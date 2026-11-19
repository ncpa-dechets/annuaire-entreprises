/* Onglet Annuaire : carte, filtres, liste, exports. */
import {$, esc, norm, nb, dateFr, num, sirFmt, toast, debounce, telecharger, estEmployeur, estApprox, PRECISIONS,
  multiSelect, SECTIONS, COULEURS, TYPES, TYPES_DEFAUT, E, parSiret, communesGJ, feuille, jour, ligneBodacc,
  fondPlanIGN, rayonEffectif} from "./commun.js";
import {CATEGORIES, categorie, palier, PALIERS, pin, pinMini, pinCategorie, hexVide} from "./pictos.js";
import {initPanneau, ficheEtab, listeGroupe, fermerPanneau, panneauOuvert} from "./panneau.js";

/* mode : « picto » (pictogrammes par activité dès le zoom SEUIL_PICTOS, cercles selon l'effectif en deçà),
   « eff » (cercles selon l'effectif) ou « egal » (cercles identiques). */
const SEUIL_PICTOS = 15;
const etat = {mode:"picto", affiche:null, tri:{col:"emin", sens:-1}, rendus:0, selection:null};
let filtres = [];
let msCommunes, msDivisions, secteursCoches = new Set(), typesCoches = new Set(TYPES_DEFAUT);
const rayon = e => etat.mode === "egal" ? 5 : rayonEffectif(e);
const pictosActifs = () => etat.mode === "picto" && map.getZoom() >= SEUIL_PICTOS;

/* Établissements au même emplacement (même immeuble, ou même rue quand la position est approximative) :
   un seul marqueur, avec leur nombre. Le plus gros employeur donne son pictogramme. */
let groupes = new Map(), groupeDe = new Map();
const cle = e => `${e.lat},${e.lon}`;
function grouper(){
  groupes = new Map(); groupeDe = new Map();
  filtres.forEach(e => { if (!e.m) return; const k = cle(e); if (!groupes.has(k)) groupes.set(k, []); groupes.get(k).push(e); });
  groupes.forEach(g => { g.sort((a, b) => (b.emin ?? -1) - (a.emin ?? -1) || (b.siege === "Oui") - (a.siege === "Oui") || a.nom.localeCompare(b.nom, "fr"));
    g.forEach(e => groupeDe.set(e.siret, g)); });
}
const infobulle = g => g.length === 1 ? esc(g[0].nom)
  : `<b>${nb(g.length)} établissements ici</b><br>${g.slice(0, 6).map(e => esc(e.nom)).join("<br>")}${g.length > 6 ? `<br>et ${nb(g.length - 6)} autres…` : ""}`;

/* =========================================================================
   Carte
   ========================================================================= */
