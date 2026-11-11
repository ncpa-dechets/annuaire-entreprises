/* Thème Emploi et recrutement : offres en cours (France Travail) et besoins en main-d'œuvre (enquête BMO). */
import {$, esc, nb, norm, dateFr, dateLongue, debounce, stats, offres, bmo, feuille, jour} from "../commun.js";
import {barres, courbes, legende, pct, C_STRUCT, C_EI} from "../graphes.js";
import {pied} from "../blocs.js";
import {blocRecrutement} from "./recrutement.js";

let bassin = "", fCom = "", fContrat = "", fTexte = "";
const nomCommune = code => stats?.communes[code]?.nom || code;
const k = (v, lib) => `<div><b>${v}</b><span>${lib}</span></div>`;
const compte = (liste, cle) => { const m = new Map(); liste.forEach(o => { const c = cle(o) || "Non précisé"; m.set(c, (m.get(c) || 0) + 1); });
  return [...m].sort((a, b) => b[1] - a[1]); };

export function emploiVue(h){
  h.innerHTML = `
    <div class="tete-page"><div><h2>Emploi et recrutement</h2>
      <p class="note">Potentiels d'embauche des entreprises, offres d'emploi diffusées par France Travail sur le territoire,
        et intentions d'embauche d'après l'enquête annuelle Besoins en main-d'œuvre.</p></div>
      <div class="no-print">${offres?.offres?.length ? '<button class="btn" id="em-xlsx">Télécharger (Excel)</button> ' : ""}<button class="btn" data-imprimer>Imprimer ou enregistrer en PDF</button></div></div>
    <div id="em-recrutement"></div><div id="em-offres"></div><div id="em-bmo"></div>${pied()}`;
  blocRecrutement($("em-recrutement")); blocOffres(); blocBmo();
}

