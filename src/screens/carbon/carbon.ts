// @ts-nocheck
/* Carbon screen 邏輯 — 自 iMarine-Carbon-Tokenization-POC/ui/index.html <script>（原檔 377-883 行）一比一搬入。
   操作邏輯 / API 呼叫 / 分頁切換 / 輪詢 / 錢包 / modal 流程與原 PoC 完全一致，僅做下列「機械式」改動：
     1. const API 由寫死的 127.0.0.1:8000 改為傳入的 apiBase。
     2. 元素查詢改綁本 section root：document.getElementById→byId、document.querySelector→qs、
        document.querySelectorAll→qsa（三個 root-scoped 小工具，見下）。
     3. 保留原樣（本就是全域）：document.addEventListener（全域委派）、document.createElement、
        reviveGlass 內對 <link rel=stylesheet> 的全域查詢、以及 LiquidGlass.*（Kit 為全域）。
   採用 // @ts-nocheck：本檔為既有 JS 逐字搬移，沿用未型別化的 e.target / DOM 屬性存取，
   關閉型別檢查以維持函式主體「逐字不動」（tsc --noEmit 因此對本檔零錯誤）。 */
export function initCarbon(root: HTMLElement, apiBase: string) {
  const LiquidGlass = window.LiquidGlass;
  const byId = (id: string) => root.querySelector("#" + id);
  const qs = (sel: string) => root.querySelector(sel);
  const qsa = (sel: string) => root.querySelectorAll(sel);

LiquidGlass.init();

/* ── state 與工具 ── */
const API = apiBase;
const S = {sus:[], events:[], roles:{}, prices:{}, online:false, busy:false, ctxToken:null};
const fmt = n => Number(n).toLocaleString("en-US");
const imo = id => "IMO" + id;
const shortHash = h => h ? h.slice(0,10) + "…" + h.slice(-6) : "-";
function toastOk(title, message){ LiquidGlass.toast({title, message, duration:3500}); }
function toastErr(e){ LiquidGlass.toast({title:"操作失敗", message:String(e.message||e), duration:6000}); }

// 後端把鏈上 revert 的原始 web3 錯誤（含 {'code':-32603,...}）原樣塞進 400 的 error 欄；
// 這裡萃取人類可讀的 reason（如 Market: not for sale / transfer once only），供 toast 顯示。
function cleanReason(msg){
  const s = String(msg);
  const m = s.match(/reason string ['"]([^'"]+)['"]/) || s.match(/custom error ['"]([^'"]+)['"]/);
  if (m) return m[1];
  if (!/['"]?code['"]?\s*:/.test(s)) return s;   // 後端自組的乾淨訊息（中文等）→ 原樣
  return "鏈上交易被拒（revert）";                 // 原始 dict 但抓不到 reason → 通用訊息
}

async function api(path, body){
  const isPost = body !== undefined;
  const opts = isPost
    ? {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)}
    : {};
  const res = await fetch(API + path, opts);
  if (!res.ok){
    let msg = "HTTP " + res.status;
    try { msg = cleanReason((await res.json()).error || msg); } catch(_){}
    const err = new Error(msg);
    if (isPost) toastErr(err);   // GET 失敗不 toast（輪詢/verify 各自處理，避免 4 秒一則的洗版）
    throw err;
  }
  return res.json();
}

function setBusy(btn, on){
  S.busy = on;
  if (btn){ btn.disabled = on; btn.dataset.label ??= btn.textContent;
    btn.textContent = on ? "送出中…" : btn.dataset.label; }
}

/* ── 掛單價格表：從 events（新→舊）反推 ── */
function derivePrices(events){
  const m = {};
  for (const e of [...events].reverse()){        // 轉為舊→新
    if (e.name === "Listed"){ try{ m[e.token_id] = JSON.parse(e.detail).price / 1e6; }catch(_){} }
    if (e.name === "Sold" || e.name === "Unlisted") delete m[e.token_id];
  }
  return m;
}

/* ── 輪詢 ── */
let pollTimer = null;
async function refresh(){
  try{
    const [st, ev] = await Promise.all([api("/state"), api("/events?limit=1000")]);
    S.sus = st.sus; S.roles = st.roles; S.events = ev; S.prices = derivePrices(ev);
    setOnline(true);
  }catch(_){ setOnline(false); }
  renderAll();
  clearTimeout(pollTimer);
  pollTimer = setTimeout(refresh, S.online ? 4000 : 10000);
}
function setOnline(ok){
  S.online = ok;
  const chip = byId("health-chip");
  chip.classList.toggle("ok", ok);
  byId("health-text").textContent = ok ? "鏈路連線" : "後端離線";
  qsa("[data-needs-backend]").forEach(b=>b.disabled = !ok);
}
function renderAll(){
  if (typeof renderStats === "function") renderStats();
  if (typeof renderWorkbench === "function") renderWorkbench();
  if (typeof renderAudit === "function") renderAudit();
  if (typeof renderDrawer === "function") renderDrawer();
  // 動態重繪出來的按鈕要補套離線 disable（setOnline 只處理當下存在的節點）
  qsa("[data-needs-backend]").forEach(b=>b.disabled = !S.online);
}

/* ── modal context：任何帶 data-token 的觸發元素 ── */
document.addEventListener("click", e=>{
  const el = e.target.closest("[data-token]");
  if (el) S.ctxToken = Number(el.dataset.token);
});

/* ── reviveGlass（UI-ToolBox CLAUDE.md 實測解法：動態折射面板顯影） ── */
function reviveGlass(root = document){
  if (!LiquidGlass.supported) return;
  const panels = [...root.querySelectorAll("[data-lg]")];
  const saved = panels.map(el=>[el, el.style.backdropFilter, el.style.getPropertyValue("-webkit-backdrop-filter")]);
  saved.forEach(([el,a,b])=>{ if(a||b){ el.style.backdropFilter="none"; el.style.setProperty("-webkit-backdrop-filter","none"); } });
  requestAnimationFrame(()=>{
    saved.forEach(([el,a,b])=>{ if(a) el.style.backdropFilter=a; if(b) el.style.setProperty("-webkit-backdrop-filter",b); });
    const link = [...document.querySelectorAll("link[rel=\"stylesheet\"]")].reverse()
      .find(e=>{ try{ return new URL(e.href).origin === location.origin; }catch(_){ return false; } });
    if (!link) return;
    const base = link.href.split("?")[0];
    const clone = link.cloneNode();
    clone.href = base + "?lgrc=" + Date.now();
    clone.addEventListener("load", ()=>link.remove(), {once:true});
    link.after(clone);
  });
}
let reviveTimers = [];
function scheduleRevive(){
  reviveTimers.forEach(clearTimeout);
  reviveTimers = [400, 900, 1800, 3500].map(ms=>setTimeout(reviveGlass, ms));
}

refresh();

/* ── 分頁切換與 stagger 進場 ── */
function ensureEntered(pageId){
  const pg = byId(pageId);
  if (pg.classList.contains("active") && !pg.classList.contains("entered")){
    pg.querySelectorAll(".anim").forEach((el,i)=>el.style.setProperty("--d",(i*0.06)+"s"));
    requestAnimationFrame(()=>requestAnimationFrame(()=>pg.classList.add("entered")));
  }
}
function switchPage(name){
  qsa(".page").forEach(p=>{
    p.classList.toggle("active", p.id === "page-"+name);
    p.classList.remove("entered");
  });
  ensureEntered("page-"+name);
}
qsa("#nav-tabs .lg-tabs__tab").forEach(t=>
  t.addEventListener("click",()=>switchPage(t.dataset.page)));
switchPage("workbench");

/* ── 常駐統計帶 + navbar 發行鈕 ── */
function renderStats(){
  const has = S.sus.length > 0;
  const tonnes = S.sus.reduce((s,u)=>s+u.amount,0);
  setVal("stat-issued", S.sus.length); setVal("stat-tonnes", tonnes);
  setVal("stat-traded", S.sus.filter(u=>u.owner_role==="buyer").length);   // 含已除役（Sold 後 owner=買家）
  setVal("stat-retired", S.sus.filter(u=>u.status==="retired").length);
  const b = byId("btn-issue-nav");
  b.disabled = !S.online || has;                 // 防重複發行：發行後常駐 disabled（spec §3）
  b.textContent = has ? "已發行" : "批次發行";
}
function setVal(id, v){
  const el = byId(id);
  if (el.getAttribute("data-lg-value") !== String(v)) el.setAttribute("data-lg-value", String(v));
}

byId("btn-issue-go").addEventListener("click", async e=>{
  if (S.busy) return;
  setBusy(e.target, true);
  try{
    const r = await api("/pipeline", {});
    toastOk("批次發行完成", `已鑄造 ${fmt(r.issued)} 筆 / ${fmt(r.total_tonnes)} 噸`);
    qs("#m-issue [data-lg-close]").click();
    await refresh();
  }catch(_){}
  setBusy(e.target, false);
});

/* ── 單筆發行 ── */
byId("btn-issue-one-go").addEventListener("click", async e=>{
  if (S.busy) return;
  const ship = byId("one-ship").value.trim();
  const period = byId("one-period").value.trim();
  const gfi = parseFloat(byId("one-gfi").value);
  const mj = parseInt(byId("one-mj").value, 10);
  const fuel = byId("one-fuel").value;
  if (!/^IMO\d+$/.test(ship)){ toastErr(new Error("船舶格式應為 IMO+純數字")); return; }
  if (!/^\d{4}-\d{2}$/.test(period)){ toastErr(new Error("申報期格式應為 YYYY-MM")); return; }
  if (!(gfi > 0)){ toastErr(new Error("實際 GFI 需為正數")); return; }
  if (!Number.isInteger(mj) || mj <= 0){ toastErr(new Error("能耗需為正整數 MJ")); return; }
  setBusy(e.target, true);
  try{
    const r = await api("/issue", {ship_id: ship, reporting_period: period,
                                   attained_gfi: gfi, energy_mj: mj, fuel});
    toastOk("已發行", `SU #${r.token_id} · ${ship} ${period} · ${fmt(r.amount_tonnes)} t`);
    qs("#m-issue-one [data-lg-close]").click();
    await refresh();
  }catch(_){}
  setBusy(e.target, false);
});

/* ── 工作台 ── */
const F = {status:new Set(), roles:new Set(), ship:"", sort:"id"};
const STATUS_TEXT = {held:"持有中", listed:"掛單中", retired:"已除役"};
const ROLE_TEXT = {shipping:"航商", buyer:"買家"};

qsa(".fchip[data-fs]").forEach(b=>b.addEventListener("click",()=>{
  b.classList.toggle("is-on");
  b.classList.contains("is-on") ? F.status.add(b.dataset.fs) : F.status.delete(b.dataset.fs);
  renderWorkbench();
}));
qsa(".fchip[data-fr]").forEach(b=>b.addEventListener("click",()=>{
  b.classList.toggle("is-on");
  b.classList.contains("is-on") ? F.roles.add(b.dataset.fr) : F.roles.delete(b.dataset.fr);
  renderWorkbench();
}));
byId("f-ship").addEventListener("change", e=>{ F.ship = e.target.value; renderWorkbench(); });
byId("wb-sort").addEventListener("change", e=>{ F.sort = e.target.value; renderWorkbench(); });
byId("f-clear").addEventListener("click", ()=>{
  F.status.clear(); F.roles.clear(); F.ship = "";
  qsa(".fchip[data-fs],.fchip[data-fr]").forEach(b=>b.classList.remove("is-on"));
  byId("f-ship").value = "";
  renderWorkbench();
});

function filteredSus(){
  return S.sus.filter(u=>
    (!F.status.size || F.status.has(u.status)) &&
    (!F.roles.size  || F.roles.has(u.owner_role)) &&
    (!F.ship || String(u.ship_id) === F.ship));
}
function sortedSus(list){
  const l = [...list];
  if (F.sort === "tonnes") l.sort((a,b)=>b.amount-a.amount);
  else if (F.sort === "price") l.sort((a,b)=>{
    const pa = a.status==="listed" ? (S.prices[a.token_id] ?? Infinity) : null;
    const pb = b.status==="listed" ? (S.prices[b.token_id] ?? Infinity) : null;
    if (pa!==null && pb!==null) return pa-pb;   // 掛單中在前、價格升冪
    if (pa!==null) return -1;
    if (pb!==null) return 1;
    return b.amount-a.amount;                   // 未掛單在後、噸數降冪
  });
  else l.sort((a,b)=>a.token_id-b.token_id);
  return l;
}

/* 卡片兩型：掛單中=折射（attach+revive）、其他=lg-static 磨砂（108 張全折射會拖垮效能） */
const gridCards = new Map();   // token_id -> {el, variant}
function suCard(u){
  const listed = u.status === "listed";
  const el = document.createElement("div");
  el.className = listed ? "lg lg-card su-card" : "lg-static lg-card su-card";
  if (listed) el.setAttribute("data-lg","");
  el.innerHTML = `
    <div class="su-top">${listed
      ? `<span class="price mono gold" data-f="price"></span>`
      : `<span class="tonnes mono gold">${fmt(u.amount)} t</span>`}
      <span class="pill ${u.status}">${STATUS_TEXT[u.status]}</span></div>
    <div class="su-sub mono">SU #${u.token_id} · ${imo(u.ship_id)}</div>
    ${listed ? `<div class="meta-row"><span>減碳量</span><span class="mono">${fmt(u.amount)} t</span></div>` : ""}
    <div class="meta-row"><span>持有者</span><span data-f="owner">${ROLE_TEXT[u.owner_role] ?? "-"}</span></div>
    ${u.status==="retired" ? `<div class="meta-row"><span>用途</span><span>${u.purpose_name ?? "-"}</span></div>` : ""}
    <div class="meta-row"><span>dataHash</span><span class="mono">${shortHash(u.data_hash)}</span></div>`;
  el.addEventListener("click", e=>{
    if (typeof openDrawer === "function") openDrawer(u.token_id); // Task 3 定義
  });
  return el;
}
function renderWorkbench(){
  const has = S.sus.length > 0;
  byId("wb-genesis").hidden = has;
  byId("wb-main").hidden = !has;
  if (!has){ ensureEntered("page-workbench"); return; }

  const sel = byId("f-ship");
  const ships = [...new Set(S.sus.map(u=>u.ship_id))].sort((a,b)=>a-b);
  if (sel.options.length !== ships.length + 1){
    sel.innerHTML = `<option value="">全部船舶</option>` + ships.map(s=>`<option value="${s}">${imo(s)}</option>`).join("");
    sel.value = F.ship;
  }
  ["held","listed","retired"].forEach(st=>{
    qs(`[data-n="${st}"]`).textContent = S.sus.filter(u=>u.status===st).length;
  });

  const list = sortedSus(filteredSus());
  byId("f-count").textContent = `顯示 ${list.length} / ${S.sus.length} 筆`;
  byId("wb-tag").textContent = `${list.length} 筆`;
  byId("wb-empty").hidden = list.length > 0;

  const grid = byId("su-grid");
  const sig = list.map(u=>u.token_id+":"+u.status).join(",");
  if (grid.dataset.sig !== sig){                 // 集合/順序/狀態變了才動 DOM（穩態 4s 輪詢零重建）
    grid.dataset.sig = sig;
    let newListed = false;
    const keep = new Set();
    list.forEach(u=>{
      keep.add(u.token_id);
      let c = gridCards.get(u.token_id);
      if (!c || c.variant !== u.status){
        if (c) c.el.remove();
        c = {el: suCard(u), variant: u.status};
        gridCards.set(u.token_id, c);
        if (u.status === "listed"){
          LiquidGlass.attach(c.el);
          c.el.querySelectorAll("[data-lg]").forEach(x=>LiquidGlass.attach(x));
          newListed = true;
        }
      }
      grid.appendChild(c.el);                    // 依排序順序排入（既有節點會移動）
    });
    [...gridCards.keys()].filter(id=>!keep.has(id)).forEach(id=>{ gridCards.get(id).el.remove(); gridCards.delete(id); });
    if (newListed) scheduleRevive();
  }
  list.forEach(u=>{                              // 穩態只更新文字
    const el = gridCards.get(u.token_id).el;
    const p = el.querySelector('[data-f="price"]');
    if (p) p.textContent = S.prices[u.token_id] !== undefined ? fmt(S.prices[u.token_id])+" mUSD" : "— mUSD";
    const o = el.querySelector('[data-f="owner"]');
    if (o) o.textContent = ROLE_TEXT[u.owner_role] ?? "-";
  });
  ensureEntered("page-workbench");
}

/* ── SU 詳情 drawer ── */
let drawerToken = null;
function openDrawer(id){
  drawerToken = id;
  const d = byId("su-drawer");
  d.hidden = false;
  requestAnimationFrame(()=>d.classList.add("is-open"));
  resetDrawerVerify();   // 換 token 清掉上一顆的 verify 結果
  renderDrawer();
}
function closeDrawer(){
  drawerToken = null;
  const d = byId("su-drawer");
  d.classList.remove("is-open"); d.hidden = true;
}
function drawerActions(u){
  if (u.status==="listed") return `<button class="lg lg-btn lg-btn--accent" data-lg data-token="${u.token_id}" data-lg-open="#m-buy" data-needs-backend>以買家身分購買</button>`;
  if (u.status==="held" && u.owner_role==="shipping") return `
    <button class="lg lg-btn" data-lg data-token="${u.token_id}" data-lg-open="#m-list" data-needs-backend>上架掛單</button>
    <button class="lg lg-btn" data-lg data-token="${u.token_id}" data-lg-open="#m-retire" data-needs-backend>除役銷毀</button>`;
  if (u.status==="held" && u.owner_role==="buyer") return `<button class="lg lg-btn lg-btn--accent" data-lg data-token="${u.token_id}" data-lg-open="#m-retire" data-needs-backend>除役銷毀</button>`;
  return "";
}
function renderDrawer(){
  if (drawerToken === null) return;
  const u = S.sus.find(x=>x.token_id === drawerToken);
  if (!u){ closeDrawer(); return; }
  byId("d-token").textContent = "SU #" + u.token_id;
  const p = S.prices[u.token_id];
  byId("d-info").innerHTML = `
    <div class="meta-row"><span>船舶</span><span class="mono">${imo(u.ship_id)}</span></div>
    <div class="meta-row"><span>減碳量</span><span class="mono gold">${fmt(u.amount)} t</span></div>
    <div class="meta-row"><span>持有者</span><span>${ROLE_TEXT[u.owner_role] ?? "-"}</span></div>
    <div class="meta-row"><span>狀態</span><span class="pill ${u.status}">${STATUS_TEXT[u.status]}</span></div>
    ${u.status==="listed" ? `<div class="meta-row"><span>掛單價</span><span class="mono gold">${p!==undefined ? fmt(p)+" mUSD" : "—"}</span></div>` : ""}
    ${u.status==="retired" ? `<div class="meta-row"><span>用途</span><span>${u.purpose_name ?? "-"}</span></div>` : ""}
    <div class="meta-row"><span>dataHash</span>
      <button class="copy mono" data-hash="${u.data_hash ?? ""}" title="點擊複製完整 hash">${shortHash(u.data_hash)}</button></div>`;
  byId("d-actions").innerHTML = drawerActions(u);
  const evs = S.events.filter(e=>e.token_id === u.token_id);
  byId("d-timeline").innerHTML = evs.length ? evs.map(e=>{
    let d = {}; try{ d = JSON.parse(e.detail); }catch(_){}
    const txt = (EVENT_TEXT[e.name] || (()=>e.detail))(d);
    return `<li><span class="ts mono">${e.ts}</span><span class="nm">${e.name}</span><span class="dt">${txt}</span></li>`;
  }).join("") : `<li style="border:none;color:var(--ink-40)">（尚無事件）</li>`;
  qsa("#su-drawer [data-needs-backend]").forEach(b=>b.disabled = !S.online);
}
byId("drawer-close").addEventListener("click", closeDrawer);
byId("drawer-overlay").addEventListener("click", closeDrawer);
document.addEventListener("keydown", e=>{
  if (e.key === "Escape" && drawerToken !== null && !qs(".lg-modal.is-open")) closeDrawer();
});
document.addEventListener("click", e=>{
  const c = e.target.closest(".copy[data-hash]");
  if (!c || !c.dataset.hash) return;
  navigator.clipboard?.writeText(c.dataset.hash).then(()=>toastOk("已複製", "完整 dataHash 已複製到剪貼簿"));
});

/* ── verify（drawer 內，防連點錯序） ── */
let verifySeq = 0;
function resetDrawerVerify(){
  byId("d-verify").innerHTML =
    `<button class="lg lg-btn lg-btn--sm" data-lg id="btn-verify" data-needs-backend ${S.online?"":"disabled"}>驗證 dataHash</button>`;
}
document.addEventListener("click", async e=>{
  if (!e.target.closest("#btn-verify")) return;
  const id = drawerToken, seq = ++verifySeq;
  const box = byId("d-verify");
  box.innerHTML = `<p style="color:var(--ink-50);font-size:13px;margin:0">驗證中——讀取鏈上 dataHash 並對鏈下明細重算 keccak…</p>`;
  const again = `<button class="lg lg-btn lg-btn--sm" data-lg id="btn-verify" data-needs-backend style="margin-top:10px">重新驗證</button>`;
  try{
    const v = await api("/verify/" + id);
    if (seq !== verifySeq || drawerToken !== id) return;   // 過期回應丟棄（以最後點擊為準）
    const cls = v.match ? "hash-ok" : "hash-bad";
    box.innerHTML = `
      <div class="verdict ${v.match ? "ok" : "bad"}">${v.match ? "MATCH — 鏈下明細未遭竄改" : "MISMATCH — 鏈下明細與鏈上指紋不符"}</div>
      <div class="hashes mono">
        <div class="row"><b>on-chain dataHash</b><span class="val">${v.onchain_hash ?? "-"}</span></div>
        <div class="row"><b>recomputed keccak</b><span class="val ${cls}">${v.recomputed_hash ?? "-"}</span></div>
        <div class="row"><b>off-chain uri</b><span class="val" style="color:var(--ink-50)">${v.uri ?? "-"}</span></div>
      </div>${again}`;
  }catch(err){
    if (seq !== verifySeq || drawerToken !== id) return;
    box.innerHTML = `<p style="color:#ff7a7a;font-size:13px;margin:0">驗證失敗：${err.message}</p>${again}`;
  }
});
/* 稽核列尾「驗證」：開 drawer 並自動觸發 */
document.addEventListener("click", e=>{
  const t = e.target.closest("[data-open-drawer]");
  if (!t) return;
  openDrawer(Number(t.dataset.openDrawer));
  byId("btn-verify")?.click();
});

/* 開 modal 時帶入 SU 摘要 */
document.addEventListener("click", e=>{
  const t = e.target.closest("[data-lg-open]");
  if (!t || t.dataset.token === undefined) return;
  const u = S.sus.find(x=>x.token_id === Number(t.dataset.token));
  if (!u) return;
  const sum = `SU #${u.token_id} · ${imo(u.ship_id)} · ${fmt(u.amount)} t`;
  if (t.dataset.lgOpen === "#m-list") byId("list-summary").textContent = sum;
  if (t.dataset.lgOpen === "#m-buy"){
    const p = S.prices[u.token_id];
    byId("buy-summary").textContent =
      sum + " · 總價 " + (p !== undefined ? fmt(p)+" mUSD" : "（依鏈上掛單價）");
  }
});

byId("btn-list-go").addEventListener("click", async e=>{
  if (S.busy || S.ctxToken === null) return;
  const price = parseInt(byId("list-price").value, 10);
  if (!Number.isInteger(price) || price <= 0){ toastErr(new Error("售價需為正整數 mUSD")); return; }
  setBusy(e.target, true);
  try{
    await api("/list", {token_id:S.ctxToken, price});
    toastOk("已上架", `SU #${S.ctxToken} 掛單 ${fmt(price)} mUSD`);
    qs("#m-list [data-lg-close]").click();
    await refresh();
  }catch(_){}
  setBusy(e.target, false);
});
byId("btn-buy-go").addEventListener("click", async e=>{
  if (S.busy || S.ctxToken === null) return;
  setBusy(e.target, true);
  try{
    await api("/buy", {token_id:S.ctxToken});
    toastOk("交易完成", `SU #${S.ctxToken} 已由買家購入（transfer-once 已用畢）`);
    qs("#m-buy [data-lg-close]").click();
    await refresh();
  }catch(_){}
  setBusy(e.target, false);
});

/* ── 除役 ── */
document.addEventListener("click", e=>{
  const t = e.target.closest('[data-lg-open="#m-retire"][data-token]');
  if (!t) return;
  const u = S.sus.find(x=>x.token_id === Number(t.dataset.token));
  if (u) byId("retire-summary").textContent =
    `SU #${u.token_id} · ${imo(u.ship_id)} · ${fmt(u.amount)} t`;
});
byId("btn-retire-go").addEventListener("click", async e=>{
  if (S.busy || S.ctxToken === null) return;
  const purpose = Number(qs('input[name="purpose"]:checked').value);
  setBusy(e.target, true);
  try{
    await api("/retire", {token_id:S.ctxToken, purpose});
    toastOk("已除役銷毀", `SU #${S.ctxToken} 已 burn——至「稽核」分頁查看 Retired 事件與 verify`);
    qs("#m-retire [data-lg-close]").click();
    await refresh();
  }catch(_){}
  setBusy(e.target, false);
});

/* ── 稽核 ── */
const EVENT_TEXT = {
  Issued:  d => `發行予航商 · ${fmt(d.amount)} t`,
  Listed:  d => `掛單 ${fmt(d.price/1e6)} mUSD`,
  Sold:    d => `買家以 ${fmt(d.price/1e6)} mUSD 購入`,
  Unlisted:() => "撤下掛單",
  Retired: d => `除役用途 ${d.purpose}`,
};
const EF = new Set();   // 空 = 全部（含 Unlisted）
qsa("#ev-chips .fchip").forEach(b=>b.addEventListener("click", ()=>{
  b.classList.toggle("is-on");
  b.classList.contains("is-on") ? EF.add(b.dataset.ev) : EF.delete(b.dataset.ev);
  renderAudit();
}));
function renderAudit(){
  const byShip = {};
  S.sus.forEach(u=>byShip[u.ship_id]=(byShip[u.ship_id]||0)+u.amount);
  const top = Object.entries(byShip).sort((a,b)=>b[1]-a[1]).slice(0,12);
  const chart = byId("chart-ships");
  const pts = top.map(t=>t[1]).join(","), lbl = top.map(t=>"…"+String(t[0]).slice(-3)).join(",");
  if (chart.getAttribute("data-lg-points") !== pts){
    chart.setAttribute("data-lg-points", pts); chart.setAttribute("data-lg-labels", lbl);
  }
  byId("audit-tag").textContent = fmt(S.sus.length)+" 筆";
  byId("su-tbody").innerHTML = S.sus.map(u=>`
    <tr>
      <td class="mono">${u.token_id}</td>
      <td class="mono">${imo(u.ship_id)}</td>
      <td class="mono gold">${fmt(u.amount)}</td>
      <td>${u.owner_role ?? "-"}</td>
      <td><span class="pill ${u.status}">${u.status}</span></td>
      <td style="color:var(--ink-50)">${u.purpose_name ?? "-"}</td>
      <td><button class="lg lg-btn lg-btn--sm" data-lg data-open-drawer="${u.token_id}" data-needs-backend>驗證</button></td>
    </tr>`).join("");
  const evs = S.events.filter(e=>!EF.size || EF.has(e.name));
  byId("ev-tag").textContent = fmt(evs.length) + " 則";
  byId("ev-tbody").innerHTML = evs.map(e=>{
    let d = {}; try{ d = JSON.parse(e.detail); }catch(_){}
    const txt = (EVENT_TEXT[e.name] || (()=>e.detail))(d);
    return `<tr><td><span class="pill">${e.name}</span></td>
      <td class="mono">#${e.token_id}</td>
      <td style="color:var(--ink-50)">${txt}</td>
      <td class="mono" style="color:var(--ink-40)">${e.ts}</td></tr>`;
  }).join("");
  ensureEntered("page-audit");
}
}
