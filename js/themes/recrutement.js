/* Potentiels d'embauche La Bonne Boîte : jointure par SIRET avec l'annuaire. */
import {$, esc, norm, nb, dateFr, debounce, bonneBoite, parSiret, feuille, jour} from "../commun.js";

let commune = "", secteur = "", recherche = "", forts = true;
const niveau = p => p.fort_potentiel === true ? "Fort potentiel" : p.fort_potentiel === false ? "Autre niveau" : "Non précisé";
const indice = p => Number.isFinite(p.indice) ? nb(p.indice) : "Non renseigné";

export function blocRecrutement(h){
  const titre = `<h3 class="partie">Entreprises à potentiel d'embauche</h3>`;
  if (!bonneBoite){
    h.innerHTML = `${titre}<p class="note">Les données de La Bonne Boîte ne sont pas encore disponibles.</p>`;
    return;
  }
  const entreprises = bonneBoite.etablissements.filter(p => parSiret.has(p.siret)).map(p => ({...parSiret.get(p.siret), ...p}))
    .sort((a, b) => Number(b.fort_potentiel === true) - Number(a.fort_potentiel === true)
      || (b.indice ?? -1) - (a.indice ?? -1) || a.nom.localeCompare(b.nom, "fr"));
  const hauts = entreprises.filter(p => p.fort_potentiel === true);
  const communes = [...new Set(entreprises.map(e => e.com))].sort((a, b) => a.localeCompare(b, "fr"));
  const secteurs = [...new Set(entreprises.map(e => e.divl).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
  const chiffre = (n, lib) => `<div><b>${nb(n)}</b><span>${lib}</span></div>`;
  h.innerHTML = `${titre}
    <p class="note">France Travail estime le potentiel d'embauche à six mois à partir des recrutements passés.
      Ces indications permettent de cibler des candidatures spontanées ; elles ne constituent pas des offres d'emploi.
      L'indice sur 100 n'est ni un pourcentage de probabilité ni un nombre de postes.
      L'absence d'un établissement dans les résultats ne signifie pas qu'il ne recrute pas.</p>
    <p class="note petit">Source : La Bonne Boîte, France Travail. Consultation du ${dateFr(bonneBoite.date)}.
      Périmètre : établissements de cet annuaire, hors entrepreneurs individuels.</p>
    <div class="gros">
      ${chiffre(bonneBoite.interroges, "établissements interrogés")}
      ${chiffre(entreprises.length, "établissements renseignés")}
      ${chiffre(hauts.length, "à fort potentiel estimé")}
      ${chiffre(new Set(hauts.map(e => e.cc)).size, "communes avec un fort potentiel")}
    </div>
    ${entreprises.length ? `<div class="bloc"><h3>Repérer les employeurs</h3>
      <div class="outils no-print">
        <label>Commune<select id="bb-commune"><option value="">Toutes les communes</option>${communes.map(c => `<option value="${esc(c)}"${c === commune ? " selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
        <label>Activité<select id="bb-secteur"><option value="">Toutes les activités</option>${secteurs.map(s => `<option value="${esc(s)}"${s === secteur ? " selected" : ""}>${esc(s)}</option>`).join("")}</select></label>
        <label>Recherche<input id="bb-recherche" type="search" placeholder="Entreprise, activité, SIRET…" value="${esc(recherche)}"></label>
        <label><input id="bb-forts" type="checkbox"${forts ? " checked" : ""}> Fort potentiel uniquement</label>
        <button type="button" class="btn" id="bb-export">Télécharger la sélection (Excel)</button>
      </div><div id="bb-resultats"></div></div>` : `<p class="note">Aucun renseignement retourné pour les établissements interrogés lors de cette consultation.</p>`}`;
  if (!entreprises.length) return;
  let selection = [], limite = 200;
  const afficher = () => {
    $("bb-export").disabled = !selection.length;
    $("bb-resultats").innerHTML = selection.length ? `<div class="cadre" style="max-height:560px"><table>
      <thead><tr><th>Établissement</th><th>Commune</th><th>Activité</th><th>Indice /100</th><th>Signal France Travail</th><th>Localisation</th></tr></thead>
      <tbody>${selection.slice(0, limite).map(e => `<tr style="cursor:default">
        <td><a class="lien" href="https://annuaire-entreprises.data.gouv.fr/etablissement/${esc(e.siret)}" target="_blank" rel="noopener">${esc(e.nom)}</a></td>
        <td>${esc(e.com)}</td><td>${esc(e.nafl || e.divl)}</td><td class="num">${indice(e)}</td><td>${niveau(e)}</td>
        <td>${e.lat !== null && e.lon !== null ? `<button type="button" class="btn" data-voir="${esc(e.siret)}">Voir sur la carte</button>` : '<span class="sansloc">Sans position</span>'}</td></tr>`).join("")}</tbody></table></div>
      <p class="note petit">${nb(selection.length)} établissement${selection.length > 1 ? "s" : ""} dans la sélection${selection.length > limite ? `, ${nb(limite)} affichés` : ""}.</p>
      ${selection.length > limite ? '<button type="button" class="btn no-print" id="bb-suite">Afficher les suivants</button>' : ""}`
      : `<p class="note">Aucun établissement ne correspond à ces filtres. Vous pouvez notamment décocher « Fort potentiel uniquement » pour voir tous les renseignements disponibles.</p>`;
    if ($("bb-suite")) $("bb-suite").onclick = () => { limite += 200; afficher(); };
  };
  const filtrer = () => {
    const mots = norm(recherche).split(/\s+/).filter(Boolean);
    selection = entreprises.filter(e => (!commune || e.com === commune) && (!secteur || e.divl === secteur)
      && (!forts || e.fort_potentiel === true)
      && mots.every(m => norm([e.nom, e.rs, e.siret, e.nafl, e.naf, e.divl].join(" ")).includes(m)));
    limite = 200; afficher();
  };
  $("bb-commune").onchange = ev => { commune = ev.target.value; filtrer(); };
  $("bb-secteur").onchange = ev => { secteur = ev.target.value; filtrer(); };
  $("bb-recherche").oninput = debounce(ev => { recherche = ev.target.value; filtrer(); }, 200);
  $("bb-forts").onchange = ev => { forts = ev.target.checked; filtrer(); };
  $("bb-export").onclick = () => {
    const wb = XLSX.utils.book_new();
    const lignes = selection.map(e => ({...e, signal:niveau(e), source:"France Travail, La Bonne Boîte v2", date:bonneBoite.date}));
    XLSX.utils.book_append_sheet(wb, feuille(lignes, [["siret", "SIRET"], ["nom", "Établissement"], ["com", "Commune"],
      ["adr", "Adresse"], ["naf", "Code NAF"], ["nafl", "Activité"], ["indice", "Indice sur 100 (pas une probabilité)"],
      ["signal", "Signal France Travail"], ["date", "Date de consultation"], ["source", "Source"]]), "Potentiels d'embauche");
    XLSX.writeFile(wb, `potentiels_embauche_ncpa_${jour()}.xlsx`);
  };
  filtrer();
}
