// Allen Invest AI Final v10.9.1 - 財報安全版
// 修正重點：任何外部資料源失敗或逾時，都不能讓整個 Function 失敗。

const memoryCache = globalThis.__ALLEN_CACHE__ || (globalThis.__ALLEN_CACHE__ = new Map());

exports.handler = async (event) => {
  try {
    const symbol = ((event.queryStringParameters && event.queryStringParameters.symbol) || "2330").replace(/\D/g, "");
    const budget = Number((event.queryStringParameters && event.queryStringParameters.budget) || 0);
    const cacheKey = `stock:${symbol}`;
    const cached = getCache(cacheKey);

    if (cached) {
      return json({ ...cached, budget, cacheHit:true });
    }

    let market = null;
    const errors = [];

    for (const [name, getter] of [
      ["MIS", () => getTaiwanMarket(symbol)],
      ["Yahoo", () => getYahooQuote(symbol)],
      ["CMoney", () => getCMoneyQuote(symbol)],
      ["FinMindDaily", () => getLatestDailyPrice(symbol)]
    ]) {
      if (market) break;
      try {
        market = await withTimeout(getter(), 3500, `${name} timeout`);
      } catch (e) {
        errors.push(`${name}:${e.message}`);
      }
    }

    if (!market) {
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
        backupSource:null,
        notice:`所有行情來源皆失敗：${errors.join(" | ")}`
      };
    }

    const enriched = enrich(symbol, market);

    const [tech, inst, financial, marketContext] = await Promise.all([
      safe(getTechnical(symbol, enriched), fallbackTechnical("技術資料逾時或失敗")),
      safe(getInstitutional(symbol), institutionalEmpty("法人資料逾時或失敗")),
      safe(getFinancials(symbol), fallbackFinancialPayload(symbol, "財報資料逾時或失敗")),
      safe(getMarketContext(), fallbackMarketContext("大盤資料逾時或失敗"))
    ]);

    const finalPayload = { ...enriched, ...financial, ...tech, ...inst, ...marketContext };
    setCache(cacheKey, finalPayload, finalPayload.mode === "LIVE_TW" ? 60 : 300);

    return json({ ...finalPayload, budget, cacheHit:false });
  } catch (fatal) {
    return json({
      symbol:"--",
      name:"系統錯誤",
      price:null,
      changePercent:null,
      volume:null,
      updateTime:new Date().toLocaleString("zh-TW", {timeZone:"Asia/Taipei"}),
      quoteWarning:true,
      quoteWarningText:"後端發生錯誤，但已安全回傳",
      quoteFreshness:"🔴 後端錯誤",
      mode:"FUNCTION_SAFE_ERROR",
      source:"Netlify Function",
      notice:fatal.message,
      eps:null,
      pe:null,
      roe:null,
      epsReady:false,
      roeReady:false,
      financialReady:false,
      maReady:false,
      volumeReady:false,
      institutionalReady:false,
      foreign20d:null,
      trust20d:null,
      dealer20d:null
    });
  }
};

function getCache(key){
  const row = memoryCache.get(key);
  if(!row) return null;
  if(Date.now() > row.expires){ memoryCache.delete(key); return null; }
  return row.value;
}
function setCache(key,value,ttlSec){
  memoryCache.set(key,{value,expires:Date.now()+ttlSec*1000});
}
function withTimeout(promise, ms, message){
  return Promise.race([
    promise,
    new Promise((_, reject)=>setTimeout(()=>reject(new Error(message)), ms))
  ]);
}
async function safe(promise, fallback){
  try { return await withTimeout(promise, 4500, "timeout"); }
  catch(e) { return { ...fallback, safeError:e.message }; }
}


async function getMarketContext(){
  const [us, tw] = await Promise.all([
    safe(getUSMarketContext(), fallbackUSMarket()),
    safe(getTaiwanIndexContext(), fallbackTaiwanMarket())
  ]);
  const pressure = marketPressureScore(us, tw);
  return {
    usMarketReady:us.ready,
    twMarketReady:tw.ready,
    usMarketSummary:us.summary,
    twMarketSummary:tw.summary,
    marketPressure:pressure,
    marketBuyText:marketBuyText(pressure),
    marketContextSource:`${us.source || "US待補"}；${tw.source || "TW待補"}`
  };
}

