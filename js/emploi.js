/* Emploi salarié privé (Urssaf), lu dans data/emploi_urssaf.json (écrit par urssaf.py). */
import {emploi} from "./commun.js";

const PLAGES = [["A",1,3],["B",5,9],["C",10,33],["D",35,35],["E",36,39],["F",41,43],["G",45,47],["H",49,53],["I",55,56],["J",58,63],
  ["K",64,66],["L",68,68],["M",69,75],["N",77,82],["O",84,84],["P",85,85],["Q",86,88],["R",90,93],["S",94,96],["T",97,98],["U",99,99]];
const sectionDe = div => PLAGES.find(([, a, b]) => +div >= a && +div <= b)?.[0] || "Z";
const zeros = () => (emploi?.annees || []).map(() => 0);
const ajouter = (cible, source) => source.forEach((v, i) => cible[i] += v);
const cache = new Map();

export const aEmploi = () => !!emploi?.lignes?.length;
export const annees = () => emploi?.annees || [];
export const derniereAnnee = () => annees().at(-1);

/* Emploi d'une commune (code Insee) ou du territoire (code vide) :
   {eff, etab, sections:{S:{eff, etab}}, apes:[{ape, lib, sec, eff, etab}]}, toutes les séries étant par année. */
export function emploiDe(code = ""){
  if (cache.has(code)) return cache.get(code);
  const r = {eff:zeros(), etab:zeros(), sections:{}, apes:[]};
  cache.set(code, r);
  if (!aEmploi()) return r;
  const parApe = new Map();
  for (const [com, sec, , ape, lib, etab, eff] of emploi.lignes){
    if (code && com !== code) continue;
    ajouter(r.eff, eff); ajouter(r.etab, etab);
    const s = r.sections[sec] ||= {eff:zeros(), etab:zeros()};
    ajouter(s.eff, eff); ajouter(s.etab, etab);
    let a = parApe.get(ape);
    if (!a) parApe.set(ape, a = {ape, lib, sec, eff:zeros(), etab:zeros()});
    ajouter(a.eff, eff); ajouter(a.etab, etab);
  }
  r.apes = [...parApe.values()];
  return r;
}

/* Département de référence : {nom, eff, sections:{S:eff}} */
let ref = null;
export function reference(){
  if (ref || !aEmploi()) return ref;
  ref = {nom:emploi.reference.nom, eff:zeros(), sections:{}};
  for (const [div, v] of Object.entries(emploi.reference.divisions)){
    ajouter(ref.eff, v.eff);
    ajouter(ref.sections[sectionDe(div)] ||= zeros(), v.eff);
  }
  return ref;
}

/* Évolution d'une série sur n années (jusqu'à la dernière) : {abs, pct} ou null. */
export function evolution(serie, n){
  const fin = serie.at(-1), debut = serie.at(-1 - n);
  if (debut == null || serie.length <= n) return null;
  return {abs:fin - debut, pct:debut ? 100 * (fin - debut) / debut : null};
}
export const fmtEvol = e => !e ? "–" : e.pct == null ? (e.abs > 0 ? `+${e.abs.toLocaleString("fr-FR")}` : "–")
  : `${e.pct > 0 ? "+" : ""}${e.pct.toLocaleString("fr-FR", {maximumFractionDigits:1})} %`;

/* Indice de spécificité d'un secteur : sa part dans l'emploi local, rapportée à sa part dans le département. */
export function specificite(local, sec){
  const r = reference(), i = annees().length - 1;
  const pl = local.eff[i] ? (local.sections[sec]?.eff[i] || 0) / local.eff[i] : null;
  const pr = r && r.eff[i] ? (r.sections[sec]?.[i] || 0) / r.eff[i] : null;
  return pl == null || !pr ? null : pl / pr;
}

/* Emploi d'un groupe de divisions NAF (ex. le tourisme) pour une commune ou le territoire : {eff, etab} par année. */
export function emploiDivisions(code, divisions){
  const r = {eff:zeros(), etab:zeros()};
  if (!aEmploi()) return r;
  for (const [com, , div, , , etab, eff] of emploi.lignes){
    if ((code && com !== code) || !divisions.includes(div)) continue;
    ajouter(r.eff, eff); ajouter(r.etab, etab);
  }
  return r;
}
/* Même groupe de divisions dans le département de référence : effectifs par année. */
export function referenceDivisions(divisions){
  const eff = zeros();
  divisions.forEach(d => { const v = emploi?.reference?.divisions[d]; if (v) ajouter(eff, v.eff); });
  return eff;
}
