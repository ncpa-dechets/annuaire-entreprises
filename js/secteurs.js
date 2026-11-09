/* Onglet Secteurs : poids des secteurs, emploi salarié privé (Urssaf) et spécialisation du territoire. */
import {$, esc, nb, SECTIONS, COULEURS, stats, feuille, jour} from "./commun.js";
import {chiffres, listeCommunes} from "./stats.js";
import {aEmploi, annees, derniereAnnee, emploiDe, reference, evolution, fmtEvol, specificite} from "./emploi.js";
import {courbes, legende, pct, C_STRUCT, C_EI} from "./graphes.js";
import {pied} from "./blocs.js";

let code = "", detail = "", tri = {col:"sal", sens:-1};
const dec1 = v => v.toLocaleString("fr-FR", {minimumFractionDigits:1, maximumFractionDigits:1});

// Colonnes du tableau : [clé, intitulé, numérique]
const COLS = [["nom", "Secteur"], ["n", "Établissements (SIRENE)", true], ["emp", "Employeurs du privé", true], ["sal", "Salariés du privé", true],
  ["part", "Part de l'emploi", true], ["ev5", "Évolution sur 5 ans", true], ["spe", "Spécificité", true]];

function lignes(){
  const c = chiffres(code), e = emploiDe(code), i = annees().length - 1;
  const secs = new Set([...Object.keys(c.sections), ...Object.keys(e.sections)]);
  return [...secs].map(s => { const es = e.sections[s], ev = es ? evolution(es.eff, 5) : null;
    return {sec:s, nom:SECTIONS[s] || s, n:c.sections[s]?.n || 0, emp:es?.etab[i] || 0, sal:es?.eff[i] || 0,
      part:e.eff[i] ? 100 * (es?.eff[i] || 0) / e.eff[i] : null, ev5:ev?.pct ?? null, ev5txt:fmtEvol(ev), spe:es ? specificite(e, s) : null}; });
}

