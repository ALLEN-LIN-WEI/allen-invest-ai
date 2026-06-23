const profiles = {
  "2330": { name:"台積電", type:"highAI", industry:["AI供應鏈 ★★★★★","晶圓代工 ★★★★★","CoWoS ★★★★☆"], base:{fundamental:28, valuation:20, chip:18, technical:17}, retirement:55 },
  "2317": { name:"鴻海", type:"growth", industry:["AI伺服器 ★★★★☆","電動車 ★★★☆☆","代工製造 ★★★★★"], base:{fundamental:24, valuation:19, chip:17, technical:16}, retirement:68 },
  "2377": { name:"微星", type:"highAI", industry:["AI PC ★★★★☆","電競硬體 ★★★★☆"], base:{fundamental:23, valuation:18, chip:15, technical:15}, retirement:50 },
  "6214": { name:"精誠", type:"growth", industry:["系統整合 ★★★★☆","企業軟體 ★★★☆☆"], base:{fundamental:22, valuation:18, chip:15, technical:15}, retirement:62 },
  "2881": { name:"富邦金", type:"financial", industry:["金融股 ★★★★★","壽險 ★★★★☆"], base:{fundamental:24, valuation:20, chip:17, technical:15}, retirement:88 },
  "3221": { name:"台嘉碩", type:"growth", industry:["石英元件 ★★★★☆","車用/通訊 ★★★☆☆"], base:{fundamental:20, valuation:17, chip:14, technical:13}, retirement:48 },
  "0050": { name:"元大台灣50", type:"etf", industry:["市值型ETF ★★★★★","台股核心配置 ★★★★★"], base:{fundamental:26, valuation:19, chip:18, technical:16}, retirement:95 }
};

const detailIndicators = [
["基本面","EPS成長性"],["基本面","EPS穩定性"],["基本面","營收成長"],["基本面","毛利率"],["基本面","營益率"],["基本面","ROE"],["基本面","負債比"],["基本面","自由現金流"],
["估值面","本益比合理性"],["估值面","股價淨值比"],["估值面","殖利率"],["估值面","合理價位置"],["估值面","安全邊際"],
["籌碼面","外資5日"],["籌碼面","外資20日"],["籌碼面","投信5日"],["籌碼面","投信20日"],["籌碼面","自營商"],["籌碼面","三大法人一致性"],["籌碼面","融資變化"],["籌碼面","融券變化"],
["技術面","5MA"],["技術面","10MA"],["技術面","20MA"],["技術面","60MA"],["技術面","120MA"],["技術面","KD"],["技術面","RSI"],["技術面","MACD"],["技術面","支撐"],["技術面","壓力"],
["風險面","波動率"],["風險面","短線漲幅"],["風險面","大盤連動"],["風險面","系統性風險"]
];

function stockProfile(symbol){ return profiles[symbol] || { name:"台股個股", type:"growth", industry:["一般台股 ★★★☆☆"], base:{fundamental:20, valuation:16, chip:13, technical:13}, retirement:55 }; }
function money(n){ if(n===null||n===undefined||isNaN(n)) return "--"; return Number(n).toLocaleString("zh-TW",{maximumFractionDigits:2}); }
function stars(score){ if(score>=90)return"★★★★★"; if(score>=80)return"★★★★☆"; if(score>=70)return"★★★☆☆"; if(score>=60)return"★★☆☆☆"; return"★☆☆☆☆"; }

function analyzeStock(market){
  const p = stockProfile(market.symbol);
  const chg = Number(market.changePercent);
  const s = {...p.base};

  if(Number.isFinite(chg)){
    if(chg >= 5){ s.valuation -= 3; s.technical -= 2; }
    else if(chg >= 3){ s.valuation -= 2; s.technical -= 1; }
    else if(chg <= -4){ s.valuation += 2; }
    else if(chg <= -2){ s.valuation += 1; }
  }
  if(market.pe){
    if(market.pe < 15) s.valuation += 2;
    else if(market.pe > 30) s.valuation -= 3;
    else if(market.pe > 24) s.valuation -= 1;
  }
  if(market.roe && market.roe > 20) s.fundamental += 2;

  if(market.maReady){
    if(market.price > market.ma60) s.technical += 2; else s.technical -= 2;
    if(market.price > market.ma120) s.technical += 2; else s.technical -= 2;
  }
  if(market.volumeReady){
    if(market.volumeRatio >= 1.8 && chg > 0) s.technical += 2;
    if(market.volumeRatio >= 1.8 && chg < 0) s.technical -= 2;
  }
  if(market.institutionalReady){
    if(market.foreign20d > 0) s.chip += 2; else s.chip -= 1;
    if(market.trust20d > 0) s.chip += 1;
  }

  s.fundamental = clamp(s.fundamental,0,30);
  s.valuation = clamp(s.valuation,0,25);
  s.chip = clamp(s.chip,0,25);
  s.technical = clamp(s.technical,0,20);

  const total = Math.round(s.fundamental+s.valuation+s.chip+s.technical);
  const fair = fairValue(market,p,total);
  const decision = decisionEngine(market,p,total,fair,s);
  const data = dataCompleteness(market);
  const details = detailScores(s, market);
  const risks = riskLights(s,market);
  return { profile:p, scores:s, total, fair, decision, data, details, risks };
}

function clamp(n,min,max){ return Math.max(min,Math.min(max,Math.round(n))); }

