/* Onglet Annuaire : carte, filtres, liste, exports. */
import {$, esc, norm, nb, dateFr, num, sirFmt, toast, debounce, telecharger, estEmployeur, estApprox, PRECISIONS,
  multiSelect, SECTIONS, COULEURS, TYPES, TYPES_DEFAUT, E, parSiret, communesGJ, feuille, jour, ligneBodacc} from "./commun.js";

const etat = {proportionnel:true, tri:{col:"emin", sens:-1}, rendus:0, selection:null};
let filtres = [];
let msCommunes, msDivisions, secteursCoches = new Set(), typesCoches = new Set(TYPES_DEFAUT);
function rayon(e){
  if (!etat.proportionnel) return 5;
  if (e.emin === null) return 3;
  const m = (e.emin + e.emax) / 2;
  return m < 1 ? 3 : Math.min(30, 3 + 1.5 * Math.sqrt(m));
}

/* =========================================================================
   Carte
   ========================================================================= */
let map, groupe, rendu, communesCouche, anneau = null, planCouche, ortho, legTailles;
function initCarte(){
  map = L.map("map", {preferCanvas:true});
  ortho = L.tileLayer("https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image%2Fjpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
    {maxNativeZoom:19, maxZoom:20, attribution:"&copy; IGN / Géoplateforme"});
  // Fond « Plan » : OpenFreeMap Positron. Il demande WebGL : si le poste ne le permet pas,
  // ou si le style ne se charge pas, la carte bascule sur le Plan IGN pour ne pas rester vide.
  const secours = () => L.tileLayer("https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image%2Fpng&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
    {maxZoom:19, attribution:"&copy; IGN / Géoplateforme"});
  const webgl = (() => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch(e){ return false; } })();
  planCouche = (webgl && L.maplibreGL) ? L.maplibreGL({style:"https://tiles.openfreemap.org/styles/positron",
    attribution:'&copy; <a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">contributeurs OpenStreetMap</a>'}) : secours();
  planCouche.addTo(map);
  const ctlCouches = L.control.layers({"Plan":planCouche, "Photo aérienne":ortho}, {}, {collapsed:false, position:"topright"}).addTo(map);
  if (planCouche.getMaplibreMap){
    let ok = false, bascule = false;
    const basculer = () => {
      if (ok || bascule) return; bascule = true;
      const s = secours(), avait = map.hasLayer(planCouche);
      map.removeLayer(planCouche); ctlCouches.removeLayer(planCouche);
      planCouche = s; ctlCouches.addBaseLayer(s, "Plan");
      if (avait){ s.addTo(map); s.bringToBack(); }
    };
    try {
      const ml = planCouche.getMaplibreMap();
      ml.once("load", () => ok = true);
      ml.on("error", () => { if (!ml.isStyleLoaded()) basculer(); });
    } catch(e){}
    setTimeout(basculer, 12000);
  }
  const styleCom = sat => sat ? {color:"#fff",weight:1.2,opacity:.9,fill:false} : {color:"#6f6f6f",weight:1,opacity:.8,dashArray:"4 3",fill:false};
  communesCouche = L.geoJSON(communesGJ, {style:styleCom(false), interactive:false}).addTo(map);
  map.on("baselayerchange", e => communesCouche.setStyle(styleCom(e.layer === ortho)));
  rendu = L.canvas({padding:.5});
  groupe = L.layerGroup().addTo(map);
  ctlCouches.addOverlay(communesCouche, "Limites communales");
  ctlCouches.addOverlay(groupe, "Établissements");

  E.forEach(e => {
    if (e.lat === null || e.lon === null) return;
    e.m = L.circleMarker([e.lat, e.lon], {renderer:rendu, color:"#fff", weight:.8});
    e.m.bindPopup(() => fiche(e), {maxWidth:320});
    e.m.bindTooltip(() => esc(e.nom), {direction:"top"});
    e.m.on("click", () => surligner(e, false));
  });
  styliser();

  // Contrôles : vue d'ensemble, légende des tailles
  const Vue = L.Control.extend({options:{position:"topleft"}, onAdd(){
    const b = L.DomUtil.create("button", "ctl"); b.textContent = "Vue d'ensemble";
    b.onclick = vueEnsemble; L.DomEvent.disableClickPropagation(b); return b; }});
  new Vue().addTo(map);
  legTailles = L.control({position:"bottomleft"});
  legTailles.onAdd = () => {
    const d = L.DomUtil.create("div", "ctl");
    d.innerHTML = `<div class="tailles">` + [10,50,250].map(v => { const r = Math.min(30, 3 + 1.5*Math.sqrt(v));
      return `<div><span style="width:${2*r}px;height:${2*r}px"></span>${v} sal.</div>`; }).join("") +
      `</div><div style="color:var(--mut);margin-top:4px">Cercles pâles : effectif nul ou inconnu</div>`;
    return d;
  };
  legTailles.addTo(map);
  const legPrec = L.control({position:"bottomleft"});
  legPrec.onAdd = () => {
    const d = L.DomUtil.create("div", "ctl");
    d.innerHTML = `<span class="evide"></span>Cercle évidé : position approximative (rue ou lieu-dit)`;
    return d;
  };
  legPrec.addTo(map);

  // Clic droit : coordonnées à copier (pour corrections_localisation.csv)
  map.on("contextmenu", ev => {
    const t = ev.latlng.lat.toFixed(6) + "," + ev.latlng.lng.toFixed(6);
    const d = document.createElement("div"); d.className = "fiche coord";
    d.innerHTML = `<b>Coordonnées de ce point</b><input readonly value="${t}"><button class="btn" type="button">Copier</button>`;
    d.querySelector("button").onclick = () => {
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(
        () => toast("Coordonnées copiées"), () => { d.querySelector("input").select(); toast("Faites Ctrl+C pour copier"); });
    };
    L.popup().setLatLng(ev.latlng).setContent(d).openOn(map);
    setTimeout(() => d.querySelector("input").select(), 50);
  });
}