export function secteurs(){
  const h = $("se-contenu");
  if (!aEmploi() || !stats){ h.innerHTML = `<h2>Secteurs d'activité et emploi</h2><p class="note">Les données d'emploi seront disponibles après la prochaine collecte nocturne.</p>`; return; }
  const e = emploiDe(code), ref = reference(), an = derniereAnnee(), A = annees(), nomLieu = code ? stats.communes[code].nom : "Territoire";
  const e1 = evolution(e.eff, 1), e5 = evolution(e.eff, 5), eTout = evolution(e.eff, A.length - 1);
  const k = (v, lib) => `<div><b>${v}</b><span>${lib}</span></div>`;

  // Comparaison au département, en base 100
  const base = Math.max(0, A.indexOf(A.at(-1) - 10));
  const indice = s => s[base] ? s.map(v => 100 * v / s[base]) : null;
  const iLoc = indice(e.eff), iRef = indice(ref.eff);

  const L = lignes();
  L.sort((a, b) => { const x = a[tri.col], y = b[tri.col];
    if (x == null) return 1; if (y == null) return -1;
    return (typeof x === "number" ? x - y : String(x).localeCompare(String(y), "fr")) * tri.sens || a.nom.localeCompare(b.nom, "fr"); });
  const cel = (l, c) => c === "nom" ? `<td><span class="evt" style="white-space:normal"><span class="pastille" style="background:${COULEURS[l.sec] || "#999"}"></span>${esc(l.nom)}</span></td>`
    : c === "part" ? `<td class="num d">${l.part == null ? "–" : `${dec1(l.part)} %`}</td>`
    : c === "ev5" ? `<td class="num d">${l.ev5txt}</td>`
    : c === "spe" ? `<td class="num d">${l.spe == null ? "–" : `${dec1(l.spe)}<span class="mini"><i style="width:${Math.min(100, 100 * l.spe / 3).toFixed(1)}%"></i><u style="left:33.3%"></u></span>`}</td>`
    : `<td class="num d">${nb(l[c])}</td>`;

  h.innerHTML = `
    <div class="tete-page"><div><h2>Secteurs d'activité et emploi</h2>
      <p class="note">Emploi salarié du secteur privé au 31 décembre, d'après l'Urssaf : hors fonction publique, agriculture,
        particuliers employeurs et non-salariés.</p></div>
      <div class="no-print outils" style="margin:0"><label>Périmètre<select id="se-lieu"><option value="">Tout le territoire</option>${listeCommunes().map(c =>
        `<option value="${c.code}"${c.code === code ? " selected" : ""}>${esc(c.nom)}</option>`).join("")}</select></label>
        <button class="btn" id="se-xlsx">Télécharger (Excel)</button><button class="btn" data-imprimer>Imprimer ou enregistrer en PDF</button></div></div>
    <div class="gros">
      ${k(nb(e.eff.at(-1)), `salariés du privé fin ${an}${code ? `<br>à ${esc(nomLieu)}` : ""}`)}
      ${k(fmtEvol(e1), `sur un an${e1 ? `<br>(${e1.abs > 0 ? "+" : ""}${nb(e1.abs)} salariés)` : ""}`)}
      ${k(fmtEvol(e5), `sur cinq ans${e5 ? `<br>(${e5.abs > 0 ? "+" : ""}${nb(e5.abs)} salariés)` : ""}`)}
      ${k(fmtEvol(eTout), `depuis ${A[0]}`)}
      ${k(nb(e.etab.at(-1)), "établissements employeurs<br>du secteur privé")}
    </div>
    <div class="deux">
      <div class="bloc"><h3>Salariés du privé depuis ${A[0]}</h3>
        ${courbes(A.map(String), [{nom:"Salariés du privé", c:C_STRUCT, v:e.eff}], {titre:"Salariés du privé par année"})}</div>
      <div class="bloc"><h3>Évolution comparée au ${esc(ref.nom)}, base 100 en ${A[base]}</h3>
        ${iLoc && iRef ? legende([[nomLieu, C_STRUCT], [ref.nom, C_EI]]) + courbes(A.slice(base).map(String),
          [{nom:nomLieu, c:C_STRUCT, v:iLoc.slice(base)}, {nom:ref.nom, c:C_EI, v:iRef.slice(base)}], {titre:"Emploi en base 100", fmt:v => nb(Math.round(v))})
          : `<p class="note">Pas de salarié du privé en ${A[base]} : comparaison impossible.</p>`}</div>
    </div>
    <div class="bloc"><h3>Les secteurs</h3>
      <p class="note"><b>Spécificité</b> : part du secteur dans l'emploi local, rapportée à sa part dans le ${esc(ref.nom)}. Au-dessus de 1
        (le trait), le secteur pèse plus ici que dans le département. Cliquez sur un secteur pour voir ses activités.</p>
      <div class="cadre libre"><table class="compar"><thead><tr>${COLS.map(([c, lib, n]) =>
        `<th data-se="${c}"${n ? ' class="d"' : ""} tabindex="0">${esc(lib)}${tri.col === c ? `<span class="fl">${tri.sens > 0 ? "▲" : "▼"}</span>` : ""}</th>`).join("")}</tr></thead>
        <tbody>${L.map(l => `<tr data-sec="${l.sec}"${l.sec === detail ? ' class="sel"' : ""}>${COLS.map(([c]) => cel(l, c)).join("")}</tr>`).join("")}</tbody></table></div>
      <div id="se-detail">${detail ? blocDetail(e) : ""}</div></div>
    ${pied()}
    <p class="source" style="max-width:none">Emploi : Urssaf, établissements employeurs et effectifs salariés du secteur privé par commune et par activité, ${A[0]}-${an}.</p>`;

  $("se-lieu").onchange = ev => { code = ev.target.value; secteurs(); };
  const trier = c => { tri = {col:c, sens: tri.col === c ? -tri.sens : (c === "nom" ? 1 : -1)}; secteurs(); };
  h.querySelectorAll("th[data-se]").forEach(th => {
    th.onclick = () => trier(th.dataset.se);
    th.onkeydown = ev => { if (ev.key === "Enter" || ev.key === " "){ ev.preventDefault(); trier(th.dataset.se); } };
  });
  h.querySelectorAll("tbody tr[data-sec]").forEach(tr => tr.onclick = () => {
    detail = detail === tr.dataset.sec ? "" : tr.dataset.sec; secteurs();
    if (detail) $("se-detail").scrollIntoView({behavior:"smooth", block:"nearest"});
  });
  $("se-xlsx").onclick = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, feuille(L.map(l => ({...l, part:l.part == null ? "" : Math.round(l.part * 10) / 10,
      ev5:l.ev5 == null ? "" : Math.round(l.ev5 * 10) / 10, spe:l.spe == null ? "" : Math.round(l.spe * 100) / 100})),
      COLS.map(([c, lib]) => [c, c === "part" ? "Part de l'emploi (%)" : c === "ev5" ? "Évolution sur 5 ans (%)" : lib])), "Secteurs");
    const i = A.length - 1;
    XLSX.utils.book_append_sheet(wb, feuille(e.apes.map(a => ({ape:a.ape, lib:a.lib, sec:SECTIONS[a.sec] || a.sec, etab:a.etab[i], eff:a.eff[i], eff5:a.eff[i - 5] ?? ""}))
      .sort((a, b) => b.eff - a.eff), [["ape", "Code APE"], ["lib", "Activité"], ["sec", "Secteur"], ["etab", "Employeurs du privé"],
      ["eff", `Salariés ${an}`], ["eff5", `Salariés ${an - 5}`]]), "Activités");
    XLSX.writeFile(wb, `secteurs_${code || "ncpa"}_${jour()}.xlsx`);
  };
}

