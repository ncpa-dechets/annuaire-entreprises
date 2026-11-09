/* Onglet Vie des entreprises : annonces BODACC et mouvements de l'annuaire. */
import {$, esc, norm, nb, dateFr, toast, debounce, SECTIONS, E, parSiret, journal, B, EVTS, EVT, etabParSiren,
  feuille, jour} from "./commun.js";

let evtsCoches = new Set(EVTS.filter(x => x[3]).map(x => x[0]));

/* =========================================================================
   Mouvements de l'annuaire (journal SIRENE), dans l'onglet Vie des entreprises
   ========================================================================= */
function mouvementsSirene(f){
  mouvementsSirene.donnees = {ent:[], sor:[]};
  if (!journal.length){
    $("s-chiffres").innerHTML = "";
    $("s-contenu").innerHTML = `<p class="note">Le suivi démarre après la deuxième collecte nocturne : il compare chaque jour
      l'annuaire à celui de la veille.</p>`;
    return;
  }
  const sec = $("s-secteur").value;
  const j = journal.filter(r => r.date >= f.debut && (!f.fin || r.date < f.fin) && (!f.com || r.commune === f.com)
    && (!sec || r.section === sec) && (!f.sansSCI || r.type_structure !== "Société civile immobilière (SCI)")
    && f.mots.every(m => norm([r.nom, r.naf_libelle, r.siret].join(" ")).includes(m)));
  const ent = j.filter(r => r.evenement === "Nouvel établissement").sort((a,b) => b.date.localeCompare(a.date));
  const sor = j.filter(r => r.evenement === "Établissement sorti").sort((a,b) => b.date.localeCompare(a.date));
  mouvementsSirene.donnees = {ent, sor};
  $("s-chiffres").innerHTML = `<div><b>${nb(ent.length)}</b><span>nouveaux établissements</span></div>
    <div><b>${nb(sor.length)}</b><span>établissements sortis</span></div>`;
  const tab = (rows, lien) => rows.length ? `<div class="cadre"><table><thead><tr><th>Date</th><th>Nom</th><th>Commune</th><th>Activité</th><th>Effectif</th></tr></thead><tbody>` +
    rows.map(r => `<tr><td class="num">${dateFr(r.date)}</td><td>${lien && parSiret.has(r.siret) ? `<a class="lien" data-voir="${esc(r.siret)}">${esc(r.nom)}</a>` : esc(r.nom)}</td>
      <td>${esc(r.commune)}</td><td>${esc(r.naf_libelle)}</td><td class="num">${esc(r.tranche_libelle)}</td></tr>`).join("") + `</tbody></table></div>`
    : `<p class="note">Aucun mouvement sur cette période.</p>`;
  $("s-contenu").innerHTML = `<div class="deux"><div><h4 class="sous">Nouveaux établissements</h4>${tab(ent, true)}</div>
    <div><h4 class="sous">Établissements sortis</h4>${tab(sor, false)}</div></div>`;
}