async function getUSMarketContext(){
  const symbols = [["Dow","^DJI"],["Nasdaq","^IXIC"],["S&P500","^GSPC"],["Russell2000","^RUT"]];
  const rows = [];
  for(const [name,ticker] of symbols){
    try{
      const q = await yahooChart(ticker);
      if(q && Number.isFinite(q.changePercent)) rows.push({name, changePercent:q.changePercent});
    }catch(e){}
  }
  if(!rows.length) return fallbackUSMarket();
  const avg = rows.reduce((a,b)=>a+b.changePercent,0)/rows.length;
  return {ready:true, avgChange:round(avg), rows, summary:rows.map(r=>`${r.name} ${fmtPct(r.changePercent)}`).join("，"), source:"Yahoo 美股四大指數"};
}

async function getTaiwanIndexContext(){
  try{
    const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_t00.tw&json=1&delay=0&_=${Date.now()}`;
    const res = await fetch(url,{headers:{"User-Agent":"Mozilla/5.0","Referer":"https://mis.twse.com.tw/stock/fibest.jsp"}});
    const data = await res.json();
    const item = data?.msgArray?.[0];
    const latest = num(item?.z);
    const prev = num(item?.y);
    if(latest && prev){
      const pct = Math.round(((latest-prev)/prev)*10000)/100;
      return {ready:true, changePercent:pct, summary:`加權指數 ${fmtPct(pct)}`, source:"TWSE MIS 加權指數"};
    }
  }catch(e){}
  return fallbackTaiwanMarket();
}

async function yahooChart(ticker){
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=5d&interval=1d`;
  const res = await fetch(url,{headers:{"User-Agent":"Mozilla/5.0","Accept":"application/json"}});
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  const closes = (result?.indicators?.quote?.[0]?.close || []).filter(v=>Number.isFinite(v));
  if(closes.length < 2) throw new Error("not enough data");
  const last = closes[closes.length-1];
  const prev = closes[closes.length-2];
  return {changePercent:Math.round(((last-prev)/prev)*10000)/100};
}

function marketPressureScore(us, tw){
  let score = 0;
  if(us.ready){
    if(us.avgChange >= 1) score += 1;
    if(us.avgChange <= -1) score -= 1;
    if(us.avgChange <= -2) score -= 1;
  }
  if(tw.ready){
    if(tw.changePercent >= 0.8) score += 1;
    if(tw.changePercent <= -0.8) score -= 1;
    if(tw.changePercent <= -1.8) score -= 1;
  }
  return Math.max(-3, Math.min(3, score));
}

function marketBuyText(pressure){
  if(pressure >= 2) return "美股與台股環境偏強，第一買點略上修，允許小量試單。";
  if(pressure >= 1) return "大盤略強，第一買點小幅上修。";
  if(pressure <= -2) return "美股與台股偏弱，第一與第二買點下修，避免太早接刀。";
  if(pressure <= -1) return "大盤略弱，買點小幅下修，分批更保守。";
  return "大盤中性，買點維持原模型。";
}
function fallbackUSMarket(){ return {ready:false, avgChange:null, rows:[], summary:"美股四大指數待補", source:"US待補"}; }
function fallbackTaiwanMarket(){ return {ready:false, changePercent:null, summary:"台股大盤待補", source:"TW待補"}; }
function fallbackMarketContext(reason){ return {usMarketReady:false, twMarketReady:false, usMarketSummary:"美股四大指數待補", twMarketSummary:"台股大盤待補", marketPressure:0, marketBuyText:"大盤資料不足，買點維持原模型。", marketContextSource:reason}; }
function fmtPct(v){ return `${v>=0?"+":""}${round(v)}%`; }

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
        backupSource:null,
        notice:quoteStatus.warning ? "已取得最新成交價，但資料時間可能延遲" : "已取得最新成交價"
      };
    }catch(e){}
  }
  throw new Error(`${symbol} 查無有效最新成交價`);
}

async function getYahooQuote(symbol){
  const url = `https://tw.stock.yahoo.com/quote/${symbol}.TW`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":"Mozilla/5.0",
      "Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language":"zh-TW,zh;q=0.9,en;q=0.8"
    }
  });
  const html = await res.text();
  const price = pickFirstNumber([
    /"regularMarketPrice"\s*:\s*\{[^}]*"raw"\s*:\s*([0-9.]+)/,
    /"regularMarketPrice"\s*:\s*([0-9.]+)/,
    /"price"\s*:\s*\{[^}]*"raw"\s*:\s*([0-9.]+)/,
    /"close"\s*:\s*([0-9.]+)/,
    /成交價[^0-9]{0,120}([0-9]+(?:\.[0-9]+)?)/
  ], html);
  if(!price) throw new Error("Yahoo 無法解析價格");
  return {
    symbol,
    name:stockName(symbol),
    price,
    changePercent:null,
    volume:null,
    updateTime:new Date().toLocaleString("zh-TW", {timeZone:"Asia/Taipei"}),
    quoteWarning:true,
    quoteWarningText:"使用 Yahoo 備援價，請以券商報價確認",
    quoteFreshness:"🟡 Yahoo 備援",
    market:null,
    mode:"BACKUP_YAHOO",
    source:"Yahoo 股市備援",
    backupSource:"Yahoo",
    notice:"Yahoo 備援價僅供分析參考"
  };
}

