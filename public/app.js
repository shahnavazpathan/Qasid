/* =========================================================
   Helpers
========================================================= */
const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
const NOT_APPLIED_MSG = "You have not applied for this IPO.";
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function storageGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d)) return esc(value);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function fmtNum(n, digits = 0) {
  if (n === null || n === undefined || n === "" || isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("en-IN", { maximumFractionDigits: digits });
}
function fmtX(n) {
  if (n === null || n === undefined || isNaN(Number(n))) return "—";
  return `${Number(n).toFixed(2)}x`;
}
function fmtPrice(ipo) {
  if (ipo.priceMin && ipo.priceMax && ipo.priceMin !== ipo.priceMax) return `₹${fmtNum(ipo.priceMin)} – ₹${fmtNum(ipo.priceMax)}`;
  if (ipo.priceMax || ipo.priceMin) return `₹${fmtNum(ipo.priceMax || ipo.priceMin)}`;
  return ipo.priceBand ? esc(ipo.priceBand) : "—";
}
function normName(name) {
  return String(name || "")
    .toUpperCase()
    .replace(/^\[[^\]]+\]\s*/, "")
    .replace(/\b(LIMITED|LTD|PRIVATE|PVT|IPO|SME|NCD|INDIA|THE|AND)\b/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/* =========================================================
   Theme
========================================================= */
(function initTheme() {
  const saved = storageGet("theme", null);
  if (saved) document.documentElement.dataset.theme = saved;
  $("#themeToggle").addEventListener("click", () => {
    const current = document.documentElement.dataset.theme
      || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    storageSet("theme", next);
  });
})();

/* =========================================================
   Tabs
========================================================= */
function switchTab(tabId) {
  $$(".tab").forEach(el => el.classList.toggle("active", el.id === `tab-${tabId}`));
  $$("[data-tab]").forEach(el => el.classList.toggle("active", el.dataset.tab === tabId));
  storageSet("lastTab", tabId);
  window.scrollTo({ top: 0 });
}
$$("[data-tab]").forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

/* =========================================================
   Saved PANs
========================================================= */
let savedPans = storageGet("savedPans", []);
const PLACEHOLDER_NAME = "Check allotment to fetch name";

function persistPans() { storageSet("savedPans", savedPans); }

function renderSavedList() {
  $("#savedCount").textContent = savedPans.length;
  const box = $("#savedListContainer");
  if (savedPans.length === 0) {
    box.innerHTML = '<p class="muted small">No PANs saved yet.</p>';
  } else {
    box.innerHTML = savedPans.map(sp => `
      <div class="saved-row">
        <div class="saved-pan">${esc(sp.pan)}</div>
        <div class="saved-name" title="${esc(sp.name)}">${esc(sp.nickname ? `${sp.nickname} · ${sp.name}` : sp.name)}</div>
        <button class="delete-btn" data-del="${esc(sp.pan)}" aria-label="Remove ${esc(sp.pan)}">✕</button>
      </div>`).join("");
  }
  renderPanChecklist();
}

function renderPanChecklist() {
  const selected = new Set(storageGet("uncheckedPans", []));
  const box = $("#panChecklist");
  if (savedPans.length === 0) {
    box.innerHTML = '<p class="muted small">No saved PANs. Add some in <button class="link" data-goto="pans">Saved PANs</button> or use the one-time box below.</p>';
    return;
  }
  box.innerHTML = savedPans.map(sp => `
    <label class="pan-check">
      <input type="checkbox" value="${esc(sp.pan)}" ${selected.has(sp.pan) ? "" : "checked"}>
      <span class="saved-pan">${esc(sp.pan)}</span>
      <span class="saved-name">${esc(sp.nickname || (sp.name === PLACEHOLDER_NAME ? "" : sp.name))}</span>
    </label>`).join("");
}

$("#panChecklist").addEventListener("change", () => {
  const unchecked = $$("#panChecklist input:not(:checked)").map(i => i.value);
  storageSet("uncheckedPans", unchecked);
});
$("#selectAllPans").addEventListener("click", () => { storageSet("uncheckedPans", []); renderPanChecklist(); });
$("#selectNoPans").addEventListener("click", () => { storageSet("uncheckedPans", savedPans.map(p => p.pan)); renderPanChecklist(); });
document.addEventListener("click", e => { const g = e.target.closest("[data-goto]"); if (g) switchTab(g.dataset.goto); });

function parsePanInput(text) {
  // Each line/comma chunk: PAN optionally followed by a nickname
  return text.split(/\r?\n|,/).map(s => s.trim()).filter(Boolean).map(chunk => {
    const [pan, ...rest] = chunk.split(/\s+/);
    return { pan: pan.toUpperCase(), nickname: rest.join(" ") };
  });
}

$("#addPansBtn").addEventListener("click", () => {
  const entries = parsePanInput($("#pansInput").value);
  if (entries.length === 0) return;
  const invalid = entries.filter(e => !PAN_RE.test(e.pan)).map(e => e.pan);
  const err = $("#inlineError");
  if (invalid.length) {
    err.textContent = `Invalid format: ${invalid.join(", ")}. A PAN looks like ABCDE1234F.`;
    err.hidden = false;
    setTimeout(() => { err.hidden = true; }, 6000);
  } else {
    err.hidden = true;
  }
  entries.filter(e => PAN_RE.test(e.pan)).forEach(({ pan, nickname }) => {
    const existing = savedPans.find(p => p.pan === pan);
    if (existing) { if (nickname) existing.nickname = nickname; }
    else savedPans.push({ pan, name: PLACEHOLDER_NAME, nickname });
  });
  persistPans();
  $("#pansInput").value = "";
  renderSavedList();
});

$("#savedListContainer").addEventListener("click", e => {
  const btn = e.target.closest("[data-del]");
  if (!btn) return;
  const pan = btn.dataset.del;
  if (confirm(`Remove ${pan}?`)) {
    savedPans = savedPans.filter(p => p.pan !== pan);
    persistPans();
    renderSavedList();
  }
});

$("#clearPans").addEventListener("click", () => {
  if (confirm("Clear all saved PANs from this browser?")) {
    savedPans = [];
    persistPans();
    $("#status").innerHTML = "";
    renderSavedList();
  }
});

$("#exportPans").addEventListener("click", () => {
  const text = savedPans.map(p => [p.pan, p.nickname].filter(Boolean).join(" ")).join("\n");
  navigator.clipboard?.writeText(text).then(() => alert("Copied PAN list to clipboard."), () => prompt("Copy your PANs:", text));
});

/* =========================================================
   Allotment: IPO picker
========================================================= */
let allotmentIpos = [];
let registrarFilter = "all";
let selectedIpoKey = storageGet("selectedIpo", "");

const ipoKey = ipo => `${ipo.source}:${ipo.clientId}`;

async function loadIpos() {
  try {
    const res = await fetch("/api/ipos");
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Failed to fetch IPOs");
    allotmentIpos = data.ipos;
    renderRegistrarChips();
    renderIpoOptions();
  } catch (err) {
    $("#ipoSelect").innerHTML = '<option value="">Unable to load IPO list</option>';
  }
}

function renderRegistrarChips() {
  const counts = {};
  allotmentIpos.forEach(i => { counts[i.source] = counts[i.source] || { label: i.registrar || i.source, n: 0 }; counts[i.source].n++; });
  const chips = [["all", `All (${allotmentIpos.length})`], ...Object.entries(counts).map(([id, c]) => [id, `${c.label} (${c.n})`])];
  $("#registrarChips").innerHTML = chips.map(([id, label]) =>
    `<button class="chip ${registrarFilter === id ? "active" : ""}" data-reg="${esc(id)}">${esc(label)}</button>`).join("");
}

$("#registrarChips").addEventListener("click", e => {
  const chip = e.target.closest("[data-reg]");
  if (!chip) return;
  registrarFilter = chip.dataset.reg;
  renderRegistrarChips();
  renderIpoOptions();
});

function renderIpoOptions() {
  const q = $("#ipoSearch").value.trim().toUpperCase();
  const list = allotmentIpos.filter(i =>
    (registrarFilter === "all" || i.source === registrarFilter) && (!q || i.name.toUpperCase().includes(q)));
  const select = $("#ipoSelect");
  select.innerHTML = list.length
    ? list.map(i => `<option value="${esc(ipoKey(i))}" ${ipoKey(i) === selectedIpoKey ? "selected" : ""}>${esc(i.name)}</option>`).join("")
    : '<option value="" disabled>No matching IPOs</option>';
  showSelectedIpo();
}

function showSelectedIpo() {
  const ipo = allotmentIpos.find(i => ipoKey(i) === selectedIpoKey);
  $("#selectedIpo").innerHTML = ipo
    ? `Selected: <strong>${esc(ipo.name)}</strong> · ${esc(ipo.registrar || ipo.source)}`
    : "No IPO selected";
}

$("#ipoSearch").addEventListener("input", renderIpoOptions);
$("#ipoSelect").addEventListener("change", e => {
  selectedIpoKey = e.target.value;
  storageSet("selectedIpo", selectedIpoKey);
  showSelectedIpo();
});

// Jump from the IPO dashboard to its allotment, if a registrar has published it
function findAllotmentIpo(name) {
  const target = normName(name);
  if (!target) return null;
  return allotmentIpos.find(i => normName(i.name) === target)
    || allotmentIpos.find(i => { const n = normName(i.name); return n && (n.startsWith(target) || target.startsWith(n)); });
}

function openAllotmentFor(ipo) {
  selectedIpoKey = ipoKey(ipo);
  storageSet("selectedIpo", selectedIpoKey);
  registrarFilter = "all";
  $("#ipoSearch").value = "";
  renderRegistrarChips();
  renderIpoOptions();
  closeDrawer();
  switchTab("check");
}

/* =========================================================
   Allotment: check + results
========================================================= */
let lastResults = [];

$("#checkButton").addEventListener("click", handleCheck);

async function handleCheck() {
  const ipo = allotmentIpos.find(i => ipoKey(i) === selectedIpoKey);
  if (!ipo) return alert("Please select an IPO.");

  const checked = $$("#panChecklist input:checked").map(i => i.value);
  const oneOff = parsePanInput($("#oneOffPans").value).map(e => e.pan);
  const pans = [...new Set([...checked, ...oneOff])];
  if (pans.length === 0) return alert("Select at least one saved PAN, or enter one in the one-time box.");
  if (pans.length > 50) return alert("Maximum 50 PANs at once.");

  const btn = $("#checkButton");
  btn.disabled = true;
  btn.textContent = "Checking…";
  $("#checkSummary").hidden = true;
  $("#status").innerHTML = `<div class="status-message loading">Checking ${pans.length} PAN(s) on ${esc(ipo.registrar || ipo.source)}…</div>`;

  try {
    const response = await fetch("/api/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: ipo.clientId, source: ipo.source, pans })
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error || "Check failed.");

    let listUpdated = false;
    data.results.forEach(r => {
      if (r.success && r.data?.Name && r.data.Name !== "N/A" && !r.data.Name.includes("Not Provided")) {
        const match = savedPans.find(p => p.pan === r.pan);
        if (match && match.name !== r.data.Name) { match.name = r.data.Name; listUpdated = true; }
      }
    });
    if (listUpdated) { persistPans(); renderSavedList(); }

    const rank = r => r.success && r.data ? (Number(r.data.Allotted) > 0 ? 1 : 2) : r.error === NOT_APPLIED_MSG ? 3 : 4;
    data.results.sort((a, b) => rank(a) - rank(b));
    lastResults = data.results;
    renderSummary(data.results, ipo);
    renderResults(data.results, ipo);
  } catch (err) {
    $("#status").innerHTML = `<div class="status-message error">${esc(err.message || "Server error occurred.")}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Check Allotment";
  }
}

function renderSummary(results) {
  const applied = results.filter(r => r.success).length;
  const allotted = results.filter(r => r.success && Number(r.data.Allotted) > 0);
  const shares = allotted.reduce((s, r) => s + Number(r.data.Allotted), 0);
  const box = $("#checkSummary");
  box.innerHTML = `
    <div class="stat"><b>${results.length}</b><span>PANs checked</span></div>
    <div class="stat"><b>${applied}</b><span>Applied</span></div>
    <div class="stat good"><b>${allotted.length}</b><span>Allotted</span></div>
    <div class="stat good"><b>${fmtNum(shares)}</b><span>Shares allotted</span></div>`;
  box.hidden = false;
}

function renderResults(results, ipo) {
  const knownName = pan => {
    const sp = savedPans.find(p => p.pan === pan);
    if (!sp) return null;
    const name = sp.name !== PLACEHOLDER_NAME ? sp.name : "";
    return [sp.nickname, name].filter(Boolean).join(" · ") || null;
  };

  const cards = results.map(r => {
    let badge = '<span class="badge badge-gray">NOT APPLIED</span>';
    let body = "";
    const allotted = r.success && Number(r.data.Allotted) > 0;

    if (r.success) {
      badge = allotted ? '<span class="badge badge-green">ALLOTTED</span>' : '<span class="badge badge-red">NOT ALLOTTED</span>';
      const apps = r.data.Applications || [];
      body = `
        <div class="investor-details">
          <div><b>${esc(r.data.Name)}</b></div>
          <div>Allotted: <b>${fmtNum(r.data.Allotted)}</b> shares${r.data.Applied ? ` · Applied: <b>${fmtNum(r.data.Applied)}</b>` : ""}${apps.length > 1 ? ` · ${apps.length} applications` : ""}</div>
        </div>`;
    } else {
      const name = knownName(r.pan);
      if (r.error !== NOT_APPLIED_MSG) badge = '<span class="badge badge-gray">ERROR</span>';
      body = (name ? `<div class="investor-details"><b>${esc(name)}</b></div>` : "")
        + `<div class="result-error">${esc(r.error || "Details unavailable.")}</div>`;
    }

    return `
      <div class="result-card ${allotted ? "allotted" : ""}">
        <div class="result-header"><span class="pan">${esc(r.pan)}</span>${badge}</div>
        ${body}
      </div>`;
  }).join("");

  $("#status").innerHTML = `
    <div class="result-actions">
      <button class="btn btn-ghost btn-sm" id="copyResults">Copy results</button>
      <button class="btn btn-ghost btn-sm" id="csvResults">Download CSV</button>
    </div>${cards}`;

  $("#copyResults").onclick = () => {
    const lines = [`${ipo.name} – allotment`, ...lastResults.map(r =>
      `${r.pan}: ${r.success ? (Number(r.data.Allotted) > 0 ? `ALLOTTED ${r.data.Allotted}` : "Not allotted") : r.error}`)];
    navigator.clipboard?.writeText(lines.join("\n")).then(() => alert("Copied."));
  };
  $("#csvResults").onclick = () => {
    const rows = [["PAN", "Name", "Status", "Applied", "Allotted"], ...lastResults.map(r => [
      r.pan, r.success ? r.data.Name : (knownName(r.pan) || ""),
      r.success ? (Number(r.data.Allotted) > 0 ? "Allotted" : "Not allotted") : r.error,
      r.success ? r.data.Applied || "" : "", r.success ? r.data.Allotted : ""])];
    const csv = rows.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${normName(ipo.name).replace(/ /g, "_") || "allotment"}.csv`;
    a.click();
  };
}

/* =========================================================
   IPO dashboard
========================================================= */
let market = null;
let marketStatus = "open";
let marketType = "all";

async function loadMarket(force = false) {
  const grid = $("#marketGrid");
  if (!market) grid.innerHTML = Array.from({ length: 6 }, () => '<div class="skeleton"></div>').join("");
  try {
    const res = await fetch(`/api/market${force ? "?refresh=1" : ""}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Failed to load");
    market = data;
    ["open", "upcoming", "closed", "listed"].forEach(s => { $(`#cnt-${s}`).textContent = (data[s] || []).length; });
    const when = new Date(data.updatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    $("#marketUpdated").textContent = `Live from exchanges · updated ${when}${data.sources ? ` · sources: ${data.sources.join(", ")}` : ""}`;
    // Default to whichever bucket has something to show
    if (marketStatus !== "drhp" && (data[marketStatus] || []).length === 0) {
      const firstNonEmpty = ["open", "upcoming", "closed", "listed"].find(s => (data[s] || []).length);
      if (firstNonEmpty) setMarketStatus(firstNonEmpty, false);
    }
    renderMarket();
  } catch (err) {
    if (!market) grid.innerHTML = `<div class="empty">Couldn't load IPO data right now. ${esc(err.message)}</div>`;
  }
}

function setMarketStatus(status, render = true) {
  marketStatus = status;
  $$("#marketStatusSeg .seg-btn").forEach(b => b.classList.toggle("active", b.dataset.status === status));
  if (render) renderMarket();
}

$("#marketStatusSeg").addEventListener("click", e => { const b = e.target.closest("[data-status]"); if (b) setMarketStatus(b.dataset.status); });
$("#marketTypeSeg").addEventListener("click", e => {
  const b = e.target.closest("[data-type]");
  if (!b) return;
  marketType = b.dataset.type;
  $$("#marketTypeSeg .seg-btn").forEach(x => x.classList.toggle("active", x === b));
  renderMarket();
});
$("#marketSearch").addEventListener("input", renderMarket);
$("#marketRefresh").addEventListener("click", () => loadMarket(true));

function marketList() {
  const q = $("#marketSearch").value.trim().toUpperCase();
  return (market?.[marketStatus] || []).filter(i =>
    (marketType === "all" || i.type === marketType) && (!q || i.name.toUpperCase().includes(q) || (i.symbol || "").includes(q)));
}

function gmpHtml(ipo) {
  if (ipo.gmp === null || ipo.gmp === undefined || ipo.gmp === "") return "—";
  const v = Number(ipo.gmp);
  const pct = ipo.priceMax ? ` (${((v / ipo.priceMax) * 100).toFixed(1)}%)` : "";
  return `<span class="${v >= 0 ? "gmp-pos" : "gmp-neg"}">₹${fmtNum(v)}${pct}</span>`;
}

let drhpFilings = null;

async function renderDrhp() {
  const grid = $("#marketGrid");
  if (!drhpFilings) {
    grid.innerHTML = '<div class="empty">Loading SEBI filings…</div>';
    try {
      const data = await (await fetch("/api/market/drhp")).json();
      if (!data.success) throw new Error(data.error);
      drhpFilings = data.filings;
    } catch (err) {
      grid.innerHTML = `<div class="empty">Couldn't load SEBI filings. ${esc(err.message || "")}</div>`;
      return;
    }
  }
  if (marketStatus !== "drhp") return;
  const q = $("#marketSearch").value.trim().toUpperCase();
  const list = drhpFilings.filter(f => !q || f.name.toUpperCase().includes(q));
  grid.innerHTML = list.length ? list.map(f => `
    <a class="ipo-card" href="${esc(f.url)}" target="_blank" rel="noopener" style="text-decoration:none">
      <div class="ipo-card-head">
        <div class="ipo-name">${esc(f.name)}</div>
        <div class="tags"><span class="tag tag-main">${esc(f.kind)}</span></div>
      </div>
      <div class="kv"><div><span>Filed with SEBI</span><b>${fmtDate(f.filedDate)}</b></div><div><span>Document</span><b>View on SEBI ↗</b></div></div>
    </a>`).join("") : '<div class="empty">No matching filings.</div>';
}

function renderMarket() {
  if (marketStatus === "drhp") return renderDrhp();
  if (!market) return;
  const list = marketList();
  const grid = $("#marketGrid");
  if (list.length === 0) {
    grid.innerHTML = `<div class="empty">No ${esc(marketStatus)} IPOs${marketType !== "all" ? ` (${esc(marketType)})` : ""} right now.</div>`;
    return;
  }
  grid.innerHTML = list.map((ipo, idx) => {
    const sub = ipo.subscription?.total;
    const subPct = sub ? Math.min(100, (Math.log10(1 + sub) / Math.log10(101)) * 100) : 0;
    const allot = findAllotmentIpo(ipo.name);
    const dateLine = marketStatus === "upcoming"
      ? `<div><span>Opens</span><b>${fmtDate(ipo.openDate)}</b></div><div><span>Closes</span><b>${fmtDate(ipo.closeDate)}</b></div>`
      : marketStatus === "listed"
        ? `<div><span>Listed</span><b>${fmtDate(ipo.listingDate)}</b></div><div><span>Listing gain</span><b class="${(ipo.listingGain ?? 0) >= 0 ? "gmp-pos" : "gmp-neg"}">${ipo.listingGain !== undefined && ipo.listingGain !== null ? `${Number(ipo.listingGain).toFixed(1)}%` : "—"}</b></div>`
        : `<div><span>Closes</span><b>${fmtDate(ipo.closeDate)}</b></div><div><span>Allotment</span><b>${fmtDate(ipo.allotmentDate)}</b></div>`;
    return `
      <button class="ipo-card" data-idx="${idx}">
        <div class="ipo-card-head">
          <div class="ipo-name">${esc(ipo.name)}</div>
          <div class="tags">
            <span class="tag ${ipo.type === "SME" ? "tag-sme" : "tag-main"}">${esc(ipo.type || "IPO")}</span>
            ${allot ? '<span class="tag tag-open">Allotment out</span>' : ""}
          </div>
        </div>
        <div class="kv">
          <div><span>Price band</span><b>${fmtPrice(ipo)}</b></div>
          <div><span>Lot size</span><b>${fmtNum(ipo.lotSize)}</b></div>
          ${dateLine}
          <div><span>Issue size</span><b>${ipo.issueSizeCr ? `₹${fmtNum(ipo.issueSizeCr, 2)} Cr` : esc(ipo.issueSize || "—")}</b></div>
          <div><span>GMP</span><b>${gmpHtml(ipo)}</b></div>
        </div>
        ${sub ? `<div><div class="sub-line"><span class="muted">Subscribed</span><b>${fmtX(sub)}</b></div><div class="sub-bar"><i style="width:${subPct}%"></i></div></div>` : ""}
      </button>`;
  }).join("");
}

$("#marketGrid").addEventListener("click", e => {
  const card = e.target.closest("[data-idx]");
  if (card) openDrawer(marketList()[Number(card.dataset.idx)]);
});

/* =========================================================
   IPO detail drawer
========================================================= */
function closeDrawer() { $("#drawer").hidden = true; document.body.style.overflow = ""; }
$("#drawer").addEventListener("click", e => { if (e.target.closest("[data-close]")) closeDrawer(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeDrawer(); });

async function openDrawer(ipo) {
  if (!ipo) return;
  $("#drawer").hidden = false;
  document.body.style.overflow = "hidden";
  renderDrawer(ipo, null, true);
  if (ipo.symbol) {
    try {
      const res = await fetch(`/api/market/ipo/${encodeURIComponent(ipo.symbol)}?type=${encodeURIComponent(ipo.type || "")}`);
      const data = await res.json();
      if (data.success && !$("#drawer").hidden) renderDrawer(ipo, data.detail, false);
      else renderDrawer(ipo, null, false);
    } catch { renderDrawer(ipo, null, false); }
  } else {
    renderDrawer(ipo, null, false);
  }
}

function renderDrawer(base, detail, loading) {
  const ipo = { ...base, ...(detail || {}) };
  const allot = findAllotmentIpo(ipo.name);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const steps = [
    ["Opens", ipo.openDate], ["Closes", ipo.closeDate], ["Allotment", ipo.allotmentDate],
    ["Refunds", ipo.refundDate], ["Shares to demat", ipo.creditDate], ["Listing", ipo.listingDate]
  ].filter(([, d]) => d);
  const nextIdx = steps.findIndex(([, d]) => new Date(d) >= today);

  const sub = ipo.subscription || {};
  const subRows = (sub.categories || []).map(c => `
    <tr><td>${esc(c.category)}</td><td class="num">${fmtNum(c.offered)}</td><td class="num">${fmtNum(c.bid)}</td><td class="num"><b>${fmtX(c.times)}</b></td></tr>`).join("");

  const allDocs = [...(detail?.documents || []), ...(base.documents || [])]
    .filter((d, i, arr) => arr.findIndex(x => x.url === d.url) === i);
  const docs = allDocs.map(d => `<a class="btn btn-ghost btn-sm" href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.label)} ↗</a>`).join("");

  $("#drawerBody").innerHTML = `
    <div class="tags" style="margin-bottom:8px">
      <span class="tag ${ipo.type === "SME" ? "tag-sme" : "tag-main"}">${esc(ipo.type || "IPO")}</span>
      ${ipo.exchange ? `<span class="tag">${esc(ipo.exchange)}</span>` : ""}
      ${ipo.symbol ? `<span class="tag">${esc(ipo.symbol)}</span>` : ""}
    </div>
    <h2 id="drawerTitle">${esc(ipo.name)}</h2>
    ${ipo.industry ? `<p class="muted small">${esc(ipo.industry)}</p>` : ""}

    ${allot ? `<p><button class="btn btn-primary btn-block" id="drawerCheck">Check allotment (${esc(allot.registrar || allot.source)})</button></p>` : ""}

    <div class="kv" style="margin-top:14px">
      <div><span>Price band</span><b>${fmtPrice(ipo)}</b></div>
      <div><span>Lot size</span><b>${fmtNum(ipo.lotSize)} shares</b></div>
      <div><span>Min. investment</span><b>${ipo.lotSize && ipo.priceMax ? `₹${fmtNum(ipo.lotSize * ipo.priceMax)}` : "—"}</b></div>
      <div><span>Issue size</span><b>${ipo.issueSizeCr ? `₹${fmtNum(ipo.issueSizeCr, 2)} Cr` : esc(ipo.issueSize || "—")}</b></div>
      <div><span>Face value</span><b>${ipo.faceValue ? `₹${esc(ipo.faceValue)}` : "—"}</b></div>
      <div><span>GMP</span><b>${gmpHtml(ipo)}</b></div>
      ${ipo.registrarName ? `<div><span>Registrar</span><b>${esc(ipo.registrarName)}</b></div>` : ""}
      ${ipo.leadManagers ? `<div><span>Lead managers</span><b>${esc(ipo.leadManagers)}</b></div>` : ""}
      ${ipo.listingPrice ? `<div><span>Listing price</span><b>₹${fmtNum(ipo.listingPrice, 2)}</b></div>` : ""}
      ${ipo.currentPrice ? `<div><span>Current price</span><b>₹${fmtNum(ipo.currentPrice, 2)}</b></div>` : ""}
    </div>

    ${steps.length ? `<h3>Timeline</h3><ul class="timeline">${steps.map(([label, d], i) =>
      `<li class="${nextIdx === -1 || i < nextIdx ? "done" : i === nextIdx ? "next" : ""}"><span>${label}</span><b>${fmtDate(d)}</b></li>`).join("")}</ul>` : ""}

    <h3>Subscription ${sub.total ? `· ${fmtX(sub.total)}` : ""}</h3>
    ${loading ? '<p class="muted small">Loading live subscription…</p>'
      : subRows ? `<table class="table"><thead><tr><th>Category</th><th class="num">Offered</th><th class="num">Bids</th><th class="num">Times</th></tr></thead><tbody>${subRows}</tbody></table>
        ${sub.updatedAt ? `<p class="muted small">As of ${esc(sub.updatedAt)}</p>` : ""}`
      : `<p class="muted small">${ipo.status === "upcoming" ? "Bidding hasn't started yet." : "Category-wise data not available."}</p>`}

    ${docs ? `<h3>Documents</h3><div class="doc-links">${docs}</div>` : loading ? "" : ""}
    ${ipo.about ? `<h3>About</h3><p class="small">${esc(ipo.about)}</p>` : ""}
  `;
  const btn = $("#drawerCheck");
  if (btn) btn.onclick = () => openAllotmentFor(allot);
}

/* =========================================================
   Registrar health footer
========================================================= */
async function loadHealth() {
  try {
    const data = await (await fetch("/api/registrars")).json();
    $("#registrarHealth").innerHTML = data.registrars.map(r => {
      const ok = r.status?.ok;
      const servers = r.servers ? ` (${r.servers.filter(s => s.healthy).length}/${r.servers.length} servers)` : "";
      return `<span title="${esc(r.status?.error || "")}"><i class="dot ${ok === undefined ? "" : ok ? "ok" : "bad"}"></i>${esc(r.label)}${servers}</span>`;
    }).join("");
  } catch {}
}

/* =========================================================
   Boot
========================================================= */
switchTab(storageGet("lastTab", "market"));
renderSavedList();
loadIpos().then(() => { renderMarket(); loadHealth(); });
loadMarket();
setInterval(() => { if (!document.hidden) loadMarket(); }, 60 * 1000);
