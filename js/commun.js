/* Outils, référentiels et données partagés par tous les onglets. */
/* =========================================================================
   Référentiels (identiques à referentiels.py)
   ========================================================================= */
export const SECTIONS = {A:"Agriculture, sylviculture et pêche",B:"Industries extractives",C:"Industrie manufacturière",
 D:"Électricité, gaz, vapeur et air conditionné",E:"Eau, assainissement, déchets et dépollution",F:"Construction",
 G:"Commerce, réparation d'automobiles et de motocycles",H:"Transports et entreposage",I:"Hébergement et restauration",
 J:"Information et communication",K:"Activités financières et d'assurance",L:"Activités immobilières",
 M:"Activités spécialisées, scientifiques et techniques",N:"Services administratifs et de soutien",O:"Administration publique",
 P:"Enseignement",Q:"Santé humaine et action sociale",R:"Arts, spectacles et activités récréatives",S:"Autres activités de services",
 T:"Activités des ménages employeurs",U:"Activités extra-territoriales",Z:"Activité non classée"};
export const COULEURS = {A:"#5f8f2f",B:"#8c6d46",C:"#1f5f8b",D:"#d4a017",E:"#2a9d8f",F:"#d9822b",G:"#c2185b",H:"#6c5b7b",
 I:"#e8590c",J:"#3d84c6",K:"#264653",L:"#9c6644",M:"#7b2cbf",N:"#8d99ae",O:"#495057",P:"#e9a23b",Q:"#2b9348",
 R:"#e75480",S:"#b5838d",T:"#adb5bd",U:"#adb5bd",Z:"#9e9e9e"};
export const TYPES = ["Société commerciale","Société civile (hors SCI)","Société civile immobilière (SCI)","Association","Secteur public","Autre structure privée"];
export const TYPES_DEFAUT = new Set(["Société commerciale","Société civile (hors SCI)","Association","Autre structure privée"]);

/* =========================================================================
   Outils
   ========================================================================= */
export const $ = id => document.getElementById(id);
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export const norm = s => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export const nb = n => Number(n).toLocaleString("fr-FR");
export const dateFr = iso => iso ? iso.slice(0,10).split("-").reverse().join("/") : "–";
export const MOIS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
export const dateLongue = iso => { const d = new Date(iso); return isNaN(d) ? "" : `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`; };
export const num = v => { const x = parseFloat(String(v ?? "").replace(",", ".")); return isNaN(x) ? null : x; };
export const sirFmt = s => String(s).replace(/^(\d{3})(\d{3})(\d{3})(\d{5})$/, "$1 $2 $3 $4");
export function toast(m){ const t = $("toast"); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(()=>t.hidden = true, 3200); }
export function debounce(f, ms){ let t; return (...a) => { clearTimeout(t); t = setTimeout(()=>f(...a), ms); }; }
export function telecharger(nom, contenu, type){
  const url = URL.createObjectURL(new Blob([contenu], {type}));
  const a = Object.assign(document.createElement("a"), {href:url, download:nom});
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url), 1000);
}
export const estEmployeur = e => e.emp === "Oui" || (e.emin !== null && e.emin >= 1);
// Précision de la position (colonne « precision » écrite par localisation.py)
export const APPROX = "Rue ou lieu-dit";
export const estApprox = e => e.prec === APPROX;
export const PRECISIONS = {"Numéro":"au numéro de la rue", "Lieu nommé":"sur le lieu nommé (camping, zone d'activités, lieu-dit…)",
  "Rue ou lieu-dit":"approximative : quelque part dans la rue ou le lieu-dit", "Vérifiée":"vérifiée à la main"};

/* =========================================================================
   Liste déroulante à cases (communes, activités détaillées)
   ========================================================================= */
