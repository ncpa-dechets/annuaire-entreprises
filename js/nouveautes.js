/* Onglet Quoi de neuf : ce qui s'est passé récemment, d'après le BODACC, l'annuaire et le journal SIRENE. */
import {$, esc, nb, dateFr, dateLongue, toast, E, B, EVT, journal, parSiret, estEmployeur, feuille, jour, lienEntreprise} from "./commun.js";
import {effBodacc} from "./vie.js";

const SCI = "Société civile immobilière (SCI)";
// Tranches d'effectif dans l'ordre (libellés de referentiels.py), pour dire si un effectif monte ou baisse
const TRANCHES = ["Non renseigné", "0 salarié", "1 ou 2 salariés", "3 à 5 salariés", "6 à 9 salariés", "10 à 19 salariés",
  "20 à 49 salariés", "50 à 99 salariés", "100 à 199 salariés", "200 à 249 salariés", "250 à 499 salariés", "500 à 999 salariés",
  "1 000 à 1 999 salariés", "2 000 à 4 999 salariés", "5 000 à 9 999 salariés", "10 000 salariés et plus"];
const rang = lib => Math.max(0, TRANCHES.indexOf(String(lib || "").trim()));
const employeurTranche = lib => rang(lib) >= 2;

const RUBRIQUES = [
  ["difficulte", "Entreprises en difficulté", "Ouvertures de sauvegarde ou de redressement, liquidations et plans arrêtés par le tribunal (BODACC). Ce sont souvent les entreprises à contacter en premier."],
  ["reprise", "Reprises", "Ventes de fonds de commerce : un commerce change de propriétaire, l'activité continue en général."],
  ["arrivee", "Arrivées et créations", "Créations et arrivées publiées au BODACC, établissements créés d'après le répertoire SIRENE et nouveaux établissements détectés chaque nuit."],
  ["depart", "Départs et fermetures", "Radiations du registre du commerce (BODACC) et établissements sortis du répertoire (SIRENE)."],
  ["effectif", "Effectifs qui changent", "Établissements dont la tranche d'effectif a changé dans le répertoire SIRENE. L'Insee met ces tranches à jour par lots, souvent une fois par an."]];
const COUL = {arrivee:"#2b9348", sirene:"#74c69d", depart:"#6c757d", hausse:"#2b9348", baisse:"#B91E27", employeur:"#1f5f8b"};

let fait = false, rubriques = {};

function filtres(){
  const d = new Date(); d.setDate(d.getDate() - Number($("n-periode").value));
  return {jours:Number($("n-periode").value), debut:d.toISOString().slice(0, 10), com:$("n-commune").value,
    sansSCI:$("n-sci").checked, sansPP:$("n-pp").checked};
}

// Une ligne affichée : {date, evt, c, siren, nom, com, act, eff, emp, emin, emax, detail, url, source}
const deBodacc = (b, extra = {}) => ({date:b.date, evt:b.evt, c:EVT[b.evt]?.c || "#999", siren:b.sirens[0] || "", nom:b.nom, pp:b.pp,
  com:b.com, act:b.act, eff:effBodacc(b), effTxt:b.eff || "", emp:b.emin !== null && b.emin >= 1, emin:b.emin, emax:b.emax,
  detail:"", url:b.url, source:"BODACC", ...extra});
const deEtab = (e, date, evt, c, source) => ({date, evt, c, siren:e.siret.slice(0, 9), nom:e.nom, com:e.com, act:e.nafl,
  eff:esc(e.trl), effTxt:e.trl, emp:estEmployeur(e), emin:e.emin, emax:e.emax, detail:"", url:"", source});
const deJournal = (r, evt, c) => { const e = parSiret.get(r.siret);
  return e ? deEtab(e, r.date, evt, c, "SIRENE") : {date:r.date, evt, c, siren:r.siret.slice(0, 9), nom:r.nom, com:r.commune, act:r.naf_libelle,
    eff:esc(r.tranche_libelle), effTxt:r.tranche_libelle, emp:employeurTranche(r.tranche_libelle), emin:null, emax:null, detail:"", url:"", source:"SIRENE"}; };

