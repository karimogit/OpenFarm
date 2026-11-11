// Profile page: everything here lives in localStorage (see common.js) – nothing is sent anywhere.
import { BASE, INDEX, REGION_BY, $, esc, loadProfile, saveProfile, clearProfile, validateProfile, matchGuides, thumbHTML, swatch, addGrowing, downloadICS, myCropGuides, hardinessZone, hardinessLine, exportCSV, exportMarkdown } from "./common.js";

const CAT = JSON.parse(document.getElementById("of-catalog").textContent);
const CROP = Object.fromEntries(CAT.crops.map((c) => [c.slug, c]));
const VAR = Object.fromEntries(CAT.varieties.map((v) => [`${v.crop}/${v.slug}`, v]));
const GUIDE = Object.fromEntries(INDEX.guides.map((g) => [`${g.crop}/${g.region}`, g]));

function tile(href, img, name, sub, fav) {
  return `<li><a href="${href}">${thumbHTML(img)}<strong class="name">${esc(name)}</strong><em class="sci1">${sub ? esc(sub) : "&nbsp;"}</em></a>
    <button class="fav card-fav on" type="button" data-fav="${fav}" aria-pressed="true" title="Remove from favourites">♥</button></li>`;
}

function render() {
  const p = loadProfile();
  // location
  const loc = p.location, region = loc && REGION_BY[loc.region];
  $("#profile-location").innerHTML = loc
    ? `<p><strong>${esc((loc.label || "").split(",")[0] || `${loc.lat}, ${loc.lon}`)}</strong><br><span class="small">${loc.lat}, ${loc.lon}</span></p>
       ${region ? `<p>${swatch(region)}<a href="${BASE}regions/${region.slug}/">${esc(region.name)}</a> <a class="kg" href="${BASE}help/#koppen" title="Köppen climate class – see Help">${esc(loc.symbol || "")}</a></p>` : ""}
       <div id="hz-box"></div>
       <p class="small"><a href="${BASE}#where">Change location</a></p>`
    : `<p class="small">No location saved. <a href="${BASE}#where">Find your location</a> on the home page.</p>`;
  if (loc) hardinessZone(loc.lat, loc.lon).then((h) => { const b = $("#hz-box"); if (b) b.innerHTML = hardinessLine(h); }).catch(() => {});

  // growing
  const gl = $("#growing-list");
  gl.innerHTML = p.growing.length ? `<ul class="growing">${p.growing.map((g) => {
    const c = CROP[g.crop], vars = CAT.varieties.filter((v) => v.crop === g.crop);
    return `<li data-id="${esc(g.id)}">
      <div class="g-head">${thumbHTML(c?.img, "thumb mini")}
        <div><a href="${BASE}crops/${g.crop}/"><strong>${esc(c?.name || g.crop)}</strong></a>${c?.sci ? ` <em class="sci">${esc(c.sci)}</em>` : ""}</div>
        <button type="button" class="link-btn" data-remove>Remove</button></div>
      <div class="g-fields">
        ${vars.length ? `<label>Variety <select data-field="variety"><option value="">–</option>${vars.map((v) => `<option value="${v.slug}"${v.slug === g.variety ? " selected" : ""}>${esc(v.name)}</option>`).join("")}</select></label>` : ""}
        <label>Sown <input type="date" data-field="sown" value="${esc(g.sown)}"></label>
        <label class="notes">Notes <textarea data-field="notes" rows="2" maxlength="5000" placeholder="Bed, source of seed, how it went…">${esc(g.notes)}</textarea></label>
      </div></li>`;
  }).join("")}</ul>` : `<p class="small muted">Nothing yet. Add a crop below, or tap “＋ I'm growing this” on any crop, variety or guide page.</p>`;

  // favourites
  const f = p.favourites;
  let h = "";
  if (f.crops.length) h += `<h3 class="group">Crops</h3><ul class="crop-grid">${f.crops.map((s) => tile(`${BASE}crops/${s}/`, CROP[s]?.img, CROP[s]?.name || s, CROP[s]?.sci, `crop:${s}`)).join("")}</ul>`;
  if (f.varieties.length) h += `<h3 class="group">Varieties</h3><ul class="crop-grid">${f.varieties.map((id) => { const v = VAR[id], [c, s] = id.split("/");
    return tile(`${BASE}crops/${c}/varieties/${s}/`, CROP[c]?.img, v?.name || s, v?.cultivarName || CROP[c]?.name, `variety:${id}`); }).join("")}</ul>`;
  if (f.guides.length) h += `<h3 class="group">Guides</h3><ul class="crop-grid">${f.guides.map((id) => { const g = GUIDE[id], [c, r] = id.split("/");
    return tile(`${BASE}guides/${c}/${r}/`, CROP[c]?.img, g?.title || id, REGION_BY[r]?.name, `guide:${id}`); }).join("")}</ul>`;
  $("#fav-list").innerHTML = h || `<p class="small muted">No favourites yet – tap ♡ on any crop, variety or guide.</p>`;

  // guides for my region, for the crops I care about (favourites + growing), else all
  const mine = new Set([...f.crops, ...p.growing.map((g) => g.crop), ...f.varieties.map((x) => x.split("/")[0]), ...f.guides.map((x) => x.split("/")[0])]);
  const pg = $("#profile-guides");
  if (!loc?.symbol) { pg.innerHTML = `<p class="small muted">Save a location to see the guides for your climate region.</p>`; return; }
  const list = matchGuides(loc.symbol, loc.lat).filter((m) => !mine.size || mine.has(m.g.crop));
  pg.innerHTML = list.length ? `<p class="small muted">${mine.size ? "For your favourites and the crops you grow" : "All guides"} in ${swatch(region)}${esc(region.name)}.</p>
    <ul class="crop-grid guide-grid">${list.map(({ g, kind, via }) => `<li><a href="${BASE}guides/${g.crop}/${g.region}/">${thumbHTML(g.img)}
      <strong class="name">${esc(g.name)}</strong><em class="sci1">${g.sci ? esc(g.sci) : "&nbsp;"}</em><span class="gtitle">${esc(g.title)}</span>
      <span class="badges">${kind === "similar" ? `<span class="flag">nearest region: ${esc(via.name.toLowerCase())}</span>` : ""}</span></a></li>`).join("")}</ul>`
    : `<p class="small muted">No guides for these crops in your climate region (or a similar one) yet.</p>`;
}