async function getCMoneyQuote(symbol){
  const url = `https://www.cmoney.tw/forum/stock/${symbol}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":"Mozilla/5.0",
      "Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language":"zh-TW,zh;q=0.9,en;q=0.8"
    }
  });
  const html = await res.text();
  const price = pickFirstNumber([
    /"price"\s*:\s*"?([0-9]+(?:\.[0-9]+)?)"?/,
    /"close"\s*:\s*"?([0-9]+(?:\.[0-9]+)?)"?/,
    /"currentPrice"\s*:\s*"?([0-9]+(?:\.[0-9]+)?)"?/,
    /最新價[^0-9]{0,120}([0-9]+(?:\.[0-9]+)?)/,
    /成交價[^0-9]{0,120}([0-9]+(?:\.[0-9]+)?)/
  ], html);
  if(!price) throw new Error("CMoney 無法解析價格");
  return {
    symbol,
    name:stockName(symbol),
    price,
    changePercent:null,
    volume:null,
    updateTime:new Date().toLocaleString("zh-TW", {timeZone:"Asia/Taipei"}),
    quoteWarning:true,
    quoteWarningText:"使用 CMoney 備援價，請以券商報價確認",
    quoteFreshness:"🟡 CMoney 備援",
    market:null,
    mode:"BACKUP_CMONEY",
    source:"CMoney 股市備援",
    backupSource:"CMoney",
    notice:"CMoney 備援價僅供分析參考"
  };
}

async function getLatestDailyPrice(symbol){
  const rows = await finmindDataset("TaiwanStockPrice", symbol, daysAgo(20), today());
  const clean = rows.filter(r => r.close).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  if(!clean.length) throw new Error(`FinMind 查無 ${symbol} 最新日K`);
  const last = clean[clean.length-1];
  const prev = clean.length >= 2 ? clean[clean.length-2] : null;
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
    quoteWarningText:"即時與備援行情失敗，改用最近一日收盤價",
    quoteFreshness:"🟡 非即時收盤價",
    market:null,
    mode:"DELAYED_DAILY",
    source:"FinMind 最新日K收盤價",
    backupSource:"FinMind",
    notice:"即時與備援行情失敗，已改用日K收盤價"
  };
}

async function getTechnical(symbol, market){
  const rows = await finmindDataset("TaiwanStockPrice", symbol, daysAgo(300), today());
  const clean = rows.filter(r => r.close && r.Trading_Volume).sort((a,b)=>String(a.date).localeCompare(String(b.date))).slice(-150);
  if(clean.length < 120) return fallbackTechnical(`日K筆數不足：${clean.length}/120`);

  const closes = clean.map(r => Number(r.close));
  const vols = clean.map(r => Number(r.Trading_Volume)/1000);
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
}

async function getInstitutional(symbol){
  const rows = await finmindDataset("TaiwanStockInstitutionalInvestorsBuySell", symbol, daysAgo(80), today());
  const clean = rows.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  if(!clean.length) return institutionalEmpty("FinMind 無法人資料或免費額度限制");

  const byDate = {};
  for(const r of clean){
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

  const sum20 = sumInstitutionDays(byDate, days);
  return {
    institutionalReady:true,
    foreign20d:Math.round(sum20.foreign/1000),
    trust20d:Math.round(sum20.trust/1000),
    dealer20d:Math.round(sum20.dealer/1000),
    institutionalSource:"FinMind 盤後法人資料"
  };
}

async function getFinancials(symbol){
  const fallback = fallbackFinancial(symbol);
  const [perRows, fsRows] = await Promise.all([
    safeFinmindDataset("TaiwanStockPER", symbol, daysAgo(90), today()),
    safeFinmindDataset("TaiwanStockFinancialStatements", symbol, daysAgo(365*6), today())
  ]);

  const perClean = (perRows || []).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const latestPer = perClean[perClean.length-1] || {};
  const pe = firstNumber(latestPer.PER, latestPer.pe, latestPer.PE, latestPer["本益比"]) || fallback.pe || null;

  const normalized = normalizeFinancialRows(fsRows || []);
  const epsRows = normalized.filter(r => isEpsType(r.type) && Number.isFinite(r.value)).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const roeRows = normalized.filter(r => isRoeType(r.type) && Number.isFinite(r.value)).sort((a,b)=>String(a.date).localeCompare(String(b.date)));

  const eps = epsRows.length ? round(epsRows[epsRows.length-1].value) : fallback.eps || null;
  const roe = roeRows.length ? round(roeRows[roeRows.length-1].value) : fallback.roe || null;
  const epsStats = analyzeEps(epsRows);

  return {
    eps,
    pe,
    roe,
    epsReady: epsRows.length >= 4 || !!fallback.eps,
    roeReady: !!roe,
    financialReady: !!(eps || pe || roe),
    epsRecent: epsRows.slice(-8).map(r=>({date:r.date,value:round(r.value)})),
    epsGrowthScore: epsStats.growthScore || (fallback.eps ? 2 : null),
    epsStabilityScore: epsStats.stabilityScore || (fallback.eps ? 2 : null),
    epsGrowthText: epsStats.growthText || (fallback.eps ? "使用備用EPS資料，成長性需再確認。" : null),
    epsStabilityText: epsStats.stabilityText || (fallback.eps ? "使用備用EPS資料，穩定性需再確認。" : null),
    financialSource: epsRows.length || roeRows.length || perClean.length ? "FinMind 財報資料" : "備用資料"
  };
}

async function safeFinmindDataset(dataset, symbol, startDate, endDate){
  try{ return await withTimeout(finmindDataset(dataset, symbol, startDate, endDate), 3000, `${dataset} timeout`); }
  catch(e){ return []; }
}

async function finmindDataset(dataset, symbol, startDate, endDate){
  const token = process.env.FINMIND_TOKEN || "";
  const tokenPart = token ? `&token=${encodeURIComponent(token)}` : "";
  const url = `https://api.finmindtrade.com/api/v4/data?dataset=${dataset}&data_id=${symbol}&start_date=${startDate}&end_date=${endDate}${tokenPart}`;
  const res = await fetch(url, {headers:{"Accept":"application/json"}});
  const data = await res.json();
  if(data.status && data.status !== 200) throw new Error(data.msg || `FinMind ${dataset} 失敗`);
  return data.data || [];
}

