// Profile page: everything here lives in localStorage (see common.js) – nothing is sent anywhere.
import { BASE, INDEX, REGION_BY, regionOf, $, esc, loadProfile, saveProfile, clearProfile, validateProfile, matchGuides, thumbHTML, swatch, addGrowing, downloadICS, myCropGuides, hardinessZone, hardinessLine, exportCSV, exportMarkdown, exportProfile, nextGrowTask, growStatus, GROW_STATUS_LABEL, debounce, loadPlaces, locationHref, guideHref, favGuideHref, MONTHS } from "./common.js";
import { icon } from "./icons.js";

const CAT = JSON.parse(document.getElementById("of-catalog").textContent);
const CROP = Object.fromEntries(CAT.crops.map((c) => [c.slug, c]));
const VAR = Object.fromEntries(CAT.varieties.map((v) => [`${v.crop}/${v.slug}`, v]));
const GUIDE = Object.fromEntries(INDEX.guides.map((g) => [g.favId || `${g.crop}/${g.region}`, g]));

function tile(href, img, name, sub, fav) {
  return `<li><a href="${href}">${thumbHTML(img)}<strong class="name">${esc(name)}</strong><em class="sci1">${sub ? esc(sub) : "&nbsp;"}</em></a>
    <button class="fav card-fav on" type="button" data-fav="${fav}" aria-pressed="true" title="Remove from favourites">${icon("heart", { filled: true })}<span class="visually-hidden">Remove from favourites</span></button></li>`;
}

function varietyName(crop, slug) {
  if (!slug) return "";
  return VAR[`${crop}/${slug}`]?.name || slug.replace(/-/g, " ");
}

function growCard(g) {
  const c = CROP[g.crop];
  const vName = varietyName(g.crop, g.variety);
  const task = nextGrowTask(g);
  const st = growStatus(g);
  return `<li>
    <button type="button" class="growing-card" data-edit="${esc(g.id)}" aria-haspopup="dialog">
      ${thumbHTML(c?.img, "thumb")}
      <strong class="name">${esc(c?.name || g.crop)}</strong>
      <em class="sci1">${vName ? esc(vName) : "&nbsp;"}</em>
      <span class="grow-meta"><span class="grow-status-pill st-${st}">${esc(GROW_STATUS_LABEL[st])}</span> · ${esc(task)}</span>
    </button>
  </li>`;
}

const UI_KEY = "openfarm.ui";
function loadUi() { try { return JSON.parse(localStorage.getItem(UI_KEY)) || {}; } catch { return {}; } }
function saveUi(ui) { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch {} }
function growingView() { return loadUi().growingView === "calendar" ? "calendar" : "cards"; }

function monthOf(iso) {
  if (!iso) return null;
  const m = String(iso).match(/^\d{4}-(\d{2})/);
  return m ? +m[1] : null;
}

function renderGrowingCalendar(p) {
  const loc = p.location;
  const byCrop = {};
  if (loc?.symbol) {
    for (const { crop, m } of myCropGuides(p)) byCrop[crop] = m;
  }
  const head = ["<th scope='col'>Crop</th>", ...MONTHS.map((mo) => `<th scope='col'>${esc(mo)}</th>`)].join("");
  const rows = p.growing.map((g) => {
    const c = CROP[g.crop];
    const vName = varietyName(g.crop, g.variety);
    const cal = byCrop[g.crop]?.calendar || {};
    const sownM = monthOf(g.sown), plantedM = monthOf(g.planted);
    const cells = MONTHS.map((_, i) => {
      const mo = i + 1;
      const bits = [];
      if ((cal.sow_indoors || []).includes(mo)) bits.push(`<span class="mark sow_indoors">sow in</span>`);
      if ((cal.sow_direct || []).includes(mo)) bits.push(`<span class="mark sow_direct">sow</span>`);
      if ((cal.plant || []).includes(mo)) bits.push(`<span class="mark plant">plant</span>`);
      if ((cal.harvest || []).includes(mo)) bits.push(`<span class="mark harvest">harvest</span>`);
      if ((cal.prune || []).includes(mo)) bits.push(`<span class="mark prune">prune</span>`);
      if (sownM === mo) bits.push(`<span class="mark done">sown${g.sown ? " " + esc(g.sown.slice(8)) : ""}</span>`);
      if (plantedM === mo) bits.push(`<span class="mark done">planted${g.planted ? " " + esc(g.planted.slice(8)) : ""}</span>`);
      return `<td>${bits.join("")}</td>`;
    }).join("");
    return `<tr><th class="crop" scope="row"><button type="button" class="cal-crop" data-edit="${esc(g.id)}">${esc(c?.name || g.crop)}${vName ? ` <em>${esc(vName)}</em>` : ""}</button></th>${cells}</tr>`;
  }).join("");
  return `<div class="growing-cal"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>
    <p class="cal-legend"><i class="on sow_indoors"></i>sow indoors <i class="on sow_direct"></i>sow outside <i class="on plant"></i>plant out <i class="on prune"></i>prune <i class="on harvest"></i>harvest</p>
    <p class="small muted">${loc?.symbol ? "Windows come from your region's guide, when one exists. Dates you recorded are labelled sown/planted." : "Save a location to see sowing and harvest windows from your region's guides. Dates you recorded still appear."}</p></div>`;
}