// edits to the growing list (saved as you type)
document.addEventListener("input", (e) => {
  const li = e.target.closest("#growing-list li[data-id]"); const field = e.target.dataset.field;
  if (!li || !field) return;
  const p = loadProfile(), item = p.growing.find((g) => g.id === li.dataset.id); if (!item) return;
  item[field] = e.target.value || (field === "variety" ? null : "");
  saveProfile(p, { silent: true });
});
document.addEventListener("click", (e) => {
  const rm = e.target.closest("[data-remove]"); if (!rm) return;
  const id = rm.closest("li[data-id]").dataset.id, p = loadProfile();
  p.growing = p.growing.filter((g) => g.id !== id); saveProfile(p);
});
$("#add-growing").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("#add-crop").value.trim().toLowerCase(); if (!q) return;
  const c = CAT.crops.find((x) => x.name.toLowerCase() === q || x.slug === q || (x.sci || "").toLowerCase() === q);
  if (!c) { $("#add-crop").setCustomValidity("Pick a crop from the list"); $("#add-crop").reportValidity(); return; }
  $("#add-crop").setCustomValidity(""); $("#add-crop").value = "";
  addGrowing(c.slug);
});
$("#add-crop").addEventListener("input", () => $("#add-crop").setCustomValidity(""));

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
$("#ics-btn").addEventListener("click", icsClick);
document.addEventListener("openfarm:profile", render);
render();

$("#csv-btn")?.addEventListener("click", exportCSV);
$("#md-btn")?.addEventListener("click", exportMarkdown);
$("#ics-btn-2")?.addEventListener("click", icsClick);