function styliser(){
  E.forEach(e => { if (!e.m) return;
    const pale = etat.proportionnel && !(e.emin >= 1);
    const c = COULEURS[e.sec] || "#999";
    // Position approximative : cercle évidé, bordé de la couleur du secteur
    e.m.setStyle(estApprox(e) ? {fillColor:c, fillOpacity:.15, color:c, weight:1.6}
                              : {fillColor:c, fillOpacity: pale ? .45 : .82, color:"#fff", weight:.8});
    e.m.setRadius(rayon(e));
  });
  if (legTailles) etat.proportionnel ? legTailles.addTo(map) : legTailles.remove();
}

function fiche(e){
  const rs = e.rs && e.rs !== e.nom ? `<div class="rs">${esc(e.rs)}</div>` : "";
  const eff = esc(e.trl) + (e.aeff ? ` <span style="color:var(--mut)">(${esc(e.aeff)})</span>` : "");
  return `<div class="fiche"><div class="n">${esc(e.nom)}</div>${rs}
    <div class="act" style="border-color:${COULEURS[e.sec]}">${esc(e.nafl || "Activité non renseignée")}${e.naf ? ` <span style="color:var(--mut)">(${esc(e.naf)})</span>` : ""}</div>
    <table><tr><td>Adresse</td><td>${esc(e.adr)}${e.cplt ? "<br>" + esc(e.cplt) : ""}<br>${esc(e.cp)} ${esc(e.com)}</td></tr>
    <tr><td>Effectif</td><td>${eff}</td></tr>
    <tr><td>Créé le</td><td>${dateFr(e.crea)}</td></tr>
    <tr><td>Établissement</td><td>${e.siege === "Oui" ? "Siège" : "Établissement secondaire"}</td></tr>
    <tr><td>Structure</td><td>${esc(e.tstr)}${e.catent ? " (" + esc(e.catent) + ")" : ""}</td></tr>
    <tr><td>SIRET</td><td>${sirFmt(e.siret)}</td></tr>${ligneBodacc(e)}
    <tr><td>Position</td><td>${esc(PRECISIONS[e.prec] ? PRECISIONS[e.prec][0].toUpperCase() + PRECISIONS[e.prec].slice(1) : e.loc)}${e.prec ? `<br><span style="color:var(--mut)">Source : ${esc(e.loc)}</span>` : ""}</td></tr></table>
    <a href="https://annuaire-entreprises.data.gouv.fr/etablissement/${esc(e.siret)}" target="_blank" rel="noopener">Fiche complète sur l'Annuaire des entreprises</a></div>`;
}

