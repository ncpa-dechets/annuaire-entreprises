/* Fiche entreprise (adresse #/entreprise/<siren>) et recherche d'entreprise dans l'en-tête. */
import {$, esc, norm, nb, dateFr, dateLongue, sirFmt, debounce, E, EVT, COULEURS, PRECISIONS, estApprox, journal, communesGJ,
  etabsParSiren, bodaccParSiren, potentielParSiret, bonneBoite, principal, lienEntreprise, entreprises, fondPlanIGN, jour} from "./commun.js";
import {compter, aActivites} from "./stats.js";
import {effBodacc} from "./vie.js";

const API = "https://recherche-entreprises.api.gouv.fr/search";
const LABELS = [["est_rge", "RGE (rénovation énergétique)"], ["est_ess", "Économie sociale et solidaire"], ["est_qualiopi", "Qualiopi (formation)"],
  ["est_organisme_formation", "Organisme de formation"], ["est_bio", "Agriculture biologique"], ["est_siae", "Insertion par l'activité économique"],
  ["est_societe_mission", "Société à mission"], ["est_patrimoine_vivant", "Entreprise du patrimoine vivant"],
  ["est_entrepreneur_spectacle", "Entrepreneur de spectacles"], ["est_finess", "Établissement sanitaire ou social (FINESS)"]];
const TRANCHES = {NN:"Non renseigné", "00":"0 salarié", "01":"1 ou 2 salariés", "02":"3 à 5 salariés", "03":"6 à 9 salariés",
  "11":"10 à 19 salariés", "12":"20 à 49 salariés", "21":"50 à 99 salariés", "22":"100 à 199 salariés", "31":"200 à 249 salariés",
  "32":"250 à 499 salariés", "41":"500 à 999 salariés", "42":"1 000 à 1 999 salariés", "51":"2 000 à 4 999 salariés",
  "52":"5 000 à 9 999 salariés", "53":"10 000 salariés et plus"};
const cache = new Map();   // SIREN -> promesse de la réponse de l'API (une seule requête par session)
let carte = null;

const euros = v => v == null || isNaN(v) ? "–" : Math.abs(v) >= 1e6 ? `${(v / 1e6).toLocaleString("fr-FR", {maximumFractionDigits:1})} M€`
  : Math.abs(v) >= 1e3 ? `${Math.round(v / 1e3).toLocaleString("fr-FR")} k€` : `${nb(Math.round(v))} €`;
const phrase = t => String(t || "").split(/\.\s/)[0].replace(/\.$/, "");

/* =========================================================================
   Fiche
   ========================================================================= */