function renderGrowing(p) {
  const view = growingView();
  const cardsBtn = $("#grow-view-cards"), calBtn = $("#grow-view-cal");
  if (cardsBtn && calBtn) {
    cardsBtn.setAttribute("aria-pressed", view === "cards" ? "true" : "false");
    calBtn.setAttribute("aria-pressed", view === "calendar" ? "true" : "false");
  }
  const gl = $("#growing-list");
  if (!p.growing.length) {
    gl.innerHTML = `<p class="small muted">Nothing yet. Use Add to put a crop or variety on your list.</p>`;
    return;
  }
  gl.innerHTML = view === "calendar"
    ? renderGrowingCalendar(p)
    : `<ul class="crop-grid growing-grid">${p.growing.map(growCard).join("")}</ul>`;
}

function render() {
  const p = loadProfile();
  const loc = p.location, region = loc && (regionOf(loc.symbol) || REGION_BY[loc.region]);
  $("#profile-location").innerHTML = loc
    ? `<p><strong>${esc((loc.label || "").split(",")[0] || `${loc.lat}, ${loc.lon}`)}</strong><br><span class="small">${loc.lat}, ${loc.lon}</span></p>
       ${region ? `<p>${swatch(region)}<a href="${BASE}regions/${region.slug}/">${esc(region.name)}</a> <a class="kg" href="${BASE}help/#koppen" title="Köppen climate class – see Help">${esc(loc.symbol || "")}</a></p>` : ""}
       <div id="hz-box"></div>
       <p class="small"><a data-share-loc href="${BASE}#where">Shareable link</a> · <a href="${BASE}#where">Change location</a></p>`
    : `<p class="small">No location saved. <a href="${BASE}#where">Find your location</a> on the home page.</p>`;
  if (loc) {
    hardinessZone(loc.lat, loc.lon).then((h) => { const b = $("#hz-box"); if (b) b.innerHTML = hardinessLine(h); }).catch(() => {});
    loadPlaces().then(() => {
      const a = document.querySelector("[data-share-loc]");
      if (!a) return;
      const href = locationHref(loc.lat, loc.lon);
      a.href = href;
      const q = href.includes("?") ? href.slice(href.indexOf("?")) : href;
      a.textContent = q;
    });
  }

  renderGrowing(p);

  const f = p.favourites;
  let h = "";
  if (f.crops.length) h += `<h3 class="group">Crops</h3><ul class="crop-grid">${f.crops.map((s) => tile(`${BASE}crops/${s}/`, CROP[s]?.img, CROP[s]?.name || s, CROP[s]?.sci, `crop:${s}`)).join("")}</ul>`;
  if (f.varieties.length) h += `<h3 class="group">Varieties</h3><ul class="crop-grid">${f.varieties.map((id) => { const v = VAR[id], [c, s] = id.split("/");
    return tile(`${BASE}crops/${c}/${s}/`, CROP[c]?.img, v?.name || s, v?.cultivarName || CROP[c]?.name, `variety:${id}`); }).join("")}</ul>`;
  if (f.guides.length) h += `<h3 class="group">Guides</h3><ul class="crop-grid">${f.guides.map((id) => { const g = GUIDE[id], parts = id.split("/"), c = parts[0], r = parts.at(-1);
    return tile(favGuideHref(parts.join("/")), CROP[c]?.img, g?.title || id, REGION_BY[r]?.name, `guide:${id}`); }).join("")}</ul>`;
  $("#fav-list").innerHTML = h || `<p class="small muted">No favourites yet — use the heart on any crop, variety or guide.</p>`;

  const mine = new Set([...f.crops, ...p.growing.map((g) => g.crop), ...f.varieties.map((x) => x.split("/")[0]), ...f.guides.map((x) => x.split("/")[0])]);
  const pg = $("#profile-guides");
  if (!loc?.symbol || !region) { pg.innerHTML = `<p class="small muted">Save a location to see the guides for your climate region.</p>`; return; }
  const list = matchGuides(loc.symbol, loc.lat).filter((m) => !mine.size || mine.has(m.g.crop));
  pg.innerHTML = list.length ? `<p class="small muted">${mine.size ? "For your favourites and the crops you grow" : "All guides"} in ${swatch(region)}${esc(region.name)}.</p>
    <ul class="crop-grid guide-grid">${list.map(({ g, kind, via }) => `<li><a href="${guideHref(g)}">${thumbHTML(g.img)}
      <strong class="name">${esc(g.name)}</strong><em class="sci1">${g.sci ? esc(g.sci) : "&nbsp;"}</em><span class="gtitle">${esc(g.title)}</span>
      <span class="badges">${kind === "similar" && via ? `<span class="note-flag">nearest region: ${esc(via.name.toLowerCase())}</span>` : ""}</span></a></li>`).join("")}</ul>`
    : `<p class="small muted">No guides for these crops in your climate region (or a similar one) yet.</p>`;
}