function vueEnsemble(){
  const pts = filtres.filter(e => e.m).map(e => [e.lat, e.lon]);
  if (pts.length) map.fitBounds(L.latLngBounds(pts), {padding:[24,24], maxZoom:16});
  else map.fitBounds(communesCouche.getBounds());
}

function surligner(e, centrer){
  etat.selection = e.siret;
  if (!centrer) montrerDansListe(e);
  document.querySelectorAll("#tb-liste tr.sel").forEach(t => t.classList.remove("sel"));
  document.querySelector(`#tb-liste tr[data-s="${e.siret}"]`)?.classList.add("sel");
  if (anneau){ map.removeLayer(anneau); anneau = null; }
  if (!e.m){ toast("Cet établissement n'a pas de position précise."); return; }
  anneau = L.circleMarker([e.lat, e.lon], {radius:rayon(e) + 7, color:"#B91E27", weight:3, fill:false, interactive:false}).addTo(map);
  if (centrer){
    map.setView([e.lat, e.lon], Math.max(map.getZoom(), 17));
    if (!groupe.hasLayer(e.m)) groupe.addLayer(e.m);
    setTimeout(() => e.m.openPopup(), 250);
  }
}

/* =========================================================================
   Filtres
   ========================================================================= */
/* Filtre par codes d'activité, posé par un lien d'un autre onglet (ex. « Pharmacie ») et affiché en tête des filtres. */
function activites(codes, libelle){
  etat.nafs = codes;
  const b = $("f-naf"); b.hidden = !codes;
  if (codes){ b.innerHTML = `<span>Activité : <b>${esc(libelle || [...codes].join(", "))}</b></span><button type="button" class="btn">Retirer</button>`;
    b.querySelector("button").onclick = () => { activites(null); appliquer(); }; }
}

function passe(e, sauf){
  const f = etat.f;
  if (etat.nafs && !etat.nafs.has(e.naf)) return false;
  if (f.mots.length && !f.mots.every(m => e.q.includes(m))) return false;
  if (f.communes.size && !f.communes.has(e.com)) return false;
  if (sauf !== "sec" && !secteursCoches.has(e.sec)) return false;
  if (f.divisions.size && !f.divisions.has(e.div)) return false;
  if (f.seuil !== null && !(e.emin !== null && e.emin >= f.seuil)) return false;
  if (!typesCoches.has(e.tstr)) return false;
  if (f.employeurs && !estEmployeur(e)) return false;
  if (f.sieges && e.siege !== "Oui") return false;
  if (f.depuis && !(e.crea && e.crea >= f.depuis)) return false;
  return true;
}

function lireFiltres(){
  const ans = $("f-creation").value;
  let depuis = "";
  if (ans){ const d = new Date(); d.setFullYear(d.getFullYear() - Number(ans)); depuis = d.toISOString().slice(0,10); }
  etat.f = {mots: norm($("f-texte").value).split(/\s+/).filter(Boolean), communes: msCommunes.valeurs(),
    divisions: msDivisions.valeurs(), seuil: $("f-effectif").value ? Number($("f-effectif").value) : null,
    employeurs: $("f-employeurs").checked, sieges: $("f-sieges").checked, depuis};
}

