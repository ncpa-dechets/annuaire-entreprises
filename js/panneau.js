/* Fiche latérale de l'annuaire : s'ouvre au clic sur un établissement de la carte ou de la liste.
   Sections repliables (leur état est gardé dans ce navigateur). Plusieurs établissements au même
   emplacement : la fiche commence par leur liste. */
import {$, esc, nb, dateFr, sirFmt, toast, E, COULEURS, SECTIONS, PRECISIONS, estApprox, etabsParSiren, bodaccParSiren,
  potentielParSiret, bonneBoite, journal, EVT, dossier, basculerDossier} from "./commun.js";
import {MAX_ENTREPRISES} from "./fiches-outils.js";
import {interroger, LABELS, euros} from "./entreprise.js";
import {pin, pinMini, categorie, icone} from "./pictos.js";

const CLE = "ncpa-panneau-replis";
const replis = new Set((() => { try { const l = JSON.parse(localStorage.getItem(CLE) || "[]"); return Array.isArray(l) ? l : []; } catch(e){ return []; } })());
let hote, corps, pied, actions = {}, groupeCourant = null, courant = null;

export function initPanneau(el, a){
  hote = el; actions = a;
  hote.innerHTML = `<div class="pf-tete"><h2 data-pf="titre">Fiche établissement</h2>
      <button type="button" class="pf-fermer" aria-label="Fermer la fiche" title="Fermer (Échap)">${icone("x", 20)}</button></div>
    <div class="pf-corps" data-pf="corps"></div><div class="pf-pied" data-pf="pied"></div>`;
  corps = hote.querySelector('[data-pf="corps"]'); pied = hote.querySelector('[data-pf="pied"]');
  hote.querySelector(".pf-fermer").onclick = fermerPanneau;
  hote.addEventListener("keydown", ev => { if (ev.key === "Escape") fermerPanneau(); });
  // Sections repliables : mémoriser l'état choisi
  corps.addEventListener("toggle", ev => {
    const k = ev.target.dataset?.sec; if (!k) return;
    ev.target.open ? replis.delete(k) : replis.add(k);
    try { localStorage.setItem(CLE, JSON.stringify([...replis])); } catch(e){}
  }, true);
  corps.addEventListener("click", ev => {
    const b = ev.target.closest("[data-copier]");
    if (b){ copier(b.dataset.copier); return; }
    const s = ev.target.closest("[data-pf-etab]")?.dataset.pfEtab;
    if (s){ const e = E.find(x => x.siret === s);
      if (e){ if (groupeCourant && !groupeCourant.includes(e)) groupeCourant = null; ouvrir(e); actions.voir?.(e); } return; }
    const a = ev.target.closest("[data-pf-action]")?.dataset.pfAction;
    if (a === "retour" && groupeCourant) listeGroupe(groupeCourant);
    else if (a === "centrer" && courant) actions.voir?.(courant, true);
    else if (a === "etabs" && courant) actions.centrerSur?.(etabsParSiren.get(courant.siret.slice(0, 9)) || [courant]);
    else if (a === "similaires" && courant) actions.filtrerActivite?.(courant.naf, courant.nafl, courant.com);
    else if (a === "dossier" && courant){ basculerDossier(courant.siret.slice(0, 9)); majDossier(); }
    else if (a === "reessayer" && courant) direct(courant);
  });
}

export const panneauOuvert = () => hote && !hote.hidden;
export function fermerPanneau(){
  if (!hote || hote.hidden) return;
  hote.hidden = true; courant = null; groupeCourant = null;
  actions.ferme?.();
}
function montrer(){
  const etait = hote.hidden;
  hote.hidden = false; corps.scrollTop = 0;
  if (etait) actions.ouvre?.();
}