// ---- Add search dialog + edit dialog ----
const searchDlg = $("#grow-search"), editDlg = $("#grow-edit"), searchQ = $("#grow-search-q"), searchRes = $("#grow-search-results");
const editForm = $("#grow-edit-form");
let editingId = null, searchActive = -1;

function openDlg(dlg) { dlg.showModal(); }
function closeDlg(dlg) { if (dlg.open) dlg.close(); }

function fillVarietyOptions(crop, selected) {
  const vars = CAT.varieties.filter((v) => v.crop === crop);
  const sel = $("#grow-variety");
  sel.innerHTML = `<option value="">–</option>` + vars.map((v) => `<option value="${esc(v.slug)}"${v.slug === selected ? " selected" : ""}>${esc(v.name || v.slug)}</option>`).join("");
  sel.closest("label").hidden = vars.length === 0;
}

function openEditor(id) {
  const p = loadProfile(), item = p.growing.find((g) => g.id === id);
  if (!item) return;
  editingId = id;
  const c = CROP[item.crop];
  $("#grow-edit-title").textContent = c?.name || item.crop;
  $("#grow-edit-lead").textContent = [c?.sci, item.variety ? varietyName(item.crop, item.variety) : ""].filter(Boolean).join(" · ");
  fillVarietyOptions(item.crop, item.variety);
  $("#grow-sown").value = item.sown || "";
  $("#grow-planted").value = item.planted || "";
  $("#grow-bed").value = item.bed || "";
  $("#grow-quantity").value = item.quantity || "";
  $("#grow-notes").value = item.notes || "";
  const st = growStatus(item);
  for (const r of editForm.querySelectorAll('input[name="status"]')) r.checked = r.value === st;
  openDlg(editDlg);
}

function readEdit() {
  const status = editForm.querySelector('input[name="status"]:checked')?.value || "planned";
  return {
    variety: $("#grow-variety").value || null,
    sown: $("#grow-sown").value || "",
    planted: $("#grow-planted").value || "",
    bed: $("#grow-bed").value.trim(),
    quantity: $("#grow-quantity").value.trim(),
    status,
    notes: $("#grow-notes").value,
  };
}

