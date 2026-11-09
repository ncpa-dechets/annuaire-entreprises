/* Thème Commerces et services de proximité : ce qui existe et ce qui manque dans chaque commune. */
import {$, esc, nb, communesGJ, stats, feuille, jour} from "../commun.js";
import {listeCommunes, compter, compterCategorie, aActivites} from "../stats.js";
import {classes, classeDe, couleurClasse} from "../graphes.js";
import {pied} from "../blocs.js";

let choix = "", carte, couche, centres = null;

const categories = () => stats?.proximite || [];
const nbCat = (code, cat) => compterCategorie(code, cat).n;
const dedoublonne = () => !!stats?.proximite_comptes;
const familles = () => [...new Set(categories().map(c => c.famille))];

/* Centre approximatif de chaque commune (milieu de son emprise), pour les distances à vol d'oiseau. */
function centre(code){
  if (!centres){ centres = new Map();
    communesGJ.features.forEach(f => centres.set(f.properties.code, L.geoJSON(f).getBounds().getCenter())); }
  return centres.get(code);
}

/* Commune la plus proche disposant de la catégorie : {nom, km} ou null. */
function plusProche(code, cat){
  const ici = centre(code); let mieux = null;
  if (!ici) return null;
  listeCommunes().forEach(k => {
    if (k.code === code || !nbCat(k.code, cat)) return;
    const d = ici.distanceTo(centre(k.code)) / 1000;
    if (!mieux || d < mieux.km) mieux = {nom:k.nom, km:d};
  });
  return mieux;
}
const km = d => d < 10 ? d.toLocaleString("fr-FR", {maximumFractionDigits:1}) : nb(Math.round(d));

