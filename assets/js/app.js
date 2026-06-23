const $ = id => document.getElementById(id);
let currentStock = null;

document.querySelectorAll("[data-jump]").forEach(b=>b.addEventListener("click",()=>$(b.dataset.jump).scrollIntoView({behavior:"smooth"})));
document.querySelectorAll(".chip").forEach(b=>b.addEventListener("click",()=>{$("stockInput").value=b.dataset.stock; runAnalyze();}));
$("analyzeBtn").addEventListener("click", e=>{e.preventDefault(); runAnalyze();});
$("stockInput").addEventListener("keydown", e=>{ if(e.key==="Enter") runAnalyze(); });
$("watchAddBtn").addEventListener("click",()=>addWatch($("watchInput").value));
$("watchClearBtn").addEventListener("click",()=>{localStorage.removeItem("allenWatchlistV10"); renderWatchlist();});

function norm(x){ return String(x||"").replace(/\D/g,"").slice(0,6); }

async function runAnalyze(codeArg){
  const code = norm(codeArg || $("stockInput").value);
  const budget = Number($("budgetInput").value || 0);
  if(!code){ alert("請輸入股票代號"); return; }
  currentStock = code; $("stockInput").value = code;
  $("loading").classList.remove("hidden"); $("emptyState").classList.add("hidden"); $("result").classList.add("hidden");
  try{
    const res = await fetch(`/.netlify/functions/stock?symbol=${encodeURIComponent(code)}&budget=${encodeURIComponent(budget)}`);
    if(!res.ok) throw new Error("Function failed");
    const market = await res.json();
    const a = analyzeStock(market);
    render(market,a);
  }catch(err){
    console.error(err);
    alert("取得後端資料失敗，請確認 Netlify Function 是否部署成功。");
  }finally{
    $("loading").classList.add("hidden");
  }
}

function render(m,a){
  $("result").classList.remove("hidden");
  $("finalSentence").textContent = a.decision.sentence;
  $("ratingTag").textContent = a.decision.label;
  $("starTag").textContent = stars(a.total);
  $("riskTag").textContent = `風險 ${a.decision.risk}`;
  $("quoteWarning").classList.toggle("hidden", !m.quoteWarning);
  $("totalScore").textContent = a.total;
  document.querySelector(".score-dial").style.setProperty("--p", `${a.total}%`);

  $("stockName").textContent = `${m.name || a.profile.name}（${m.symbol}）`;
  $("stockMeta").textContent = `${a.profile.type}｜${a.profile.industry[0] || "一般台股"}`;
  $("price").textContent = `${money(m.price)} 元`;
  $("change").textContent = m.changePercent!==null && m.changePercent!==undefined ? `${m.changePercent}%` : "--";
  $("sharePlan").textContent = a.decision.shares;
  $("sharePlanText").textContent = a.decision.shareText;
  $("mainBuy").textContent = `${money(a.decision.buy1)} 元`;
  $("mainBuyText").textContent = "第一批觀察布局";

  renderBars(a.scores);
  $("fairRange").textContent = `${money(a.fair.low)}～${money(a.fair.high)} 元`;
  $("valuationLight").textContent = a.fair.light;
  $("valuationText").textContent = a.fair.text;
  $("riskFundamental").textContent = a.risks.fundamental;
  $("riskValuation").textContent = a.risks.valuation;
  $("riskChip").textContent = a.risks.chip;
  $("riskTechnical").textContent = a.risks.technical;

  $("buy1").textContent = `${money(a.decision.buy1)} 元`;
  $("buy2").textContent = `${money(a.decision.buy2)} 元`;
  $("buy3").textContent = `${money(a.decision.buy3)} 元`;
  $("positionPlan").textContent = a.decision.shares;
  $("positionText").textContent = a.decision.shareText;

  $("ma60").textContent = m.ma60 ? `${money(m.ma60)} 元` : "待補";
  $("ma120").textContent = m.ma120 ? `${money(m.ma120)} 元` : "待補";
  $("maText").textContent = m.maReady ? maText(m) : "尚未取得足夠日K資料，先不納入強判斷。";
  $("avgVolume20").textContent = m.avgVolume20 ? `${money(m.avgVolume20)} 張` : "待補";
  $("volumeRatio").textContent = m.volumeRatio ? `${m.volumeRatio} 倍` : "待補";
  $("volumeText").textContent = m.volumeReady ? volumeText(m) : "量能資料不足，先保守。";
  $("foreign20").textContent = m.institutionalReady ? money(m.foreign20d) : "待接入";
  $("trust20").textContent = m.institutionalReady ? money(m.trust20d) : "待接入";
  $("institutionText").textContent = m.institutionalReady ? "法人資料已納入評分。" : "法人資料為盤後資料，尚未穩定接入。";

  $("industryBox").innerHTML = a.profile.industry.map(x=>`<span class="pill">${x}</span>`).join("");
  $("retireScore").textContent = `${a.profile.retirement}`;
  $("retireStars").textContent = stars(a.profile.retirement);
  $("retireText").textContent = retirementText(a.profile);
  $("dataScore").textContent = `${a.data.score}%`;
  $("missingBox").innerHTML = a.data.missing.length ? a.data.missing.map(x=>`<span class="pill">${x} 待補</span>`).join("") : `<span class="pill">資料完整</span>`;
  $("sourceInfo").textContent = `${m.mode || "--"}｜${m.source || "--"}｜${m.updateTime || "--"}`;

  renderReport(m,a);
  renderDetails(a.details);
}

