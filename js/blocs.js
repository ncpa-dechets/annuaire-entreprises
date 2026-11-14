/* Blocs réutilisés par la Synthèse et les fiches commune : chiffres clés, secteurs, dynamique, employeurs. */
import {esc, nb, dateFr, dateLongue, SECTIONS, COULEURS, stats, meta, EVT, lienEntreprise} from "./commun.js";
import {chiffres, employeurs, procedures, annonces, FAM_EI} from "./stats.js";
import {aEmploi, emploiDe, derniereAnnee, evolution, fmtEvol} from "./emploi.js";
import {barres, colonnes, legende, pct, signe, C_STRUCT, C_EI, C_CREA, C_FERM} from "./graphes.js";

const complet = () => !!stats?.complet;

export function avertissement(){
  return complet() ? "" : `<div class="bandeau no-print">Chiffres provisoires, calculés d'après l'annuaire : les entrepreneurs
    individuels et les fermetures seront comptés à partir de la prochaine collecte nocturne.</div>`;
}

export function chiffresCles(code){
  const c = chiffres(code);
  const k = (v, lib, aide) => `<div${aide ? ` data-bulle="${esc(aide)}" tabindex="0"` : ""}><b>${v}</b><span>${lib}</span></div>`;
  const dens = c.pop ? (1000 * c.n / c.pop).toLocaleString("fr-FR", {maximumFractionDigits:0}) : null;
  return `<div class="gros">
    ${k(nb(c.n), "établissements actifs" + (complet() ? `<br>dont ${nb(c.ei)} entrepreneurs individuels` : "<br>hors entrepreneurs individuels"),
      "Tous les établissements actifs du répertoire SIRENE : sociétés, associations, structures publiques, SCI" + (complet() ? " et entrepreneurs individuels." : "."))}
    ${k(nb(c.emp), "établissements employeurs", "Établissements déclarés employeurs ou ayant au moins un salarié d'après l'Insee.")}
    ${aEmploi() ? (() => { const e = emploiDe(code), ev = evolution(e.eff, 5);
      return k(nb(e.eff.at(-1)), `salariés du privé fin ${derniereAnnee()}<br>${ev ? `${fmtEvol(ev)} en cinq ans (Urssaf)` : "(Urssaf)"}`,
        "Effectifs salariés des établissements du secteur privé au 31 décembre, d'après l'Urssaf : hors fonction publique, agriculture et non-salariés."); })() : ""}
    ${k(`${nb(c.emin)} à ${nb(c.emax)}`, "salariés, toutes structures<br>(tranches Insee)", "Somme des tranches d'effectif du répertoire SIRENE : un ordre de grandeur, souvent en retard d'un à deux ans.")}
    ${k(nb(c.crea12), "créations sur 12 mois" + (complet() ? "" : "<br>encore actives"), "Établissements créés depuis un an (date de création SIRENE). Un transfert d'adresse compte comme une création.")}
    ${complet() ? k(nb(c.ferm12), "fermetures sur 12 mois", "Établissements fermés depuis un an. Un transfert d'adresse compte comme une fermeture.")
      + k(signe(c.crea12 - c.ferm12), "solde sur 12 mois") : ""}
    ${k(nb(procedures(code)), "entreprises en procédure collective<br>ouverte sur 12 mois (BODACC)", "Sauvegardes, redressements et liquidations judiciaires publiés au BODACC depuis un an.")}
    ${dens ? k(dens, `établissements pour 1 000 habitants<br>(${nb(c.pop)} habitants)`) : ""}
  </div>`;
}

/* Secteurs : nombre d'établissements, avec la part des entrepreneurs individuels.
   ref (facultatif) : chiffres du territoire, pour comparer la part de chaque secteur. */
export function blocSecteurs(c, ref){
  const secs = Object.entries(c.sections).sort((a, b) => b[1].n - a[1].n);
  if (!secs.length) return `<p class="note">Aucun établissement.</p>`;
  if (ref){
    const max = Math.max(...secs.map(([s, v]) => Math.max(v.n / c.n, (ref.sections[s]?.n || 0) / ref.n)));
    return legende([["Part dans la commune", C_STRUCT], ["Part dans le territoire", "#333", "trait"]]) + barres(secs.map(([s, v]) => {
      const p = v.n / c.n, pr = (ref.sections[s]?.n || 0) / ref.n;
      return {lib:SECTIONS[s] || s, pastille:COULEURS[s], segments:[{v:p, c:C_STRUCT}], repere:pr, valeur:`${pct(v.n, c.n)} <small>(${nb(v.n)})</small>`,
        bulle:`<b>${esc(SECTIONS[s] || s)}</b><div class="l">Commune<b>${pct(v.n, c.n, 1)}</b></div><div class="l">Territoire<b>${pct(pr, 1, 1)}</b></div>
          <div class="l">Établissements<b>${nb(v.n)}</b></div><div class="l">dont employeurs<b>${nb(v.emp)}</b></div>`};
    }), max);
  }
  return (complet() ? legende([["Sociétés, associations et autres structures", C_STRUCT], ["Entrepreneurs individuels", C_EI]]) : "")
    + barres(secs.map(([s, v]) => ({lib:SECTIONS[s] || s, pastille:COULEURS[s],
      segments:[{v:v.n - v.ei, c:C_STRUCT}, {v:v.ei, c:C_EI}], valeur:`${nb(v.n)} <small>(${pct(v.n, c.n)})</small>`,
      bulle:`<b>${esc(SECTIONS[s] || s)}</b><div class="l">Établissements<b>${nb(v.n)}</b></div>
        ${complet() ? `<div class="l">dont entrepreneurs individuels<b>${nb(v.ei)}</b></div>` : ""}
        <div class="l">dont employeurs<b>${nb(v.emp)}</b></div><div class="l">Salariés (tranches)<b>${nb(v.emin)} à ${nb(v.emax)}</b></div>`})));
}

