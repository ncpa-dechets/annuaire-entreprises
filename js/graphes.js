/* Petits graphiques en HTML et SVG, sans bibliothèque : ils s'impriment nettement et restent légers. */
import {esc, nb} from "./commun.js";

// Paires vérifiées pour les daltoniens (écart suffisant en vision deutan, protan et tritan)
export const C_STRUCT = "#B91E27", C_EI = "#3d84c6";       // structures / entrepreneurs individuels
export const C_CREA = "#3d84c6", C_FERM = "#B91E27";       // créations / fermetures
// Dégradé d'une seule teinte pour les cartes (du plus clair au plus foncé)
export const DEGRADE = ["#fbe9e7", "#f3b9b3", "#e17f7a", "#c8443f", "#8f161e"];

export const pct = (n, total, dec = 0) => total ? `${(100 * n / total).toLocaleString("fr-FR", {maximumFractionDigits:dec})} %` : "–";
const bulle = html => html ? ` data-bulle="${esc(html)}" tabindex="0"` : "";

export function legende(items){
  return `<div class="leg">${items.map(([lib, c, forme]) =>
    `<span><span class="${forme || "pastille"}" style="background:${c}"></span>${esc(lib)}</span>`).join("")}</div>`;
}

/* Barres horizontales. lignes : [{lib, pastille, segments:[{v, c}], valeur, repere, bulle}]
   max : valeur qui remplit toute la largeur. repere : petit trait vertical (valeur de comparaison). */
export function barres(lignes, max){
  max = max || Math.max(1, ...lignes.map(l => Math.max(l.repere || 0, l.segments.reduce((s, x) => s + x.v, 0))));
  return `<div class="barres">${lignes.map(l => `<div class="l"${bulle(l.bulle)}>
    <div class="lib">${l.pastille ? `<span class="pastille" style="background:${l.pastille}"></span>` : ""}<span>${esc(l.lib)}</span></div>
    <div class="piste">${l.segments.filter(s => s.v > 0).map(s => `<i style="width:${(100 * s.v / max).toFixed(2)}%;background:${s.c}"></i>`).join("")}
      ${l.repere != null ? `<u style="left:${Math.min(100, 100 * l.repere / max).toFixed(2)}%"></u>` : ""}</div>
    <div class="val">${l.valeur}</div></div>`).join("")}</div>`;
}

/* Colonnes groupées par année. series : [{nom, c, v:[…]}], etiquettes : ["2010", …] */
export function colonnes(etiquettes, series, titre){
  const max = Math.max(1, ...series.flatMap(s => s.v));
  const W = 560, H = 190, bas = 22, haut = 12, pas = W / etiquettes.length;
  const lb = Math.min(13, (pas - 6) / series.length - 2);
  const y = n => H - bas - (H - bas - haut) * n / max;
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(titre)}">`;
  [0, .5, 1].forEach(t => { const n = Math.round(max * t);
    svg += `<line x1="0" x2="${W}" y1="${y(n)}" y2="${y(n)}" stroke="#e6e6e1"/><text x="2" y="${y(n) - 3}" font-size="10" fill="#777">${nb(n)}</text>`; });
  etiquettes.forEach((e, i) => {
    const x0 = i * pas + (pas - series.length * (lb + 2) + 2) / 2;
    const detail = `<b>${esc(e)}</b>` + series.map(s => `<div class="l"><span class="pastille" style="background:${s.c}"></span>${esc(s.nom)}<b>${nb(s.v[i])}</b></div>`).join("")
      + (series.length === 2 ? `<div class="l">Solde<b>${s2(series[0].v[i] - series[1].v[i])}</b></div>` : "");
    svg += `<g class="an"${bulle(detail)}><rect class="zone" x="${i * pas}" y="0" width="${pas}" height="${H}"/>`;
    series.forEach((s, j) => { const n = s.v[i];
      svg += `<rect x="${x0 + j * (lb + 2)}" y="${y(n)}" width="${lb}" height="${Math.max(0, H - bas - y(n))}" fill="${s.c}" rx="2"/>`; });
    const court = etiquettes.length > 12 ? `${String(e).slice(2)}` : e;
    svg += `<text x="${i * pas + pas / 2}" y="${H - 6}" font-size="10.5" text-anchor="middle" fill="#666">${esc(court)}</text></g>`;
  });
  return `<div class="colonnes">${svg}</svg></div>`;
}
const s2 = n => (n > 0 ? "+" : "") + nb(n);
export const signe = s2;

