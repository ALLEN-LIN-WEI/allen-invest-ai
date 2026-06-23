exports.handler = async (event) => {
  const symbol = (event.queryStringParameters.symbol || "2330").replace(/\D/g, "");
  const budget = Number(event.queryStringParameters.budget || 0);

  try {
    const live = await getTaiwanMarket(symbol);
    const enriched = enrich(symbol, live);
    const tech = await getTechnical(symbol, enriched);
    return json({ ...enriched, ...tech, budget });
  } catch (error) {
    const fallback = enrich(symbol, mockMarket(symbol));
    return json({
      ...fallback,
      budget,
      maReady:false,
      volumeReady:false,
      quoteWarning:true,
      mode:"MOCK_FALLBACK",
      source:"示範資料",
      notice:`即時行情暫時失敗：${error.message}`
    });
  }
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
      const res = await fetch(url,{headers:{"User-Agent":"Mozilla/5.0","Referer":"https://mis.twse.com.tw/stock/fibest.jsp"}});
      const data = await res.json();
      const item = data?.msgArray?.[0];
      if(!item) continue;
      const price = num(item.z) ?? num(item.y) ?? num(item.o);
      const prev = num(item.y);
      if(!price) continue;
      const changePercent = prev ? Math.round(((price-prev)/prev)*10000)/100 : null;
      const updateTime = time(item.d,item.t);
      const quoteWarning = isPossiblyStale(item.t);
      return {
        symbol,
        name:item.n || stockName(symbol),
        price,
        changePercent,
        volume:num(item.v),
        updateTime,
        quoteWarning,
        market:ch.prefix,
        mode:"LIVE_TW",
        source:ch.source,
        notice:quoteWarning ? "已取得行情，但時間可能非最新成交" : "已取得即時行情"
      };
    }catch(e){}
  }
  throw new Error(`${symbol} 查無行情`);
}

async function getTechnical(symbol, market){
  try{
    const end = new Date();
    const start = new Date(Date.now() - 220*24*60*60*1000);
    const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${symbol}&start_date=${fmt(start)}&end_date=${fmt(end)}`;
    const res = await fetch(url);
    const data = await res.json();
    const rows = (data.data || []).filter(r => r.close && r.Trading_Volume).slice(-150);
    if(rows.length < 120) return {maReady:false, volumeReady:false};
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
      volumeReady:!!volumeRatio
    };
  }catch(e){
    return {maReady:false, volumeReady:false};
  }
}

function enrich(symbol, m){
  const db = {
    "2330": {eps:50.9, pe:22.5, roe:26.8, institutionalReady:false, foreign20d:null, trust20d:null},
    "2317": {eps:11.8, pe:18.2, roe:12.5, institutionalReady:false, foreign20d:null, trust20d:null},
    "2377": {eps:9.7, pe:19.4, roe:18.1, institutionalReady:false, foreign20d:null, trust20d:null},
    "6214": {eps:6.6, pe:21.3, roe:15.2, institutionalReady:false, foreign20d:null, trust20d:null},
    "2881": {eps:8.8, pe:16.1, roe:10.9, institutionalReady:false, foreign20d:null, trust20d:null},
    "3221": {eps:null, pe:null, roe:null, institutionalReady:false, foreign20d:null, trust20d:null},
    "0050": {eps:null, pe:null, roe:null, institutionalReady:false, foreign20d:null, trust20d:null}
  };
  return {...m, ...(db[symbol] || {eps:null, pe:null, roe:null, institutionalReady:false, foreign20d:null, trust20d:null})};
}

function num(v){ if(v===undefined||v===null||v===""||v==="-")return null; const n=Number(String(v).replace(/,/g,"")); return Number.isFinite(n)?n:null; }
function avg(arr){ return arr.reduce((a,b)=>a+b,0)/arr.length; }
function round(n){ return Math.round(n*100)/100; }
function fmt(d){ return d.toISOString().slice(0,10); }
function isPossiblyStale(t){
  if(!t) return true;
  // MIS can return last transaction time. If no colon or empty, treat as warning.
  return String(t).length < 5;
}
function time(d,t){ if(!d||!t)return new Date().toLocaleString("zh-TW",{timeZone:"Asia/Taipei"}); return `${d.slice(0,4)}/${d.slice(4,6)}/${d.slice(6,8)} ${t}`; }
function json(data){ return {statusCode:200,headers:{"Content-Type":"application/json; charset=utf-8","Access-Control-Allow-Origin":"*"},body:JSON.stringify(data)}; }
function stockName(symbol){
  return {"2330":"台積電","2317":"鴻海","2377":"微星","6214":"精誠","2881":"富邦金","3221":"台嘉碩","0050":"元大台灣50"}[symbol] || "台股個股";
}
function mockMarket(symbol){
  const d = {
    "2330": {name:"台積電", price:1145, changePercent:1.2, volume:32541},
    "2317": {name:"鴻海", price:216, changePercent:0.8, volume:58210},
    "2377": {name:"微星", price:188, changePercent:-0.4, volume:12600},
    "6214": {name:"精誠", price:141, changePercent:0.5, volume:4300},
    "2881": {name:"富邦金", price:141, changePercent:0.2, volume:22000},
    "3221": {name:"台嘉碩", price:55.9, changePercent:0, volume:3000},
    "0050": {name:"元大台灣50", price:210, changePercent:0.3, volume:18000}
  }[symbol] || {name:"台股個股", price:100, changePercent:0, volume:0};
  return {symbol, ...d, updateTime:new Date().toLocaleString("zh-TW",{timeZone:"Asia/Taipei"})};
}