// Première phrase d'un jugement : « Jugement d'ouverture de liquidation judiciaire du 04/11/2026. »
const phrase = t => String(t || "").split(/\.\s/)[0].replace(/\.$/, "");
const prix = t => { const m = String(t || "").match(/prix stipulé de ([\d.]+) euros/i);
  return m ? `${Math.round(Number(m[1])).toLocaleString("fr-FR")} €` : ""; };

/* Garde une ligne par entreprise : la plus récente, sources réunies. */
function unique(lignes){
  const vus = new Map();
  lignes.sort((a, b) => b.date.localeCompare(a.date)).forEach(l => {
    const k = l.siren || `${l.nom}|${l.com}`, d = vus.get(k);
    if (!d){ vus.set(k, l); return; }
    if (!d.source.includes(l.source)) d.source += ` et ${l.source}`;
    if (!d.url && l.url) d.url = l.url;
    if (l.emp && !d.emp){ d.emp = true; d.eff = l.eff; d.effTxt = l.effTxt; d.emin = l.emin; d.emax = l.emax; }
  });
  return [...vus.values()];
}
const tri = l => l.sort((a, b) => (b.emp - a.emp) || ((b.emin ?? -1) - (a.emin ?? -1)) || b.date.localeCompare(a.date));

function calculer(f){
  const okB = b => b.date >= f.debut && (!f.com || b.com === f.com) && (!f.sansPP || !b.pp) && (!f.sansSCI || !b.sci);
  const okJ = r => r.date >= f.debut && (!f.com || r.commune === f.com) && (!f.sansSCI || r.type_structure !== SCI);
  const bod = B.filter(okB), jr = journal.filter(okJ);
  const g = k => bod.filter(b => EVT[b.evt]?.g === k);

  const difficulte = unique([...g("proc"), ...bod.filter(b => b.evt === "Plan de redressement ou de sauvegarde")]
    .map(b => deBodacc(b, {detail:esc(phrase(b.detail))})));

  const reprise = unique(g("vente").map(b => deBodacc(b, {detail:prix(b.detail) ? `Prix : <b>${prix(b.detail)}</b>` : ""})));

  const nouveaux = jr.filter(r => r.evenement === "Nouvel établissement"), sortis = jr.filter(r => r.evenement === "Établissement sorti");
  const arrivee = unique([
    ...g("crea").map(b => deBodacc(b, {evt:b.evt === "Immatriculation" ? "Arrivée (immatriculation)" : "Création"})),
    // Une date de création peut être déclarée à l'avance : elle est alors ramenée à aujourd'hui et indiquée en détail
    ...E.filter(e => e.crea && e.crea >= f.debut && (!f.com || e.com === f.com) && (!f.sansSCI || e.tstr !== SCI))
      .map(e => e.crea <= jour() ? deEtab(e, e.crea, "Établissement créé", COUL.arrivee, "SIRENE")
        : {...deEtab(e, jour(), "Création annoncée", COUL.arrivee, "SIRENE"), detail:`Date de création déclarée : ${dateFr(e.crea)}`}),
    ...nouveaux.map(r => deJournal(r, "Nouvel établissement", COUL.sirene))]);

  // Un établissement sorti dont l'entreprise vient d'en ouvrir un autre : déménagement probable
  const sirensNouveaux = new Set(nouveaux.map(r => r.siret.slice(0, 9)));
  const depart = unique([...g("rad").map(b => deBodacc(b, {detail:esc(b.detail.replace(/^[\d-]+ ; Radiation ?;? ?/, ""))})),
    ...sortis.map(r => deJournal(r, "Établissement sorti", COUL.depart))]);
  depart.forEach(l => { if (sirensNouveaux.has(l.siren)){ l.transfert = true;
    l.detail = [l.detail, "Un autre établissement de l'entreprise vient d'ouvrir : déménagement probable."].filter(Boolean).join(" "); } });

  const effectif = unique(jr.filter(r => r.evenement === "Changement d'effectif").map(r => {
    const [avant, apres] = String(r.detail || "").split(" → ");
    const sens = !employeurTranche(avant) && employeurTranche(apres) ? ["Devient employeur", COUL.employeur]
      : rang(apres) > rang(avant) ? ["Effectif en hausse", COUL.hausse] : ["Effectif en baisse", COUL.baisse];
    return {...deJournal(r, ...sens), detail:esc(r.detail || "")};
  }));

  tri(difficulte); tri(reprise); tri(arrivee); tri(effectif);
  depart.sort((a, b) => (a.transfert || 0) - (b.transfert || 0) || (b.emp - a.emp) || b.date.localeCompare(a.date));
  return {difficulte, reprise, arrivee, depart, effectif};
}

