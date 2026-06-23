const indicators = [
["基本面","EPS成長性"],["基本面","EPS穩定性"],["基本面","本益比合理性"],["基本面","營收年增率"],["基本面","毛利率趨勢"],["基本面","營業利益率"],["基本面","自由現金流"],["基本面","負債比率"],["基本面","ROE"],["基本面","產業成長性"],
["籌碼面","外資買賣超趨勢"],["籌碼面","投信持續性"],["籌碼面","自營商方向"],["籌碼面","三大法人一致性"],["籌碼面","融資變化"],["籌碼面","融券變化"],["籌碼面","大戶集中度"],["籌碼面","主力進出跡象"],["籌碼面","券資比變化"],["籌碼面","籌碼穩定性"],
["技術面","均線排列"],["技術面","5日線趨勢"],["技術面","10日線趨勢"],["技術面","20日線（月線）"],["技術面","60日線（季線）"],["技術面","KD指標"],["技術面","RSI強弱"],["技術面","MACD"],["技術面","壓力突破"],["技術面","支撐強度"],
["量價","放量上漲"],["量價","放量下跌"],["量價","量縮整理"],
["風險","波動率"],["風險","歷史高檔風險"],["風險","大盤連動性"],["風險","系統性風險"]
];

const moduleMax = {"基本面":30,"籌碼面":25,"技術面":25,"量價":10,"風險":10};

const stockProfiles = {
  "2330": {name:"台積電", type:"highAI", growth:"高", baseScore:83},
  "2317": {name:"鴻海", type:"growth", growth:"中高", baseScore:78},
  "2377": {name:"微星", type:"highAI", growth:"中高", baseScore:74},
  "6214": {name:"精誠", type:"growth", growth:"中", baseScore:72},
  "2881": {name:"富邦金", type:"financial", growth:"中", baseScore:77},
  "2303": {name:"聯電", type:"growth", growth:"中", baseScore:68},
  "6274": {name:"台燿", type:"highAI", growth:"高", baseScore:79},
  "3037": {name:"欣興", type:"highAI", growth:"高", baseScore:75},
  "0050": {name:"元大台灣50", type:"etf", growth:"中", baseScore:81},
  "00918": {name:"大華優利高填息30", type:"etf", growth:"中", baseScore:73}
};

function getProfile(code){return stockProfiles[code]||{name:"台股個股",type:"growth",growth:"中",baseScore:66};}

function scoreStock(code, market){
  const profile=getProfile(code);
  let baseScore=profile.baseScore;
  const chg=Number(market.changePercent);

  if(Number.isFinite(chg)){
    if(chg>=5) baseScore-=6;
    else if(chg>=3) baseScore-=3;
    else if(chg<=-4) baseScore+=4;
    else if(chg<=-2) baseScore+=2;
  }

  if(market.pe){
    if(market.pe>35) baseScore-=6;
    else if(market.pe>25) baseScore-=3;
    else if(market.pe<15) baseScore+=3;
  }

  baseScore=Math.max(45,Math.min(92,Math.round(baseScore)));

  const moduleRatio={"基本面":0.30,"籌碼面":0.25,"技術面":0.25,"量價":0.10,"風險":0.10};
  const modules={};
  Object.entries(moduleRatio).forEach(([k,r])=>{
    let v=baseScore*r;
    if(k==="技術面"&&Number.isFinite(chg)){ if(chg>3)v-=1.2; if(chg<-2)v+=0.8; }
    if(k==="風險"&&profile.type==="highAI")v-=0.8;
    modules[k]=Math.max(0,Math.min(moduleMax[k],Math.round(v*10)/10));
  });

  const total=Math.round(Object.values(modules).reduce((a,b)=>a+b,0));
  const rows=indicators.map(([module,name])=>{
    const modulePct=modules[module]/moduleMax[module];
    let raw=Math.round(modulePct*3);
    raw=Math.max(1,Math.min(3,raw));
    let dataMissing=false;
    if(name.includes("本益比")&&!market.pe){ raw=1; dataMissing=true; }
    if(name.includes("EPS")&&!market.eps){ raw=1; dataMissing=true; }
    if(name.includes("外資")||name.includes("投信")||name.includes("法人")){ raw=1; dataMissing=true; }
    const grade=itemGrade(raw,dataMissing);
    return {module,name,raw,grade:grade.label,gradeClass:grade.className,text:itemPlainText(name,raw,dataMissing)};
  });

  const decision=makeDecision(code,total,modules,market,profile);
  return {rows,modules,total,profile,decision};
}