function blocOffres(){
  const h = $("em-offres"), O = offres?.offres || [];
  if (!offres){ h.innerHTML = `<h3 class="partie">Offres d'emploi en cours</h3>
    <p class="note">Les offres d'emploi publiées ne sont pas disponibles pour le moment.</p>`; return; }
  const cdi = O.filter(o => o.contrat === "CDI").length, postes = O.reduce((s, o) => s + (o.postes || 1), 0);
  const hist = offres.historique || [];
  const parMetier = compte(O, o => o.metier).slice(0, 12), parContrat = compte(O, o => o.contrat_libelle.split(" - ")[0]), parCom = compte(O, o => nomCommune(o.code_commune)).slice(0, 12);
  const ligne = ([lib, n], c) => ({lib, segments:[{v:n, c}], valeur:`${nb(n)} <small>(${pct(n, O.length)})</small>`});
  h.innerHTML = `<h3 class="partie">Offres d'emploi en cours</h3>
    <div class="gros">
      ${k(nb(O.length), `offres en cours<br>au ${dateLongue(offres.date)}`)}
      ${k(nb(postes), "postes à pourvoir")}
      ${k(pct(cdi, O.length), "des offres sont en CDI")}
      ${k(nb(new Set(O.map(o => o.code_commune)).size), "communes concernées")}
      ${k(nb(new Set(O.map(o => o.rome)).size), "métiers différents")}
    </div>
    ${O.length ? `<div class="deux">
      <div class="bloc"><h3>Métiers les plus recherchés</h3>${barres(parMetier.map(x => ligne(x, C_STRUCT)))}</div>
      <div class="bloc"><h3>Par type de contrat</h3>${barres(parContrat.map(x => ligne(x, C_EI)))}
        <h3>Par commune</h3>${barres(parCom.map(x => ligne(x, C_STRUCT)))}</div></div>
    ${hist.length > 2 ? `<div class="bloc"><h3>Nombre d'offres en cours, jour après jour</h3>
      ${courbes(hist.map(x => dateFr(x[0]).slice(0, 5)), [{nom:"Offres en cours", c:C_STRUCT, v:hist.map(x => x[1])}], {titre:"Offres en cours par jour"})}</div>` : ""}
    <div class="bloc"><h3>Toutes les offres</h3>
      <div class="outils no-print">
        <label>Commune<select id="em-com"><option value="">Toutes les communes</option>${[...new Set(O.map(o => o.code_commune))].map(c => [c, nomCommune(c)])
          .sort((a, b) => a[1].localeCompare(b[1], "fr")).map(([c, n]) => `<option value="${esc(c)}"${c === fCom ? " selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
        <label>Contrat<select id="em-contrat"><option value="">Tous les contrats</option>${parContrat.map(([c]) => `<option${c === fContrat ? " selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
        <label>Recherche<input id="em-texte" type="search" placeholder="Métier, entreprise, secteur…" value="${esc(fTexte)}"></label></div>
      <div id="em-liste"></div></div>` : `<p class="note">Aucune offre en cours sur le territoire.</p>`}`;
  if (!O.length) return;
  const lister = () => {
    const mots = norm(fTexte).split(/\s+/).filter(Boolean);
    const L = O.filter(o => (!fCom || o.code_commune === fCom) && (!fContrat || o.contrat_libelle.split(" - ")[0] === fContrat)
      && mots.every(m => norm([o.intitule, o.metier, o.entreprise, o.secteur].join(" ")).includes(m)));
    $("em-liste").innerHTML = L.length ? `<div class="cadre" style="max-height:560px"><table><thead><tr><th>Publiée le</th><th>Offre</th><th>Employeur</th><th>Commune</th><th>Contrat</th><th>Secteur</th></tr></thead>
      <tbody>${L.slice(0, 300).map(o => `<tr style="cursor:default"><td class="num">${dateFr(o.date)}</td>
        <td>${o.url ? `<a class="lien" href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.intitule)}</a>` : `<b>${esc(o.intitule)}</b>`}${o.postes > 1 ? ` <span class="sansloc">${nb(o.postes)} postes</span>` : ""}</td>
        <td>${esc(o.entreprise) || '<span class="sansloc" style="margin:0">non communiqué</span>'}</td><td>${esc(nomCommune(o.code_commune))}</td>
        <td>${esc(o.contrat_libelle.split(" - ")[0])}${o.duree ? `<br><span class="sansloc" style="margin:0">${esc(o.duree)}</span>` : ""}</td><td class="detail">${esc(o.secteur)}</td></tr>`).join("")}</tbody></table></div>
      <p class="note petit">${nb(L.length)} offre${L.length > 1 ? "s" : ""}${L.length > 300 ? ", les 300 plus récentes sont affichées" : ""}. Source : France Travail.</p>`
      : `<p class="note">Aucune offre ne correspond à ces critères.</p>`;
  };
  lister();
  $("em-com").onchange = ev => { fCom = ev.target.value; lister(); };
  $("em-contrat").onchange = ev => { fContrat = ev.target.value; lister(); };
  $("em-texte").oninput = debounce(ev => { fTexte = ev.target.value; lister(); }, 200);
  $("em-xlsx").onclick = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, feuille(O.map(o => ({...o, commune:nomCommune(o.code_commune)})), [["date", "Publiée le"], ["intitule", "Offre"], ["metier", "Métier"],
      ["rome", "Code ROME"], ["entreprise", "Employeur"], ["commune", "Commune"], ["contrat_libelle", "Contrat"], ["duree", "Durée du travail"],
      ["experience", "Expérience"], ["secteur", "Secteur"], ["postes", "Postes"], ["url", "Lien"]]), "Offres");
    XLSX.writeFile(wb, `offres_emploi_ncpa_${jour()}.xlsx`);
  };
}

function blocBmo(){
  const h = $("em-bmo"), B = bmo?.bassins || {}, noms = Object.keys(B);
  if (!noms.length){ h.innerHTML = ""; return; }
  if (!noms.includes(bassin)) bassin = noms[0];
  // lignes : [code, métier, famille, projets, projets difficiles, projets saisonniers] ; null = secret statistique
  const L = B[bassin], tot = L.reduce((s, x) => s + (x[3] || 0), 0), dif = L.reduce((s, x) => s + (x[4] || 0), 0), sai = L.reduce((s, x) => s + (x[5] || 0), 0);
  const top = L.slice(0, 15), tendus = L.filter(x => (x[3] || 0) >= 30 && x[4] != null).sort((a, b) => b[4] / b[3] - a[4] / a[3]).slice(0, 12);
  const titre = t => t.charAt(0) + t.slice(1).toLowerCase();
  h.innerHTML = `<h3 class="partie">Besoins en main-d'œuvre ${bmo.annee}</h3>
    <p class="note">Chaque année, France Travail interroge les employeurs sur leurs projets de recrutement. Les résultats sont publiés par
      bassin d'emploi, plus large que le territoire : ils donnent la tendance du marché local, pas un décompte des communes.</p>
    <div class="outils no-print"><label>Bassin d'emploi<select id="em-bassin">${noms.map(n => `<option value="${esc(n)}"${n === bassin ? " selected" : ""}>${esc(titre(n))}</option>`).join("")}</select></label></div>
    <div class="gros">
      ${k(nb(tot), `projets de recrutement<br>bassin de ${esc(titre(bassin))}`)}
      ${k(pct(dif, tot), "jugés difficiles par les employeurs")}
      ${k(pct(sai, tot), "liés à une activité saisonnière")}
      ${k(nb(L.length), "métiers concernés")}
    </div>
    <div class="deux">
      <div class="bloc"><h3>Les 15 métiers les plus recherchés</h3>
        ${legende([["Recrutements jugés difficiles", C_STRUCT], ["Autres projets", C_EI]])}
        ${barres(top.map(x => ({lib:x[1], segments:[{v:x[4] || 0, c:C_STRUCT}, {v:(x[3] || 0) - (x[4] || 0), c:C_EI}], valeur:nb(x[3] || 0),
          bulle:`<b>${esc(x[1])}</b><div class="l">Projets de recrutement<b>${nb(x[3] || 0)}</b></div>
            <div class="l">dont difficiles<b>${x[4] == null ? "non diffusé" : `${nb(x[4])} (${pct(x[4], x[3])})`}</b></div>
            <div class="l">dont saisonniers<b>${x[5] == null ? "non diffusé" : `${nb(x[5])} (${pct(x[5], x[3])})`}</b></div>`})))}</div>
      <div class="bloc"><h3>Les métiers les plus difficiles à pourvoir</h3>
        <p class="note petit">Part des projets jugés difficiles, parmi les métiers comptant au moins 30 projets.</p>
        ${barres(tendus.map(x => ({lib:x[1], segments:[{v:x[4] / x[3], c:C_STRUCT}], valeur:`${pct(x[4], x[3])} <small>(${nb(x[3])} projets)</small>`})), 1)}</div>
    </div>
    <p class="note petit">Source : France Travail, enquête Besoins en main-d'œuvre ${bmo.annee}. Les valeurs trop faibles ne sont pas diffusées.</p>`;
  $("em-bassin").onchange = ev => { bassin = ev.target.value; blocBmo(); };
}
