const $=(id)=>document.getElementById(id);let currentStock=null;
document.querySelectorAll("[data-target]").forEach(btn=>{btn.addEventListener("click",()=>$(btn.dataset.target).scrollIntoView({behavior:"smooth"}));});
document.querySelectorAll(".chip").forEach(btn=>{btn.addEventListener("click",()=>{$("stockInput").value=btn.dataset.stock;analyze();});});
$("analyzeBtn").addEventListener("click",e=>{e.preventDefault();analyze();});
$("stockInput").addEventListener("keydown",e=>{if(e.key==="Enter")analyze();});
$("watchAddBtn").addEventListener("click",()=>addWatch($("watchInput").value.trim()));
$("watchClearBtn").addEventListener("click",()=>{localStorage.removeItem("allenWatchlist");renderWatchlist();});
$("addWatchBtn").addEventListener("click",()=>currentStock&&addWatch(currentStock));
function normalize(code){return String(code||"").replace(/\D/g,"").slice(0,6);}
async function fetchMarket(symbol,budget){const res=await fetch(`/.netlify/functions/stock?symbol=${encodeURIComponent(symbol)}&budget=${encodeURIComponent(budget||0)}`);if(!res.ok)throw new Error("後端 API 回應失敗");return await res.json();}
async function analyze(codeInput){
  const code=normalize(codeInput||$("stockInput").value),budget=Number($("budgetInput").value||0);
  if(!code){alert("請輸入股票代號");return;}
  currentStock=code;$("stockInput").value=code;$("loading").classList.remove("hidden");$("emptyState").classList.add("hidden");$("result").classList.add("hidden");
  try{const market=await fetchMarket(code,budget);market.budget=budget;const data=scoreStock(code,market);renderResult(code,market,data);}
  catch(err){alert("取得後端資料失敗，請確認 Netlify Function 是否部署成功。");console.error(err);$("emptyState").classList.remove("hidden");}
  finally{$("loading").classList.add("hidden");}
}
function renderResult(code,market,data){
  const rt=rating(data.total),d=data.decision;$("result").classList.remove("hidden");
  $("oneLineDecision").textContent=d.oneLine;$("decisionBadge").textContent=d.badge;
  $("overallGrade").textContent=d.grade;$("overallGradeText").textContent=`綜合分數 ${data.total} / 100`;
  $("riskLight").textContent=d.riskLight;$("riskText").textContent=d.riskText;
  $("finalAction").textContent=d.finalAction;$("finalActionText").textContent=d.finalActionText;
  $("dataScore").textContent=`${data.dataCompleteness.score}%`;$("dataText").textContent=data.dataCompleteness.score>=70?"資料相對完整":"仍有關鍵資料待串接";
  $("currentPrice").textContent=`${money(market.price)} 元`;
  $("changePercent").textContent=market.changePercent!==null&&market.changePercent!==undefined?`${market.changePercent}%`:"--";
  $("volume").textContent=market.volume?money(market.volume):"--";$("updateTime").textContent=market.updateTime||"--";
  $("fairRange").textContent=`${money(data.fair.low)}～${money(data.fair.high)} 元`;
  $("fairText").textContent=data.fair.text;
  $("valuationText").textContent=d.valuationText;$("valuationDetail").textContent=d.valuationDetail;
  $("actionText").textContent=d.actionText;$("actionDetail").textContent=d.actionDetail;
  $("positionText").textContent=d.positionText;$("positionDetail").textContent=d.positionDetail;
  $("buy1").textContent=`${money(d.buy1)} 元`;$("buy2").textContent=`${money(d.buy2)} 元`;$("buy3").textContent=`${money(d.buy3)} 元`;
  $("sharesNow").textContent=d.sharesNow?`${d.sharesNow} 股`:"暫不買";$("budgetPlan").textContent=d.positionDetail;
  $("stockTitle").textContent=`${market.name||stockName(code)}（${code}）`;
  $("totalScore").textContent=data.total;document.querySelector(".score-circle").style.setProperty("--p",`${data.total}%`);
  $("ratingBadge").textContent=rt.label;$("confidence").textContent=`信心指數：${confidence(data.total)}`;
  $("aiSummary").textContent=`Allen AI 摘要：${market.name||stockName(code)}目前評分為 ${data.total} 分。${d.oneLine}`;
  $("whyList").innerHTML=(d.why||[]).map(x=>`<li>${x}</li>`).join("");
  renderReport(d.report);
  $("yahooLink").href=`https://tw.stock.yahoo.com/quote/${code}.TW`;$("cmoneyLink").href=`https://www.cmoney.tw/forum/stock/${code}`;
  renderBars(data.modules);renderScoreTable(data.rows);renderSource(market);renderMissing(data.dataCompleteness);
  $("analyze").scrollIntoView({behavior:"smooth"});
}
function renderReport(r){$("reportBox").innerHTML=`<h5>${r.title}</h5><p>${r.summary}</p><p>${r.fair}</p><p>${r.buys}</p><p>${r.position}</p><h5>主要理由</h5><ul>${(r.reasons||[]).map(x=>`<li>${x}</li>`).join("")}</ul>`;}
function renderBars(modules){$("moduleBars").innerHTML=Object.entries(modules).map(([k,v])=>{const max=moduleMax[k],pct=Math.round(v/max*100);return`<div class="bar"><div class="bar-head"><span>${k}</span><b>${v} / ${max}</b></div><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div></div>`;}).join("");}
function renderScoreTable(rows){$("scoreTable").innerHTML=rows.map(r=>`<tr><td>${r.module}</td><td>${r.name}</td><td><span class="grade-pill ${r.gradeClass}">${r.grade}</span></td><td>${r.text}</td></tr>`).join("");}
function renderSource(market){$("sourceBox").innerHTML=`<div class="source-pill"><span>資料來源</span><b>${market.source||"--"}</b></div><div class="source-pill"><span>模式</span><b>${market.mode||"--"}</b></div><div class="source-pill"><span>提示</span><b>${market.notice||"正常"}</b></div>`;}
function renderMissing(dc){$("missingBox").innerHTML=(dc.missing&&dc.missing.length)?dc.missing.map(x=>`<div class="missing-item">${x} 尚未完整串接，系統已用保守邏輯處理。</div>`).join(""):`<div class="source-pill"><span>資料狀態</span><b>完整</b></div>`;}
function getWatchlist(){return JSON.parse(localStorage.getItem("allenWatchlist")||"[]");}
function setWatchlist(list){localStorage.setItem("allenWatchlist",JSON.stringify([...new Set(list)]));}
function addWatch(code){code=normalize(code);if(!code){alert("請輸入股票代號");return;}const list=getWatchlist();if(!list.includes(code))list.push(code);setWatchlist(list);$("watchInput").value="";renderWatchlist();}
function removeWatch(code){setWatchlist(getWatchlist().filter(x=>x!==code));renderWatchlist();}
function renderWatchlist(){const list=getWatchlist();if(list.length===0){$("watchlistBox").innerHTML=`<div class="empty">尚未加入自選股。</div>`;return;}$("watchlistBox").innerHTML=list.map(code=>`<article class="stock-card"><h4>${stockName(code)}（${code}）</h4><p>點選分析可取得最新後端資料。</p><div class="card-actions"><button onclick="analyze('${code}')">分析</button><button onclick="removeWatch('${code}')">刪除</button></div></article>`).join("");}
renderWatchlist();