function persistEdit({ announce = true, silent = true } = {}) {
  if (!editingId) return;
  const p = loadProfile(), item = p.growing.find((g) => g.id === editingId);
  if (!item) return;
  Object.assign(item, readEdit());
  saveProfile(p, { silent, announce });
  renderGrowing(p);
}

const persistNotes = debounce(() => persistEdit({ announce: true, silent: true }), 400);

editForm.addEventListener("input", (e) => {
  if (!editingId) return;
  if (e.target.name === "notes") persistNotes();
  else { persistNotes.cancel(); persistEdit({ announce: true, silent: true }); }
});
editForm.addEventListener("change", (e) => {
  if (!editingId || e.target.name === "notes") return;
  persistNotes.cancel();
  persistEdit({ announce: true, silent: true });
});
editDlg.addEventListener("close", () => { persistNotes.flush(); editingId = null; });

$("#grow-remove").addEventListener("click", () => {
  if (!editingId || !confirm("Remove this crop from “What I'm growing”?")) return;
  persistNotes.cancel();
  const id = editingId, p = loadProfile();
  p.growing = p.growing.filter((g) => g.id !== id);
  editingId = null;
  saveProfile(p);
  closeDlg(editDlg);
});

$("#growing-list").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-edit]"); if (btn) openEditor(btn.dataset.edit);
});

function setGrowingView(view) {
  const ui = loadUi();
  ui.growingView = view;
  saveUi(ui);
  renderGrowing(loadProfile());
}
$("#grow-view-cards")?.addEventListener("click", () => setGrowingView("cards"));
$("#grow-view-cal")?.addEventListener("click", () => setGrowingView("calendar"));

function searchHits(q) {
  const nq = q.trim().toLowerCase();
  const hits = [];
  const scoreName = (name, slug, extra) => {
    const nn = (name || "").toLowerCase(), ns = (slug || "").toLowerCase(), hay = `${nn} ${ns} ${extra || ""}`.toLowerCase();
    if (nn === nq || ns === nq) return 100;
    if (nn.startsWith(nq) || ns.startsWith(nq)) return 80;
    if (hay.includes(nq)) return 40;
    return 0;
  };
  if (!nq) {
    return CAT.crops.slice(0, 10).map((c) => ({ kind: "crop", crop: c.slug, variety: null, name: c.name, sub: c.sci, img: c.img }));
  }
  for (const c of CAT.crops) {
    const s = scoreName(c.name, c.slug, c.sci);
    if (s) hits.push({ kind: "crop", crop: c.slug, variety: null, name: c.name, sub: c.sci, img: c.img, score: s });
  }
  for (const v of CAT.varieties) {
    const c = CROP[v.crop];
    const s = scoreName(v.name, v.slug, `${c?.name || ""} ${v.cultivarName || ""}`) - 2;
    if (s > 0) hits.push({ kind: "variety", crop: v.crop, variety: v.slug, name: v.name || v.slug, sub: c?.name, img: c?.img, score: s });
  }
  hits.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return hits.slice(0, 12);
}

function renderSearch(q) {
  const hits = searchHits(q);
  searchActive = hits.length ? 0 : -1;
  searchRes.innerHTML = hits.length ? hits.map((it, i) => `<li role="option" id="gs-${i}" class="sg-opt" data-i="${i}" aria-selected="${i === 0}">
      ${thumbHTML(it.img, "thumb mini")}<span><strong>${esc(it.name)}</strong><em class="sci1">${it.sub ? esc(it.sub) : it.kind === "variety" ? "Variety" : "&nbsp;"}</em></span>
    </li>`).join("") : `<li class="sg-note">No matching crops or varieties.</li>`;
  searchRes._hits = hits;
}

function addFromHit(it) {
  if (!it) return;
  const item = addGrowing(it.crop, it.variety);
  closeDlg(searchDlg);
  render();
  openEditor(item.id);
}

