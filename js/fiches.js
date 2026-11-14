/* Atelier « Fiches PDF » (#/fiches/<type>/<paramètres>) : compose un document A4 à enregistrer en PDF.
   Types : territoire, commune (codes Insee ou « toutes »), selection (sélection en cours de l'annuaire), entreprise (SIREN). */
import {$, esc, nb, dateLongue, jour, meta, stats, E, estEmployeur, etabsParSiren, bodaccParSiren, principal, dossier, basculerDossier} from "./commun.js";
import {chiffres, listeCommunes, compter} from "./stats.js";
import {lireAdresse, filtrerListe, grouperParSecteur, nomFichier, LISTES, MAX_ENTREPRISES} from "./fiches-outils.js";
import {carteEtablissements, carteCommunes, legendeCarte} from "./cartes.js";
import {corpsFicheCommune, introCommune, tableComparatif} from "./communes.js";
import {INDICATEURS} from "./synthese.js";
import {selection} from "./annuaire.js";
import {rendreFiche} from "./entreprise.js";
import {avertissement, chiffresCles, blocSecteurs, blocFlux, blocFamilles, blocAges, tableEmployeurs, tableEtablissements, pied} from "./blocs.js";
import {barres, classes, classeDe, couleurClasse, legendeClasses, C_STRUCT, pct} from "./graphes.js";

// Réglages du document ; le titre est propre à chaque document, les autres réglages sont gardés d'un document à l'autre
const opts = {titre:"", couverture:true, sommaire:true, carte:true, liste:"emp", notes:true, suite:false, ind:"etab"};
let courant = "", cartes = [], attente = Promise.resolve(), generation = 0, logo;

export function fiches(reste = []){
  const h = $("fi-contenu"), adr = lireAdresse(reste);
  nettoyer();
  h.closest(".page").scrollTop = 0;
  if (!adr.type){ accueil(h); return; }
  const cle = reste.join("/");
  if (cle !== courant){ courant = cle; opts.titre = ""; }
  atelier(h, adr);
}

function nettoyer(){
  generation++;
  cartes.forEach(c => { try { c.remove(); } catch(e){} });
  cartes = []; attente = Promise.resolve();
}

/* =========================================================================
   Accueil : choix du document
   ========================================================================= */