function fallbackTechnical(reason){
  return {maReady:false, volumeReady:false, ma60:null, ma120:null, avgVolume20:null, volumeRatio:null, technicalNotice:reason};
}
function institutionalEmpty(reason){
  return {institutionalReady:false, foreign20d:null, trust20d:null, dealer20d:null, institutionalSource:reason || "法人資料尚未取得"};
}
function fallbackFinancialPayload(symbol, reason){
  const f = fallbackFinancial(symbol);
  return {
    eps:f.eps || null,
    pe:f.pe || null,
    roe:f.roe || null,
    epsReady:!!f.eps,
    roeReady:!!f.roe,
    financialReady:!!(f.eps || f.pe || f.roe),
    epsGrowthScore:f.eps ? 2 : null,
    epsStabilityScore:f.eps ? 2 : null,
    epsGrowthText:f.eps ? "使用備用EPS資料，成長性需再確認。" : null,
    epsStabilityText:f.eps ? "使用備用EPS資料，穩定性需再確認。" : null,
    financialSource:reason
  };
}
function fallbackFinancial(symbol){
  const db = {
    "2330": {eps:50.9, pe:22.5, roe:26.8},
    "2317": {eps:11.8, pe:18.2, roe:12.5},
    "2377": {eps:9.7, pe:19.4, roe:18.1},
    "6214": {eps:6.6, pe:21.3, roe:15.2},
    "2881": {eps:8.8, pe:16.1, roe:10.9}
  };
  return db[symbol] || {};
}
function enrich(symbol, m){
  return {...m};
}
function normalizeFinancialRows(rows){
  return rows.map(r=>{
    const type = String(r.type || r.account || r.name || r.origin_name || r.label || "");
    const value = firstNumber(r.value, r.amount, r.data_value, r.val);
    return {date:r.date || r.year || r.quarter || "", type, value};
  }).filter(r=>r.type && Number.isFinite(r.value));
}
function isEpsType(t){
  const s = String(t).toLowerCase();
  return s === "eps" || s.includes("earnings per share") || s.includes("每股盈餘") || s.includes("基本每股盈餘");
}
function isRoeType(t){
  const s = String(t).toLowerCase();
  return s === "roe" || s.includes("return on equity") || s.includes("權益報酬");
}
function analyzeEps(epsRows){
  const rows = epsRows.filter(r=>Number.isFinite(r.value)).slice(-8);
  if(rows.length < 4) return {};
  const values = rows.map(r=>r.value);
  const positives = values.filter(v=>v>0).length;
  const latest = values[values.length-1];
  const first = values[0];
  const growth = latest - first;
  const upCount = values.slice(1).filter((v,i)=>v>=values[i]).length;
  const avgVal = values.reduce((a,b)=>a+b,0)/values.length;
  const variance = values.reduce((a,b)=>a+Math.pow(b-avgVal,2),0)/values.length;
  const cv = avgVal ? Math.sqrt(variance)/Math.abs(avgVal) : 999;

  let growthScore = 2;
  if(positives >= rows.length-1 && growth > 0 && upCount >= Math.floor((rows.length-1)*0.55)) growthScore = 3;
  if(latest < 0 || growth < 0) growthScore = 1;

  let stabilityScore = 2;
  if(positives === rows.length && cv < 0.55) stabilityScore = 3;
  if(positives < rows.length-1 || cv > 1.2) stabilityScore = 1;

  return {
    growthScore,
    stabilityScore,
    growthText:`近${rows.length}期EPS由 ${round(first)} 變化至 ${round(latest)}，${growthScore>=3?"成長性佳":growthScore===2?"成長性普通":"成長性偏弱"}。`,
    stabilityText:`近${rows.length}期EPS正數期數 ${positives}/${rows.length}，${stabilityScore>=3?"穩定性佳":stabilityScore===2?"穩定性普通":"穩定性偏弱"}。`
  };
}
function sumInstitutionDays(byDate, days){
  return days.reduce((acc,d)=>{
    acc.foreign += byDate[d].foreign || 0;
    acc.trust += byDate[d].trust || 0;
    acc.dealer += byDate[d].dealer || 0;
    return acc;
  },{foreign:0,trust:0,dealer:0});
}
function num(v){ if(v===undefined||v===null||v===""||v==="-")return null; const n=Number(String(v).replace(/,/g,"")); return Number.isFinite(n)?n:null; }
function firstNumber(...vals){
  for(const v of vals){
    const n = num(v);
    if(Number.isFinite(n)) return n;
  }
  return null;
}
function pickFirstNumber(patterns, text){
  for(const p of patterns){
    const m = text.match(p);
    if(m && m[1]){
      const n = num(m[1]);
      if(n && n > 0) return n;
    }
  }
  return null;
}
function cleanText(s){ return String(s || "").replace(/<[^>]+>/g,"").replace(/\s+/g," ").trim(); }
function avg(arr){ return arr.reduce((a,b)=>a+b,0)/arr.length; }
function round(n){ return Math.round(n*100)/100; }
function today(){ return new Date().toISOString().slice(0,10); }
function daysAgo(n){ return new Date(Date.now()-n*24*60*60*1000).toISOString().slice(0,10); }
function quoteFreshness(d,t){
  if(!d || !t || String(t).length < 5) return {warning:true, label:"行情時間待確認", text:"行情時間待確認"};
  const taipeiNow = new Date(new Date().toLocaleString("en-US", {timeZone:"Asia/Taipei"}));
  const year = Number(d.slice(0,4));
  const month = Number(d.slice(4,6)) - 1;
  const day = Number(d.slice(6,8));
  const parts = String(t).split(":").map(Number);
  const quoteTime = new Date(year, month, day, parts[0]||0, parts[1]||0, parts[2]||0);
  const diffMin = Math.round((taipeiNow - quoteTime)/60000);
  if(diffMin <= 3) return {warning:false, label:"🟢 即時", text:"行情即時"};
  if(diffMin <= 15) return {warning:true, label:"🟡 可能延遲", text:"行情可能延遲"};
  return {warning:true, label:"🔴 舊資料", text:"行情可能已失真"};
}
function formatTime(d,t){ if(!d||!t)return new Date().toLocaleString("zh-TW",{timeZone:"Asia/Taipei"}); return `${d.slice(0,4)}/${d.slice(4,6)}/${d.slice(6,8)} ${t}`; }
function json(data){ return {statusCode:200,headers:{"Content-Type":"application/json; charset=utf-8","Access-Control-Allow-Origin":"*"},body:JSON.stringify(data)}; }
function stockName(symbol){
  return {"2330":"台積電","2317":"鴻海","2377":"微星","6214":"精誠","2881":"富邦金","3221":"台嘉碩","3005":"神基","0050":"元大台灣50"}[symbol] || "台股個股";
}
