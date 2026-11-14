/* Onglet Communes : tableau comparatif des communes, et fiche détaillée de chacune. */
import {$, esc, nb, SECTIONS, COULEURS, stats, feuille, jour} from "./commun.js";
import {chiffres, listeCommunes, secteurDominant} from "./stats.js";
import {pct, signe} from "./graphes.js";
import {aEmploi, emploiDe} from "./emploi.js";
import {encartProximite} from "./themes/commerces.js";
import {encartTourisme} from "./themes/tourisme.js";
import {avertissement, chiffresCles, blocSecteurs, blocFlux, blocFamilles, blocAges, tableEmployeurs, tableAnnonces, pied} from "./blocs.js";

let tri = {col:"n", sens:-1}, sansImmobilier = false;

// Colonnes du tableau : [clé, intitulé, numérique, réservé aux données complètes]
const COLS = [["nom", "Commune"], ["pop", "Habitants", true], ["n", "Établissements", true], ["pei", "dont entrepreneurs individuels", true, true],
  ["emp", "Employeurs", true], ["sal", "Salariés du privé (Urssaf)", true], ["dens", "Étab. pour 1 000 hab.", true],
  ["crea", "Créations 12 mois", true], ["ferm", "Fermetures 12 mois", true, true], ["solde", "Solde", true, true], ["dom", "Secteur dominant"]];

function lignes(){
  return listeCommunes().map(k => { const c = chiffres(k.code), d = secteurDominant(c, sansImmobilier);
    return {code:k.code, nom:k.nom, pop:k.pop, n:c.n, pei:c.n ? 100 * c.ei / c.n : null, emp:c.emp, sal:aEmploi() ? emploiDe(k.code).eff.at(-1) : null,
      dens:k.pop ? 1000 * c.n / k.pop : null, crea:c.crea12, ferm:c.ferm12, solde:c.crea12 - c.ferm12, dom:SECTIONS[d] || "", sec:d}; });
}

export function communes(code){
  const h = $("co-contenu");
  if (!stats){ h.innerHTML = `<h2>Communes</h2><p class="note">Les statistiques seront disponibles après la prochaine collecte nocturne.</p>`; return; }
  if (code && stats.communes[code]) fiche(code); else tableau();
  h.closest(".page").scrollTop = 0;
}

const colonnes = () => COLS.filter(c => !c[3] || stats.complet);
const cel = (l, k) => k === "nom" ? `<td><a class="lien" href="#/communes/${l.code}">${esc(l.nom)}</a></td>`
  : k === "dom" ? `<td><span class="evt"><span class="pastille" style="background:${COULEURS[l.sec] || "#999"}"></span>${esc(l.dom)}</span></td>`
  : `<td class="num d">${l[k] == null ? "–" : k === "pei" ? `${Math.round(l[k])} %` : k === "solde" ? signe(l[k]) : nb(Math.round(l[k]))}</td>`;
function totaux(cols){
  const t = chiffres("");
  return `<tfoot><tr>${cols.map(([k]) => k === "nom" ? "<td><b>Territoire</b></td>" : k === "dom" ? "<td></td>" : `<td class="num d"><b>${
    ({pop:t.pop == null ? "–" : nb(t.pop), n:nb(t.n), pei:pct(t.ei, t.n), emp:nb(t.emp), sal:aEmploi() ? nb(emploiDe("").eff.at(-1)) : "–", dens:t.pop ? nb(Math.round(1000 * t.n / t.pop)) : "–",
      crea:nb(t.crea12), ferm:nb(t.ferm12), solde:signe(t.crea12 - t.ferm12)})[k]}</b></td>`).join("")}</tr></tfoot>`;
}

/* Tableau comparatif fixe, par ordre alphabétique (dossier PDF du territoire). */
export function tableComparatif(){
  const cols = colonnes(), L = lignes().sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  return `<div class="cadre libre"><table class="compar fi-compar"><thead><tr>${cols.map(([, lib, n]) => `<th${n ? ' class="d"' : ""}>${esc(lib)}</th>`).join("")}</tr></thead>
    <tbody>${L.map(l => `<tr>${cols.map(([k]) => cel(l, k)).join("")}</tr>`).join("")}</tbody>${totaux(cols)}</table></div>`;
}

