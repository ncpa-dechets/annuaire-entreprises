/* Chiffres du tableau de bord, lus dans data/stats.json (écrit par statistiques.py). */
import {stats, E, B, EVT} from "./commun.js";

export const FAM_EI = "Entrepreneur individuel";
const cache = new Map();

/* Chiffres d'une commune (code Insee) ou de tout le territoire (code vide). */
export function chiffres(code = ""){
  if (cache.has(code)) return cache.get(code);
  const c = {n:0, ei:0, emp:0, emin:0, emax:0, sections:{}, familles:{}, crea12:0, ferm12:0, flux:[], ages:[], pop:null};
  cache.set(code, c);
  if (!stats) return c;
  const ok = x => !code || x === code;
  for (const [com, sec, fam, n, emp, emin, emax] of stats.stock){
    if (!ok(com)) continue;
    const ei = fam === FAM_EI ? n : 0;
    c.n += n; c.ei += ei; c.emp += emp; c.emin += emin; c.emax += emax;
    const s = c.sections[sec] ||= {n:0, ei:0, emp:0, emin:0, emax:0};
    s.n += n; s.ei += ei; s.emp += emp; s.emin += emin; s.emax += emax;
    c.familles[fam] = (c.familles[fam] || 0) + n;
  }
  for (const [com, , , cr, fe] of stats.flux_12m) if (ok(com)){ c.crea12 += cr; c.ferm12 += fe; }
  const fin = +stats.date.slice(0, 4), parAn = {};
  for (let a = stats.annee_debut; a <= fin; a++) parAn[a] = {an:a, crea:0, ferm:0};
  for (const [an, com, , , cr, fe] of stats.flux) if (ok(com) && parAn[an]){ parAn[an].crea += cr; parAn[an].ferm += fe; }
  c.flux = Object.values(parAn);
  c.ages = stats.classes_age.map(lib => ({lib, n:0, ei:0}));
  for (const [com, k, ei, n] of stats.ages) if (ok(com) && c.ages[k]){ c.ages[k].n += n; if (ei) c.ages[k].ei += n; }
  const pops = Object.entries(stats.communes).filter(([k]) => ok(k)).map(([, v]) => v.population);
  c.pop = pops.length && pops.every(p => p != null) ? pops.reduce((a, b) => a + b, 0) : null;
  return c;
}

/* Communes du territoire : [{code, nom, population}], par ordre alphabétique. */
export const listeCommunes = () => !stats ? [] : Object.entries(stats.communes)
  .map(([code, v]) => ({code, nom:v.nom, pop:v.population})).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

/* Secteur qui compte le plus d'établissements. */
export function secteurDominant(c){
  return Object.entries(c.sections).filter(([s]) => s !== "Z").sort((a, b) => b[1].n - a[1].n)[0]?.[0] || "";
}

/* Principaux employeurs, d'après les tranches d'effectif de l'annuaire (hors entrepreneurs individuels). */
export function employeurs(code, combien){
  return E.filter(e => (!code || e.cc === code) && e.emin !== null && e.emin >= 1)
    .sort((a, b) => b.emin - a.emin || a.nom.localeCompare(b.nom, "fr")).slice(0, combien);
}

const ilYaUnAn = () => { const d = new Date(); d.setDate(d.getDate() - 365); return d.toISOString().slice(0, 10); };

/* Entreprises ayant fait l'objet d'une ouverture de procédure collective sur 12 mois (BODACC). */
export function procedures(code){
  const debut = ilYaUnAn(), vus = new Set();
  B.forEach(b => { if (EVT[b.evt]?.g === "proc" && b.date >= debut && (!code || b.cc === code)) vus.add(b.sirens[0] || b.id); });
  return vus.size;
}

/* Dernières annonces BODACC d'une commune, hors étapes administratives. */
export function annonces(code, combien){
  return B.filter(b => (!code || b.cc === code) && b.evt !== "Suivi de procédure").slice(0, combien);
}

/* Créations et fermetures par année, pour une commune (ou tout le territoire) et un secteur (ou tous). */
export function fluxDe(code = "", sec = ""){
  if (!stats) return [];
  const fin = +stats.date.slice(0, 4), parAn = {};
  for (let a = stats.annee_debut; a <= fin; a++) parAn[a] = {an:a, crea:0, ferm:0, creaEi:0};
  for (const [an, com, s, ei, cr, fe] of stats.flux){
    if ((code && com !== code) || (sec && s !== sec) || !parAn[an]) continue;
    parAn[an].crea += cr; parAn[an].ferm += fe; if (ei) parAn[an].creaEi += cr;
  }
  return Object.values(parAn);
}

/* Créations et fermetures des 12 derniers mois par secteur : {S:{crea, ferm, creaEi}} */
export function flux12ParSecteur(code = ""){
  const r = {};
  if (!stats) return r;
  for (const [com, s, ei, cr, fe] of stats.flux_12m){
    if (code && com !== code) continue;
    const x = r[s] ||= {crea:0, ferm:0, creaEi:0};
    x.crea += cr; x.ferm += fe; if (ei) x.creaEi += cr;
  }
  return r;
}

/* Établissements actifs par code d'activité (table « activites » de stats.json), entrepreneurs individuels compris. */
let idxAct = null;
function indexActivites(){
  if (idxAct) return idxAct;
  idxAct = new Map();
  for (const [com, naf, s, ei] of stats?.activites || []){
    let m = idxAct.get(com); if (!m) idxAct.set(com, m = new Map());
    m.set(naf, [s, ei]);
  }
  return idxAct;
}
export const aActivites = () => !!stats?.activites?.length;
/* Nombre d'établissements d'une commune (ou du territoire, code vide) pour une liste de codes NAF : {n, ei}. */
export function compter(code, codes){
  let n = 0, ei = 0;
  const lire = m => codes.forEach(c => { const v = m.get(c); if (v){ n += v[0] + v[1]; ei += v[1]; } });
  if (code){ const m = indexActivites().get(code); if (m) lire(m); } else indexActivites().forEach(lire);
  return {n, ei};
}