let map, calque, groupe, pictos, rendu, communesCouche, anneau = null, planCouche, ortho, legende;
const marqueurs = new Map();   // emplacement -> {sig, mk} : pictogrammes déjà créés
function initCarte(){
  map = L.map("map", {preferCanvas:true});
  ortho = L.tileLayer("https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image%2Fjpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
    {maxNativeZoom:19, maxZoom:20, attribution:"&copy; IGN / Géoplateforme"});
  // Fond « Plan » : OpenFreeMap Positron. Il demande WebGL : si le poste ne le permet pas,
  // ou si le style ne se charge pas, la carte bascule sur le Plan IGN pour ne pas rester vide.
  const secours = fondPlanIGN;
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
  groupe = L.layerGroup();    // cercles (canevas)
  pictos = L.layerGroup();    // pictogrammes (seulement ceux de la vue)
  calque = L.layerGroup([groupe, pictos]).addTo(map);
  ctlCouches.addOverlay(communesCouche, "Limites communales");
  ctlCouches.addOverlay(calque, "Établissements");

  E.forEach(e => {
    if (e.lat === null || e.lon === null) return;
    e.m = L.circleMarker([e.lat, e.lon], {renderer:rendu, color:"#fff", weight:.8});
    e.m.bindTooltip(() => infobulle(groupeDe.get(e.siret) || [e]), {direction:"top"});
    e.m.on("click", () => cliquer(e));
  });
  styliser();

  // Contrôles : vue d'ensemble, légende (tailles et positions approximatives)
  const Vue = L.Control.extend({options:{position:"topleft"}, onAdd(){
    const b = L.DomUtil.create("button", "ctl"); b.textContent = "Vue d'ensemble";
    b.onclick = vueEnsemble; L.DomEvent.disableClickPropagation(b); return b; }});
  new Vue().addTo(map);
  legende = L.control({position:"bottomleft"});
  legende.onAdd = () => {
    const d = L.DomUtil.create("div", "ctl legende");
    L.DomEvent.disableClickPropagation(d);
    // Zoomer sur l'établissement affiché le plus proche du centre, pour ne pas tomber dans un champ
    d.addEventListener("click", ev => {
      if (!ev.target.closest("[data-zoomer]")) return;
      const c = map.getCenter(); let proche = null, dist = Infinity;
      filtres.forEach(e => { if (!e.m) return; const x = map.distance(c, [e.lat, e.lon]); if (x < dist){ dist = x; proche = e; } });
      map.setView(proche ? [proche.lat, proche.lon] : c, SEUIL_PICTOS + 1);
    });
    return d;
  };
  legende.addTo(map);
  map.on("zoomend moveend", () => dessiner());

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
    const pale = etat.mode !== "egal" && !(e.emin >= 1);
    const c = COULEURS[e.sec] || "#999";
    // Position approximative : cercle évidé, bordé de la couleur du secteur
    e.m.setStyle(estApprox(e) ? {fillColor:c, fillOpacity:.15, color:c, weight:1.6}
                              : {fillColor:c, fillOpacity: pale ? .45 : .82, color:"#fff", weight:.8});
    e.m.setRadius(rayon(e));
  });
}

/* Dessine les établissements filtrés : cercles sur le canevas, ou pictogrammes de la vue en cours.
   force : la sélection a changé (filtres, mode). */
function dessiner(force = false){
  if (!map) return;
  if (pictosActifs()){
    if (etat.affiche !== "pictos" || force){ groupe.clearLayers(); etat.affiche = "pictos"; }
    dessinerPictos();
  } else if (etat.affiche !== "cercles" || force){
    pictos.clearLayers(); groupe.clearLayers();
    // Grands cercles d'abord pour que les petits restent cliquables
    filtres.filter(e => e.m).sort((a,b) => rayon(b) - rayon(a)).forEach(e => groupe.addLayer(e.m));
    etat.affiche = "cercles";
  }
  majAnneau(); majLegende();
}

function dessinerPictos(){
  const b = map.getBounds().pad(.25), vus = new Set();
  groupes.forEach((g, k) => {
    if (!b.contains([g[0].lat, g[0].lon])) return;
    vus.add(k);
    const sig = g.map(e => e.siret).join();
    let m = marqueurs.get(k);
    if (!m || m.sig !== sig){ if (m) pictos.removeLayer(m.mk); m = {sig, g, mk:creerPin(g)}; marqueurs.set(k, m); }
    if (!pictos.hasLayer(m.mk)) pictos.addLayer(m.mk);
  });
  marqueurs.forEach((m, k) => { if (!vus.has(k) && pictos.hasLayer(m.mk)) pictos.removeLayer(m.mk); });
  marquerSelection();
}

function creerPin(g){
  const e = g[0], p = Math.max(...g.map(palier)), l = PALIERS[p].l, h = Math.round(l * 38 / 32);
  const html = `<div class="pin">${pin(e, {l})}${g.length > 1 ? `<span class="pin-n">${g.length > 99 ? "99+" : g.length}</span>` : ""}</div>`;
  const mk = L.marker([e.lat, e.lon], {icon:L.divIcon({className:"pin-ic", html, iconSize:[l, h], iconAnchor:[l / 2, h]}),
    riseOnHover:true, zIndexOffset:p * 100, keyboard:true, title:""});
  mk.bindTooltip(() => infobulle(g), {direction:"top", offset:[0, -h + 4]});
  mk.on("click", () => cliquer(e, g));
  return mk;
}