function copier(t){
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast("Copié dans le presse-papiers"),
    () => toast("Copie impossible : sélectionnez le texte et faites Ctrl+C"));
}
const btnCopier = (t, lib) => `<button type="button" class="pf-ico" data-copier="${esc(t)}" title="Copier ${esc(lib)}" aria-label="Copier ${esc(lib)}">${icone("copy", 14)}</button>`;
const section = (k, titre, contenu, {n = null} = {}) => `<details class="pf-sec" data-sec="${k}"${replis.has(k) ? "" : " open"}>
  <summary><span>${esc(titre)}</span>${n ? `<span class="pf-n">${nb(n)}</span>` : ""}<span class="pf-chev">${icone("chevron-down", 18)}</span></summary>
  <div class="pf-sec-corps">${contenu}</div></details>`;
const champ = (lib, val) => `<div class="pf-champ"><b>${esc(lib)}</b><span>${val}</span></div>`;

/* ---------- Plusieurs établissements au même emplacement ---------- */
export function listeGroupe(liste){
  groupeCourant = liste; courant = null;
  const e0 = liste[0];
  hote.querySelector('[data-pf="titre"]').textContent = `${nb(liste.length)} établissements ici`;
  corps.innerHTML = `<div class="pf-carte pf-adr">${icone("map-pin", 18)}<div><b>${esc(e0.adr)}</b><br>${esc(e0.cp)} ${esc(e0.com)}
      ${estApprox(e0) ? `<br><span class="pf-mut">Position approximative : ces établissements sont dans la rue ou le lieu-dit, pas forcément au même numéro.</span>` : ""}</div></div>
    <div class="pf-liste">${liste.map(e => `<button type="button" class="pf-ligne" data-pf-etab="${esc(e.siret)}">${pinMini(e, 26)}
      <span class="pf-l-txt"><b>${esc(e.nom)}</b><span>${esc(e.nafl || "Activité non renseignée")}</span>
      <span class="pf-mut">${esc(e.adr)} · ${esc(e.trl)}</span></span>${e.siege === "Oui" ? `<span class="pf-badge">Siège</span>` : ""}</button>`).join("")}</div>`;
  pied.innerHTML = "";
  montrer();
}