function renderBars(s){
  const rows = [["基本面",s.fundamental,30],["估值面",s.valuation,25],["籌碼面",s.chip,25],["技術面",s.technical,20]];
  $("scoreBars").innerHTML = rows.map(([n,v,max])=>`
    <div class="bar">
      <div class="bar-head"><span>${n}</span><b>${v}/${max}</b></div>
      <div class="track"><div class="fill" style="width:${Math.round(v/max*100)}%"></div></div>
    </div>`).join("");
}

function renderReport(m,a){
  $("report").innerHTML = `
    <h5>${m.name || a.profile.name}（${m.symbol}）</h5>
    <p>Allen AI 評分為 <b>${a.total}/100</b>，評級為 <b>${a.decision.label}</b>。</p>
    <p>目前股價 ${money(m.price)} 元，合理價區間估算為 ${money(a.fair.low)}～${money(a.fair.high)} 元，估值燈號為 ${a.fair.light}。</p>
    <p>買點規劃：第一買點 ${money(a.decision.buy1)} 元，第二買點 ${money(a.decision.buy2)} 元，第三買點 ${money(a.decision.buy3)} 元。</p>
    <p>技術確認：60MA ${m.ma60?money(m.ma60)+" 元":"待補"}，120MA ${m.ma120?money(m.ma120)+" 元":"待補"}，量能 ${m.volumeRatio?m.volumeRatio+" 倍":"待補"}。</p>
    <p>建議部位：${a.decision.shares}。${a.decision.shareText}</p>
    <p>結論：${a.decision.sentence}</p>
  `;
}

function renderDetails(rows){
  $("detailRows").innerHTML = rows.map(r=>`
    <tr>
      <td>${r.module}</td>
      <td>${r.name}</td>
      <td><span class="grade ${r.className}">${r.grade}</span></td>
      <td>${r.text}</td>
    </tr>`).join("");
}

function maText(m){
  const above60 = m.price > m.ma60;
  const above120 = m.price > m.ma120;
  if(above60 && above120) return "股價站上60MA與120MA，中長線偏多。";
  if(above60 && !above120) return "股價站上60MA但仍低於120MA，屬於修復中。";
  return "股價低於關鍵均線，技術面需保守。";
}
function volumeText(m){
  if(m.volumeRatio >= 2 && m.changePercent > 0) return "倍量上漲，買盤積極。";
  if(m.volumeRatio >= 2 && m.changePercent < 0) return "放量下跌，賣壓偏重。";
  if(m.volumeRatio < 0.7) return "低量整理，方向尚未明確。";
  return "量能正常，需搭配價格與均線判斷。";
}
function retirementText(p){
  if(p.type==="etf") return "適合長期核心配置，可搭配定期定額或回檔加碼。";
  if(p.type==="financial") return "適合現金流與長期持有，但需留意景氣與利率循環。";
  if(p.type==="highAI") return "成長性強但波動大，較適合小部位與分批，不適合作為退休核心。";
  return "可作為成長型衛星部位，需控管比例。";
}

function getWatch(){ return JSON.parse(localStorage.getItem("allenWatchlistV10")||"[]"); }
function setWatch(list){ localStorage.setItem("allenWatchlistV10", JSON.stringify([...new Set(list)])); }
function addWatch(code){ code=norm(code); if(!code)return; const list=getWatch(); if(!list.includes(code))list.push(code); setWatch(list); $("watchInput").value=""; renderWatchlist(); }
function removeWatch(code){ setWatch(getWatch().filter(x=>x!==code)); renderWatchlist(); }
function renderWatchlist(){
  const list=getWatch();
  $("watchlistBox").innerHTML = list.length ? list.map(code=>`
    <div class="watch-card">
      <h4>${stockProfile(code).name}（${code}）</h4>
      <button onclick="runAnalyze('${code}')">分析</button>
      <button onclick="removeWatch('${code}')">刪除</button>
    </div>`).join("") : `<div class="empty">尚未加入自選股。</div>`;
}
renderWatchlist();