function marquerSelection(){
  marqueurs.forEach(m => m.mk.getElement()?.firstElementChild?.classList.toggle("sel", !!etat.selection && m.g.some(e => e.siret === etat.selection)));
}
function majAnneau(){
  if (anneau){ map.removeLayer(anneau); anneau = null; }
  const e = etat.selection && parSiret.get(etat.selection);
  if (!e || !e.m || etat.affiche !== "cercles" || !groupe.hasLayer(e.m)) return;
  anneau = L.circleMarker([e.lat, e.lon], {radius:rayon(e) + 7, color:"#B91E27", weight:3, fill:false, interactive:false}).addTo(map);
}

function majLegende(){
  const d = legende?.getContainer(); if (!d) return;
  const cercles = [10,50,250].map(v => { const r = Math.min(30, 3 + 1.5*Math.sqrt(v));
    return `<div><span style="width:${2*r}px;height:${2*r}px"></span>${v} sal.</div>`; }).join("");
  const pt = etat.affiche === "pictos";
  d.innerHTML = pt
    ? `<div class="tailles hex">${PALIERS.slice(1).map(p => `<div>${hexVide(p.l * .8)}${p.lib}</div>`).join("")}</div>
       <div class="leg-l">Taille selon le nombre de salariés de l'établissement</div>
       <div class="leg-l"><span class="pin-n leg">3</span>établissements au même emplacement</div>
       <div class="leg-l"><span class="pin-mini">${pin({sec:"Z", naf:""}, {l:15, approx:true})}</span>Pictogramme évidé : position approximative</div>`
    : (etat.mode === "egal" ? "" : `<div class="tailles">${cercles}</div><div class="leg-l">Cercles pâles : effectif nul ou inconnu</div>`)
      + `<div class="leg-l"><span class="evide"></span>Cercle évidé : position approximative (rue ou lieu-dit)</div>`
      + (etat.mode === "picto" ? `<button type="button" class="leg-zoom" data-zoomer>Zoomer pour voir les pictogrammes</button>` : "");
}

function vueEnsemble(){
  const pts = filtres.filter(e => e.m).map(e => [e.lat, e.lon]);
  if (pts.length) map.fitBounds(L.latLngBounds(pts), {padding:[24,24], maxZoom:16});
  else map.fitBounds(communesCouche.getBounds());
}

/* Clic sur un marqueur : la fiche, ou la liste des établissements de l'emplacement. */
function cliquer(e, g = groupeDe.get(e.siret) || [e]){
  marquer(e);
  if (g.length > 1) listeGroupe(g); else ficheEtab(e);
}

/* Met en évidence un établissement (carte et liste) ; centrer : zoomer dessus. */
function marquer(e, centrer = false){
  etat.selection = e.siret;
  if ($("tiroir").classList.contains("ouvert")) montrerDansListe(e);
  document.querySelectorAll("#tb-liste tr.sel").forEach(t => t.classList.remove("sel"));
  document.querySelector(`#tb-liste tr[data-s="${e.siret}"]`)?.classList.add("sel");
  if (centrer && e.m){
    if (!filtres.includes(e)) toast("Cet établissement est masqué par les filtres en cours.");
    centrerVisible([e.lat, e.lon], Math.max(map.getZoom(), 17));
  }
  marquerSelection(); majAnneau();
}