const fourchette = l => { const c = l.filter(x => x.emin !== null && x.emin !== undefined);
  const a = c.reduce((s, x) => s + x.emin, 0), b = c.reduce((s, x) => s + x.emax, 0);
  return {txt: a === b ? nb(a) : `${nb(a)} à ${nb(b)}`, connus:c.length}; };

function tableau(l){
  if (!l.length) return `<p class="note">Rien sur cette période.</p>`;
  return `<div class="cadre libre"><table class="nv"><thead><tr><th>Date</th><th>Événement</th><th>Entreprise</th><th>Commune</th>
    <th>Activité</th><th>Effectif</th><th class="no-print"></th></tr></thead><tbody>${l.map(x => `<tr>
      <td class="num">${dateFr(x.date)}</td>
      <td><span class="evt"><span class="pastille" style="background:${x.c}"></span>${esc(x.evt)}</span></td>
      <td>${lienEntreprise(x.siren, x.nom)}${x.emp ? ` <span class="badge">employeur</span>` : ""}${x.pp ? ` <span class="sansloc">(en nom propre)</span>` : ""}
        ${x.detail ? `<div class="detail">${x.detail}</div>` : ""}</td>
      <td>${esc(x.com)}</td><td class="detail">${esc(x.act)}</td><td class="num">${x.eff}</td>
      <td class="no-print">${x.url ? `<a class="lien" href="${esc(x.url)}" target="_blank" rel="noopener">Annonce</a>` : `<span class="sansloc">${esc(x.source)}</span>`}</td></tr>`).join("")}
    </tbody></table></div>`;
}

export function nouveautes(){
  if (!fait){ init(); fait = true; }
  dessiner();
}

function dessiner(){
  const f = filtres(), r = calculer(f);
  rubriques = r;
  const procs = r.difficulte.filter(x => EVT[x.evt]?.g === "proc"), s = fourchette(procs);
  const empA = r.arrivee.filter(x => x.emp).length, empD = r.depart.filter(x => x.emp).length;
  const debutJournal = journal.length ? journal.reduce((m, x) => x.date < m ? x.date : m, journal[0].date) : null;
  $("n-chiffres").innerHTML = `
    <div><b>${nb(r.arrivee.length)}</b><span>arrivées et créations${empA ? `<br>dont ${nb(empA)} employeur${empA > 1 ? "s" : ""}` : ""}</span></div>
    <div><b>${nb(procs.length)}</b><span>${procs.length > 1 ? "entreprises" : "entreprise"} en procédure collective${s.connus ? `<br>${s.txt} salariés concernés (effectif connu pour ${nb(s.connus)})` : ""}</span></div>
    <div><b>${nb(r.reprise.length)}</b><span>ventes de fonds</span></div>
    <div><b>${nb(r.depart.length)}</b><span>départs et fermetures${empD ? `<br>dont ${nb(empD)} employeur${empD > 1 ? "s" : ""}` : ""}</span></div>
    ${r.effectif.length ? `<div><b>${nb(r.effectif.length)}</b><span>effectifs qui changent</span></div>` : ""}`;
  $("n-sous").textContent = `${f.jours} derniers jours, au ${dateLongue(jour())}${f.com ? `, à ${f.com}` : ", sur les 38 communes"}${f.sansSCI ? ", hors SCI" : ""}${f.sansPP ? ", hors commerçants en nom propre" : ""}.`;
  $("n-note").innerHTML = debutJournal && debutJournal > f.debut
    ? `Les mouvements quotidiens du répertoire SIRENE sont suivis depuis le ${dateLongue(debutJournal)} : avant cette date, seules les annonces du BODACC et les dates de création SIRENE sont prises en compte.` : "";
  $("n-contenu").innerHTML = RUBRIQUES.filter(([k]) => k !== "effectif" || r.effectif.length || journal.some(x => x.evenement === "Changement d'effectif"))
    .map(([k, titre, aide]) => `<div class="bloc"><h3>${titre} <span class="compte">${nb(r[k].length)}</span></h3>
      <p class="note petit">${aide}</p>${tableau(r[k])}</div>`).join("");
}