const MOISC = ["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
const MOISL = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
const moisLong = m => `${MOISL[+m.slice(5) - 1]} ${m.slice(0, 4)}`;
let moisChoisi = null;   // « 2026-10 » quand un mois a été cliqué sur le graphique

function filtresBodacc(){
  let debut, fin = "";
  if (moisChoisi){
    const [a, m] = moisChoisi.split("-").map(Number);
    debut = `${moisChoisi}-01`; fin = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
  } else {
    const d = new Date(); d.setDate(d.getDate() - Number($("b-periode").value)); debut = d.toISOString().slice(0,10);
  }
  return {debut, fin, com:$("b-commune").value, mots:norm($("b-texte").value).split(/\s+/).filter(Boolean),
    sansPP:$("b-pp").checked, sansSCI:$("b-sci").checked};
}
const passeBodacc = (b, f, avecPeriode = true) => (!avecPeriode || (b.date >= f.debut && (!f.fin || b.date < f.fin)))
  && (!f.com || b.com === f.com) && (!f.sansPP || !b.pp) && (!f.sansSCI || !b.sci) && f.mots.every(m => b.q.includes(m));
function choisirMois(m){
  moisChoisi = moisChoisi === m ? null : m;
  vieEntreprises();
}
// Effectif : « 3 à 5 salariés » + année et origine (établissements locaux, ou entreprise entière si hors annuaire)
const effBodacc = b => !b.srcEff ? `<span style="color:var(--mut)">${esc(b.eff || "Non renseigné")}</span>`
  : `${esc(b.eff)}<br><span class="sansloc" style="margin:0">${b.srcEff.startsWith("Entreprise") ? "toute l'entreprise" : "sur le territoire"}${b.aeff ? ", " + esc(b.aeff) : ""}</span>`;

export function vieEntreprises(){
  const f = filtresBodacc();
  $("b-mois").innerHTML = moisChoisi ? `<div class="bandeau">Seul le mois de <b>${moisLong(moisChoisi)}</b> est affiché, dans les deux parties.
    <button type="button" class="btn" data-a="periode">Revenir à la période choisie</button></div>` : "";
  mouvementsSirene(f);
  if (!B.length){
    $("b-contenu").innerHTML = `<p class="note">Les annonces du BODACC seront disponibles après la prochaine collecte nocturne.</p>`;
    return;
  }
  const periode = B.filter(b => passeBodacc(b, f));
  const lignes = periode.filter(b => evtsCoches.has(b.evt));
  vieEntreprises.lignes = lignes;

  // Cases d'événement, avec le nombre d'annonces de la période (tous événements confondus)
  const cpt = {}; periode.forEach(b => cpt[b.evt] = (cpt[b.evt] || 0) + 1);
  $("b-evts").innerHTML = EVTS.map(([n,c]) => `<label class="${evtsCoches.has(n) ? "" : "off"}"><input type="checkbox" value="${esc(n)}"${evtsCoches.has(n) ? " checked" : ""}>
    <span class="pastille" style="background:${c}"></span>${esc(n)} <span class="n">${nb(cpt[n] || 0)}</span></label>`).join("");

  const g = k => periode.filter(b => EVT[b.evt]?.g === k).length;
  // Salariés des entreprises en procédure : une seule fois par entreprise (une procédure donne plusieurs annonces)
  const procs = new Map(); periode.filter(b => EVT[b.evt]?.g === "proc").forEach(b => procs.set(b.sirens[0] || b.id, b));
  const connus = [...procs.values()].filter(b => b.emin !== null);
  const sMin = connus.reduce((s, b) => s + b.emin, 0), sMax = connus.reduce((s, b) => s + b.emax, 0);
  $("b-chiffres").innerHTML = `<div><b>${nb(g("crea"))}</b><span>créations et immatriculations</span></div>
    <div><b>${nb(g("rad"))}</b><span>radiations</span></div>
    <div><b>${nb(g("proc"))}</b><span>procédures ouvertes (sauvegarde, redressement, liquidation)</span></div>
    <div><b>${sMin === sMax ? nb(sMin) : `${nb(sMin)} à ${nb(sMax)}`}</b><span>salariés concernés par ces procédures<br>(effectif connu pour ${nb(connus.length)} entreprises sur ${nb(procs.size)})</span></div>
    <div><b>${nb(g("vente"))}</b><span>ventes de fonds</span></div>`;

  grapheBodacc(f);

  const nomLien = b => { const e = b.sirens.map(s => etabParSiren.get(s)).find(Boolean);
    return e ? `<a class="lien" data-voir="${esc(e.siret)}" title="Voir sur la carte">${esc(b.nom)}</a>` : esc(b.nom); };
  $("b-contenu").innerHTML = lignes.length ? `<div class="cadre" style="max-height:600px"><table><thead><tr><th>Date</th><th>Événement</th><th>Nom</th>
    <th>Commune</th><th>Effectif</th><th>Activité</th><th>Détail</th><th></th></tr></thead><tbody>` + lignes.map(b => `<tr>
      <td class="num">${dateFr(b.date)}</td>
      <td><span class="evt"><span class="pastille" style="background:${EVT[b.evt]?.c || "#999"}"></span>${esc(b.evt)}</span></td>
      <td>${nomLien(b)}${b.pp ? ` <span class="sansloc">(en nom propre)</span>` : ""}${b.type && b.type !== "Avis initial" ? ` <span class="sansloc">(${esc(b.type.toLowerCase())})</span>` : ""}</td>
      <td>${esc(b.com)}</td><td class="num">${effBodacc(b)}</td><td>${esc(b.act)}</td><td class="detail">${esc(b.detail)}</td>
      <td><a class="lien" href="${esc(b.url)}" target="_blank" rel="noopener">Annonce</a></td></tr>`).join("") + `</tbody></table></div>`
    : `<p class="note">Aucune annonce ne correspond à ces critères.</p>`;
}

function grapheBodacc(f){
  // 12 derniers mois complets + mois en cours ; filtres commune, recherche et nom propre (pas la période)
  const mois = [], d = new Date(); d.setDate(1);
  for (let i = 11; i >= 0; i--){ const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    mois.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`); }
  const series = [["crea", "Créations", "#2b9348"], ["rad", "Radiations", "#6c757d"], ["proc", "Procédures ouvertes", "#B91E27"]];
  const v = Object.fromEntries(series.map(([k]) => [k, Object.fromEntries(mois.map(m => [m, 0]))]));
  B.forEach(b => { const k = EVT[b.evt]?.g, m = b.date.slice(0, 7);
    if (v[k] && m in v[k] && passeBodacc(b, f, false)) v[k][m]++; });
  const max = Math.max(1, ...series.flatMap(([k]) => Object.values(v[k])));
  const W = 900, H = 170, bas = 22, haut = 12, pas = W / mois.length, lb = Math.min(16, (pas - 10) / 3);
  const y = n => H - bas - (H - bas - haut) * n / max;
  grapheBodacc.donnees = {mois, series, v};
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="Annonces par mois sur 12 mois">`;
  [0, .5, 1].forEach(t => { const n = Math.round(max * t);
    svg += `<line x1="0" x2="${W}" y1="${y(n)}" y2="${y(n)}" stroke="#e6e6e1"/><text x="2" y="${y(n) - 3}" font-size="10" fill="#888">${n}</text>`; });
  mois.forEach((m, i) => {
    const x0 = i * pas + (pas - 3 * lb - 4) / 2;
    const resume = series.map(([k, l]) => `${l} : ${v[k][m]}`).join(", ");
    // Un groupe par mois : zone de survol sur toute la hauteur, focalisable au clavier, cliquable
    svg += `<g class="mois${m === moisChoisi ? " sel" : ""}" data-m="${m}" tabindex="0" role="button"
      aria-pressed="${m === moisChoisi}" aria-label="${moisLong(m)} – ${resume}. Activer pour n'afficher que ce mois.">
      <rect class="zone" x="${i * pas + 1}" y="0" width="${pas - 2}" height="${H}" rx="4"/>`;
    series.forEach(([k, , c], j) => { const n = v[k][m];
      svg += `<rect class="barre" x="${x0 + j * (lb + 2)}" y="${y(n)}" width="${lb}" height="${Math.max(0, H - bas - y(n))}" fill="${c}" rx="2"/>`; });
    svg += `<text x="${i * pas + pas / 2}" y="${H - 6}" font-size="11" text-anchor="middle">${MOISC[+m.slice(5) - 1]}</text></g>`;
  });
  $("b-graphe").innerHTML = `<div class="leg">${series.map(([, l, c]) => `<span><span class="pastille" style="background:${c}"></span>${l}</span>`).join("")}</div>
    <div class="graphe">${svg}</svg><div class="infobulle" role="status" hidden></div></div>`;
}

// Infobulle du graphique : survol, focus clavier ou toucher d'un mois
function bulleMois(g){
  const cadre = $("b-graphe").querySelector(".graphe"), bulle = cadre?.querySelector(".infobulle");
  if (!bulle) return;
  if (!g){ bulle.hidden = true; cadre.querySelectorAll(".mois.survol").forEach(x => x.classList.remove("survol")); return; }
  const {series, v} = grapheBodacc.donnees, m = g.dataset.m;
  cadre.querySelectorAll(".mois.survol").forEach(x => x !== g && x.classList.remove("survol"));
  g.classList.add("survol");
  bulle.innerHTML = `<div class="t">${moisLong(m)}</div>` + series.map(([k, l, c]) =>
    `<div class="l"><span class="pastille" style="background:${c}"></span><span>${l}</span><b>${nb(v[k][m])}</b></div>`).join("") +
    `<div class="aide">${m === moisChoisi ? "Cliquer pour revenir à la période" : "Cliquer pour n'afficher que ce mois"}</div>`;
  bulle.hidden = false;
  // Placée au-dessus du mois, sans dépasser du cadre
  const rc = cadre.getBoundingClientRect(), rz = g.querySelector(".zone").getBoundingClientRect();
  const w = bulle.offsetWidth, x = Math.min(Math.max(rz.left - rc.left + rz.width / 2 - w / 2, 0), rc.width - w);
  bulle.style.left = `${x}px`;
  const haut = Math.min(...[...g.querySelectorAll(".barre")].map(b => b.getBoundingClientRect().top));
  bulle.style.top = `${Math.max(haut - rc.top - 8, 0)}px`;
}

function exportBodacc(){
  // Un classeur : annonces BODACC + nouveaux et sortis de l'annuaire, avec les filtres affichés
  const l = vieEntreprises.lignes || [], s = mouvementsSirene.donnees || {ent:[], sor:[]};
  if (!l.length && !s.ent.length && !s.sor.length){ toast("Rien à exporter avec ces filtres"); return; }
  const lignes = l.map(b => ({...b, siren:b.sirens.join(", "), ppTxt:b.pp ? "Oui" : "Non", sciTxt:b.sci ? "Oui" : "Non"}));
  const cols = [["date","Date de parution"],["evt","Événement"],["nom","Nom"],["siren","SIREN"],["forme","Forme juridique"],
    ["sciTxt","SCI"],["ppTxt","Commerçant en nom propre"],["act","Activité"],["com","Commune"],["cp","Code postal"],
    ["eff","Effectif (tranche Insee)"],["aeff","Année de l'effectif"],["srcEff","Origine de l'effectif"],
    ["detail","Détail"],["type","Type d'avis"],["url","Annonce"]];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, feuille(lignes, cols), "Annonces BODACC");
  const colsS = [["date","Date"],["nom","Nom"],["commune","Commune"],["naf_libelle","Activité"],["tranche_libelle","Effectif"],["type_structure","Structure"],["siret","SIRET"]];
  XLSX.utils.book_append_sheet(wb, feuille(s.ent, colsS), "Nouveaux (annuaire)");
  XLSX.utils.book_append_sheet(wb, feuille(s.sor, colsS), "Sortis (annuaire)");
  XLSX.writeFile(wb, `vie_des_entreprises_ncpa_${jour()}.xlsx`);
}

export function initVie(){
  const communes = [...new Set(E.map(e => e.com))];
  const presentes = Object.keys(SECTIONS).filter(s => E.some(e => e.sec === s));
  [...new Set([...communes, ...B.map(b => b.com)])].sort((a,b) => a.localeCompare(b, "fr"))
    .forEach(c => $("b-commune").insertAdjacentHTML("beforeend", `<option>${esc(c)}</option>`));
  presentes.forEach(s => $("s-secteur").insertAdjacentHTML("beforeend", `<option value="${s}">${esc(SECTIONS[s])}</option>`));
  $("b-periode").addEventListener("change", () => { moisChoisi = null; vieEntreprises(); });
  ["b-commune", "b-pp", "b-sci", "s-secteur"].forEach(id => $(id).addEventListener("change", vieEntreprises));
  $("b-mois").addEventListener("click", ev => { if (ev.target.closest('[data-a="periode"]')){ moisChoisi = null; vieEntreprises(); } });
  // Graphique : survol, focus clavier, clic ou Entrée sur un mois
  const graphe = $("b-graphe"), moisDe = ev => ev.target.closest?.(".mois");
  graphe.addEventListener("mouseover", ev => { const g = moisDe(ev); if (g) bulleMois(g); });
  graphe.addEventListener("mouseleave", () => bulleMois(null));
  graphe.addEventListener("focusin", ev => { const g = moisDe(ev); if (g) bulleMois(g); });
  graphe.addEventListener("focusout", () => bulleMois(null));
  graphe.addEventListener("click", ev => { const g = moisDe(ev); if (g) choisirMois(g.dataset.m); });
  graphe.addEventListener("keydown", ev => {
    const g = moisDe(ev); if (!g || (ev.key !== "Enter" && ev.key !== " ")) return;
    ev.preventDefault(); const m = g.dataset.m; choisirMois(m);
    graphe.querySelector(`.mois[data-m="${m}"]`)?.focus();
  });
  $("b-texte").addEventListener("input", debounce(vieEntreprises, 200));
  $("b-evts").addEventListener("change", ev => {
    ev.target.checked ? evtsCoches.add(ev.target.value) : evtsCoches.delete(ev.target.value); vieEntreprises();
  });
  $("b-export").onclick = exportBodacc;
}
