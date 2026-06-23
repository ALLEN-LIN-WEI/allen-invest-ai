const $ = id => document.getElementById(id);
let currentStock = null;

document.querySelectorAll("[data-jump]").forEach(b=>b.addEventListener("click",()=>$(b.dataset.jump).scrollIntoView({behavior:"smooth"})));
document.querySelectorAll(".chip").forEach(b=>b.addEventListener("click",()=>{$("stockInput").value=b.dataset.stock; runAnalyze();}));
$("analyzeBtn").addEventListener("click", e=>{e.preventDefault(); runAnalyze();});
$("stockInput").addEventListener("keydown", e=>{ if(e.key==="Enter") runAnalyze(); });
$("watchAddBtn").addEventListener("click",()=>addWatch($("watchInput").value));
$("watchClearBtn").addEventListener("click",()=>{localStorage.removeItem("allenWatchlistV9"); renderWatchlist();});

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
  $("totalScore").textContent = a.total;
  document.querySelector(".score-dial").style.setProperty("--p", `${a.total}%`);

  $("stockName").textContent = `${m.name || a.profile.name}（${m.symbol}）`;
  $("stockMeta").textContent = `${a.profile.type}｜${a.profile.industry[0] || "一般台股"}`;
  $("price").textContent = `${money(m.price)} 元`;
  $("change").textContent = m.changePercent!==null && m.changePercent!==undefined ? `${m.changePercent}%` : "--";
  $("volume").textContent = m.volume ? `${money(m.volume)} 張` : "--";
  $("updatedAt").textContent = m.updateTime || "--";
  $("sourceMode").textContent = m.mode || "--";
  $("sourceText").textContent = m.source || "--";

  renderBars(a.scores);
  $("fairCurrent").textContent = `${money(m.price)} 元`;
  $("fairRange").textContent = `${money(a.fair.low)}～${money(a.fair.high)} 元`;
  $("valuationLight").textContent = a.fair.light;
  $("valuationText").textContent = a.fair.text;

  $("buy1").textContent = `${money(a.decision.buy1)} 元`; $("buy1Text").textContent = "第一批觀察布局";
  $("buy2").textContent = `${money(a.decision.buy2)} 元`; $("buy2Text").textContent = "第二批主要加碼";
  $("buy3").textContent = `${money(a.decision.buy3)} 元`; $("buy3Text").textContent = "第三批積極布局";
  $("sharePlan").textContent = a.decision.shares; $("sharePlanText").textContent = a.decision.shareText;

  $("industryBox").innerHTML = a.profile.industry.map(x=>`<span class="pill">${x}</span>`).join("");
  $("retireScore").textContent = `${a.profile.retirement}`;
  $("retireStars").textContent = stars(a.profile.retirement);
  $("retireText").textContent = retirementText(a.profile);

  $("dataScore").textContent = `${a.data.score}%`;
  $("missingBox").innerHTML = a.data.missing.length ? a.data.missing.map(x=>`<span class="pill">${x} 待補</span>`).join("") : `<span class="pill">資料完整</span>`;

  renderReport(m,a);
  renderDetails(a.details);
  renderWatchlist();
}

function renderBars(s){
  const rows = [
    ["基本面",s.fundamental,30],
    ["估值面",s.valuation,25],
    ["籌碼面",s.chip,25],
    ["技術面",s.technical,20]
  ];
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

function retirementText(p){
  if(p.type==="etf") return "適合長期核心配置，可搭配定期定額或回檔加碼。";
  if(p.type==="financial") return "適合現金流與長期持有，但需留意景氣與利率循環。";
  if(p.type==="highAI") return "成長性強但波動大，較適合小部位與分批，不適合作為退休核心。";
  return "可作為成長型衛星部位，需控管比例。";
}

function getWatch(){ return JSON.parse(localStorage.getItem("allenWatchlistV9")||"[]"); }
function setWatch(list){ localStorage.setItem("allenWatchlistV9", JSON.stringify([...new Set(list)])); }
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