function accueil(h){
  const sel = selection(), dos = [...dossier];
  const nomDe = s => principal(etabsParSiren.get(s) || [])?.nom || bodaccParSiren.get(s)?.[0]?.nom || s;
  h.innerHTML = `<div class="inner">
    <div class="tete-page"><div><h2>Fiches à enregistrer en PDF</h2>
      <p class="note">Composez un document A4 : territoire, communes, secteur ou sélection d'établissements, entreprises.
        Un aperçu s'affiche avec ses réglages (titre, couverture, carte, liste), puis « Enregistrer en PDF ».</p></div></div>
    <div class="fi-choix">
      <div class="fi-carton"><h3>Le territoire</h3>
        <p class="note">Chiffres clés, secteurs, carte des communes, dynamique, principaux employeurs et tableau comparatif des communes.
          Peut être suivi des fiches des ${nb(meta.nb_communes)} communes, pour un document à remettre aux élus.</p>
        <a class="btn" href="#/fiches/territoire">Composer le dossier du territoire</a></div>
      <div class="fi-carton"><h3>Une ou plusieurs communes</h3>
        <p class="note">Une fiche par commune : chiffres, secteurs, carte des établissements, employeurs, commerces, annonces et liste des établissements.</p>
        <div class="fi-communes">${listeCommunes().map(c => `<label><input type="checkbox" value="${c.code}"> ${esc(c.nom)}</label>`).join("")}</div>
        <p><button class="btn" type="button" id="fi-tout">Tout cocher</button> <button class="btn" type="button" id="fi-com">Composer</button></p></div>
      <div class="fi-carton"><h3>Un secteur, une filière, une sélection</h3>
        <p class="note">Choisissez dans l'Annuaire les communes, secteurs, activités, effectifs… puis le bouton « Fiche PDF » sous la carte.
          Depuis l'onglet Secteurs, le détail d'un secteur propose aussi sa fiche.</p>
        ${sel ? `<p>Sélection en cours : <b>${esc(sel.titre)}</b>, ${nb(sel.etabs.length)} établissements.
          <a class="btn" href="#/fiches/selection">Composer</a></p>` : ""}
        <a class="lien" href="#/annuaire">Aller à l'Annuaire →</a></div>
      <div class="fi-carton"><h3>Une ou plusieurs entreprises</h3>
        <p class="note">Ouvrez une fiche entreprise (recherche en haut de la page) puis « Fiche PDF », ou « Ajouter au dossier PDF »
          pour en réunir plusieurs (${nb(MAX_ENTREPRISES)} au plus).</p>
        ${dos.length ? `<ul class="fi-dossier">${dos.map(s => `<li><a class="lien" href="#/entreprise/${s}">${esc(nomDe(s))}</a>
          <button class="btn" type="button" data-retirer="${s}">Retirer</button></li>`).join("")}</ul>
          <a class="btn" href="#/fiches/entreprise/${dos.join(",")}">Composer le dossier (${nb(dos.length)})</a>` : `<p class="note">Le dossier est vide.</p>`}</div>
    </div></div>`;
  const cases = () => [...h.querySelectorAll(".fi-communes input")];
  $("fi-tout").onclick = () => { const tout = cases().some(i => !i.checked); cases().forEach(i => i.checked = tout); };
  $("fi-com").onclick = () => {
    const l = cases().filter(i => i.checked).map(i => i.value);
    if (l.length) location.hash = `#/fiches/commune/${l.length === cases().length ? "toutes" : l.join(",")}`;
  };
  h.querySelectorAll("[data-retirer]").forEach(b => b.onclick = () => { basculerDossier(b.dataset.retirer); accueil(h); });
}

/* =========================================================================
   Atelier : réglages et aperçu
   ========================================================================= */