function itemGrade(raw,missing){
  if(missing) return {label:"C｜待確認", className:"grade-c"};
  if(raw>=3) return {label:"A｜優秀", className:"grade-a"};
  if(raw===2) return {label:"B｜普通", className:"grade-b"};
  if(raw===1) return {label:"C｜偏弱", className:"grade-c"};
  return {label:"D｜風險", className:"grade-d"};
}

function itemPlainText(name,raw,missing){
  if(missing) return "目前缺少即時資料，先保守看待，不直接判定好壞。";
  if(name.includes("EPS")) return raw>=3?"獲利表現佳，是加分項。":raw===2?"獲利表現尚可，需搭配財報確認。":"獲利穩定度不足，需留意。";
  if(name.includes("本益比")) return raw>=3?"估值相對合理。":raw===2?"估值可接受，但不算便宜。":"估值偏高或資料不足。";
  if(name.includes("ROE")) return raw>=3?"獲利效率佳。":raw===2?"獲利能力普通。":"獲利效率偏弱。";
  if(name.includes("外資")||name.includes("投信")||name.includes("法人")) return raw>=3?"法人籌碼偏多。":raw===2?"法人態度中性。":"法人資料不足或偏弱。";
  if(name.includes("均線")||name.includes("KD")||name.includes("RSI")||name.includes("MACD")) return raw>=3?"技術面偏多。":raw===2?"技術面中性，可觀察。":"技術訊號尚未轉強。";
  if(name.includes("量")) return raw>=3?"量價配合良好。":raw===2?"量價普通，尚可觀察。":"量價訊號偏弱。";
  if(raw>=3) return "條件良好，是加分項。";
  if(raw===2) return "表現普通，可持續觀察。";
  return "偏弱或資料不足，需保守。";
}

function rating(score){
  if(score>=82)return{label:"🟢 可分批布局",advice:"條件偏多，但仍不建議追高。"};
  if(score>=70)return{label:"🟡 可小量試單",advice:"可用零股或小部位建立觀察單。"};
  if(score>=58)return{label:"🟠 等待確認",advice:"資料不足或訊號未共振，等待回檔或補充資料。"};
  return{label:"🔴 暫避",advice:"風險偏高或條件不足，暫不建議進場。"};
}

function confidence(score){if(score>=88)return"★★★★★";if(score>=78)return"★★★★☆";if(score>=68)return"★★★☆☆";if(score>=58)return"★★☆☆☆";return"★☆☆☆☆";}
function stockName(code){return getProfile(code).name;}
function money(n){if(n===null||n===undefined||isNaN(n))return"--";return Number(n).toLocaleString("zh-TW",{maximumFractionDigits:2});}
function overallGrade(score){if(score>=90)return"A+";if(score>=80)return"A";if(score>=70)return"B";if(score>=60)return"C";return"D";}
function riskLight(score,profile,chg){if(score>=80&&profile.type!=="highAI")return{label:"🟢 普通偏低",text:"整體風險相對可控。"};if(score>=70)return{label:"🟡 普通",text:"可觀察或小量試單，但不宜重壓。"};if(score>=58)return{label:"🟠 注意",text:"資料不足或訊號未共振，需保守。"};return{label:"🔴 偏高",text:"目前不適合積極買進。"};}