export function blocFlux(c){
  if (!complet()) return `<p class="note">Les créations et fermetures par année seront disponibles après la prochaine collecte nocturne.</p>`;
  const an = +stats.date.slice(0, 4);
  return legende([["Créations", C_CREA], ["Fermetures", C_FERM]])
    + colonnes(c.flux.map(f => String(f.an)), [{nom:"Créations", c:C_CREA, v:c.flux.map(f => f.crea)}, {nom:"Fermetures", c:C_FERM, v:c.flux.map(f => f.ferm)}],
      "Créations et fermetures d'établissements par année")
    + `<p class="note petit">${an} : année en cours, jusqu'au ${dateLongue(stats.date)}. Un déménagement compte pour une fermeture et une création.</p>`;
}

export function blocFamilles(c){
  const ordre = stats?.familles || [];
  const l = Object.entries(c.familles).sort((a, b) => b[1] - a[1] || ordre.indexOf(a[0]) - ordre.indexOf(b[0]));
  return barres(l.map(([f, n]) => ({lib:f, segments:[{v:n, c:f === FAM_EI ? C_EI : C_STRUCT}], valeur:`${nb(n)} <small>(${pct(n, c.n)})</small>`})));
}

export function blocAges(c){
  const total = c.ages.reduce((s, a) => s + a.n, 0);
  if (!total) return `<p class="note">Dates de création non renseignées.</p>`;
  return barres(c.ages.map(a => ({lib:a.lib, segments:[{v:a.n - a.ei, c:C_STRUCT}, {v:a.ei, c:C_EI}], valeur:`${nb(a.n)} <small>(${pct(a.n, total)})</small>`})));
}

export function tableEmployeurs(code, combien){
  const l = employeurs(code, combien);
  if (!l.length) return `<p class="note">Aucun établissement avec un effectif salarié connu.</p>`;
  return `<div class="cadre libre"><table><thead><tr><th>Établissement</th><th>Activité</th>${code ? "" : "<th>Commune</th>"}<th>Effectif (tranche Insee)</th></tr></thead><tbody>
    ${l.map(e => `<tr><td>${lienEntreprise(e.siret.slice(0, 9), e.nom)} <a class="sansloc no-print" data-voir="${esc(e.siret)}" title="Voir sur la carte" style="cursor:pointer">carte</a></td><td>${esc(e.nafl)}</td>
      ${code ? "" : `<td>${esc(e.com)}</td>`}<td class="num">${esc(e.trl)}${e.aeff ? ` <span class="sansloc">(${esc(e.aeff)})</span>` : ""}</td></tr>`).join("")}
    </tbody></table></div>`;
}

export function tableAnnonces(code, combien){
  const l = annonces(code, combien);
  if (!l.length) return `<p class="note">Aucune annonce au BODACC sur deux ans.</p>`;
  return `<div class="cadre libre"><table><thead><tr><th>Date</th><th>Événement</th><th>Nom</th><th>Activité</th></tr></thead><tbody>
    ${l.map(b => `<tr><td class="num">${dateFr(b.date)}</td><td><span class="evt"><span class="pastille" style="background:${EVT[b.evt]?.c || "#999"}"></span>${esc(b.evt)}</span></td>
      <td>${lienEntreprise(b.sirens[0], b.nom)} <a class="sansloc no-print" href="${esc(b.url)}" target="_blank" rel="noopener">annonce</a></td><td class="detail">${esc(b.act)}</td></tr>`).join("")}
    </tbody></table></div>`;
}

export function pied(){
  return `<p class="source pied">Sources : Insee, répertoire SIRENE (établissements actifs${complet() ? ", entrepreneurs individuels compris dans les comptages" : ""}) ;
    BODACC (annonces légales) ; Urssaf (emploi salarié privé) ; populations municipales Insee. Données du ${dateLongue(meta.date_maj)}.
    Les effectifs sont des tranches déclarées à l'Insee : des ordres de grandeur.</p>`;
}