function atelier(h, adr){
  const t = adr.type, pour = (...types) => types.includes(t);
  const ck = (k, lib) => `<label class="case"><input type="checkbox" data-opt="${k}"${opts[k] ? " checked" : ""}> ${lib}</label>`;
  h.innerHTML = `<div class="fi-atelier">
    <aside class="fi-reglages no-print">
      <a class="lien" href="#/fiches">← Autre document</a>
      <h2>Réglages</h2>
      <label class="lib" for="fi-titre">Titre du document</label><input id="fi-titre" class="champ">
      ${ck("couverture", "Page de couverture")}
      ${ck("sommaire", "Sommaire sur la couverture")}
      ${pour("territoire") ? `<label class="lib" for="fi-ind">Carte des communes</label><select id="fi-ind" class="champ" data-opt="ind">${INDICATEURS
        .filter(i => !i[4] || stats?.complet).map(i => `<option value="${i[0]}"${i[0] === opts.ind ? " selected" : ""}>${esc(i[1])}</option>`).join("")}</select>
        ${ck("suite", `Ajouter les fiches des ${nb(meta.nb_communes)} communes`)}` : ""}
      ${pour("commune", "selection") || (pour("territoire") && opts.suite) ? ck("carte", "Carte des établissements") + `
        <label class="lib" for="fi-liste">Liste des établissements</label><select id="fi-liste" class="champ" data-opt="liste">${Object.entries(LISTES)
          .map(([k, l]) => `<option value="${k}"${k === opts.liste ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>` : ""}
      ${pour("entreprise") ? ck("notes", "Encadré « Notes de visite »") : ""}
      <button class="btn principal" type="button" id="fi-pdf">Enregistrer en PDF</button>
      <p class="note petit" id="fi-etat" role="status"></p>
      <p class="note petit">Dans la fenêtre qui s'ouvre, choisissez la destination « Enregistrer au format PDF », le format A4 et les marges par défaut.
        Les numéros de page s'impriment avec Chrome et Edge.</p>
    </aside>
    <div class="fi-apercu"><div class="fi-doc" id="fi-doc"></div></div></div>`;
  h.querySelectorAll("[data-opt]").forEach(el => el.onchange = () => {
    opts[el.dataset.opt] = el.type === "checkbox" ? el.checked : el.value;
    el.dataset.opt === "suite" ? atelier(h, adr) : rendreDoc(adr);   // « suite » fait apparaître d'autres réglages
  });
  $("fi-titre").oninput = ev => { opts.titre = ev.target.value.trim(); document.querySelectorAll("#fi-doc .fi-titre").forEach(x => x.textContent = opts.titre || $("fi-titre").placeholder); };
  $("fi-pdf").onclick = enregistrer;
  rendreDoc(adr);
}

const etat = m => { const e = $("fi-etat"); if (e) e.textContent = m; };

async function rendreDoc(adr){
  nettoyer();
  const g = generation, zone = $("fi-doc"), doc = construire(adr);
  if (doc.erreur){ zone.innerHTML = `<section class="feuille">${doc.erreur}</section>`; $("fi-pdf").disabled = true; etat(""); return; }
  $("fi-pdf").disabled = false;
  $("fi-titre").placeholder = doc.titre; $("fi-titre").value = opts.titre;
  zone.dataset.fichier = nomFichier(opts.titre || doc.titre, jour());
  if (logo === undefined) logo = await chercherLogo();
  if (g !== generation) return;
  zone.innerHTML = (opts.couverture ? couverture(doc) : "")
    + doc.feuilles.map((f, i) => `<section class="feuille" data-i="${i}">${f.html}</section>`).join("");
  zone.querySelectorAll(".fi-titre").forEach(x => x.textContent = opts.titre || doc.titre);
  const sections = zone.querySelectorAll("section[data-i]"), aMonter = doc.feuilles.filter(f => f.monter).length;
  // Cartes et compléments chargés une fiche après l'autre, pour ménager les services de tuiles et l'API
  attente = (async () => {
    let k = 0;
    for (let i = 0; i < doc.feuilles.length; i++){
      const f = doc.feuilles[i];
      if (!f.monter) continue;
      if (g !== generation) return;
      etat(`Préparation : ${nb(++k)} / ${nb(aMonter)}…`);
      try { await f.monter(sections[i]); } catch(e){ console.error(e); }
    }
    if (g === generation) etat(`Prêt : ${nb(doc.feuilles.length)} fiche${doc.feuilles.length > 1 ? "s" : ""}${adr.tronque ? ` (limité à ${MAX_ENTREPRISES} entreprises)` : ""}.`);
  })();
}

async function enregistrer(){
  const b = $("fi-pdf"), g = generation;
  b.disabled = true; b.textContent = "Préparation…";
  await attente;
  b.disabled = false; b.textContent = "Enregistrer en PDF";
  if (g !== generation) return;
  // Le titre de la page devient le nom de fichier proposé par le navigateur
  const ancien = document.title;
  document.title = $("fi-doc").dataset.fichier || ancien;
  window.addEventListener("afterprint", () => { document.title = ancien; }, {once:true});
  window.print();
}

/* Logo facultatif déposé dans img/ : affiché sur la couverture et en tête des fiches. */
async function chercherLogo(){
  for (const u of ["img/logo.svg", "img/logo.png"]){
    try { const r = await fetch(u, {method:"HEAD", cache:"no-store"}); if (r.ok) return u; } catch(e){}
  }
  return null;
}

/* =========================================================================
   Mise en page commune : couverture, en-tête de fiche, carte, liste
   ========================================================================= */
function couverture(doc){
  const titre = opts.titre || doc.titre, somm = opts.sommaire && doc.feuilles.length > 1;
  return `<section class="feuille fi-couv">
    <div class="fi-couv-haut">${logo ? `<img src="${esc(logo)}" alt="">` : ""}<div class="sur">Développement économique</div>
      <div>Normandie-Cabourg-Pays d'Auge</div></div>
    <div class="fi-couv-milieu"><h1 class="fi-titre">${esc(titre)}</h1>${doc.sous ? `<p>${esc(doc.sous)}</p>` : ""}
      ${somm ? `<h3>Sommaire</h3><ol class="fi-sommaire">${doc.feuilles.map(f => `<li>${esc(f.titre)}</li>`).join("")}</ol>` : ""}</div>
    <div class="fi-couv-bas">Données du ${dateLongue(meta.date_maj)} · document édité le ${dateLongue(jour())}<br>
      Sources : Insee, répertoire SIRENE ; BODACC ; Urssaf ; Annuaire des entreprises.</div></section>`;
}

const entete = (titre, sous) => `<div class="fi-entete">${logo ? `<img src="${esc(logo)}" alt="">` : ""}<b>Développement économique · NCPA</b>
    <span class="fi-titre"></span><span>${dateLongue(meta.date_maj)}</span></div>
  ${titre ? `<h2 class="fi-h">${esc(titre)}</h2>` : ""}${sous ? `<p class="note">${sous}</p>` : ""}`;

const blocCarte = etabs => !opts.carte ? "" : `<div class="bloc fi-bloc-carte"><h3>Carte des établissements</h3>
  <div class="fi-carte" data-carte role="img" aria-label="Carte des établissements"></div>${legendeCarte(etabs)}</div>`;

function monterCarte(el, etabs, communes){
  const zone = el.querySelector("[data-carte]");
  if (!zone) return Promise.resolve();
  const r = carteEtablissements(zone, etabs, communes);
  cartes.push(r.carte);
  return r.pret;
}

function blocListe(liste, total, commune){
  if (opts.liste === "aucune") return "";
  return `<div class="bloc fi-liste"><h3>Liste des établissements</h3>
    <p class="note petit">${esc(LISTES[opts.liste])} : ${nb(liste.length)} établissement${liste.length > 1 ? "s" : ""} sur ${nb(total)} dans l'annuaire.
      Les entrepreneurs individuels sont comptés dans les chiffres mais jamais cités nominativement. Effectifs : tranches déclarées à l'Insee.</p>
    ${tableEtablissements(grouperParSecteur(liste), {commune})}</div>`;
}

/* =========================================================================
   Les documents
   ========================================================================= */
function construire(adr){
  const sansStats = {erreur:`<h2>Données indisponibles</h2><p class="note">Les statistiques seront disponibles après la prochaine collecte nocturne.</p>`};
  let doc;
  if (adr.type === "territoire") doc = stats ? docTerritoire() : sansStats;
  else if (adr.type === "commune") doc = stats ? docCommunes(adr.ids) : sansStats;
  else if (adr.type === "selection") doc = docSelection();
  else doc = docEntreprises(adr.ids);
  return doc;
}

function feuilleCommune(code){
  const nom = stats.communes[code].nom, etabs = E.filter(e => e.cc === code);
  return {titre:nom,
    html:`${entete(nom, esc(introCommune(code)))}
      ${corpsFicheCommune(code, {apresChiffres:blocCarte(etabs)})}
      ${blocListe(filtrerListe(etabs, opts.liste), etabs.length, false)}
      ${pied()}`,
    monter:opts.carte ? el => monterCarte(el, etabs, [code]) : null};
}

function docCommunes(ids){
  const codes = ids.includes("toutes") ? listeCommunes().map(c => c.code) : ids.filter(c => stats.communes[c]);
  if (!codes.length) return {erreur:`<h2>Aucune commune</h2><p class="note">L'adresse ne contient pas de code de commune du territoire. <a class="lien" href="#/fiches">Choisir des communes →</a></p>`};
  const noms = codes.map(c => stats.communes[c].nom);
  return {titre:codes.length === 1 ? `Portrait économique de ${noms[0]}` : ids.includes("toutes") ? `Portraits économiques des ${nb(codes.length)} communes` : `Portraits économiques de ${nb(codes.length)} communes`,
    sous:codes.length === 1 ? "Normandie-Cabourg-Pays d'Auge" : codes.length <= 8 ? noms.join(", ") : `Normandie-Cabourg-Pays d'Auge, ${nb(codes.length)} communes`,
    feuilles:codes.map(feuilleCommune)};
}

function docTerritoire(){
  const c = chiffres(""), ind = INDICATEURS.find(i => i[0] === opts.ind && (!i[4] || stats.complet)) || INDICATEURS[0];
  const intro = `Normandie-Cabourg-Pays d'Auge, ${nb(meta.nb_communes)} communes${c.pop ? `, ${nb(c.pop)} habitants` : ""}.`;
  const feuilles = [
    {titre:"Le territoire en chiffres", html:`${entete("Le territoire en chiffres", esc(intro))}
      ${avertissement()}${chiffresCles("")}
      <div class="deux">
        <div class="bloc"><h3>Établissements par secteur d'activité</h3>${blocSecteurs(c)}</div>
        <div class="bloc"><h3>Les communes : ${esc(ind[1].toLowerCase())}</h3><div class="fi-carte petite" data-choro role="img" aria-label="Carte des communes"></div><div data-leg></div></div></div>
      <div class="deux">
        <div class="bloc"><h3>Créations et fermetures d'établissements par an</h3>${blocFlux(c)}</div>
        <div class="bloc"><h3>Types de structure</h3>${blocFamilles(c)}<h3>Âge des établissements actifs</h3>${blocAges(c)}</div></div>`,
      monter:el => monterChoro(el, ind)},
    {titre:"Principaux employeurs et communes", html:`${entete("Principaux employeurs et communes")}
      <div class="bloc"><h3>Les 20 principaux employeurs</h3><p class="note">D'après la tranche d'effectif de chaque établissement (répertoire SIRENE).</p>${tableEmployeurs("", 20)}</div>
      <div class="bloc"><h3>Les communes comparées</h3>${tableComparatif()}</div>${pied()}`}];
  if (opts.suite) listeCommunes().forEach(k => feuilles.push(feuilleCommune(k.code)));
  return {titre:"Portrait économique du territoire", sous:intro + (opts.suite ? " Avec la fiche de chaque commune." : ""), feuilles};
}

function monterChoro(el, [, lib, calcul, fmt]){
  const val = Object.fromEntries(listeCommunes().map(k => [k.code, calcul(chiffres(k.code), k.code)]));
  const seuils = classes(Object.values(val));
  const couleurs = Object.fromEntries(Object.entries(val).map(([k, v]) => [k, v == null ? "#eee" : couleurClasse(classeDe(v, seuils), seuils)]));
  const r = carteCommunes(el.querySelector("[data-choro]"), couleurs);
  cartes.push(r.carte);
  el.querySelector("[data-leg]").innerHTML = legendeClasses(lib, seuils, fmt);
  return r.pret;
}

function docSelection(){
  const sel = selection();
  if (!sel) return {erreur:`<h2>Pas de sélection en cours</h2><p class="note">La fiche d'un secteur ou d'une sélection se compose depuis l'Annuaire :
    choisissez communes, secteurs, activités ou effectifs, puis « Fiche PDF » sous la carte.</p><p><a class="lien" href="#/annuaire">Aller à l'Annuaire →</a></p>`};
  const {etabs} = sel;
  if (!etabs.length) return {erreur:`<h2>Sélection vide</h2><p class="note">Aucun établissement ne correspond aux filtres de l'Annuaire.</p><p><a class="lien" href="#/annuaire">Modifier la sélection →</a></p>`};
  const codes = sel.communes.map(n => listeCommunes().find(c => c.nom === n)?.code).filter(Boolean);
  const k = (v, lib) => `<div><b>${v}</b><span>${lib}</span></div>`;
  let bas = 0, haut = 0;
  etabs.forEach(e => { if (e.emin !== null){ bas += e.emin; haut += e.emax; } });
  // Total entrepreneurs individuels compris : seulement quand la sélection se réduit à des secteurs ou des activités, et des communes
  let total = null;
  if (stats?.complet && sel.simple && (sel.nafs.length || sel.secteurs.length)){
    const lieux = codes.length ? codes : [""];
    total = lieux.reduce((s, cc) => s + (sel.nafs.length ? compter(cc, sel.nafs).n
      : sel.secteurs.reduce((t, x) => t + (chiffres(cc).sections[x]?.n || 0), 0)), 0);
  }
  const repartition = (cle, max = 12) => {
    const n = {}; etabs.forEach(e => { const v = e[cle] || "Non renseigné"; n[v] = (n[v] || 0) + 1; });
    const l = Object.entries(n).sort((a, b) => b[1] - a[1]), reste = l.slice(max).reduce((s, x) => s + x[1], 0);
    return barres([...l.slice(0, max), ...(reste ? [[`${nb(l.length - max)} autres`, reste]] : [])]
      .map(([lib, v]) => ({lib, segments:[{v, c:C_STRUCT}], valeur:`${nb(v)} <small>(${pct(v, etabs.length)})</small>`})));
  };
  const nbCom = new Set(etabs.map(e => e.com)).size;
  const html = `${entete(sel.titre, sel.criteres.length ? esc(sel.criteres.join(" · ")) : "Tous les établissements de l'annuaire")}
    <div class="gros">
      ${k(nb(etabs.length), "établissements dans l'annuaire<br>(hors entrepreneurs individuels)")}
      ${total != null ? k(nb(total), "établissements actifs au total<br>entrepreneurs individuels compris") : ""}
      ${k(nb(etabs.filter(estEmployeur).length), "établissements employeurs")}
      ${k(`${nb(bas)} à ${nb(haut)}`, "salariés<br>(tranches Insee)")}
      ${k(nb(nbCom), `commune${nbCom > 1 ? "s" : ""}`)}
    </div>
    <div class="deux">
      <div class="bloc"><h3>Par commune</h3>${repartition("com")}</div>
      <div class="bloc"><h3>Par activité</h3>${repartition("nafl")}</div></div>
    ${blocCarte(etabs)}
    ${blocListe(filtrerListe(etabs, opts.liste), etabs.length, nbCom > 1)}
    ${pied()}`;
  return {titre:sel.titre, sous:sel.criteres.join(" · "), feuilles:[{titre:sel.titre, html, monter:opts.carte ? el => monterCarte(el, etabs, codes) : null}]};
}

function docEntreprises(ids){
  if (!ids.length) return {erreur:`<h2>Aucune entreprise</h2><p class="note">L'adresse ne contient pas de numéro SIREN. Ouvrez une fiche entreprise
    depuis la recherche en haut de la page, puis « Fiche PDF » ou « Ajouter au dossier PDF ».</p>`};
  const nomDe = s => principal(etabsParSiren.get(s) || [])?.nom || bodaccParSiren.get(s)?.[0]?.nom || `SIREN ${s}`;
  const noms = ids.map(nomDe);
  return {titre:ids.length === 1 ? noms[0] : `Dossier : ${nb(ids.length)} entreprises`,
    sous:ids.length === 1 ? "Fiche entreprise" : noms.slice(0, 8).join(", ") + (ids.length > 8 ? "…" : ""),
    feuilles:ids.map((s, i) => ({titre:noms[i], html:`${entete()}<div data-entreprise></div>`,
      monter:el => { const r = rendreFiche(el.querySelector("[data-entreprise]"), s, {pdf:true, notes:opts.notes});
        if (r.carte) cartes.push(r.carte); return r.pret; }}))};
}