/* ---------- Fiche d'un établissement ---------- */
export function ficheEtab(e, {groupe = null} = {}){
  groupeCourant = groupe && groupe.length > 1 ? groupe : null;
  ouvrir(e);
}
function ouvrir(e){
  courant = e;
  const siren = e.siret.slice(0, 9), etabs = [...(etabsParSiren.get(siren) || [e])]
    .sort((a, b) => (b.siege === "Oui") - (a.siege === "Oui") || (b.emin ?? -1) - (a.emin ?? -1));
  const cat = categorie(e.naf), c = COULEURS[e.sec] || "#999";
  const rs = e.rs && e.rs !== e.nom ? `<div class="pf-rs">${esc(e.rs)}</div>` : "";
  hote.querySelector('[data-pf="titre"]').textContent = "Fiche établissement";
  const avis = `https://api-avis-situation-sirene.insee.fr/identification/pdf/${e.siret}`;
  const rcs = !/Association|Secteur public/.test(e.tstr);

  corps.innerHTML = `
    ${groupeCourant ? `<button type="button" class="pf-retour" data-pf-action="retour">← ${nb(groupeCourant.length)} établissements à cet emplacement</button>` : ""}
    <div class="pf-carte pf-id">
      <div class="pf-ident">${pin(e, {l:46, approx:false})}<div><div class="pf-nom">${esc(e.nom)}</div>${rs}</div></div>
      <div class="pf-etats"><span class="pf-actif">Actif</span>
        <span class="pf-badge">${e.siege === "Oui" ? "Siège" : "Établissement secondaire"}</span>
        ${e.ess === "Oui" ? `<span class="pf-badge">ESS</span>` : ""}
        <span class="pf-mut">créé le ${dateFr(e.crea)}</span></div>
    </div>
    <div class="pf-carte pf-grille">
      ${champ("Type de structure", esc(e.tstr || "–"))}${champ("Catégorie d'entreprise", esc(e.catent || "–"))}
      ${champ("Effectif", `${esc(e.trl || "Non renseigné")}${e.aeff ? ` <span class="pf-mut">(${esc(e.aeff)})</span>` : ""}`)}
      ${champ("Employeur", esc(e.emp || "–"))}
    </div>
    <div class="pf-carte pf-grille pf-ids">
      ${champ("SIREN", `<code>${siren.replace(/(\d{3})(?=\d)/g, "$1 ")}</code>${btnCopier(siren, "le SIREN")}`)}
      ${champ("SIRET", `<code>${sirFmt(e.siret)}</code>${btnCopier(e.siret, "le SIRET")}`)}
    </div>
    <div class="pf-carte pf-adr">${icone("map-pin", 18)}<div class="pf-adr-txt"><b>Adresse</b><br>${esc(e.adr)}${e.cplt ? `<br>${esc(e.cplt)}` : ""}<br>${esc(e.cp)} ${esc(e.com)}
      <br><span class="pf-mut">Position ${esc(PRECISIONS[e.prec] || (e.lat === null ? "inconnue" : e.loc))}</span></div>
      <div class="pf-adr-btn">${btnCopier([e.adr, e.cplt, `${e.cp} ${e.com}`].filter(Boolean).join("\n"), "l'adresse")}
      ${e.m ? `<button type="button" class="pf-ico" data-pf-action="centrer" title="Centrer la carte ici" aria-label="Centrer la carte ici">${icone("crosshair", 14)}</button>` : ""}</div></div>
    ${section("activite", "Activité", `
      <div class="pf-carte">
        ${champ("Activité (APE)", `<span class="pf-ape"><code>${esc(e.naf || "–")}</code> ${esc(e.nafl || "Non renseignée")}</span>`)}
        ${champ("Catégorie", `<span class="pf-cat">${pinMini(e, 18)}${esc(cat.lib)}</span>`)}
        ${champ("Secteur", `<span class="pf-cat"><span class="pf-pt" style="background:${c}"></span>${esc(SECTIONS[e.sec] || "–")}</span>`)}
        ${e.divl ? champ("Division", esc(e.divl)) : ""}
      </div>`)}
    ${section("etabs", "Établissements sur le territoire", `
      ${etabs.some(x => x.m) && etabs.length > 1 ? `<button type="button" class="pf-large" data-pf-action="etabs">${icone("crosshair", 14)} Centrer sur ses établissements</button>` : ""}
      ${etabs.map(x => x === e ? `<div class="pf-carte pf-ligne courant">${pinMini(x, 26)}<span class="pf-l-txt"><b>${esc(x.com)} (${esc(x.cp)})</b>
          <span>${esc(x.adr)}</span><span class="pf-mut">Cet établissement · ${esc(x.trl)}</span></span>${x.siege === "Oui" ? `<span class="pf-badge">Siège</span>` : ""}</div>`
        : `<button type="button" class="pf-carte pf-ligne" data-pf-etab="${esc(x.siret)}">${pinMini(x, 26)}<span class="pf-l-txt"><b>${esc(x.com)} (${esc(x.cp)})</b>
          <span>${esc(x.nom !== e.nom ? x.nom : x.adr)}</span><span class="pf-mut">${sirFmt(x.siret)} · ${esc(x.trl)}</span></span>${x.siege === "Oui" ? `<span class="pf-badge">Siège</span>` : ""}</button>`).join("")}
      <p class="pf-mut pf-note" data-pf="france"></p>`, {n:etabs.length})}
    ${section("direct", "Dirigeants, comptes et labels", `<div data-pf="direct"><p class="pf-mut">Interrogation de l'Annuaire des entreprises…</p></div>`)}
    ${vie(e, siren)}
    ${section("docs", "Documents", `<div class="pf-docs">
      <a class="pf-doc" href="${avis}" target="_blank" rel="noopener">${icone("file-text", 18)}<span><b>Avis de situation SIRENE</b><span class="pf-mut">PDF de l'Insee, à la date du jour</span></span></a>
      ${rcs ? `<a class="pf-doc" href="https://data.inpi.fr/entreprises/${siren}" target="_blank" rel="noopener">${icone("file-text", 18)}<span><b>Registre national des entreprises</b><span class="pf-mut">Fiche INPI : statuts, actes, extrait</span></span></a>` : ""}
      <a class="pf-doc" href="https://annuaire-entreprises.data.gouv.fr/etablissement/${e.siret}" target="_blank" rel="noopener">${icone("external-link", 18)}<span><b>Annuaire des entreprises</b><span class="pf-mut">Fiche publique de l'État</span></span></a>
      <button type="button" class="pf-doc" data-pf-action="dossier">${icone("download", 18)}<span><b data-pf="dossier"></b><span class="pf-mut">Fiches PDF à imprimer ensemble</span></span></button></div>`)}
    ${similaires(e, siren)}`;

  pied.innerHTML = `<a class="pf-bas" href="#/entreprise/${siren}">${icone("file-text", 16)} Fiche entreprise complète</a>
    <a class="pf-bas" href="${avis}" target="_blank" rel="noopener">${icone("download", 16)} Avis SIRENE</a>`;
  majDossier();
  montrer();
  direct(e);
}

function majDossier(){
  const b = corps.querySelector('[data-pf="dossier"]'); if (!b || !courant) return;
  const s = courant.siret.slice(0, 9), dedans = dossier.has(s);
  b.textContent = dedans ? `Retirer du dossier PDF (${nb(dossier.size)})` : dossier.size >= MAX_ENTREPRISES ? "Dossier PDF complet" : "Ajouter au dossier PDF";
}

function vie(e, siren){
  const annonces = bodaccParSiren.get(siren) || [], mouv = journal.filter(r => r.siret === e.siret).sort((a, b) => b.date.localeCompare(a.date));
  const pot = potentielParSiret.get(e.siret);
  if (!annonces.length && !mouv.length && !pot) return "";
  return section("vie", "Vie de l'entreprise", `
    ${annonces.slice(0, 4).map(b => `<a class="pf-carte pf-evt" href="${esc(b.url)}" target="_blank" rel="noopener">
      <span class="pf-pt" style="background:${EVT[b.evt]?.c || "#999"}"></span><span><b>${esc(b.evt)}</b> · ${dateFr(b.date)}<br>
      <span class="pf-mut">Annonce au BODACC</span></span></a>`).join("")}
    ${annonces.length > 4 ? `<p class="pf-mut pf-note">et ${nb(annonces.length - 4)} autres annonces sur la fiche complète.</p>` : ""}
    ${mouv.slice(0, 3).map(r => `<div class="pf-carte pf-evt"><span class="pf-pt" style="background:#8d99ae"></span><span><b>${esc(r.evenement)}</b> · ${dateFr(r.date)}<br>
      <span class="pf-mut">${esc(r.detail || r.tranche_libelle || "Répertoire SIRENE")}</span></span></div>`).join("")}
    ${pot ? `<div class="pf-carte pf-evt"><span class="pf-pt" style="background:#2b9348"></span><span><b>${pot.fort_potentiel === true ? "Fort potentiel d'embauche estimé" : "Potentiel d'embauche estimé"}</b>${Number.isFinite(pot.indice) ? ` · indice ${nb(pot.indice)}/100` : ""}<br>
      <span class="pf-mut">La Bonne Boîte, estimation à 6 mois (pas une offre), consultée le ${dateFr(bonneBoite?.date)}</span></span></div>` : ""}`,
    {n:annonces.length + mouv.length + (pot ? 1 : 0)});
}

function similaires(e, siren){
  const l = E.filter(x => x.naf === e.naf && x.cc === e.cc && !x.siret.startsWith(siren) && x.tstr !== "Société civile immobilière (SCI)")
    .sort((a, b) => (b.emin ?? -1) - (a.emin ?? -1) || a.nom.localeCompare(b.nom, "fr"));
  if (!e.naf) return "";
  return section("similaires", "Même activité dans la commune", l.length ? `
    ${l.slice(0, 5).map(x => `<button type="button" class="pf-carte pf-ligne" data-pf-etab="${esc(x.siret)}">${pinMini(x, 26)}<span class="pf-l-txt"><b>${esc(x.nom)}</b>
      <span>${esc(x.adr)}</span><span class="pf-mut">${esc(x.trl)}</span></span></button>`).join("")}
    <button type="button" class="pf-large" data-pf-action="similaires">Voir ${l.length > 5 ? `les ${nb(l.length + 1)}` : "toute l'activité"} dans l'annuaire →</button>`
    : `<p class="pf-mut">Aucun autre établissement « ${esc(e.nafl)} » à ${esc(e.com)} dans l'annuaire.</p>
    <button type="button" class="pf-large" data-pf-action="similaires">Voir cette activité dans l'annuaire →</button>`, {n:l.length});
}

