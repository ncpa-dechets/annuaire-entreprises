/* Onglet Dynamique (partie haute) : créations et fermetures d'établissements, par an et par secteur. */
import {$, esc, nb, SECTIONS, COULEURS, stats} from "./commun.js";
import {chiffres, listeCommunes, fluxDe, flux12ParSecteur} from "./stats.js";
import {pct, signe} from "./graphes.js";
import {avertissement, blocFlux, blocAges} from "./blocs.js";

let code = "", sec = "";

export function dynamique(){
  const h = $("dy-contenu");
  if (!stats){ h.innerHTML = ""; return; }
  const c = chiffres(code), f12 = flux12ParSecteur(code), complet = !!stats.complet;
  const secs = Object.keys(c.sections).sort((a, b) => (SECTIONS[a] || a).localeCompare(SECTIONS[b] || b, "fr"));
  if (sec && !secs.includes(sec)) sec = "";
  const tot = Object.entries(f12).filter(([s]) => !sec || s === sec).reduce((t, [, v]) => ({crea:t.crea + v.crea, ferm:t.ferm + v.ferm, creaEi:t.creaEi + v.creaEi}), {crea:0, ferm:0, creaEi:0});
  const stock = sec ? (c.sections[sec]?.n || 0) : c.n;
  const k = (v, lib) => `<div><b>${v}</b><span>${lib}</span></div>`;
  const L = Object.keys({...c.sections, ...f12}).map(s => ({s, nom:SECTIONS[s] || s, n:c.sections[s]?.n || 0, ...(f12[s] || {crea:0, ferm:0, creaEi:0})}))
    .sort((a, b) => b.crea - a.crea || b.n - a.n);

  h.innerHTML = `
    <div class="tete-page"><div><h2>Dynamique des entreprises</h2>
      <p class="note">Créations et fermetures d'établissements d'après le répertoire SIRENE${complet ? ", entrepreneurs individuels compris" : ""}.
        Un déménagement compte pour une fermeture et une création.</p></div>
      <div class="no-print outils" style="margin:0">
        <label>Périmètre<select id="dy-lieu"><option value="">Tout le territoire</option>${listeCommunes().map(x =>
          `<option value="${x.code}"${x.code === code ? " selected" : ""}>${esc(x.nom)}</option>`).join("")}</select></label>
        <label>Secteur<select id="dy-sec"><option value="">Tous les secteurs</option>${secs.map(s =>
          `<option value="${s}"${s === sec ? " selected" : ""}>${esc(SECTIONS[s] || s)}</option>`).join("")}</select></label>
        <button class="btn" data-imprimer>Imprimer ou enregistrer en PDF</button></div></div>
    ${avertissement()}
    <div class="gros">
      ${k(nb(tot.crea), "créations sur 12 mois" + (complet ? "" : "<br>encore actives"))}
      ${complet ? k(nb(tot.ferm), "fermetures sur 12 mois") + k(signe(tot.crea - tot.ferm), "solde sur 12 mois") : ""}
      ${k(pct(tot.crea, stock, 1), "taux de création<br>(créations sur 12 mois / établissements actifs)")}
      ${complet ? k(pct(tot.creaEi, tot.crea), "des créations sont le fait<br>d'entrepreneurs individuels") : ""}
    </div>
    <div class="deux">
      <div class="bloc"><h3>Créations et fermetures par an${sec ? ` : ${esc(SECTIONS[sec])}` : ""}</h3>${blocFlux({flux:fluxDe(code, sec)})}</div>
      <div class="bloc"><h3>Âge des établissements actifs${sec ? " (tous secteurs)" : ""}</h3>${blocAges(c)}</div>
    </div>
    <div class="bloc"><h3>Par secteur, sur 12 mois</h3>
      <div class="cadre libre"><table class="compar"><thead><tr><th>Secteur</th><th class="d">Établissements actifs</th><th class="d">Créations</th>
        ${complet ? '<th class="d">dont entrepreneurs individuels</th><th class="d">Fermetures</th><th class="d">Solde</th>' : ""}<th class="d">Taux de création</th></tr></thead>
        <tbody>${L.map(l => `<tr data-sec="${l.s}"${l.s === sec ? ' class="sel"' : ""}><td><span class="evt" style="white-space:normal"><span class="pastille" style="background:${COULEURS[l.s] || "#999"}"></span>${esc(l.nom)}</span></td>
          <td class="num d">${nb(l.n)}</td><td class="num d">${nb(l.crea)}</td>
          ${complet ? `<td class="num d">${nb(l.creaEi)}</td><td class="num d">${nb(l.ferm)}</td><td class="num d">${signe(l.crea - l.ferm)}</td>` : ""}
          <td class="num d">${pct(l.crea, l.n, 1)}</td></tr>`).join("")}</tbody></table></div>
      <p class="note petit no-print">Cliquez sur un secteur pour afficher son graphique par année.</p></div>`;

  $("dy-lieu").onchange = ev => { code = ev.target.value; dynamique(); };
  $("dy-sec").onchange = ev => { sec = ev.target.value; dynamique(); };
  h.querySelectorAll("tbody tr[data-sec]").forEach(tr => tr.onclick = () => { sec = sec === tr.dataset.sec ? "" : tr.dataset.sec; dynamique(); h.closest(".page").scrollTop = 0; });
}
