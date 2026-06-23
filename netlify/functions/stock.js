exports.handler = async (event) => {
  const symbol = (event.queryStringParameters.symbol || "2330").replace(/\D/g, "");
  const budget = Number(event.queryStringParameters.budget || 0);

  // v10.6 核心原則：
  // 1. 即時 MIS 成功：用最新成交價。
  // 2. 即時 MIS 失敗：改用 FinMind 最新日收盤價，明確標示「非即時」。
  // 3. 除非所有資料源都失敗，否則不使用 mock 價格進行買點與估值。
  // 4. 技術面、量能、法人分開抓，不因即時行情失敗而全部失效。

  let market;
  try {
    market = await getTaiwanMarket(symbol);
  } catch (liveError) {
    try {
      market = await getLatestDailyPrice(symbol, liveError.message);
    } catch (dailyError) {
      market = {
        symbol,
        name: stockName(symbol),
        price:null,
        changePercent:null,
        volume:null,
        updateTime:new Date().toLocaleString("zh-TW", {timeZone:"Asia/Taipei"}),
        quoteWarning:true,
        quoteWarningText:"無法取得可靠股價，請以券商報價為準",
        quoteFreshness:"🔴 無可靠行情",
        market:null,
        mode:"NO_PRICE",
        source:"無可靠資料",
        notice:`即時與日K資料皆失敗：${dailyError.message}`
      };
    }
  }

  const enriched = enrich(symbol, market);

  const [tech, inst] = await Promise.all([
    getTechnical(symbol, enriched),
    getInstitutional(symbol)
  ]);

  return json({ ...enriched, ...tech, ...inst, budget });
};