/* Résumé en texte brut, à coller dans un courriel. */
function resume(){
  const f = filtres(), lignes = [`Quoi de neuf sur le territoire${f.com ? ` (${f.com})` : ""} : ${f.jours} derniers jours, au ${dateLongue(jour())}`, ""];
  RUBRIQUES.forEach(([k, titre]) => {
    const l = rubriques[k] || []; if (!l.length) return;
    lignes.push(`${titre} (${l.length})`);
    l.slice(0, 10).forEach(x => lignes.push(`- ${dateFr(x.date)} · ${x.evt} · ${x.nom} (${x.com})${x.act ? ` · ${x.act}` : ""}${x.emp ? ` · ${x.effTxt}` : ""}`));
    if (l.length > 10) lignes.push(`- … et ${l.length - 10} autres`);
    lignes.push("");
  });
  lignes.push(`Détail : ${location.href.split("#")[0]}#/nouveautes`);
  return lignes.join("\n");
}

function copier(){
  const t = resume();
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast("Résumé copié : collez-le dans un courriel"),
    () => { const z = document.createElement("textarea"); z.value = t; document.body.appendChild(z); z.select();
      try { document.execCommand("copy"); toast("Résumé copié"); } catch(e){ toast("Copie impossible"); } z.remove(); });
}

function exporter(){
  const wb = XLSX.utils.book_new(), cols = [["date", "Date"], ["evt", "Événement"], ["nom", "Entreprise"], ["siren", "SIREN"], ["com", "Commune"],
    ["act", "Activité"], ["effTxt", "Effectif (tranche Insee)"], ["empTxt", "Employeur"], ["detailTxt", "Détail"], ["source", "Source"], ["url", "Annonce"]];
  let n = 0;
  RUBRIQUES.forEach(([k, titre]) => { const l = rubriques[k] || []; n += l.length;
    XLSX.utils.book_append_sheet(wb, feuille(l.map(x => ({...x, empTxt:x.emp ? "Oui" : "Non",
      detailTxt:String(x.detail || "").replace(/<[^>]+>/g, "")})), cols), titre.slice(0, 31)); });
  if (!n){ toast("Rien à exporter sur cette période"); return; }
  XLSX.writeFile(wb, `quoi_de_neuf_ncpa_${jour()}.xlsx`);
}

function init(){
  [...new Set([...E.map(e => e.com), ...B.map(b => b.com)].filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"))
    .forEach(c => $("n-commune").insertAdjacentHTML("beforeend", `<option>${esc(c)}</option>`));
  ["n-periode", "n-commune", "n-sci", "n-pp"].forEach(id => $(id).addEventListener("change", dessiner));
  $("n-copier").onclick = copier;
  $("n-export").onclick = exporter;
}
