/* Onglet Synthèse : portrait chiffré de tout le territoire. */
import {$, esc, nb, communesGJ, stats, meta} from "./commun.js";
import {chiffres, listeCommunes} from "./stats.js";
import {classes, classeDe, couleurClasse} from "./graphes.js";
import {avertissement, chiffresCles, blocSecteurs, blocFlux, blocFamilles, blocAges, tableEmployeurs, pied} from "./blocs.js";

// Indicateurs proposés sur la carte des communes : [clé, libellé, calcul, format, réservé aux données complètes]
const INDICATEURS = [
  ["etab", "Établissements actifs", c => c.n, nb],
  ["dens", "Établissements pour 1 000 habitants", c => c.pop ? 1000 * c.n / c.pop : null, v => nb(Math.round(v))],
  ["emp", "Établissements employeurs", c => c.emp, nb],
  ["sal", "Salariés, au moins (tranches Insee)", c => c.emin, nb],
  ["crea", "Créations sur 12 mois", c => c.crea12, nb],
  ["ei", "Part d'entrepreneurs individuels", c => c.n ? 100 * c.ei / c.n : null, v => `${Math.round(v)} %`, true],
];
let carte, couche, fait = false;

export function synthese(){
  if (fait){ carte?.invalidateSize(); cadrer(); return; }
  fait = true;
  if (!stats){ $("sy-contenu").innerHTML = `<h2>Synthèse du territoire</h2><p class="note">Les statistiques seront disponibles après la prochaine collecte nocturne.</p>`; return; }
  const c = chiffres(""), inds = INDICATEURS.filter(i => !i[4] || stats.complet);
  $("sy-contenu").innerHTML = `
    <div class="tete-page"><div><h2>Synthèse du territoire</h2>
      <p class="note">Normandie-Cabourg-Pays d'Auge, ${nb(meta.nb_communes)} communes${c.pop ? `, ${nb(c.pop)} habitants` : ""}.</p></div>
      <button class="btn no-print" data-imprimer>Imprimer ou enregistrer en PDF</button></div>
    ${avertissement()}
    ${chiffresCles("")}
    <div class="deux">
      <div class="bloc"><h3>Établissements par secteur d'activité</h3>${blocSecteurs(c)}</div>
      <div class="bloc"><h3>Les communes</h3>
        <div class="outils no-print" style="margin:0 0 8px"><label>Indicateur<select id="sy-ind">${inds.map(i => `<option value="${i[0]}">${esc(i[1])}</option>`).join("")}</select></label></div>
        <div id="sy-carte" role="img" aria-label="Carte des communes"></div><div id="sy-leg"></div>
        <p class="note petit no-print">Cliquez sur une commune pour ouvrir sa fiche.</p></div>
    </div>
    <div class="deux">
      <div class="bloc"><h3>Créations et fermetures d'établissements par an</h3>${blocFlux(c)}</div>
      <div class="bloc"><h3>Types de structure</h3>${blocFamilles(c)}
        <h3>Âge des établissements actifs</h3>${blocAges(c)}</div>
    </div>
    <div class="bloc"><h3>Les 20 principaux employeurs</h3>
      <p class="note">D'après la tranche d'effectif de chaque établissement (répertoire SIRENE).</p>${tableEmployeurs("", 20)}</div>
    ${pied()}`;
  initCarte();
  $("sy-ind").onchange = colorier;
}

function cadrer(){ if (carte && couche) carte.fitBounds(couche.getBounds(), {padding:[4, 4]}); }

function initCarte(){
  carte = L.map("sy-carte", {zoomControl:false, attributionControl:false, dragging:false, scrollWheelZoom:false, doubleClickZoom:false,
    boxZoom:false, keyboard:false, touchZoom:false, zoomSnap:0});
  couche = L.geoJSON(communesGJ, {style:{color:"#fff", weight:1.2, fillOpacity:1, fillColor:"#eee"}}).addTo(carte);
  couche.eachLayer(l => {
    l.on("click", () => { location.hash = `#/communes/${l.feature.properties.code}`; });
    l.on("mouseover", () => l.setStyle({color:"#1e1e1e", weight:2}).bringToFront());
    l.on("mouseout", () => l.setStyle({color:"#fff", weight:1.2}));
  });
  cadrer();
  window.addEventListener("resize", () => { carte.invalidateSize(); cadrer(); });
  colorier();
}

function colorier(){
  const [, lib, calcul, fmt] = INDICATEURS.find(i => i[0] === $("sy-ind").value);
  const val = Object.fromEntries(listeCommunes().map(k => [k.code, calcul(chiffres(k.code))]));
  const seuils = classes(Object.values(val));
  couche.eachLayer(l => {
    const p = l.feature.properties, v = val[p.code];
    l.setStyle({fillColor: v == null ? "#eee" : couleurClasse(classeDe(v, seuils), seuils)});
    l.unbindTooltip();
    l.bindTooltip(`<b>${esc(p.nom)}</b><br>${esc(lib)} : ${v == null ? "non disponible" : fmt(v)}`, {sticky:true});
  });
  const bornes = [null, ...seuils];
  $("sy-leg").innerHTML = `<div class="leg carte"><b>${esc(lib)}</b>${bornes.map((b, k) => `<span><span class="carre" style="background:${couleurClasse(k, seuils)}"></span>${
    k === 0 ? (seuils.length ? `moins de ${fmt(seuils[0])}` : "toutes les communes") : k === bornes.length - 1 ? `${fmt(b)} et plus` : `${fmt(b)} à ${fmt(seuils[k])}`}</span>`).join("")}</div>`;
}