function tableau(){
  const cols = colonnes(), L = lignes();
  L.sort((a, b) => { const x = a[tri.col], y = b[tri.col];
    if (x == null) return 1; if (y == null) return -1;
    return (typeof x === "number" ? x - y : String(x).localeCompare(String(y), "fr")) * tri.sens || a.nom.localeCompare(b.nom, "fr"); });
  $("co-contenu").innerHTML = `
    <div class="tete-page"><div><h2>Les ${L.length} communes</h2>
      <p class="note">Cliquez sur un intitulé de colonne pour trier, sur une commune pour ouvrir sa fiche.</p></div>
      <div class="no-print"><button class="btn" id="co-xlsx">Télécharger (Excel)</button> <a class="btn" href="#/fiches/commune/toutes">Fiches PDF des communes</a>
        <button class="btn" data-imprimer>Imprimer ce tableau</button></div></div>
    ${avertissement()}
    <div class="outils no-print" style="margin:6px 0 10px"><label class="case" style="padding:0"><input type="checkbox" id="co-immo"${sansImmobilier ? " checked" : ""}>
      Secteur dominant hors activités immobilières</label></div>
    <div class="cadre libre"><table class="compar"><thead><tr>${cols.map(([k, lib, n]) =>
      `<th data-co="${k}"${n ? ' class="d"' : ""} tabindex="0">${esc(k === "dom" && sansImmobilier ? "Secteur dominant, hors immobilier" : lib)}${tri.col === k ? `<span class="fl">${tri.sens > 0 ? "▲" : "▼"}</span>` : ""}</th>`).join("")}</tr></thead>
      <tbody>${L.map(l => `<tr data-code="${l.code}">${cols.map(([k]) => cel(l, k)).join("")}</tr>`).join("")}</tbody>
      ${totaux(cols)}</table></div>
    ${pied()}`;
  $("co-immo").onchange = ev => { sansImmobilier = ev.target.checked; tableau(); };
  const trier = k => { tri = {col:k, sens: tri.col === k ? -tri.sens : (k === "nom" || k === "dom" ? 1 : -1)}; tableau(); };
  document.querySelectorAll("#co-contenu th[data-co]").forEach(th => {
    th.onclick = () => trier(th.dataset.co);
    th.onkeydown = ev => { if (ev.key === "Enter" || ev.key === " "){ ev.preventDefault(); trier(th.dataset.co); } };
  });
  document.querySelectorAll("#co-contenu tbody tr").forEach(tr => tr.onclick = ev => { if (!ev.target.closest("a")) location.hash = `#/communes/${tr.dataset.code}`; });
  $("co-xlsx").onclick = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, feuille(L.map(l => ({...l, pei:l.pei == null ? "" : Math.round(l.pei * 10) / 10, dens:l.dens == null ? "" : Math.round(l.dens)})),
      cols.map(([k, lib]) => [k, k === "pei" ? "Entrepreneurs individuels (%)" : k === "dom" && sansImmobilier ? "Secteur dominant, hors immobilier" : lib])), "Communes");
    XLSX.writeFile(wb, `communes_ncpa_${jour()}.xlsx`);
  };
}

/* Phrase d'introduction d'une fiche commune. */
export function introCommune(code){
  const c = chiffres(code), t = chiffres("");
  return `Portrait économique de la commune${c.pop ? `, ${nb(c.pop)} habitants` : ""}. ${nb(c.n)} établissements, soit ${pct(c.n, t.n, 1)} de ceux du territoire.`;
}

function fiche(code){
  const nom = stats.communes[code].nom;
  $("co-contenu").innerHTML = `
    <div class="tete-page"><div><a class="lien no-print" href="#/communes">← Toutes les communes</a>
      <h2>${esc(nom)}</h2>
      <p class="note">${introCommune(code)}</p></div>
      <div class="no-print outils" style="margin:0"><label>Autre commune<select id="co-choix">${listeCommunes().map(k =>
        `<option value="${k.code}"${k.code === code ? " selected" : ""}>${esc(k.nom)}</option>`).join("")}</select></label>
        <a class="btn" href="#/fiches/commune/${code}">Fiche PDF (carte et liste)</a>
        <button class="btn" data-imprimer>Imprimer cette page</button></div></div>
    ${corpsFicheCommune(code)}
    ${pied()}`;
  $("co-choix").onchange = ev => { location.hash = `#/communes/${ev.target.value}`; };
}

/* Corps de la fiche d'une commune, commun à l'onglet et à l'atelier Fiches.
   apresChiffres : contenu inséré après les chiffres clés (la carte, dans l'atelier). */
export function corpsFicheCommune(code, {apresChiffres = ""} = {}){
  const c = chiffres(code), t = chiffres(""), nom = stats.communes[code].nom;
  return `${avertissement()}
    ${chiffresCles(code)}
    ${apresChiffres}
    <div class="deux">
      <div class="bloc"><h3>Secteurs d'activité, comparés au territoire</h3>
        <p class="note petit">Part de chaque secteur dans les établissements de la commune ; le trait noir indique sa part dans tout le territoire.</p>
        ${blocSecteurs(c, t)}</div>
      <div class="bloc"><h3>Créations et fermetures d'établissements par an</h3>${blocFlux(c)}
        <h3>Types de structure</h3>${blocFamilles(c)}
        <h3>Âge des établissements actifs</h3>${blocAges(c)}</div>
    </div>
    <div class="bloc"><h3>Principaux employeurs</h3>${tableEmployeurs(code, 10)}
      <p class="no-print" style="margin:10px 0 0"><a class="lien" data-annuaire-commune="${esc(nom)}">Voir tous les établissements de ${esc(nom)} dans l'annuaire →</a></p></div>
    ${encartProximite(code)}
    ${encartTourisme(code)}
    <div class="bloc"><h3>Dernières annonces légales (BODACC)</h3>${tableAnnonces(code, 8)}</div>`;
}