function appliquer(){
  lireFiltres();
  filtres = E.filter(e => passe(e));
  // Compteurs par secteur, calculés avec tous les autres filtres (la liste reste utile pour cocher)
  const cpt = {};
  E.forEach(e => { if (passe(e, "sec")) cpt[e.sec] = (cpt[e.sec] || 0) + 1; });
  document.querySelectorAll("#f-secteurs label").forEach(l => {
    const s = l.dataset.s, n = cpt[s] || 0;
    l.querySelector(".n").textContent = nb(n); l.classList.toggle("vide", !n);
  });
  // Activités détaillées proposées : celles des secteurs cochés
  const divs = new Map();
  E.forEach(e => { if (e.div && secteursCoches.has(e.sec)) divs.set(e.div, e.divl); });
  msDivisions.options([...divs].sort((a,b) => a[0].localeCompare(b[0])).map(([v,l]) => ({v, l:`${v} – ${l}`})));
  // Carte : grands cercles d'abord pour que les petits restent cliquables
  groupe.clearLayers();
  filtres.filter(e => e.m).sort((a,b) => rayon(b) - rayon(a)).forEach(e => groupe.addLayer(e.m));
  // Chiffres clés
  let bas = 0, haut = 0;
  filtres.forEach(e => { if (e.emin !== null){ bas += e.emin; haut += e.emax; } });
  $("k-etab").textContent = nb(filtres.length);
  $("k-emp").textContent = nb(filtres.filter(estEmployeur).length);
  $("k-sal").textContent = `${nb(bas)} à ${nb(haut)}`;
  $("k-com").textContent = nb(new Set(filtres.map(e => e.com)).size);
  $("n-liste").textContent = nb(filtres.length);
  trier(); listeDebut();
}

/* =========================================================================
   Liste (affichage progressif : 200 lignes, puis la suite au défilement)
   ========================================================================= */
function trier(){
  const {col, sens} = etat.tri;
  filtres.sort((a,b) => {
    let x = a[col], y = b[col];
    if (x === null || x === "") return 1; if (y === null || y === "") return -1;
    const r = typeof x === "number" ? x - y : String(x).localeCompare(String(y), "fr");
    return r * sens || a.nom.localeCompare(b.nom, "fr");
  });
  document.querySelectorAll("th[data-tri]").forEach(th => {
    th.querySelector(".fl")?.remove();
    if (th.dataset.tri === col) th.insertAdjacentHTML("beforeend", `<span class="fl">${sens > 0 ? "▲" : "▼"}</span>`);
  });
}
function ligne(e){
  return `<tr data-s="${e.siret}"${e.siret === etat.selection ? ' class="sel"' : ""}><td><b>${esc(e.nom)}</b>${e.m ? "" : '<span class="sansloc">(sans position)</span>'}</td>
    <td>${esc(e.nafl)}</td><td>${esc(e.com)}</td><td>${esc(e.adr)}</td><td class="num">${esc(e.trl)}</td><td>${e.crea ? e.crea.slice(0,4) : ""}</td></tr>`;
}
function listeDebut(){
  etat.rendus = 0; $("tb-liste").innerHTML = ""; $("corps-liste").scrollTop = 0;
  if (!filtres.length){ $("tb-liste").innerHTML = `<tr><td colspan="6" class="vide-msg">Aucun établissement ne correspond à ces critères. Élargissez la recherche ou retirez un filtre.</td></tr>`; return; }
  listeSuite();
}
function listeSuite(){
  const lot = filtres.slice(etat.rendus, etat.rendus + 200);
  $("tb-liste").insertAdjacentHTML("beforeend", lot.map(ligne).join(""));
  etat.rendus += lot.length;
}