/* Part de la carte cachée par la fiche latérale : à droite sur grand écran, en bas sur mobile. */
const mobile = matchMedia("(max-width:820px)");
function cache(){
  if (!panneauOuvert()) return {x:0, y:0};
  const p = $("panneau");
  return mobile.matches ? {x:0, y:p.offsetHeight} : {x:p.offsetWidth + 20, y:0};
}
/* Centre un point dans la partie visible de la carte. */
function centrerVisible(ll, z){
  const c = cache(), p = map.project(ll, z).add([c.x / 2, c.y / 2]);
  map.setView(map.unproject(p, z), z);
}

/* Ouvre la fiche d'un établissement (liste, liens des autres onglets) et le montre sur la carte. */
function surligner(e, centrer){
  ficheEtab(e, {groupe:groupeDe.get(e.siret)});
  marquer(e, centrer);
}

function centrerSur(etabs){
  const pts = etabs.filter(e => e.m).map(e => [e.lat, e.lon]);
  if (!pts.length) return;
  const c = cache();
  if (pts.length === 1) centrerVisible(pts[0], Math.max(map.getZoom(), 17));
  else map.fitBounds(L.latLngBounds(pts), {paddingTopLeft:[40, 40], paddingBottomRight:[40 + c.x, 40 + c.y], maxZoom:17});
  if (etabs.some(e => !filtres.includes(e))) toast("Certains établissements sont masqués par les filtres en cours.");
}

function deselectionner(){
  etat.selection = null;
  document.querySelectorAll("#tb-liste tr.sel").forEach(t => t.classList.remove("sel"));
  marquerSelection(); majAnneau();
}

/* =========================================================================
   Filtres
   ========================================================================= */