export function commerces(h){
  if (!aActivites()){ h.innerHTML = `<h2>Commerces et services de proximité</h2>
    <p class="note">Ce module sera disponible après la prochaine collecte nocturne.</p>`; return; }
  const cats = categories(), coms = listeCommunes().sort((a, b) => (b.pop || 0) - (a.pop || 0));
  if (!cats.some(c => c.cle === choix)) choix = cats[0].cle;
  const sans = cle => { const c = cats.find(x => x.cle === cle); return c ? coms.filter(k => !nbCat(k.code, c)).length : null; };
  const alim = cats.filter(c => c.famille === "Alimentation");
  const k = (v, lib) => `<div><b>${v}</b><span>${lib}</span></div>`;

  h.innerHTML = `
    <div class="tete-page"><div><h2>Commerces et services de proximité</h2>
      <p class="note">${dedoublonne() ? "Nombre de commerces et de professionnels" : "Nombre d'établissements actifs"} par commune d'après le code d'activité SIRENE${stats.complet ? ", entrepreneurs individuels compris" : ""}.
        ${dedoublonne() ? "Les établissements d'une même entreprise ou situés à la même adresse comptent pour un seul commerce ; en santé, chaque professionnel est compté." : ""}
        Une case vide signale une absence à vérifier sur le terrain : SIRENE recense des établissements déclarés, pas des boutiques ouvertes.</p></div>
      <div class="no-print"><button class="btn" id="pc-xlsx">Télécharger (Excel)</button> <button class="btn" data-imprimer>Imprimer ou enregistrer en PDF</button></div></div>
    <div class="gros">
      ${k(nb(coms.filter(c => !alim.some(x => nbCat(c.code, x))).length), `communes sans commerce alimentaire<br>sur ${coms.length}`)}
      ${k(nb(sans("boulangerie")), "communes sans boulangerie")}
      ${k(nb(sans("medecin")), "communes sans médecin généraliste")}
      ${k(nb(sans("pharmacie")), "communes sans pharmacie")}
      ${k(nb(sans("cafe")), "communes sans café ni bar")}
    </div>
    <div class="deux">
      <div class="bloc"><h3>Où trouve-t-on ce service ?</h3>
        <div class="outils no-print" style="margin:0 0 8px"><label>Commerce ou service<select id="pc-cat">${familles().map(f =>
          `<optgroup label="${esc(f)}">${cats.filter(c => c.famille === f).map(c => `<option value="${c.cle}"${c.cle === choix ? " selected" : ""}>${esc(c.libelle)}</option>`).join("")}</optgroup>`).join("")}</select></label></div>
        <div id="pc-carte" class="carte-com" role="img" aria-label="Carte des communes"></div><div id="pc-leg"></div></div>
      <div class="bloc"><h3 id="pc-titre"></h3><div id="pc-sans"></div></div>
    </div>
    <div class="bloc"><h3>Toutes les communes, tous les services</h3>
      <p class="note">Communes classées par population. Cliquez sur une commune pour ouvrir sa fiche.</p>
      <div class="cadre libre grille"><table><thead>
        <tr><th rowspan="2">Commune</th><th rowspan="2" class="d">Habitants</th>${familles().map(f => `<th class="fam" colspan="${cats.filter(c => c.famille === f).length}">${esc(f)}</th>`).join("")}</tr>
        <tr>${familles().map(f => cats.filter(c => c.famille === f).map((c, i) => `<th class="vert${i ? "" : " deb"}"><span>${esc(c.libelle)}</span></th>`).join("")).join("")}</tr></thead>
        <tbody>${coms.map(c => `<tr><td><a class="lien" href="#/communes/${c.code}">${esc(c.nom)}</a></td><td class="num d">${c.pop == null ? "–" : nb(c.pop)}</td>
          ${familles().map(f => cats.filter(x => x.famille === f).map((x, i) => { const n = nbCat(c.code, x);
            return `<td class="c${n ? "" : " zero"}${i ? "" : " deb"}" data-bulle="${esc(`<b>${esc(c.nom)}</b><br>${esc(x.libelle)} : ${n ? nb(n) : "aucun"}`)}">${n || "–"}</td>`; }).join("")).join("")}</tr>`).join("")}</tbody>
        <tfoot><tr><td><b>Territoire</b></td><td></td>${familles().map(f => cats.filter(x => x.famille === f).map((x, i) =>
          `<td class="c${i ? "" : " deb"}"><b>${nb(nbCat("", x))}</b></td>`).join("")).join("")}</tr></tfoot></table></div></div>
    ${pied()}`;

  carte = L.map("pc-carte", {zoomControl:false, attributionControl:false, dragging:false, scrollWheelZoom:false, doubleClickZoom:false,
    boxZoom:false, keyboard:false, touchZoom:false, zoomSnap:0});
  couche = L.geoJSON(communesGJ, {style:{color:"#fff", weight:1.2, fillOpacity:1, fillColor:"#eee"}}).addTo(carte);
  couche.eachLayer(l => {
    l.on("click", () => { location.hash = `#/communes/${l.feature.properties.code}`; });
    l.on("mouseover", () => l.setStyle({color:"#1e1e1e", weight:2}).bringToFront());
    l.on("mouseout", () => l.setStyle({color:"#bbb", weight:1}));
  });
  carte.fitBounds(couche.getBounds(), {padding:[4, 4]});
  $("pc-cat").onchange = ev => { choix = ev.target.value; detail(); };
  detail();
  $("pc-xlsx").onclick = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, feuille(coms.map(c => ({nom:c.nom, pop:c.pop ?? "", ...Object.fromEntries(cats.map(x => [x.cle, nbCat(c.code, x)]))})),
      [["nom", "Commune"], ["pop", "Habitants"], ...cats.map(x => [x.cle, x.libelle])]), "Commerces et services");
    XLSX.writeFile(wb, `commerces_services_ncpa_${jour()}.xlsx`);
  };
}