export function ficheEntreprise(param){
  const siren = String(param || "").replace(/\D/g, "").slice(0, 9), h = $("en-contenu");
  if (carte){ try { carte.remove(); } catch(e){} carte = null; }
  const etabs = [...(etabsParSiren.get(siren) || [])].sort((a, b) => (b.siege === "Oui") - (a.siege === "Oui") || (b.emin ?? -1) - (a.emin ?? -1));
  const annonces = bodaccParSiren.get(siren) || [];
  h.closest(".page").scrollTop = 0;
  if (!etabs.length && !annonces.length){
    h.innerHTML = `<div class="tete-page"><div><h2>Entreprise introuvable</h2>
      <p class="note">${siren.length === 9 ? `Le SIREN ${sirFmt(siren)} n'a ni établissement actif sur le territoire, ni annonce au BODACC depuis deux ans.`
        : "L'adresse ne contient pas de numéro SIREN."} Utilisez la recherche en haut de la page.</p>
      ${siren.length === 9 ? `<p><a class="lien" href="https://annuaire-entreprises.data.gouv.fr/entreprise/${siren}" target="_blank" rel="noopener">Chercher sur l'Annuaire des entreprises →</a></p>` : ""}</div></div>`;
    return;
  }
  const p = etabs.length ? principal(etabs) : null, b0 = annonces[0];
  const nom = p?.nom || b0.nom, rs = p?.rs && p.rs !== nom ? p.rs : "";
  const connus = etabs.filter(e => e.emin !== null), effMin = connus.reduce((s, e) => s + e.emin, 0), effMax = connus.reduce((s, e) => s + e.emax, 0);
  const annee = [...new Set(connus.map(e => e.aeff).filter(Boolean))].sort().at(-1);
  const crea = etabs.map(e => e.crea).filter(Boolean).sort()[0];
  const k = (id, v, lib) => `<div><b${id ? ` id="${id}"` : ""}>${v}</b><span>${lib}</span></div>`;
  const mouvements = journal.filter(r => r.siret.startsWith(siren)).sort((a, b) => b.date.localeCompare(a.date));
  const places = etabs.some(e => e.lat !== null && e.lon !== null);

  h.innerHTML = `
    <div class="tete-page"><div><a class="lien no-print" data-retour>← Retour</a>
      <h2>${esc(nom)}</h2>${rs ? `<p class="note" style="margin:0">${esc(rs)}</p>` : ""}
      <p class="note">${[p?.nafl ? `${esc(p.nafl)} <span class="sansloc">(${esc(p.naf)})</span>` : esc(b0?.act || ""), `SIREN ${sirFmt(siren)}`,
        esc(p?.tstr || b0?.forme || ""), p?.catent ? esc(p.catent) : ""].filter(Boolean).join(" · ")}</p>
      <div id="en-etat"></div></div>
      <div class="no-print"><a class="btn" href="https://annuaire-entreprises.data.gouv.fr/entreprise/${siren}" target="_blank" rel="noopener">Annuaire des entreprises</a>
        <button class="btn" data-imprimer>Imprimer ou enregistrer en PDF</button></div></div>
    <div class="gros">
      ${k("", nb(etabs.length), `établissement${etabs.length > 1 ? "s" : ""} sur le territoire<br><span id="en-france">${etabs.length ? "" : "connue par le BODACC"}</span>`)}
      ${connus.length ? k("", effMin === effMax ? nb(effMin) : `${nb(effMin)} à ${nb(effMax)}`, `salariés sur le territoire<br>(tranches Insee${annee ? `, ${esc(annee)}` : ""})`) : ""}
      ${k("en-crea", crea ? dateFr(crea) : "–", `<span id="en-crea-lib">${crea ? "plus ancien établissement local" : "date de création"}</span>`)}
      ${p ? k("", p.siege === "Oui" ? "Siège" : "Établissement", p.siege === "Oui" ? `sur le territoire, à ${esc(p.com)}` : `<span id="en-siege">siège hors du territoire</span>`) : ""}
      ${b0 ? k("", dateFr(b0.date), `dernière annonce au BODACC<br>${esc(b0.evt)}`) : ""}
    </div>
    ${!etabs.length ? "" : places ? `<div class="deux">
      <div class="bloc"><h3>Établissements sur le territoire</h3>${tableEtabs(etabs)}</div>
      <div class="bloc"><h3>Localisation</h3><div id="en-carte" role="img" aria-label="Carte des établissements"></div>
        <p class="note petit" id="en-carte-note"></p></div></div>`
      : `<div class="bloc"><h3>Établissements sur le territoire</h3>${tableEtabs(etabs)}
        <p class="note petit">Aucun établissement n'a de position sur la carte : l'adresse n'a pas pu être localisée de façon fiable.</p></div>`}
    <div class="bloc"><h3>Dirigeants, comptes et labels</h3><div id="en-direct"><p class="note">Interrogation de l'Annuaire des entreprises…</p></div></div>
    ${potentiel(etabs)}
    <div class="bloc"><h3>Annonces légales (BODACC, deux ans)</h3>${tableBodacc(annonces)}</div>
    ${mouvements.length ? `<div class="bloc"><h3>Mouvements dans le répertoire SIRENE</h3>${tableJournal(mouvements)}</div>` : ""}
    ${p ? contexte(p, siren) : ""}
    <div class="notes-visite"><h3>Notes de visite</h3><div class="lignes"></div></div>
    <p class="source pied">Fiche éditée le ${dateLongue(jour())}. Sources : Insee, répertoire SIRENE (établissements actifs du territoire) ; BODACC ;
      Annuaire des entreprises (dirigeants, comptes et labels, consultés à l'ouverture de la fiche). Les effectifs sont des tranches déclarées à l'Insee.</p>`;
  if (places) initCarte(etabs);
  complements(siren);
}

function tableEtabs(etabs){
  return `<div class="cadre libre"><table><thead><tr><th>Adresse</th><th>Activité</th><th>Effectif</th><th>Créé</th></tr></thead><tbody>
    ${etabs.map(e => `<tr><td><b>${esc(e.com)}</b>${e.siege === "Oui" ? ` <span class="badge">siège</span>` : ""}<br>${esc(e.adr)}${e.cplt ? `<br><span class="sansloc" style="margin:0">${esc(e.cplt)}</span>` : ""}
      <div class="no-print">${e.lat !== null ? `<a class="lien" data-voir="${esc(e.siret)}">Voir sur la carte de l'annuaire</a>` : `<span class="sansloc" style="margin:0">sans position</span>`}</div></td>
      <td>${esc(e.nafl)}${e.nom !== principal(etabs).nom ? `<br><span class="sansloc" style="margin:0">${esc(e.nom)}</span>` : ""}</td>
      <td class="num">${esc(e.trl)}${e.aeff ? `<br><span class="sansloc" style="margin:0">${esc(e.aeff)}</span>` : ""}</td><td class="num">${dateFr(e.crea)}</td></tr>`).join("")}
    </tbody></table></div>`;
}

function tableBodacc(l){
  if (!l.length) return `<p class="note">Aucune annonce depuis deux ans.</p>`;
  return `<div class="cadre libre"><table><thead><tr><th>Date</th><th>Événement</th><th>Détail</th><th>Effectif</th><th class="no-print"></th></tr></thead><tbody>
    ${l.map(b => `<tr><td class="num">${dateFr(b.date)}</td><td><span class="evt"><span class="pastille" style="background:${EVT[b.evt]?.c || "#999"}"></span>${esc(b.evt)}</span></td>
      <td class="detail">${esc(phrase(b.detail))}</td><td class="num">${effBodacc(b)}</td>
      <td class="no-print"><a class="lien" href="${esc(b.url)}" target="_blank" rel="noopener">Annonce</a></td></tr>`).join("")}
    </tbody></table></div>`;
}

function tableJournal(l){
  return `<div class="cadre libre"><table><thead><tr><th>Date</th><th>Mouvement</th><th>Établissement</th><th>Détail</th></tr></thead><tbody>
    ${l.map(r => `<tr><td class="num">${dateFr(r.date)}</td><td>${esc(r.evenement)}</td><td>${esc(r.commune)} <span class="sansloc">(${sirFmt(r.siret)})</span></td>
      <td>${esc(r.detail || r.tranche_libelle)}</td></tr>`).join("")}</tbody></table></div>`;
}

function potentiel(etabs){
  const l = etabs.map(e => [e, potentielParSiret.get(e.siret)]).filter(([, x]) => x);
  if (!l.length) return "";
  return `<div class="bloc"><h3>Potentiel d'embauche (La Bonne Boîte)</h3>
    <p class="note petit">Estimation de France Travail à six mois, pas une offre d'emploi. Consultée le ${dateFr(bonneBoite.date)}.</p>
    <ul class="etapes">${l.map(([e, x]) => `<li>${esc(e.com)} : ${x.fort_potentiel === true ? "<b>fort potentiel estimé</b>" : "potentiel estimé"}${Number.isFinite(x.indice) ? `, indice ${nb(x.indice)}/100` : ""}</li>`).join("")}</ul></div>`;
}

function contexte(p, siren){
  const autres = E.filter(e => e.naf === p.naf && e.cc === p.cc && !e.siret.startsWith(siren)).sort((a, b) => (b.emin ?? -1) - (a.emin ?? -1));
  const ter = aActivites() ? compter("", [p.naf]) : null, com = aActivites() ? compter(p.cc, [p.naf]) : null;
  const n = ter ? ter.n : E.filter(e => e.naf === p.naf).length, propres = etabsParSiren.get(siren).filter(e => e.naf === p.naf).length;
  return `<div class="bloc"><h3>Même activité sur le territoire</h3>
    <p class="note">${esc(p.nafl)} :
      ${n <= propres ? `aucun autre établissement de cette activité sur le territoire${ter ? " (entrepreneurs individuels compris)" : ""}.`
        : ter ? `${nb(ter.n)} établissements actifs sur le territoire, dont ${nb(com.n)} à ${esc(p.com)} (entrepreneurs individuels compris).`
        : `${nb(n)} établissements dans l'annuaire du territoire.`}
      <a class="lien no-print" data-annuaire-nafs="${esc(p.naf)}" data-annuaire-libelle="${esc(p.nafl)}">Les voir dans l'annuaire →</a></p>
    ${autres.length ? `<p class="note petit" style="margin-bottom:4px">Autres établissements de cette activité à ${esc(p.com)} :</p>
      <div class="puces">${autres.slice(0, 12).map(e => `<span>${lienEntreprise(e.siret.slice(0, 9), e.nom)}${e.emin >= 1 ? ` <span class="sansloc">${esc(e.trl)}</span>` : ""}</span>`).join("")}
      ${autres.length > 12 ? `<span>et ${nb(autres.length - 12)} autres</span>` : ""}</div>` : ""}</div>`;
}

function initCarte(etabs){
  const pts = etabs.filter(e => e.lat !== null && e.lon !== null);
  $("en-carte-note").textContent = pts.length < etabs.length ? `${nb(etabs.length - pts.length)} établissement(s) sans position.` : "";
  if (!pts.length){ $("en-carte").hidden = true; return; }
  carte = L.map("en-carte", {scrollWheelZoom:false, attributionControl:true});
  // Cadrer avant d'ajouter les couches vectorielles : Leaflet ne sait pas les dessiner sans vue
  carte.fitBounds(L.latLngBounds(pts.map(e => [e.lat, e.lon])).pad(.3), {maxZoom:15});
  fondPlanIGN().addTo(carte);
  L.geoJSON(communesGJ, {style:{color:"#6f6f6f", weight:1, opacity:.7, dashArray:"4 3", fill:false}, interactive:false}).addTo(carte);
  pts.forEach(e => { const c = COULEURS[e.sec] || "#999";
    L.circleMarker([e.lat, e.lon], estApprox(e) ? {radius:8, color:c, weight:2, fillColor:c, fillOpacity:.15} : {radius:8, color:"#fff", weight:1.5, fillColor:c, fillOpacity:.9})
      .bindTooltip(`<b>${esc(e.com)}</b><br>${esc(e.adr)}<br><span style="color:#666">Position ${esc(PRECISIONS[e.prec] || e.loc)}</span>`).addTo(carte); });
}

/* =========================================================================
   Compléments en direct : API Recherche d'entreprises (sans clé)
   ========================================================================= */
function interroger(siren){
  if (!cache.has(siren)){
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
    cache.set(siren, fetch(`${API}?q=${siren}&per_page=1`, {signal:ctl.signal})
      .then(r => r.ok ? r.json() : Promise.reject(new Error(r.status)))
      .then(j => (j.results || []).find(x => x.siren === siren) || null)
      .finally(() => clearTimeout(t))
      .catch(err => { cache.delete(siren); throw err; }));
  }
  return cache.get(siren);
}

async function complements(siren){
  const zone = () => $("en-direct");
  let r;
  try { r = await interroger(siren); }
  catch(e){
    if (!zone() || !location.hash.includes(siren)) return;
    zone().innerHTML = `<p class="note">Compléments indisponibles : l'Annuaire des entreprises ne répond pas pour le moment. Le reste de la fiche est à jour.
      <button type="button" class="btn no-print">Réessayer</button></p>`;
    zone().querySelector("button").onclick = () => { zone().innerHTML = `<p class="note">Interrogation de l'Annuaire des entreprises…</p>`; complements(siren); };
    return;
  }
  if (!zone() || !location.hash.includes(siren)) return;   // l'utilisateur a changé de fiche entre-temps
  if (!r){ zone().innerHTML = `<p class="note">Aucune information complémentaire publiée pour ce SIREN.</p>`; return; }

  // Chiffres clés de l'en-tête, complétés
  if (r.nombre_etablissements_ouverts && $("en-france")) $("en-france").textContent = `sur ${nb(r.nombre_etablissements_ouverts)} ouvert${r.nombre_etablissements_ouverts > 1 ? "s" : ""} en France`;
  if (r.date_creation && $("en-crea")){ $("en-crea").textContent = dateFr(r.date_creation); $("en-crea-lib").textContent = "création de l'entreprise"; }
  if (r.siege?.libelle_commune && $("en-siege")) $("en-siege").textContent = `siège à ${r.siege.libelle_commune}`;
  if (r.etat_administratif === "C" && $("en-etat"))
    $("en-etat").innerHTML = `<div class="bandeau">Entreprise cessée${r.date_fermeture ? ` le ${dateFr(r.date_fermeture)}` : ""} d'après le répertoire SIRENE.</div>`;

  const an = new Date().getFullYear();
  // Les commissaires aux comptes ne dirigent pas : cités à part
  const cac = (r.dirigeants || []).filter(d => /commissaire aux comptes/i.test(d.qualite || ""));
  const dir = (r.dirigeants || []).filter(d => !cac.includes(d)).map(d => d.type_dirigeant === "personne morale"
    ? `<li><b>${esc(d.denomination || "")}</b>${d.qualite ? ` · ${esc(d.qualite)}` : ""}</li>`
    : `<li><b>${esc([d.prenoms, d.nom].filter(Boolean).join(" "))}</b>${d.qualite ? ` · ${esc(d.qualite)}` : ""}${d.annee_de_naissance
      ? ` <span class="sansloc">né·e en ${esc(String(d.annee_de_naissance).slice(0, 4))}, ${an - +String(d.annee_de_naissance).slice(0, 4)} ans environ</span>` : ""}</li>`);
  const fin = Object.entries(r.finances || {}).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 4);
  const c = r.complements || {};
  const labels = LABELS.filter(([k]) => c[k]).map(([, l]) => l);
  if (c.liste_idcc?.length) labels.push(`Convention collective : IDCC ${c.liste_idcc.join(", ")}`);
  const effEnt = r.tranche_effectif_salarie && TRANCHES[r.tranche_effectif_salarie];

  zone().innerHTML = `<div class="trois">
    <div><h4 class="sous">Dirigeants</h4>${c.collectivite_territoriale ? `<p class="note">Collectivité territoriale : les élus ne sont pas repris ici.</p>`
      : dir.length ? `<ul class="etapes">${dir.join("")}</ul>` : `<p class="note">Aucun dirigeant publié.</p>`}
      ${cac.length ? `<p class="note petit">Commissaire${cac.length > 1 ? "s" : ""} aux comptes : ${cac.map(d => esc(d.denomination || [d.prenoms, d.nom].filter(Boolean).join(" "))).join(", ")}.</p>` : ""}</div>
    <div><h4 class="sous">Comptes publiés</h4>${fin.length ? `<table><thead><tr><th>Exercice</th><th class="d">Chiffre d'affaires</th><th class="d">Résultat net</th></tr></thead><tbody>
      ${fin.map(([a, v]) => `<tr><td>${esc(a)}</td><td class="d num">${euros(v.ca)}</td><td class="d num ${v.resultat_net < 0 ? "moins-val" : ""}">${euros(v.resultat_net)}</td></tr>`).join("")}</tbody></table>`
      : `<p class="note">Pas de comptes publiés (petite entreprise, comptes confidentiels ou structure non soumise au dépôt).</p>`}
      ${effEnt ? `<p class="note petit">Effectif de toute l'entreprise : ${esc(effEnt)}${r.annee_tranche_effectif_salarie ? ` (${esc(r.annee_tranche_effectif_salarie)})` : ""}${r.categorie_entreprise ? ` · ${esc(r.categorie_entreprise)}` : ""}.</p>` : ""}</div>
    <div><h4 class="sous">Labels et qualités</h4>${labels.length ? `<div class="puces">${labels.map(l => `<span>${esc(l)}</span>`).join("")}</div>` : `<p class="note">Aucun label recensé.</p>`}</div>
  </div>`;
}

/* =========================================================================
   Recherche dans l'en-tête
   ========================================================================= */
export function initRecherche(){
  const champ = $("r-texte"), liste = $("r-liste");
  let props = [], actif = -1;
  const fermer = () => { liste.hidden = true; champ.setAttribute("aria-expanded", "false"); actif = -1; };
  const aller = siren => { location.hash = `#/entreprise/${siren}`; champ.value = ""; fermer(); champ.blur(); };
  const marquer = () => liste.querySelectorAll("li[data-siren]").forEach((li, i) => {
    li.setAttribute("aria-selected", String(i === actif)); if (i === actif) li.scrollIntoView({block:"nearest"}); });
  const chercher = () => {
    const q = champ.value.trim(), chiffres = q.replace(/\s/g, "");
    if (q.length < 2){ fermer(); return; }
    const idx = entreprises();
    if (/^\d{3,14}$/.test(chiffres)) props = idx.filter(x => x.siren.startsWith(chiffres.slice(0, 9)));
    else { const mots = norm(q).split(/\s+/).filter(Boolean), debut = norm(q);
      props = idx.filter(x => mots.every(m => x.q.includes(m)))
        .sort((a, b) => (norm(b.nom).startsWith(debut) - norm(a.nom).startsWith(debut)) || (!!a.bodacc - !!b.bodacc) || (b.emin - a.emin) || (b.n - a.n)); }
    const total = props.length; props = props.slice(0, 8); actif = -1;
    liste.innerHTML = props.length ? props.map(x => `<li role="option" data-siren="${x.siren}" aria-selected="false"><b>${esc(x.nom)}</b>
        <span>${esc(x.com)}${x.act ? ` · ${esc(x.act)}` : ""}${x.bodacc ? " · BODACC seulement" : x.n > 1 ? ` · ${nb(x.n)} établissements` : ""}</span></li>`).join("")
        + (total > 8 ? `<li class="plus">${nb(total - 8)} autres résultats : précisez la recherche</li>` : "")
      : `<li class="plus">Aucune entreprise trouvée</li>`;
    liste.hidden = false; champ.setAttribute("aria-expanded", "true");
  };
  champ.addEventListener("input", debounce(chercher, 120));
  champ.addEventListener("focus", () => { if (champ.value.trim().length >= 2) chercher(); });
  champ.addEventListener("keydown", ev => {
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp"){ if (liste.hidden) chercher(); ev.preventDefault();
      if (props.length){ actif = (actif + (ev.key === "ArrowDown" ? 1 : -1) + props.length) % props.length; marquer(); } }
    else if (ev.key === "Enter"){ ev.preventDefault();
      const chiffres = champ.value.replace(/\s/g, "");
      if (actif >= 0) aller(props[actif].siren);
      else if (/^\d{9}$|^\d{14}$/.test(chiffres)) aller(chiffres.slice(0, 9));
      else { chercher(); if (props.length) aller(props[0].siren); } }
    else if (ev.key === "Escape"){ fermer(); }
  });
  liste.addEventListener("mousedown", ev => { const li = ev.target.closest("li[data-siren]"); if (li){ ev.preventDefault(); aller(li.dataset.siren); } });
  champ.addEventListener("blur", () => setTimeout(fermer, 100));
}