function montrerDansListe(e){
  const index = filtres.findIndex(x => x.siret === e.siret);
  if (index < 0) return;
  // La ligne peut se trouver au-delà des lots déjà chargés dans le tableau.
  while (etat.rendus <= index) listeSuite();
  const ouvrir = !$("tiroir").classList.contains("ouvert");
  $("tiroir").classList.add("ouvert");
  $("tog-liste").setAttribute("aria-expanded", "true");
  const defiler = () => {
    if (ouvrir) map.invalidateSize();
    if (etat.selection !== e.siret) return;
    const ligne = document.querySelector(`#tb-liste tr[data-s="${e.siret}"]`);
    if (!ligne) return;
    const corps = $("corps-liste"), hauteurEntete = corps.querySelector("thead").getBoundingClientRect().height;
    const rect = ligne.getBoundingClientRect();
    // Faire défiler uniquement le tableau, en gardant la ligne sous l'en-tête fixe.
    corps.scrollTo({top:corps.scrollTop + rect.top - corps.getBoundingClientRect().top
      - hauteurEntete - Math.max(0, (corps.clientHeight - hauteurEntete - rect.height) / 2)});
  };
  if (ouvrir) setTimeout(defiler, 220); // attendre la fin de l'ouverture du tiroir
  else defiler();
}

/* =========================================================================
   Exports
   ========================================================================= */
const COLS_EXPORT = [["siret","SIRET"],["nom","Nom"],["rs","Raison sociale"],["adr","Adresse"],["cplt","Complément"],
  ["cp","Code postal"],["com","Commune"],["naf","Code NAF"],["nafl","Activité"],["sec","Section NAF"],["trl","Effectif (tranche)"],
  ["aeff","Année de l'effectif"],["emp","Employeur"],["siege","Siège"],["crea","Date de création"],["tstr","Type de structure"],
  ["cj","Catégorie juridique"],["catent","Catégorie d'entreprise"],["ess","ESS"],["lat","Latitude"],["lon","Longitude"],["loc","Source de la position"],["prec","Précision de la position"]];
function exportExcel(){
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, feuille(filtres, COLS_EXPORT), "Établissements");
  XLSX.writeFile(wb, `annuaire_entreprises_ncpa_${jour()}.xlsx`);
}
function exportGeojson(){
  const fc = {type:"FeatureCollection", features: filtres.filter(e => e.m).map(e => ({type:"Feature",
    geometry:{type:"Point", coordinates:[e.lon, e.lat]},
    properties:Object.fromEntries(COLS_EXPORT.filter(([k]) => k !== "lat" && k !== "lon").map(([k,l]) => [l, e[k] ?? null]))}))};
  telecharger(`annuaire_entreprises_ncpa_${jour()}.geojson`, JSON.stringify(fc), "application/geo+json");
}