function makeDecision(code,total,modules,market,profile){
  const price=Number(market.price||0),type=profile.type,budget=Number(market.budget||0),chg=Number(market.changePercent);
  let pullbacks=total>=82?{buy1:price*.98,buy2:price*.94,buy3:price*.90}:total>=70?{buy1:price*.97,buy2:price*.93,buy3:price*.88}:{buy1:price*.95,buy2:price*.90,buy3:price*.85};
  const isHot=Number.isFinite(chg)&&chg>=3.5;
  let oneLine,valuationText,valuationDetail,actionText,actionDetail,positionText,positionDetail,badge,finalAction,finalActionText;
  if(total>=82){
    oneLine=isHot?"條件偏強，但今天漲幅偏大，不追高，等小回檔分批。":"條件偏強，可分批布局。";
    valuationText=isHot?"短線偏熱，但不等於不能買":"合理區間，可分批";
    valuationDetail=isHot?`今天漲幅偏大，第一買點先看 ${money(pullbacks.buy1)} 元附近。`:`可從 ${money(pullbacks.buy1)} 元附近開始布局。`;
    actionText="分批布局"; actionDetail=`第一買點 ${money(pullbacks.buy1)} 元，第二買點 ${money(pullbacks.buy2)} 元。`;
    badge="可分批"; finalAction="可分批布局"; finalActionText="先建立小部位，保留資金等第二買點。";
  }else if(total>=70){
    oneLine=isHot?"今天偏熱，不追高；但可列入觀察，等回檔再買。":"目前可小量試單，不必等到完全低估才開始觀察。";
    valuationText=isHot?"短線偏熱":"合理區間 / 資料待補";
    valuationDetail=isHot?`建議等回到 ${money(pullbacks.buy1)} 元附近再考慮。`:`可小量建立觀察單，加碼點在 ${money(pullbacks.buy2)} 元附近。`;
    actionText="小量試單"; actionDetail=`先小部位測試，不一次買滿；回檔至 ${money(pullbacks.buy2)} 元附近再加碼。`;
    badge="小量試單"; finalAction="可小量試單"; finalActionText="適合零股或小部位，不適合重壓。";
  }else if(total>=58){
    oneLine="目前不是不能買，而是資料與訊號還不夠完整，建議等待確認。";
    valuationText="資料不足，不直接判定偏高";
    valuationDetail=`缺 PE/EPS/法人/均線時，先保守；觀察 ${money(pullbacks.buy1)} 元以下是否有支撐。`;
    actionText="等待確認"; actionDetail=`等回檔、站上均線或法人轉買後再評估。`;
    badge="等待確認"; finalAction="等待確認"; finalActionText="不是看壞，而是需要更多資料與更好價格。";
  }else{
    oneLine="目前條件不足，暫不建議進場。";
    valuationText="風險偏高"; valuationDetail="評分偏低，先不要急著買。";
    actionText="暫不進場"; actionDetail="等待分數改善或價格進入明顯低估區。";
    badge="暫避"; finalAction="暫避"; finalActionText="保留現金，等待更好的機會。";
  }
  let sharesNow=0;
  if(type==="highAI"){sharesNow=total>=82?20:total>=70?10:0;positionText=sharesNow?`先買 ${sharesNow} 股零股`:"先不買或只觀察";positionDetail="高價 AI 熱門股波動大，以 10～20 股零股試單與分批為主。";}
  else if(type==="financial"||type==="etf"){sharesNow=total>=82?1000:total>=70?500:0;positionText=sharesNow>=1000?"可先買 1 張":sharesNow?"可先買 500 股觀察":"先等待";positionDetail="金融股/ETF較適合整張分批，但仍應避開短線過熱與大盤風險。";}
  else{sharesNow=total>=82?100:total>=70?20:0;positionText=sharesNow?`先買 ${sharesNow} 股`:"先觀察";positionDetail="一般成長股建議分 3～5 批，避免一次買在短線高點。";}
  if(budget>0&&price>0){const suggestedCash=total>=82?budget*.3:total>=70?budget*.15:total>=58?budget*.05:0;const budgetShares=Math.floor(suggestedCash/price);if(budgetShares>0){sharesNow=sharesNow?Math.min(sharesNow,budgetShares):budgetShares;positionText=`依預算先買 ${sharesNow} 股`;positionDetail=`以預算 ${money(budget)} 元估算，第一階段約投入 ${money(sharesNow*price)} 元，保留資金等待第二、第三買點。`;}}
  const risk=riskLight(total,profile,chg);
  const grade=overallGrade(total);
  const why=buildWhyList(total,profile,market);
  return{oneLine,valuationText,valuationDetail,actionText,actionDetail,positionText,positionDetail,badge,buy1:pullbacks.buy1,buy2:pullbacks.buy2,buy3:pullbacks.buy3,sharesNow,grade,riskLight:risk.label,riskText:risk.text,finalAction,finalActionText,why};
}

function buildWhyList(total,profile,market){
  const list=[];
  if(profile.growth==="高"||profile.growth==="中高") list.push("成長題材具備想像空間，是主要加分來源。");
  if(profile.type==="highAI") list.push("高價 AI 熱門股波動較大，因此建議零股試單與分批。");
  if(profile.type==="financial") list.push("金融股較適合用整張分批，但需留意大盤與利率環境。");
  if(profile.type==="etf") list.push("ETF適合長期分批，但仍要避免短線追高。");
  if(Number.isFinite(Number(market.changePercent))&&Number(market.changePercent)>=3) list.push("今日漲幅偏大，追高風險上升。");
  if(total>=82) list.push("綜合評分偏強，適合分批而非一次買滿。");
  else if(total>=70) list.push("綜合評分中上，適合小量建立觀察部位。");
  else list.push("目前資料仍不足，等待回檔或補充法人、均線與財報資料會更安全。");
  return list;
}