function dataCompleteness(m){
  const fields = [
    ["即時股價", m.price],
    ["EPS", m.eps],
    ["PE", m.pe],
    ["ROE", m.roe],
    ["法人", m.institutionalReady],
    ["60MA/120MA", m.maReady],
    ["量能", m.volumeReady]
  ];
  const ready = fields.filter(([_,v]) => v !== null && v !== undefined && v !== false).length;
  return { score: Math.round(ready/fields.length*100), missing: fields.filter(([_,v])=>v===null||v===undefined||v===false).map(([k])=>k) };
}

function fairValue(m,p,total){
  const price = Number(m.price||0);
  if(!price) return {low:null,mid:null,high:null,light:"🟠 待確認",text:"缺少價格，無法估算。"};
  let low, mid, high;
  if(p.type==="financial"){ mid=price*0.98; low=mid*0.94; high=mid*1.06; }
  else if(p.type==="etf"){ mid=price; low=mid*0.97; high=mid*1.03; }
  else { mid=price*(total>=80?1.03:total>=70?1.00:0.96); low=mid*0.93; high=mid*1.07; }
  const diff = (price-mid)/mid*100;
  let light = Math.abs(diff)<=5 ? "🟡 合理" : diff < -5 ? "🟢 便宜" : "🔴 偏高";
  let text = `目前股價相對合理價中位數約 ${diff>=0?"+":""}${diff.toFixed(1)}%。`;
  return {low,mid,high,light,text};
}

function decisionEngine(m,p,total,fair,scores){
  const price = Number(m.price||0);
  let label, sentence, risk;
  if(total>=90){ label="強力買進"; sentence="條件非常強，可分批布局，但仍避免一次買滿。"; risk="🟢 低"; }
  else if(total>=80){ label="分批布局"; sentence="基本條件良好，可依買點分批布局。"; risk=p.type==="highAI"?"🟡 中":"🟢 中低"; }
  else if(total>=70){ label="觀察買進"; sentence="條件中上，可小量試單，等待更好價格加碼。"; risk="🟡 中"; }
  else if(total>=60){ label="等待回檔"; sentence="條件尚可但不夠完整，等待回檔或資料補強。"; risk="🟠 注意"; }
  else { label="避免進場"; sentence="條件不足，暫時不建議買進。"; risk="🔴 高"; }

  const buy1 = price ? price*(total>=80?0.97:0.95) : null;
  const buy2 = price ? price*(total>=80?0.93:0.90) : null;
  const buy3 = price ? price*(total>=80?0.88:0.85) : null;

  let shares, shareText;
  if(p.type==="highAI"){
    shares = total>=80 ? "先買 20 股" : total>=70 ? "先買 10 股" : "先觀察";
    shareText = "高價 AI 股用零股試單，等第二買點再加碼。";
  }else if(p.type==="financial" || p.type==="etf"){
    shares = total>=80 ? "可先買 1 張" : total>=70 ? "可先買 500 股" : "先觀察";
    shareText = "金融股/ETF適合整張分批，但仍要避開短線追高。";
  }else{
    shares = total>=80 ? "先買 100 股" : total>=70 ? "先買 20 股" : "先觀察";
    shareText = "一般成長股分 3～5 批，不一次買滿。";
  }

  return {label,sentence,risk,buy1,buy2,buy3,shares,shareText};
}

function riskLights(s,m){
  return {
    fundamental: s.fundamental>=24?"🟢":s.fundamental>=18?"🟡":"🟠",
    valuation: s.valuation>=20?"🟢":s.valuation>=15?"🟡":"🟠",
    chip: s.chip>=20?"🟢":s.chip>=14?"🟡":"🟠",
    technical: s.technical>=16?"🟢":s.technical>=11?"🟡":"🟠"
  };
}

function detailScores(scores,m){
  return detailIndicators.map(([module,name])=>{
    let val = 2;
    if(module==="基本面") val = scores.fundamental>=25?3:scores.fundamental>=20?2:1;
    if(module==="估值面") val = scores.valuation>=20?3:scores.valuation>=15?2:1;
    if(module==="籌碼面") val = m.institutionalReady ? (scores.chip>=20?3:scores.chip>=15?2:1) : 1;
    if(module==="技術面") val = m.maReady ? (scores.technical>=16?3:scores.technical>=12?2:1) : 1;
    if(module==="風險面") val = scores.valuation>=18?3:2;
    const missing = (module==="籌碼面"&&!m.institutionalReady) || (module==="技術面"&&!m.maReady) || (name.includes("EPS")&&!m.eps) || (name.includes("ROE")&&!m.roe);
    return {module,name,grade:grade(val,missing),className:gradeClass(val,missing),text:plain(name,val,missing)};
  });
}

function grade(v,missing){ if(missing)return"C｜待補"; if(v>=3)return"A｜優秀"; if(v===2)return"B｜普通"; return"C｜偏弱"; }
function gradeClass(v,missing){ if(missing)return"grade-c"; if(v>=3)return"grade-a"; if(v===2)return"grade-b"; return"grade-c"; }
function plain(name,v,missing){
  if(missing) return "此項資料尚未完整串接，先保守看待。";
  if(v>=3) return "條件良好，是加分項。";
  if(v===2) return "表現普通，可持續觀察。";
  return "偏弱或資料不足，需保守。";
}