/* Classes d'une carte : seuils par quantiles, sans doublon. */
export function classes(valeurs, nbClasses = DEGRADE.length){
  const v = valeurs.filter(x => x != null && isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return [];
  const seuils = [];
  for (let i = 1; i < nbClasses; i++){ const q = v[Math.min(v.length - 1, Math.floor(i * v.length / nbClasses))]; if (!seuils.includes(q) && q > v[0]) seuils.push(q); }
  return seuils;       // la classe d'une valeur = nombre de seuils qu'elle atteint
}
export const classeDe = (x, seuils) => seuils.filter(s => x >= s).length;
export function couleurClasse(k, seuils){
  const n = seuils.length + 1;
  return DEGRADE[n === 1 ? 2 : Math.round(k * (DEGRADE.length - 1) / (n - 1))];
}

/* Infobulle commune à tous les graphiques : survol, toucher ou focus clavier d'un élément [data-bulle]. */
export function activerBulles(){
  const b = document.createElement("div"); b.className = "bulle"; b.hidden = true; b.setAttribute("role", "status");
  document.body.appendChild(b);
  const montrer = (el, x, y) => {
    b.innerHTML = el.dataset.bulle; b.hidden = false;
    const w = b.offsetWidth, h = b.offsetHeight;
    b.style.left = `${Math.max(6, Math.min(x + 14, innerWidth - w - 6))}px`;
    b.style.top = `${y - h - 12 < 6 ? y + 18 : y - h - 12}px`;
  };
  document.addEventListener("mousemove", ev => { const el = ev.target.closest?.("[data-bulle]"); el ? montrer(el, ev.clientX, ev.clientY) : (b.hidden = true); });
  document.addEventListener("focusin", ev => { const el = ev.target.closest?.("[data-bulle]"); if (el){ const r = el.getBoundingClientRect(); montrer(el, r.left + r.width / 2, r.top); } });
  document.addEventListener("focusout", () => b.hidden = true);
  document.addEventListener("scroll", () => b.hidden = true, true);
}

/* Courbes par année. series : [{nom, c, v:[…]}]. L'axe ne part pas de zéro : ses bornes sont affichées. */
export function courbes(etiquettes, series, {titre = "", fmt = nb} = {}){
  const vals = series.flatMap(s => s.v).filter(v => v != null && isFinite(v));
  if (!vals.length) return "";
  let min = Math.min(...vals), max = Math.max(...vals);
  const marge = (max - min || Math.abs(max) || 1) * .12; min -= marge; max += marge;
  const W = 560, H = 200, g = 8, d = 8, bas = 22, haut = 12, n = etiquettes.length;
  const x = i => g + (n > 1 ? i * (W - g - d) / (n - 1) : 0), y = v => H - bas - (H - bas - haut) * (v - min) / (max - min);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(titre)}">`;
  [0, .5, 1].forEach(t => { const v = min + marge + (max - min - 2 * marge) * t;
    svg += `<line x1="0" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="#e6e6e1"/><text x="2" y="${y(v) - 3}" font-size="10" fill="#777">${fmt(v)}</text>`; });
  series.forEach(s => {
    const pts = s.v.map((v, i) => v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`).filter(Boolean);
    svg += `<polyline points="${pts.join(" ")}" fill="none" stroke="${s.c}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    const k = s.v.length - 1;
    if (s.v[k] != null) svg += `<circle cx="${x(k)}" cy="${y(s.v[k])}" r="4" fill="${s.c}" stroke="#fff" stroke-width="2"/>`;
  });
  const pas = n > 1 ? (W - g - d) / (n - 1) : W, tous = Math.ceil(n / 7);
  etiquettes.forEach((e, i) => {
    const detail = `<b>${esc(e)}</b>` + series.map(s => `<div class="l"><span class="pastille" style="background:${s.c}"></span>${esc(s.nom)}<b>${s.v[i] == null ? "–" : fmt(s.v[i])}</b></div>`).join("");
    svg += `<g class="an"${bulle(detail)}><rect class="zone" x="${x(i) - pas / 2}" y="0" width="${pas}" height="${H - bas}"/>
      <line class="guide" x1="${x(i)}" x2="${x(i)}" y1="${haut}" y2="${H - bas}"/>
      ${series.map(s => s.v[i] == null ? "" : `<circle class="pt" cx="${x(i)}" cy="${y(s.v[i])}" r="4" fill="${s.c}" stroke="#fff" stroke-width="2"/>`).join("")}
      ${(n - 1 - i) % tous === 0 ? `<text x="${x(i)}" y="${H - 6}" font-size="10.5" text-anchor="${i === n - 1 ? "end" : i === 0 ? "start" : "middle"}" fill="#666">${esc(e)}</text>` : ""}</g>`;
  });
  return `<div class="colonnes courbes">${svg}</svg></div>`;
}
