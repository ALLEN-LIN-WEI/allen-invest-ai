const indicators = [
["基本面","EPS成長性"],["基本面","EPS穩定性"],["基本面","本益比合理性"],["基本面","營收年增率"],["基本面","毛利率趨勢"],["基本面","營業利益率"],["基本面","自由現金流"],["基本面","負債比率"],["基本面","ROE"],["基本面","產業成長性"],
["籌碼面","外資買賣超趨勢"],["籌碼面","投信持續性"],["籌碼面","自營商方向"],["籌碼面","三大法人一致性"],["籌碼面","融資變化"],["籌碼面","融券變化"],["籌碼面","大戶集中度"],["籌碼面","主力進出跡象"],["籌碼面","券資比變化"],["籌碼面","籌碼穩定性"],
["技術面","均線排列"],["技術面","5日線趨勢"],["技術面","10日線趨勢"],["技術面","20日線（月線）"],["技術面","60日線（季線）"],["技術面","KD指標"],["技術面","RSI強弱"],["技術面","MACD"],["技術面","壓力突破"],["技術面","支撐強度"],
["量價","放量上漲"],["量價","放量下跌"],["量價","量縮整理"],
["風險","波動率"],["風險","歷史高檔風險"],["風險","大盤連動性"],["風險","系統性風險"]
];

const moduleMax = {"基本面":30,"籌碼面":25,"技術面":25,"量價":10,"風險":10};

const stockProfiles = {
  "2330": {name:"台積電", type:"highAI", growth:"高"},
  "2317": {name:"鴻海", type:"growth", growth:"中高"},
  "2377": {name:"微星", type:"highAI", growth:"中高"},
  "6214": {name:"精誠", type:"growth", growth:"中"},
  "2881": {name:"富邦金", type:"financial", growth:"中"},
  "2303": {name:"聯電", type:"growth", growth:"中"},
  "6274": {name:"台燿", type:"highAI", growth:"高"},
  "3037": {name:"欣興", type:"highAI", growth:"高"},
  "0050": {name:"元大台灣50", type:"etf", growth:"中"},
  "00918": {name:"大華優利高填息30", type:"etf", growth:"中"}
};

function seededRandom(seed){
  let h = 2166136261;
  for (let i=0;i<seed.length;i++){ h ^= seed.charCodeAt(i); h = Math.imul(h,16777619); }
  return function(){
    h += h << 13; h ^= h >>> 7; h += h << 3; h ^= h >>> 17; h += h << 5;
    return (h >>> 0) / 4294967295;
  }
}

function getProfile(code){
  return stockProfiles[code] || {name:"台股個股", type:"growth", growth:"中"};
}

function scoreStock(code, market){
  const rnd = seededRandom(code);
  const rows = indicators.map(([m,n])=>{
    let base = 1 + Math.floor(rnd()*3);
    if (rnd() < 0.10) base = 0;

    // 用部分市場資料微調示範分數
    if (n.includes("本益比") && market.pe && market.pe > 35) base = Math.max(0, base-1);
    if (n.includes("量") && market.changePercent && market.changePercent < -3) base = Math.max(0, base-1);

    const text = base===3 ? "強多/優勢明確" : base===2 ? "偏多/可觀察" : base===1 ? "中性/資料待確認" : "偏空/需留意";
    return {module:m, name:n, raw:base, text};
  });

  const modules = {};
  Object.keys(moduleMax).forEach(k=>modules[k]=0);
  rows.forEach(r=>{
    const count = indicators.filter(i=>i[0]===r.module).length;
    modules[r.module] += r.raw / 3 * moduleMax[r.module] / count;
  });
  Object.keys(modules).forEach(k=>modules[k]=Math.round(modules[k]*10)/10);
  const total = Math.round(Object.values(modules).reduce((a,b)=>a+b,0));
  const profile = getProfile(code);
  const decision = makeDecision(code, total, modules, market, profile);
  return {rows, modules, total, profile, decision};
}

function rating(score){
  if(score>=85) return {label:"🟢 強力買進", advice:"分數進入強勢區，但仍建議分批，不追高。"};
  if(score>=70) return {label:"🟡 偏多觀察", advice:"可列入觀察或小量分批，等待價位更漂亮。"};
  if(score>=50) return {label:"🟠 中性/等待確認", advice:"訊號尚未完全共振，建議等待突破或回測支撐。"};
  return {label:"🔴 避開", advice:"風險偏高或資料不足，暫不建議進場。"};
}

function confidence(score){
  if(score>=90) return "★★★★★";
  if(score>=80) return "★★★★☆";
  if(score>=70) return "★★★☆☆";
  if(score>=60) return "★★☆☆☆";
  return "★☆☆☆☆";
}