export function multiSelect(hote, {vide, pluriel, recherche = true, onChange}){
  hote.innerHTML = `<button type="button" aria-haspopup="true" aria-expanded="false"></button>
    <div class="panneau" hidden>${recherche ? `<input class="champ" type="search" placeholder="Filtrer la liste…">` : ""}
    <div class="liste"></div><div class="bas"><button type="button" data-a="rien">Tout effacer</button>
    <button type="button" data-a="ok">Fermer</button></div></div>`;
  const btn = hote.querySelector(":scope>button"), pan = hote.querySelector(".panneau"),
        liste = hote.querySelector(".liste"), filtre = hote.querySelector("input");
  let options = [], choix = new Set();
  const libelle = () => { btn.textContent = !choix.size ? vide :
      choix.size === 1 ? (options.find(o => o.v === [...choix][0])?.l ?? vide) : `${choix.size} ${pluriel}`; };
  const dessiner = () => {
    const q = filtre ? norm(filtre.value) : "";
    liste.innerHTML = options.filter(o => !q || norm(o.l).includes(q)).map(o =>
      `<label><input type="checkbox" value="${esc(o.v)}"${choix.has(o.v) ? " checked" : ""}> <span>${esc(o.l)}</span></label>`).join("")
      || `<div style="color:var(--mut);padding:4px">Aucun choix</div>`;
  };
  const ouvrir = o => { pan.hidden = !o; btn.setAttribute("aria-expanded", String(o)); if (o){ dessiner(); filtre?.focus(); } };
  btn.onclick = () => ouvrir(pan.hidden);
  liste.onchange = ev => { const v = ev.target.value; ev.target.checked ? choix.add(v) : choix.delete(v); libelle(); onChange(); };
  filtre && (filtre.oninput = dessiner);
  hote.querySelector('[data-a="rien"]').onclick = () => { choix.clear(); dessiner(); libelle(); onChange(); };
  hote.querySelector('[data-a="ok"]').onclick = () => ouvrir(false);
  document.addEventListener("click", ev => { if (!hote.contains(ev.target)) ouvrir(false); });
  hote.addEventListener("keydown", ev => { if (ev.key === "Escape"){ ouvrir(false); btn.focus(); } });
  libelle();
  return {
    valeurs: () => choix,
    options(o){ options = o; const ok = new Set(o.map(x => x.v)); [...choix].forEach(v => { if (!ok.has(v)) choix.delete(v); }); libelle(); if (!pan.hidden) dessiner(); },
    vider(){ choix.clear(); libelle(); },
    choisir(valeurs){ choix = new Set(valeurs); libelle(); if (!pan.hidden) dessiner(); }
  };
}

/* =========================================================================
   Données
   ========================================================================= */
export let E = [], meta = {}, journal = [], communesGJ = null, stats = null, emploi = null, tourisme = null, offres = null, bmo = null, bonneBoite = null, B = [];
export const parSiret = new Map(), bodaccParSiren = new Map(), etabParSiren = new Map();
export const potentielParSiret = new Map();
export const aPosition = e => e.lat !== null && e.lon !== null;

export async function charger(){
  const rm = await fetch("data/meta.json", {cache:"no-store"});
  if (!rm.ok) throw new Error("meta");
  meta = await rm.json();
  const v = encodeURIComponent(meta.date_maj || Date.now());
  const lire = (u, opt) => fetch(`${u}?v=${v}`).then(r => r.ok ? r.text() : (opt ? "" : Promise.reject(new Error(u))));
  const [csv, gj, jr, corr, bod, st, em, to, of, bm, bb] = await Promise.all([
    lire("data/etablissements.csv"), lire("data/communes.geojson"),
    lire("data/journal.csv", true), lire("corrections_localisation.csv", true), lire("data/bodacc.csv", true),
    lire("data/stats.json", true), lire("data/emploi_urssaf.json", true),
    lire("data/tourisme.json", true), lire("data/offres.json", true), lire("data/bmo.json", true), lire("data/la_bonne_boite.json", true)]);
  const json = t => { try { return t.trim() ? JSON.parse(t) : null; } catch(e){ return null; } };
  tourisme = json(to); offres = json(of); bmo = json(bm);
  bonneBoite = json(bb);
  if (!Array.isArray(bonneBoite?.etablissements)) bonneBoite = null;
  potentielParSiret.clear();
  bonneBoite?.etablissements.forEach(e => potentielParSiret.set(e.siret, e));
  try { emploi = em.trim() ? JSON.parse(em) : null; } catch(e){ emploi = null; }
  try { stats = st.trim() ? JSON.parse(st) : null; } catch(e){ stats = null; }
  communesGJ = JSON.parse(gj);
  const lignes = Papa.parse(csv, {header:true, skipEmptyLines:true}).data;
  E = lignes.map(r => ({
    siret:r.siret, nom:r.nom, rs:r.raison_sociale, adr:r.adresse, cplt:r.complement_adresse, cp:r.code_postal,
    com:r.commune, cc:r.code_commune, naf:r.naf, nafl:r.naf_libelle, sec:r.section || "Z", div:r.division, divl:r.division_libelle,
    trl:r.tranche_libelle, emin:num(r.effectif_min), emax:num(r.effectif_max), aeff:r.annee_effectif,
    emp:r.employeur, siege:r.siege, crea:r.date_creation, tstr:r.type_structure, cj:r.categorie_juridique,
    catent:r.categorie_entreprise, ess:r.ess, lat:num(r.lat), lon:num(r.lon), loc:r.localisation, prec:r.precision || ""
  }));
  // Corrections manuelles : appliquées tout de suite, sans attendre la collecte de la nuit
  if (corr.trim()){
    Papa.parse(corr.trim(), {header:true, skipEmptyLines:true, delimitersToGuess:[",",";","\t"]}).data.forEach(c => {
      const k = Object.fromEntries(Object.entries(c).map(([a,b]) => [a.trim().toLowerCase(), b]));
      const s = String(k.siret || "").replace(/\D/g, ""), la = num(k.lat), lo = num(k.lon);
      const e = E.find(x => x.siret === s);
      if (e && la !== null && lo !== null){ e.lat = la; e.lon = lo; e.loc = "Corrigée manuellement"; e.prec = "Vérifiée"; }
    });
  }
  E.forEach(e => { e.q = norm([e.nom, e.rs, e.siret, e.adr, e.com, e.nafl, e.divl, e.naf].join(" ")); parSiret.set(e.siret, e); });
  journal = jr.trim() ? Papa.parse(jr, {header:true, skipEmptyLines:true}).data : [];
  chargerBodacc(bod);
}