function blocDetail(e){
  const s = e.sections[detail], A = annees(), i = A.length - 1, an = derniereAnnee();
  const lien = `<a class="lien no-print" data-annuaire-secteur="${detail}"${code ? ` data-annuaire-commune="${esc(stats.communes[code].nom)}"` : ""}>Voir les établissements de ce secteur dans l'annuaire →</a>`;
  if (!s) return `<div class="detail-sec"><h3>${esc(SECTIONS[detail] || detail)}</h3><p class="note">Aucun salarié du privé recensé par l'Urssaf dans ce secteur.</p>${lien}</div>`;
  const apes = e.apes.filter(a => a.sec === detail && (a.eff[i] || a.eff[i - 5] || a.etab[i])).sort((a, b) => b.eff[i] - a.eff[i]);
  return `<div class="detail-sec"><h3>${esc(SECTIONS[detail] || detail)}</h3>
    <div class="deux"><div>${courbes(A.map(String), [{nom:"Salariés du privé", c:COULEURS[detail] || C_STRUCT, v:s.eff}], {titre:"Salariés du secteur par année"})}</div>
    <div><p class="note">${nb(s.eff[i])} salariés du privé fin ${an} dans ${nb(s.etab[i])} établissements employeurs ;
      ${fmtEvol(evolution(s.eff, 5))} en cinq ans, ${fmtEvol(evolution(s.eff, A.length - 1))} depuis ${A[0]}.</p>${lien}</div></div>
    <div class="cadre libre" style="margin-top:10px"><table class="compar"><thead><tr><th>Activité</th><th class="d">Employeurs</th><th class="d">Salariés ${an}</th>
      <th class="d">Salariés ${an - 5}</th><th class="d">Part du secteur</th></tr></thead><tbody>
      ${apes.map(a => `<tr style="cursor:default"><td>${esc(a.lib)} <span class="sansloc">${esc(a.ape)}</span></td><td class="num d">${nb(a.etab[i])}</td>
        <td class="num d">${nb(a.eff[i])}</td><td class="num d">${a.eff[i - 5] == null ? "–" : nb(a.eff[i - 5])}</td><td class="num d">${pct(a.eff[i], s.eff[i])}</td></tr>`).join("")}
    </tbody></table></div></div>`;
}