function stockName(code){
  return getProfile(code).name;
}

function money(n){
  if(n === null || n === undefined || isNaN(n)) return "--";
  return Number(n).toLocaleString("zh-TW", {maximumFractionDigits: 2});
}

function makeDecision(code, total, modules, market, profile){
  const price = Number(market.price || 0);
  const type = profile.type;
  const budget = Number(market.budget || 0);

  let pullbacks = {buy1: price*0.95, buy2: price*0.90, buy3: price*0.85};
  if(total >= 85){ pullbacks = {buy1: price*0.98, buy2: price*0.94, buy3: price*0.90}; }
  else if(total >= 70){ pullbacks = {buy1: price*0.95, buy2: price*0.90, buy3: price*0.85}; }
  else { pullbacks = {buy1: price*0.93, buy2: price*0.88, buy3: price*0.82}; }

  let oneLine, valuationText, valuationDetail, actionText, actionDetail, positionText, positionDetail, badge;
  if(total >= 85){
    oneLine = "條件偏強，可分批布局，但仍不建議追高。";
    valuationText = "合理偏便宜或成長支撐強";
    valuationDetail = `若目前股價未短線急漲，可從 ${money(pullbacks.buy1)} 元附近開始分批。`;
    actionText = "分批布局";
    actionDetail = `第一買點 ${money(pullbacks.buy1)} 元，第二買點 ${money(pullbacks.buy2)} 元。`;
    badge = "可分批";
  } else if(total >= 70){
    oneLine = "目前可觀察，建議先零股試單，等待回檔再加碼。";
    valuationText = "合理或略偏高";
    valuationDetail = `建議等待 ${money(pullbacks.buy1)} 元附近，風險報酬比會更好。`;
    actionText = "小量試單";
    actionDetail = `若想建立觀察部位，可少量買進；主要加碼點放在 ${money(pullbacks.buy2)} 元附近。`;
    badge = "零股試單";
  } else if(total >= 60){
    oneLine = "目前不夠便宜，不建議追高，等待拉回較安全。";
    valuationText = "偏高或訊號不足";
    valuationDetail = `建議至少等到 ${money(pullbacks.buy1)} 元以下再評估。`;
    actionText = "等待拉回";
    actionDetail = `若跌至 ${money(pullbacks.buy2)} 元附近，再重新檢查法人與量價。`;
    badge = "等待";
  } else {
    oneLine = "目前風險偏高，不建議進場。";
    valuationText = "風險偏高";
    valuationDetail = "基本面、籌碼或技術分數不足，先不要急著買。";
    actionText = "暫不進場";
    actionDetail = "等待分數重新轉強或價格進入明顯低估區。";
    badge = "避開";
  }

  let sharesNow = 0;
  if(type==="highAI"){
    sharesNow = total>=85 ? 20 : total>=70 ? 10 : 0;
    positionText = sharesNow ? `先買 ${sharesNow} 股零股` : "暫不買";
    positionDetail = "高價 AI 熱門股波動大，以零股試單與分批為主。";
  } else if(type==="financial" || type==="etf"){
    sharesNow = total>=85 ? 1000 : total>=70 ? 500 : 0;
    positionText = sharesNow >= 1000 ? "可先買 1 張" : sharesNow ? "可先買 500 股觀察" : "先等待";
    positionDetail = "金融股/ETF較適合整張分批，但仍應避開大盤系統性風險。";
  } else {
    sharesNow = total>=85 ? 100 : total>=70 ? 20 : 0;
    positionText = sharesNow ? `先買 ${sharesNow} 股` : "先觀察";
    positionDetail = "一般成長股建議分3～5批，避免一次買在短線高點。";
  }

  if(budget > 0 && price > 0){
    const suggestedCash = total>=85 ? budget*0.3 : total>=70 ? budget*0.15 : total>=60 ? budget*0.05 : 0;
    const budgetShares = Math.floor(suggestedCash / price);
    if(budgetShares > 0){
      sharesNow = Math.min(sharesNow || budgetShares, budgetShares);
      positionText = `依預算先買 ${sharesNow} 股`;
      positionDetail = `以預算 ${money(budget)} 元估算，第一階段約投入 ${money(sharesNow*price)} 元，保留資金等待第二、第三買點。`;
    }
  }

  const risk = total>=80 ? "中低" : total>=70 ? "中" : total>=60 ? "中高" : "高";
  const growth = profile.growth || (modules["基本面"]>=24 ? "高" : "中");

  return {
    oneLine, valuationText, valuationDetail, actionText, actionDetail,
    positionText, positionDetail, badge, risk, growth,
    buy1: pullbacks.buy1, buy2: pullbacks.buy2, buy3: pullbacks.buy3,
    sharesNow
  };
}