/* Compléments en direct (API Recherche d'entreprises), comme sur la fiche complète */
async function direct(e){
  const siren = e.siret.slice(0, 9), zone = corps.querySelector('[data-pf="direct"]');
  if (!zone) return;
  zone.innerHTML = `<p class="pf-mut">Interrogation de l'Annuaire des entreprises…</p>`;
  let r;
  try { r = await interroger(siren); }
  catch(err){
    if (!zone.isConnected) return;
    zone.innerHTML = `<div class="pf-carte pf-erreur"><span>Compléments indisponibles pour le moment.</span>
      <button type="button" class="pf-btn" data-pf-action="reessayer">Réessayer</button></div>`;
    return;
  }
  if (!zone.isConnected || courant !== e) return;
  if (!r){ zone.innerHTML = `<p class="pf-mut">Aucune information complémentaire publiée pour ce SIREN.</p>`; return; }
  const fr = corps.querySelector('[data-pf="france"]');
  if (fr && r.nombre_etablissements_ouverts) fr.textContent = `${nb(r.nombre_etablissements_ouverts)} établissement${r.nombre_etablissements_ouverts > 1 ? "s" : ""} ouvert${r.nombre_etablissements_ouverts > 1 ? "s" : ""} en France au total${r.siege?.libelle_commune ? `, siège à ${r.siege.libelle_commune}` : ""}.`;
  const dir = (r.dirigeants || []).filter(d => !/commissaire aux comptes/i.test(d.qualite || "")).slice(0, 6).map(d => `<li><b>${esc(d.type_dirigeant === "personne morale"
    ? d.denomination || "" : [d.prenoms, d.nom].filter(Boolean).join(" "))}</b>${d.qualite ? `<span class="pf-mut"> · ${esc(d.qualite)}</span>` : ""}</li>`);
  const fin = Object.entries(r.finances || {}).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 3);
  const c = r.complements || {}, labels = LABELS.filter(([k]) => c[k]).map(([, l]) => l);
  zone.innerHTML = `
    ${r.etat_administratif === "C" ? `<div class="pf-carte pf-erreur">Entreprise cessée${r.date_fermeture ? ` le ${dateFr(r.date_fermeture)}` : ""} d'après le répertoire SIRENE.</div>` : ""}
    <div class="pf-carte">
      ${r.date_creation ? champ("Création de l'entreprise", dateFr(r.date_creation)) : ""}
      ${champ("Dirigeants", c.collectivite_territoriale ? "Collectivité territoriale : élus non repris" : dir.length ? `<ul class="pf-ul">${dir.join("")}</ul>` : "Aucun dirigeant publié")}
    </div>
    <div class="pf-carte">${champ("Comptes publiés", fin.length ? `<table class="pf-table"><tr><th>Exercice</th><th>Chiffre d'affaires</th><th>Résultat</th></tr>
      ${fin.map(([a, v]) => `<tr><td>${esc(a)}</td><td>${euros(v.ca)}</td><td class="${v.resultat_net < 0 ? "moins-val" : ""}">${euros(v.resultat_net)}</td></tr>`).join("")}</table>`
      : "Pas de comptes publiés")}</div>
    ${labels.length ? `<div class="pf-puces">${labels.map(l => `<span>${esc(l)}</span>`).join("")}</div>` : ""}`;
}
