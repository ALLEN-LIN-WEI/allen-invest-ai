exports.handler = async (event) => {
  const symbol = (event.queryStringParameters.symbol || "2330").replace(/\D/g, "");
  const budget = Number(event.queryStringParameters.budget || 0);

  try {
    const live = await getTaiwanMarket(symbol);
    return json({ ...enrich(symbol, live), budget });
  } catch (error) {
    return json({
      ...enrich(symbol, mockMarket(symbol)),
      budget,
      mode: "MOCK_FALLBACK",
      source: "示範資料",
      notice: `即時行情暫時失敗：${error.message}`
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
      return {
        symbol,
        name:item.n || stockName(symbol),
        price,
        changePercent,
        volume:num(item.v),
        updateTime:time(item.d,item.t),
        mode:"LIVE_TW",
        source:ch.source,
        notice:"已取得即時行情"
      };
    }catch(e){}
  }
  throw new Error(`${symbol} 查無行情`);
}

function enrich(symbol, m){
  const db = {
    "2330": {eps:50.9, pe:22.5, roe:26.8, institutionalReady:false, maReady:false},
    "2317": {eps:11.8, pe:18.2, roe:12.5, institutionalReady:false, maReady:false},
    "2377": {eps:9.7, pe:19.4, roe:18.1, institutionalReady:false, maReady:false},
    "6214": {eps:6.6, pe:21.3, roe:15.2, institutionalReady:false, maReady:false},
    "2881": {eps:8.8, pe:16.1, roe:10.9, institutionalReady:false, maReady:false},
    "0050": {eps:null, pe:null, roe:null, institutionalReady:false, maReady:false}
  };
  return {...m, ...(db[symbol] || {eps:null, pe:null, roe:null, institutionalReady:false, maReady:false})};
}

function num(v){ if(v===undefined||v===null||v===""||v==="-")return null; const n=Number(String(v).replace(/,/g,"")); return Number.isFinite(n)?n:null; }
function time(d,t){ if(!d||!t)return new Date().toLocaleString("zh-TW",{timeZone:"Asia/Taipei"}); return `${d.slice(0,4)}/${d.slice(4,6)}/${d.slice(6,8)} ${t}`; }
function json(data){ return {statusCode:200,headers:{"Content-Type":"application/json; charset=utf-8","Access-Control-Allow-Origin":"*"},body:JSON.stringify(data)}; }
function stockName(symbol){
  return {"2330":"台積電","2317":"鴻海","2377":"微星","6214":"精誠","2881":"富邦金","0050":"元大台灣50"}[symbol] || "台股個股";
}
function mockMarket(symbol){
  const d = {
    "2330": {name:"台積電", price:1145, changePercent:1.2, volume:32541},
    "2317": {name:"鴻海", price:216, changePercent:0.8, volume:58210},
    "2377": {name:"微星", price:188, changePercent:-0.4, volume:12600},
    "6214": {name:"精誠", price:141, changePercent:0.5, volume:4300},
    "2881": {name:"富邦金", price:141, changePercent:0.2, volume:22000},
    "0050": {name:"元大台灣50", price:210, changePercent:0.3, volume:18000}
  }[symbol] || {name:"台股個股", price:100, changePercent:0, volume:0};
  return {symbol, ...d, updateTime:new Date().toLocaleString("zh-TW",{timeZone:"Asia/Taipei"})};
}