function construireFiltres(){
  const communes = [...new Set(E.map(e => e.com))].sort((a,b) => a.localeCompare(b, "fr"));
  msCommunes = multiSelect($("f-communes"), {vide:"Toutes les communes", pluriel:"communes", onChange:appliquer});
  msCommunes.options(communes.map(c => ({v:c, l:c})));
  msDivisions = multiSelect($("f-divisions"), {vide:"Toutes les activités", pluriel:"activités", onChange:appliquer});

  const presentes = Object.keys(SECTIONS).filter(s => E.some(e => e.sec === s));
  secteursCoches = new Set(presentes);
  $("f-secteurs").innerHTML = presentes.map(s => `<label data-s="${s}"><input type="checkbox" value="${s}" checked>
    <span class="pt" style="background:${COULEURS[s]}"></span><span>${esc(SECTIONS[s])}</span><span class="n"></span></label>`).join("");
  $("f-secteurs").onchange = ev => { ev.target.checked ? secteursCoches.add(ev.target.value) : secteursCoches.delete(ev.target.value); appliquer(); };
  const cocherSecteurs = v => { document.querySelectorAll("#f-secteurs input").forEach(i => { i.checked = v; v ? secteursCoches.add(i.value) : secteursCoches.delete(i.value); }); appliquer(); };
  $("sec-tout").onclick = () => cocherSecteurs(true);
  $("sec-rien").onclick = () => cocherSecteurs(false);

  $("f-types").innerHTML = TYPES.map(t => `<label><input type="checkbox" value="${esc(t)}"${TYPES_DEFAUT.has(t) ? " checked" : ""}> ${esc(t)}</label>`).join("");
  $("f-types").onchange = ev => { ev.target.checked ? typesCoches.add(ev.target.value) : typesCoches.delete(ev.target.value); appliquer(); };

  $("f-texte").addEventListener("input", debounce(appliquer, 200));
  ["f-effectif", "f-employeurs", "f-sieges", "f-creation"].forEach(id => $(id).addEventListener("change", appliquer));
  document.querySelectorAll('input[name="taille"]').forEach(r => r.addEventListener("change", () => {
    etat.proportionnel = document.querySelector('input[name="taille"]:checked').value === "eff";
    styliser(); appliquer();
  }));
  $("reinit").onclick = () => {
    activites(null);
    $("f-texte").value = ""; msCommunes.vider(); msDivisions.vider(); $("f-effectif").value = "";
    $("f-employeurs").checked = $("f-sieges").checked = false; $("f-creation").value = "";
    typesCoches = new Set(TYPES_DEFAUT);
    document.querySelectorAll("#f-types input").forEach(i => i.checked = TYPES_DEFAUT.has(i.value));
    cocherSecteurs(true); vueEnsemble();
  };
}

export function initAnnuaire(){
  construireFiltres();
  initCarte();
  appliquer();
  vueEnsemble();
  const tog = $("tog-liste");
  tog.onclick = () => {
    const o = $("tiroir").classList.toggle("ouvert"); tog.setAttribute("aria-expanded", String(o));
    setTimeout(() => map.invalidateSize(), 220);
  };
  $("corps-liste").addEventListener("scroll", ev => {
    const c = ev.target; if (c.scrollTop + c.clientHeight > c.scrollHeight - 300 && etat.rendus < filtres.length) listeSuite();
  });
  $("tb-liste").addEventListener("click", ev => {
    const s = ev.target.closest("tr[data-s]")?.dataset.s; if (s) surligner(parSiret.get(s), true);
  });
  document.querySelectorAll("th[data-tri]").forEach(th => th.onclick = () => {
    const c = th.dataset.tri; etat.tri = {col:c, sens: etat.tri.col === c ? -etat.tri.sens : (c === "emin" || c === "crea" ? -1 : 1)};
    trier(); listeDebut();
  });
  $("exp-xlsx").onclick = exportExcel;
  $("exp-geojson").onclick = exportGeojson;
  const bf = $("btn-filtres");
  bf.onclick = () => { const v = $("volet").classList.toggle("visible"); bf.setAttribute("aria-expanded", String(v)); };
}

/* Appelé quand l'onglet redevient visible : la carte doit recalculer sa taille. */
export function redimensionner(){ setTimeout(() => map.invalidateSize(), 50); }
/* Montre un établissement sur la carte (liens des autres onglets). */
export function voir(siret){ const e = parSiret.get(siret); if (e) setTimeout(() => surligner(e, true), 120); }
/* Annuaire limité à une commune ou à un secteur (liens des fiches commune et de l'onglet Secteurs). */
export function filtrer({commune, secteur, nafs, libelle}){
  $("reinit").click();
  if (nafs?.length) activites(new Set(nafs), libelle);
  if (commune) msCommunes.choisir([commune]);
  if (secteur) document.querySelectorAll("#f-secteurs input").forEach(i => {
    i.checked = i.value === secteur; i.checked ? secteursCoches.add(i.value) : secteursCoches.delete(i.value); });
  appliquer(); setTimeout(vueEnsemble, 120);
}