export const jour = () => new Date().toISOString().slice(0,10);
export function feuille(lignes, cols){
  const ws = XLSX.utils.json_to_sheet(lignes.map(e => Object.fromEntries(cols.map(([k,l]) => [l, e[k] ?? ""]))));
  ws["!cols"] = cols.map(([k,l]) => ({wch: Math.min(45, Math.max(l.length + 2, ...lignes.slice(0,200).map(e => String(e[k] ?? "").length + 1)))}));
  return ws;
}

/* =========================================================================
   Annonces BODACC (écrites par bodacc.py)
   ========================================================================= */
// Catégories d'événement (identiques à bodacc.py) : couleur, groupe pour les chiffres et le graphique, cochée par défaut
export const EVTS = [
  ["Création", "#2b9348", "crea", true], ["Immatriculation", "#74c69d", "crea", true],
  ["Radiation", "#6c757d", "rad", true], ["Vente de fonds", "#3d84c6", "vente", true],
  ["Ouverture de sauvegarde ou de redressement", "#e8590c", "proc", true], ["Liquidation judiciaire", "#B91E27", "proc", true],
  ["Plan de redressement ou de sauvegarde", "#d4a017", "", true], ["Clôture de procédure", "#7b2cbf", "", true],
  ["Suivi de procédure", "#adb5bd", "", false]];
export const EVT = Object.fromEntries(EVTS.map(([n,c,g]) => [n, {c, g}]));

export function chargerBodacc(texte){
  if (!texte.trim()) return;
  B = Papa.parse(texte, {header:true, skipEmptyLines:true}).data.map(r => ({
    id:r.id, date:r.date, fam:r.famille, evt:r.evenement, detail:r.detail, nom:r.nom, sirens:(r.siren || "").split(";").filter(Boolean),
    forme:r.forme_juridique, pp:r.personne_physique === "Oui", act:r.activite, com:r.commune, cc:r.code_commune, cp:r.code_postal, type:r.type_avis, url:r.url,
    sci:r.sci === "Oui", eff:r.effectif || "", emin:num(r.effectif_min), emax:num(r.effectif_max), aeff:r.annee_effectif || "", srcEff:r.source_effectif || ""}));
  B.forEach(b => { b.q = norm([b.nom, b.act, b.detail, b.sirens.join(" ")].join(" "));
    b.sirens.forEach(s => { if (!bodaccParSiren.has(s)) bodaccParSiren.set(s, []); bodaccParSiren.get(s).push(b); }); });
  // Établissement à montrer sur la carte pour un SIREN : le siège s'il est sur le territoire, sinon le premier
  E.forEach(e => { const s = e.siret.slice(0, 9), d = etabParSiren.get(s);
    if (!d || (e.siege === "Oui" && d.siege !== "Oui")) etabParSiren.set(s, e); });
}

export function ligneBodacc(e){
  const l = bodaccParSiren.get(e.siret.slice(0, 9)); if (!l || !l.length) return "";
  const d = l[0];   // le fichier est trié par date décroissante
  return `<tr><td>BODACC</td><td><a href="${esc(d.url)}" target="_blank" rel="noopener" style="margin:0;font-weight:400">${dateFr(d.date)} – ${esc(d.evt)}</a>
    ${l.length > 1 ? `<span style="color:var(--mut)"> (${l.length} annonces)</span>` : ""}</td></tr>`;
}