async function getTaiwanMarket(symbol){
  const channels = [
    {prefix:"tse", source:"TWSE MIS 台股資料源"},
    {prefix:"otc", source:"TPEx MIS 上櫃資料源"}
  ];

  for(const ch of channels){
    const exCh = `${ch.prefix}_${symbol}.tw`;
    const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${exCh}&json=1&delay=0&_=${Date.now()}`;
    try{
      const res = await fetch(url,{
        headers:{
          "User-Agent":"Mozilla/5.0",
          "Referer":"https://mis.twse.com.tw/stock/fibest.jsp",
          "Accept":"application/json,text/plain,*/*"
        }
      });
      const data = await res.json();
      const item = data?.msgArray?.[0];
      if(!item) continue;

      // 僅接受最新成交價 z；z 為 "-" 時，不退回開盤價/昨收，避免產生錯誤即時價。
      const latest = num(item.z);
      if(!latest || latest <= 0) continue;

      const prev = num(item.y);
      const changePercent = prev ? Math.round(((latest-prev)/prev)*10000)/100 : null;
      const quoteStatus = quoteFreshness(item.d, item.t);

      return {
        symbol,
        name:item.n || stockName(symbol),
        price:latest,
        changePercent,
        volume:num(item.v),
        updateTime:formatTime(item.d,item.t),
        quoteWarning:quoteStatus.warning,
        quoteWarningText:quoteStatus.text,
        quoteFreshness:quoteStatus.label,
        market:ch.prefix,
        mode:"LIVE_TW",
        source:ch.source,
        notice:quoteStatus.warning ? "已取得最新成交價，但資料時間可能延遲" : "已取得最新成交價"
      };
    }catch(e){}
  }
  throw new Error(`${symbol} 查無有效最新成交價`);
}

async function getLatestDailyPrice(symbol, liveErrorMessage){
  const end = new Date();
  const start = new Date(Date.now() - 14*24*60*60*1000);
  const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${symbol}&start_date=${fmt(start)}&end_date=${fmt(end)}`;
  const res = await fetch(url, {headers:{"Accept":"application/json"}});
  const data = await res.json();
  const rows = (data.data || []).filter(r => r.close).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  if(!rows.length) throw new Error(`FinMind 查無 ${symbol} 最新日K`);
  const last = rows[rows.length-1];
  const prev = rows.length >= 2 ? rows[rows.length-2] : null;
  const price = Number(last.close);
  const prevClose = prev ? Number(prev.close) : null;
  const changePercent = prevClose ? Math.round(((price-prevClose)/prevClose)*10000)/100 : null;

  return {
    symbol,
    name:stockName(symbol),
    price,
    changePercent,
    volume:last.Trading_Volume ? Math.round(Number(last.Trading_Volume)/1000) : null,
    updateTime:`${last.date} 收盤`,
    quoteWarning:true,
    quoteWarningText:"即時行情失敗，改用最近一日收盤價",
    quoteFreshness:"🟡 非即時收盤價",
    market:null,
    mode:"DELAYED_DAILY",
    source:"FinMind 最新日K收盤價",
    notice:`即時 MIS 失敗，已改用日K收盤價。原因：${liveErrorMessage}`
  };
}

async function getTechnical(symbol, market){
  try{
    const end = new Date();
    const start = new Date(Date.now() - 260*24*60*60*1000);
    const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${symbol}&start_date=${fmt(start)}&end_date=${fmt(end)}`;
    const res = await fetch(url, {headers:{"Accept":"application/json"}});
    const data = await res.json();
    const rows = (data.data || []).filter(r => r.close && r.Trading_Volume).sort((a,b)=>String(a.date).localeCompare(String(b.date))).slice(-150);
    if(rows.length < 120) {
      return {maReady:false, volumeReady:false, technicalNotice:`日K筆數不足：${rows.length}/120`};
    }

    const closes = rows.map(r => Number(r.close));
    const vols = rows.map(r => Number(r.Trading_Volume)/1000);
    const ma60 = avg(closes.slice(-60));
    const ma120 = avg(closes.slice(-120));
    const avgVolume20 = avg(vols.slice(-20));
    const currentVolume = market.volume || vols[vols.length-1];
    const volumeRatio = avgVolume20 ? Math.round((currentVolume/avgVolume20)*100)/100 : null;

    return {
      ma60:round(ma60),
      ma120:round(ma120),
      avgVolume20:Math.round(avgVolume20),
      volumeRatio,
      maReady:true,
      volumeReady:!!volumeRatio,
      technicalSource:"FinMind TaiwanStockPrice"
    };
  }catch(e){
    return {maReady:false, volumeReady:false, technicalNotice:`技術資料失敗：${e.message}`};
  }
}

async function getInstitutional(symbol){
  try{
    const end = new Date();
    const start = new Date(Date.now() - 55*24*60*60*1000);
    const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInstitutionalInvestorsBuySell&data_id=${symbol}&start_date=${fmt(start)}&end_date=${fmt(end)}`;
    const res = await fetch(url, {headers:{"Accept":"application/json"}});
    const data = await res.json();
    const rows = (data.data || []).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    if(!rows.length) return institutionalEmpty("FinMind 無法人資料或免費額度限制");

    const byDate = {};
    for(const r of rows){
      const date = r.date;
      const name = String(r.name || "");
      const net = Number(r.buy || 0) - Number(r.sell || 0);
      if(!byDate[date]) byDate[date] = {foreign:0, trust:0, dealer:0};
      if(name.includes("Foreign") || name.includes("外資")) byDate[date].foreign += net;
      else if(name.includes("Investment_Trust") || name.includes("投信")) byDate[date].trust += net;
      else if(name.includes("Dealer") || name.includes("自營")) byDate[date].dealer += net;
    }

    const days = Object.keys(byDate).sort().slice(-20);
    if(!days.length) return institutionalEmpty("法人資料日期不足");

    const sum = days.reduce((acc,d)=>{
      acc.foreign += byDate[d].foreign || 0;
      acc.trust += byDate[d].trust || 0;
      acc.dealer += byDate[d].dealer || 0;
      return acc;
    },{foreign:0,trust:0,dealer:0});

    // FinMind 該資料集通常為股數，轉為張。
    return {
      institutionalReady:true,
      foreign20d:Math.round(sum.foreign/1000),
      trust20d:Math.round(sum.trust/1000),
      dealer20d:Math.round(sum.dealer/1000),
      institutionalSource:"FinMind 盤後法人資料"
    };
  }catch(e){
    return institutionalEmpty(`法人資料失敗：${e.message}`);
  }
}

function institutionalEmpty(reason){
  return {
    institutionalReady:false,
    foreign20d:null,
    trust20d:null,
    dealer20d:null,
    institutionalSource:reason || "法人資料尚未取得"
  };
}

function enrich(symbol, m){
  const db = {
    "2330": {eps:50.9, pe:22.5, roe:26.8},
    "2317": {eps:11.8, pe:18.2, roe:12.5},
    "2377": {eps:9.7, pe:19.4, roe:18.1},
    "6214": {eps:6.6, pe:21.3, roe:15.2},
    "2881": {eps:8.8, pe:16.1, roe:10.9},
    "3221": {eps:null, pe:null, roe:null},
    "0050": {eps:null, pe:null, roe:null}
  };
  return {...m, ...(db[symbol] || {eps:null, pe:null, roe:null})};
}

function num(v){ if(v===undefined||v===null||v===""||v==="-")return null; const n=Number(String(v).replace(/,/g,"")); return Number.isFinite(n)?n:null; }
function avg(arr){ return arr.reduce((a,b)=>a+b,0)/arr.length; }
function round(n){ return Math.round(n*100)/100; }
function fmt(d){ return d.toISOString().slice(0,10); }

function quoteFreshness(d,t){
  if(!d || !t || String(t).length < 5) {
    return {warning:true, label:"行情時間待確認", text:"行情時間待確認"};
  }
  const taipeiNow = new Date(new Date().toLocaleString("en-US", {timeZone:"Asia/Taipei"}));
  const year = Number(d.slice(0,4));
  const month = Number(d.slice(4,6)) - 1;
  const day = Number(d.slice(6,8));
  const parts = String(t).split(":").map(Number);
  const hh = parts[0] || 0;
  const mm = parts[1] || 0;
  const ss = parts[2] || 0;
  const quoteTime = new Date(year, month, day, hh, mm, ss);
  const diffMin = Math.round((taipeiNow - quoteTime)/60000);

  if(diffMin <= 3) return {warning:false, label:"🟢 即時", text:"行情即時"};
  if(diffMin <= 15) return {warning:true, label:"🟡 可能延遲", text:"行情可能延遲"};
  return {warning:true, label:"🔴 舊資料", text:"行情可能已失真"};
}

function formatTime(d,t){ if(!d||!t)return new Date().toLocaleString("zh-TW",{timeZone:"Asia/Taipei"}); return `${d.slice(0,4)}/${d.slice(4,6)}/${d.slice(6,8)} ${t}`; }
function json(data){ return {statusCode:200,headers:{"Content-Type":"application/json; charset=utf-8","Access-Control-Allow-Origin":"*"},body:JSON.stringify(data)}; }
function stockName(symbol){
  return {"2330":"台積電","2317":"鴻海","2377":"微星","6214":"精誠","2881":"富邦金","3221":"台嘉碩","0050":"元大台灣50"}[symbol] || "台股個股";
}