/* Filtre par codes d'activité, posé par un lien d'un autre onglet (ex. « Pharmacie ») et affiché en tête des filtres. */
function activites(codes, libelle){
  etat.nafs = codes; etat.nafsLib = codes ? libelle || "" : "";
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
  grouper(); dessiner(true); legendePictos();
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

/* Légende des pictogrammes (volet) : les catégories de la sélection, les plus nombreuses d'abord.
   Un clic limite l'annuaire à cette catégorie. */
function legendePictos(){
  const n = new Map(), sec = new Map();
  filtres.forEach(e => { const c = categorie(e.naf).id; n.set(c, (n.get(c) || 0) + 1);
    const s = sec.get(c) || {}; s[e.sec] = (s[e.sec] || 0) + 1; sec.set(c, s); });
  const l = CATEGORIES.filter(c => n.has(c.id)).sort((a, b) => n.get(b.id) - n.get(a.id));
  $("leg-pictos").innerHTML = l.length ? l.map(c => { const s = Object.entries(sec.get(c.id)).sort((a, b) => b[1] - a[1])[0][0];
    return `<button type="button" data-cat="${c.id}" title="Afficher seulement : ${esc(c.lib)}">${pinCategorie(c, s, 20)}<span>${esc(c.lib)}</span><span class="n">${nb(n.get(c.id))}</span></button>`; }).join("")
    : `<p class="source">Aucun établissement dans la sélection.</p>`;
}
function filtrerCategorie(id){
  const c = CATEGORIES.find(x => x.id === id); if (!c) return;
  activites(new Set(E.filter(e => categorie(e.naf) === c).map(e => e.naf)), c.lib);
  appliquer();
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
  return `<tr data-s="${e.siret}"${e.siret === etat.selection ? ' class="sel"' : ""}><td class="nom-pin">${pinMini(e, 16)}<b>${esc(e.nom)}</b>${e.m ? "" : '<span class="sansloc" title="Pas de position sur la carte : un clic ouvre sa fiche">(sans position)</span>'}</td>
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
    etat.mode = document.querySelector('input[name="taille"]:checked').value;
    styliser(); dessiner(true);
  }));
  $("leg-pictos").onclick = ev => { const b = ev.target.closest("[data-cat]"); if (b) filtrerCategorie(b.dataset.cat); };
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
  initPanneau($("panneau"), {
    voir:(e, centrer) => marquer(e, centrer), centrerSur,
    filtrerActivite:(naf, libelle, commune) => filtrer({nafs:[naf], libelle, commune}),
    ouvre:() => $("carte-zone").classList.add("avec-panneau"),
    ferme:() => { $("carte-zone").classList.remove("avec-panneau"); deselectionner(); }
  });
  document.addEventListener("keydown", ev => {
    if (ev.key === "Escape" && panneauOuvert() && !$("v-annuaire").hidden && !ev.target.closest?.(".ms")) fermerPanneau(); });
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
    const s = ev.target.closest("tr[data-s]")?.dataset.s; if (!s) return;
    const e = parSiret.get(s);
    surligner(e, true);   // sans position, la fiche s'ouvre sans bouger la carte
  });
  document.querySelectorAll("th[data-tri]").forEach(th => th.onclick = () => {
    const c = th.dataset.tri; etat.tri = {col:c, sens: etat.tri.col === c ? -etat.tri.sens : (c === "emin" || c === "crea" ? -1 : 1)};
    trier(); listeDebut();
  });
  $("exp-xlsx").onclick = exportExcel;
  $("exp-geojson").onclick = exportGeojson;
  $("exp-pdf").onclick = () => { location.hash = "#/fiches/selection"; };
  const bf = $("btn-filtres");
  bf.onclick = () => { const v = $("volet").classList.toggle("visible"); bf.setAttribute("aria-expanded", String(v)); };
}

/* Sélection en cours, pour la fiche PDF « sélection » : établissements filtrés et critères en clair.
   null tant que l'annuaire n'a pas été ouvert. */
export function selection(){
  const f = etat.f;
  if (!f) return null;
  const c = [], presentes = [...document.querySelectorAll("#f-secteurs input")].map(i => i.value);
  const secteurs = presentes.filter(s => secteursCoches.has(s)), partiel = secteurs.length < presentes.length;
  const divLib = d => E.find(e => e.div === d)?.divl || d;
  const pl = (n, mot) => `${mot}${n > 1 ? "s" : ""}`;
  if (etat.nafs) c.push(`Activité : ${etat.nafsLib || [...etat.nafs].join(", ")}`);
  if (partiel) c.push(secteurs.length ? `${pl(secteurs.length, "Secteur")} : ${secteurs.map(s => SECTIONS[s]).join(", ")}` : "Aucun secteur coché");
  if (f.divisions.size) c.push(`${pl(f.divisions.size, "Activité détaillée")} : ${[...f.divisions].map(divLib).join(", ")}`);
  if (f.communes.size) c.push(`${pl(f.communes.size, "Commune")} : ${[...f.communes].join(", ")}`);
  if (f.mots.length) c.push(`Recherche « ${$("f-texte").value.trim()} »`);
  if (f.seuil !== null) c.push(`${nb(f.seuil)} ${pl(f.seuil, "salarié")} et plus`);
  if (f.employeurs) c.push("Employeurs uniquement");
  if (f.sieges) c.push("Sièges uniquement");
  if (f.depuis) c.push(`Créés depuis le ${dateFr(f.depuis)}`);
  const types = TYPES.filter(t => typesCoches.has(t));
  if (types.length !== TYPES_DEFAUT.size || types.some(t => !TYPES_DEFAUT.has(t))) c.push(`Structures : ${types.join(", ") || "aucune"}`);
  let titre = etat.nafs ? (etat.nafsLib || "Activités choisies") : partiel && secteurs.length === 1 ? SECTIONS[secteurs[0]]
    : f.divisions.size === 1 ? divLib([...f.divisions][0]) : "Sélection d'établissements";
  if (f.communes.size === 1) titre += ` – ${[...f.communes][0]}`;
  return {etabs:filtres.slice(), criteres:c, titre, communes:[...f.communes], secteurs:partiel ? secteurs : [],
    nafs:etat.nafs ? [...etat.nafs] : [], simple:!f.mots.length && !f.divisions.size && f.seuil === null && !f.employeurs && !f.sieges && !f.depuis};
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