function setSearchActive(i) {
  const hits = searchRes._hits || [];
  if (!hits.length) return;
  searchActive = (i + hits.length) % hits.length;
  searchRes.querySelectorAll("[role=option]").forEach((el, j) => el.setAttribute("aria-selected", j === searchActive));
  searchRes.querySelector(`[data-i="${searchActive}"]`)?.scrollIntoView({ block: "nearest" });
}

$("#add-growing-btn").addEventListener("click", () => {
  searchQ.value = "";
  renderSearch("");
  openDlg(searchDlg);
  searchQ.focus();
});
searchQ.addEventListener("input", () => renderSearch(searchQ.value));
searchQ.addEventListener("keydown", (e) => {
  const hits = searchRes._hits || [];
  if (e.key === "ArrowDown") { e.preventDefault(); setSearchActive(searchActive + 1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); setSearchActive(searchActive - 1); }
  else if (e.key === "Enter") { e.preventDefault(); addFromHit(hits[searchActive]); }
});
searchRes.addEventListener("mousedown", (e) => {
  const li = e.target.closest("[data-i]"); if (!li) return;
  e.preventDefault();
  addFromHit((searchRes._hits || [])[+li.dataset.i]);
});

for (const dlg of [searchDlg, editDlg]) {
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg || e.target.closest("[data-dialog-close]")) closeDlg(dlg);
  });
}

// import / clear
$("#import-file").addEventListener("change", async (e) => {
  const file = e.target.files[0]; e.target.value = ""; if (!file) return;
  const msg = $("#import-msg");
  if (file.size > 2_000_000) { msg.textContent = "That file is too large for an OpenFarm profile."; return; }
  let data;
  try { data = JSON.parse(await file.text()); } catch { msg.textContent = "That file is not valid JSON."; return; }
  const v = validateProfile(data);
  if (!v.ok) { msg.innerHTML = `Not imported – the file doesn't look like an OpenFarm profile:<br>${v.errors.slice(0, 5).map(esc).join("<br>")}`; return; }
  if (!confirm("Replace your current profile in this browser with the imported one?")) return;
  saveProfile(v.profile);
  if (v.profile.location) document.dispatchEvent(new CustomEvent("openfarm:location", { detail: v.profile.location }));
  msg.textContent = `Imported: ${v.profile.favourites.crops.length + v.profile.favourites.varieties.length + v.profile.favourites.guides.length} favourites, ${v.profile.growing.length} crops growing.`;
});
$("#clear-data").addEventListener("click", () => {
  if (!confirm("Delete your saved location, favourites and growing list from this browser? Export first if you want a copy.")) return;
  clearProfile(); $("#import-msg").textContent = "Your data was deleted from this browser.";
});

function icsClick() {
  const n = myCropGuides().filter((x) => x.growing).length;
  if (!n) { $("#import-msg").textContent = ""; alert("Add crops to “What I'm growing” and save a location first – the calendar uses your region's guides."); return; }
  downloadICS();
}
$("#ics-btn")?.addEventListener("click", icsClick);
document.addEventListener("openfarm:profile", render);
document.addEventListener("openfarm:location", render);
render();

(function exportMenu() {
  const btn = $("#export-btn"), menu = $("#export-menu");
  if (!btn || !menu) return;
  const items = () => [...menu.querySelectorAll("[role=menuitem]")];
  const close = () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); };
  const open = () => { menu.hidden = false; btn.setAttribute("aria-expanded", "true"); items()[0]?.focus(); };
  btn.addEventListener("click", () => (menu.hidden ? open() : close()));
  btn.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
  });
  menu.addEventListener("keydown", (e) => {
    const list = items(); const i = list.indexOf(document.activeElement);
    if (e.key === "Escape") { e.preventDefault(); close(); btn.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
    else if (e.key === "Tab") close();
  });
  menu.addEventListener("click", (e) => {
    const it = e.target.closest("[role=menuitem]"); if (!it) return;
    close();
    if (it.dataset.export === "json") exportProfile();
    else if (it.dataset.export === "csv") exportCSV();
    else if (it.dataset.export === "ics") icsClick();
    else if (it.dataset.export === "md") exportMarkdown();
  });
  document.addEventListener("click", (e) => { if (!e.target.closest("[data-export-drop]")) close(); });
})();