/* Carte et liste des communes dépourvues, pour la catégorie choisie. */
function detail(){
  const cat = categories().find(c => c.cle === choix), coms = listeCommunes();
  const val = Object.fromEntries(coms.map(k => [k.code, nbCat(k.code, cat)]));
  const seuils = classes(Object.values(val).filter(v => v > 0), 4);
  couche.eachLayer(l => {
    const p = l.feature.properties, v = val[p.code] || 0;
    l.setStyle({color:"#bbb", weight:1, fillColor: v ? couleurClasse(classeDe(v, seuils), seuils) : "#fff"});
    l.unbindTooltip();
    l.bindTooltip(`<b>${esc(p.nom)}</b><br>${esc(cat.libelle)} : ${v ? nb(v) : "aucun"}`, {sticky:true});
  });
  const bornes = [null, ...seuils];
  $("pc-leg").innerHTML = `<div class="leg carte"><b>${esc(cat.libelle)} : nombre par commune</b><span><span class="carre" style="background:#fff"></span>aucun</span>${
    bornes.map((b, i) => `<span><span class="carre" style="background:${couleurClasse(i, seuils)}"></span>${
      i === 0 ? (seuils.length ? (seuils[0] > 2 ? `1 à ${seuils[0] - 1}` : "1") : "1 et plus") : i === bornes.length - 1 ? `${b} et plus` : (seuils[i] - 1 > b ? `${b} à ${seuils[i] - 1}` : `${b}`)}</span>`).join("")}</div>`;
  const dep = coms.filter(k => !val[k.code]).map(k => ({...k, proche:plusProche(k.code, cat)})).sort((a, b) => (b.pop || 0) - (a.pop || 0));
  const hab = dep.reduce((s, k) => s + (k.pop || 0), 0), tot = compter("", cat.codes), reel = compterCategorie("", cat);
  $("pc-titre").textContent = `${cat.libelle} : ${dep.length} commune${dep.length > 1 ? "s" : ""} sans`;
  $("pc-sans").innerHTML = `<p class="note">${dedoublonne() ? `${nb(reel.n)} sur le territoire, pour ${nb(reel.decl)} établissement${reel.decl > 1 ? "s" : ""} déclaré${reel.decl > 1 ? "s" : ""}` : `${nb(tot.n)} établissement${tot.n > 1 ? "s" : ""} sur le territoire`}${stats.complet && tot.ei ? `, dont ${nb(tot.ei)} entrepreneur${tot.ei > 1 ? "s" : ""} individuel${tot.ei > 1 ? "s" : ""}` : ""}.
    ${dep.length ? `Les communes sans ce service regroupent ${nb(hab)} habitants.` : "Toutes les communes en disposent."}
    <a class="lien no-print" data-annuaire-nafs="${esc(cat.codes.join(","))}" data-annuaire-libelle="${esc(cat.libelle)}">Voir dans l'annuaire${stats.complet ? " (hors entrepreneurs individuels)" : ""} →</a></p>
    ${dep.length ? `<div class="cadre" style="max-height:330px"><table><thead><tr><th>Commune sans ce service</th><th class="d">Habitants</th><th>Le plus proche (à vol d'oiseau)</th></tr></thead><tbody>
      ${dep.map(k => `<tr><td><a class="lien" href="#/communes/${k.code}">${esc(k.nom)}</a></td><td class="num d">${k.pop == null ? "–" : nb(k.pop)}</td>
        <td>${k.proche ? `${esc(k.proche.nom)} <span class="sansloc">${km(k.proche.km)} km</span>` : "aucun sur le territoire"}</td></tr>`).join("")}</tbody></table></div>` : ""}`;
}

/* Encart de la fiche commune : services présents, services absents et commune la plus proche qui en dispose. */
export function encartProximite(code){
  if (!aActivites()) return "";
  const cats = categories();
  const pres = cats.map(c => ({c, n:nbCat(code, c)})).filter(x => x.n);
  const abs = cats.filter(c => !nbCat(code, c));
  return `<div class="bloc"><h3>Commerces et services de proximité</h3>
    <div class="deux"><div><h4 class="sous">Présents (${pres.length})</h4>
      ${pres.length ? `<div class="puces">${pres.map(x => `<span>${esc(x.c.libelle)} <b>${nb(x.n)}</b></span>`).join("")}</div>` : `<p class="note">Aucun des commerces et services suivis.</p>`}</div>
    <div><h4 class="sous">Absents (${abs.length})</h4>
      ${abs.length ? `<div class="puces abs">${abs.map(c => { const p = plusProche(code, c);
        return `<span>${esc(c.libelle)}${p ? ` <small>${esc(p.nom)}, ${km(p.km)} km</small>` : ""}</span>`; }).join("")}</div>` : `<p class="note">Tous les commerces et services suivis sont présents.</p>`}</div></div>
    <p class="note petit">D'après les codes d'activité SIRENE${stats.complet ? ", entrepreneurs individuels compris" : ""}${dedoublonne() ? ", sans les doublons d'adresse ou d'entreprise" : ""} ; pour un service absent, la commune la plus proche qui en dispose et la distance entre centres de communes.
      <a class="lien no-print" href="#/themes/commerces">Voir toutes les communes →</a></p></div>`;
}
