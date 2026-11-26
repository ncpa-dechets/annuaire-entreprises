/* Cartes fixes des fiches à imprimer : établissements sur fond Plan IGN, communes colorées selon un indicateur. */
import {esc, nb, SECTIONS, COULEURS, estApprox, communesGJ, fondPlanIGN, rayonEffectif} from "./commun.js";
import {echelleCercles, C_SYMB} from "./graphes.js";

const OPTIONS = {zoomControl:false, attributionControl:true, zoomSnap:.25, scrollWheelZoom:false, doubleClickZoom:false,
  boxZoom:false, keyboard:false, fadeAnimation:false, zoomAnimation:false, markerZoomAnimation:false};
const rayon = e => Math.min(18, rayonEffectif(e));

/* Promesse tenue quand les tuiles visibles sont chargées (ou au bout du délai, pour ne jamais bloquer l'impression). */
export function attendreTuiles(couche, delai = 8000){
  return new Promise(ok => {
    const t = setTimeout(ok, delai);
    couche.once("load", () => { clearTimeout(t); ok(); });
  });
}

/* Carte des établissements, cadrée sur les communes données (toutes si la liste est vide). */
export function carteEtablissements(el, etabs, communes = []){
  const carte = L.map(el, OPTIONS);
  const contour = L.geoJSON(communesGJ, {filter:f => !communes.length || communes.includes(f.properties.code),
    style:{color:"#333", weight:1.6, opacity:.8, fill:false}, interactive:false});
  carte.fitBounds(contour.getBounds(), {padding:[8, 8]});
  const fond = fondPlanIGN(), pret = attendreTuiles(fond);
  fond.addTo(carte);
  if (communes.length) L.geoJSON(communesGJ, {style:{color:"#6f6f6f", weight:.8, opacity:.6, dashArray:"4 3", fill:false}, interactive:false}).addTo(carte);
  contour.addTo(carte);
  const pts = etabs.filter(e => e.lat !== null && e.lon !== null).sort((a, b) => rayon(b) - rayon(a));
  pts.forEach(e => { const c = COULEURS[e.sec] || "#999";
    L.circleMarker([e.lat, e.lon], estApprox(e) ? {radius:rayon(e), color:c, weight:1.4, fillColor:c, fillOpacity:.15}
      : {radius:rayon(e), color:"#fff", weight:.7, fillColor:c, fillOpacity:e.emin >= 1 ? .85 : .5})
      .bindTooltip(`<b>${esc(e.nom)}</b><br>${esc(e.nafl)}<br>${esc(e.trl)}`).addTo(carte); });
  return {carte, pret, sansPosition:etabs.length - pts.length};
}

/* Légende de la carte des établissements : secteurs présents, tailles, positions approximatives. */
export function legendeCarte(etabs){
  const n = {};
  etabs.forEach(e => { if (e.lat !== null) n[e.sec] = (n[e.sec] || 0) + 1; });
  const secs = Object.entries(n).sort((a, b) => b[1] - a[1]);
  const sans = etabs.filter(e => e.lat === null || e.lon === null).length;
  const cercle = v => { const d = 2 * Math.min(18, 3 + 1.5 * Math.sqrt(v)); return `<span class="fi-rond" style="width:${d}px;height:${d}px"></span>`; };
  return `<div class="leg fi-leg">${secs.map(([s, k]) => `<span><span class="pastille" style="background:${COULEURS[s] || "#999"}"></span>${esc(SECTIONS[s] || s)} (${nb(k)})</span>`).join("")}</div>
    <div class="leg fi-leg">${[10, 50, 250].map(v => `<span>${cercle(v)}${v} salariés</span>`).join("")}
      <span>Points pâles : sans salarié connu</span><span><span class="evide"></span>Position approximative</span>
      ${sans ? `<span>${nb(sans)} établissement${sans > 1 ? "s" : ""} sans position</span>` : ""}</div>`;
}

/* Centre de gravité du contour extérieur d'une commune (en degrés : l'écart est négligeable à cette échelle). */
const centres = new Map();
export function centreCommune(f){
  const code = f.properties.code;
  if (!centres.has(code)){
    const anneau = f.geometry.type === "Polygon" ? f.geometry.coordinates[0]
      : f.geometry.coordinates.map(p => p[0]).sort((a, b) => b.length - a.length)[0];
    let a = 0, x = 0, y = 0;
    for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++){
      const [x0, y0] = anneau[j], [x1, y1] = anneau[i], k = x0 * y1 - x1 * y0;
      a += k; x += (x0 + x1) * k; y += (y0 + y1) * k;
    }
    centres.set(code, a ? [y / (3 * a), x / (3 * a)] : L.geoJSON(f).getBounds().getCenter());
  }
  return centres.get(code);
}

/* Rayon du plus grand cercle, proportionné à la taille de la carte. */
export function rayonMax(el){
  const c = Math.min(el.clientWidth, el.clientHeight);
  return c ? Math.max(12, Math.min(26, Math.round(c / 14))) : 20;
}

/* Cercles proportionnels posés au centre de chaque commune. valeurs = {code Insee: nombre}.
   Les plus grands sont dessinés d'abord pour que les petits restent visibles. */
export function cerclesCommunes(carte, valeurs, {rMax = rayonMax(carte.getContainer()), bulle, clic} = {}){
  const echelle = echelleCercles(Object.values(valeurs), rMax);
  // Calque propre aux symboles, au-dessus des communes : le bringToFront() du survol d'une commune ne peut plus les masquer
  if (!carte.getPane("symboles")) carte.createPane("symboles").style.zIndex = 450;
  const pts = communesGJ.features.map(f => ({f, v:valeurs[f.properties.code]})).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
  const couche = L.layerGroup(pts.map(({f, v}) => {
    const m = L.circleMarker(centreCommune(f), {pane:"symboles", radius:echelle(v), color:"#fff", weight:1, fillColor:C_SYMB, fillOpacity:.85, interactive:!!(bulle || clic)});
    if (bulle) m.bindTooltip(bulle(f.properties, v), {sticky:true});
    if (clic){ m.on("click", () => clic(f.properties));
      m.on("mouseover", () => m.setStyle({color:"#1e1e1e", weight:2}));
      m.on("mouseout", () => m.setStyle({color:"#fff", weight:1})); }
    return m;
  })).addTo(carte);
  return {couche, echelle};
}

/* Communes colorées : couleurs = {code Insee: couleur}. Pas de fond de carte, donc rien à attendre. */
export function carteCommunes(el, couleurs){
  const carte = L.map(el, {...OPTIONS, attributionControl:false, dragging:false, zoomSnap:0});
  const couche = L.geoJSON(communesGJ, {style:f => ({color:"#fff", weight:1, fillOpacity:1, fillColor:couleurs[f.properties.code] || "#eee"}),
    onEachFeature:(f, l) => l.bindTooltip(esc(f.properties.nom), {sticky:true})}).addTo(carte);
  carte.fitBounds(couche.getBounds(), {padding:[4, 4]});
  return {carte, pret:Promise.resolve()};
}
