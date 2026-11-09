/* Thème Tourisme : hébergements classés (Atout France), établissements déclarés (SIRENE) et emploi touristique (Urssaf). */
import {$, esc, nb, stats, tourisme, feuille, jour, dateLongue} from "../commun.js";
import {listeCommunes, compter, aActivites} from "../stats.js";
import {aEmploi, annees, derniereAnnee, emploiDe, emploiDivisions, referenceDivisions, reference, evolution, fmtEvol} from "../emploi.js";
import {barres, courbes, pct, C_STRUCT, C_EI} from "../graphes.js";
import {pied} from "../blocs.js";

// Activités retenues pour l'emploi touristique : hébergement, restauration, agences de voyage, loisirs
const DIVISIONS = ["55", "56", "79", "93"];
const NAF_HEBERGEMENT = {"Hôtels":["55.10Z"], "Meublés et hébergements de courte durée":["55.20Z"], "Campings":["55.30Z"], "Autres hébergements":["55.90Z"]};
const NAF_RESTAURATION = ["56.10A", "56.10B", "56.10C", "56.30Z"];
let typeChoisi = "";

const heb = code => (tourisme?.hebergements || []).filter(h => !code || h.code_commune === code);
const somme = (l, k) => l.reduce((s, h) => s + (h[k] || 0), 0);
const etoiles = n => n ? `<span aria-label="${n} étoile${n > 1 ? "s" : ""}" title="${n} étoile${n > 1 ? "s" : ""}">${"★".repeat(n)}</span>` : "–";
const unite = h => h.chambres ? `${nb(h.chambres)} chambres` : h.emplacements ? `${nb(h.emplacements)} emplacements` : h.logements ? `${nb(h.logements)} logements` : "";
const nomCommune = code => stats?.communes[code]?.nom || code;

/* Emploi touristique d'une commune ou du territoire, dernière année : {sal, part, serie} */
function emploiTouristique(code){
  if (!aEmploi()) return null;
  const t = emploiDivisions(code, DIVISIONS), tout = emploiDe(code), i = annees().length - 1;
  return {sal:t.eff[i], etab:t.etab[i], part:tout.eff[i] ? t.eff[i] / tout.eff[i] : null, serie:t.eff};
}

export function tourismeVue(h){
  const H = heb("");
  if (!H.length && !aEmploi()){ h.innerHTML = `<h2>Tourisme</h2><p class="note">Ce module sera disponible après la prochaine collecte nocturne.</p>`; return; }
  const types = [...new Set(H.map(x => x.type))].sort((a, b) => somme(H.filter(x => x.type === b), "capacite") - somme(H.filter(x => x.type === a), "capacite"));
  const hotels = H.filter(x => x.type === "Hôtel"), campings = H.filter(x => x.type === "Camping");
  const e = emploiTouristique(""), an = derniereAnnee(), A = annees();
  const refT = aEmploi() ? referenceDivisions(DIVISIONS) : null, ref = aEmploi() ? reference() : null;
  const partRef = refT && ref.eff.at(-1) ? refT.at(-1) / ref.eff.at(-1) : null;
  const k = (v, lib) => `<div><b>${v}</b><span>${lib}</span></div>`;
  const coms = listeCommunes().map(c => { const l = heb(c.code), et = emploiTouristique(c.code);
    return {...c, lits:somme(l, "capacite"), nbHeb:l.length, hotels:l.filter(x => x.type === "Hôtel").length, campings:l.filter(x => x.type === "Camping").length,
      sal:et?.sal || 0, part:et?.part, decl:aActivites() ? compter(c.code, Object.values(NAF_HEBERGEMENT).flat()).n : null,
      resto:aActivites() ? compter(c.code, NAF_RESTAURATION).n : null}; })
    .filter(c => c.lits || c.sal || c.decl || c.resto).sort((a, b) => b.lits - a.lits || b.sal - a.sal);
  const L = H.filter(x => !typeChoisi || x.type === typeChoisi).sort((a, b) => (b.capacite || 0) - (a.capacite || 0));

  h.innerHTML = `
    <div class="tete-page"><div><h2>Tourisme</h2>
      <p class="note">Hébergements classés en étoiles (Atout France), établissements déclarés (SIRENE) et emploi salarié du tourisme (Urssaf).
        Les hébergements non classés et les locations entre particuliers échappent au classement.</p></div>
      <div class="no-print"><button class="btn" id="to-xlsx">Télécharger (Excel)</button> <button class="btn" data-imprimer>Imprimer ou enregistrer en PDF</button></div></div>
    <div class="gros">
      ${H.length ? k(nb(somme(H, "capacite")), `lits touristiques classés<br>dans ${nb(H.length)} hébergements`) : ""}
      ${hotels.length ? k(nb(hotels.length), `hôtels classés<br>${nb(somme(hotels, "chambres"))} chambres`) : ""}
      ${campings.length ? k(nb(campings.length), `campings classés<br>${nb(somme(campings, "emplacements"))} emplacements`) : ""}
      ${e ? k(nb(e.sal), `salariés du tourisme fin ${an}<br>${fmtEvol(evolution(e.serie, 5))} en cinq ans`) : ""}
      ${e && e.part != null ? k(pct(e.part, 1), `de l'emploi salarié privé${partRef != null ? `<br>contre ${pct(partRef, 1)} dans le ${esc(ref.nom)}` : ""}`) : ""}
    </div>
    <div class="deux">
      <div class="bloc"><h3>Capacité d'accueil classée par commune</h3>
        ${H.length ? barres(coms.filter(c => c.lits).map(c => ({lib:c.nom, segments:[{v:c.lits, c:C_STRUCT}], valeur:`${nb(c.lits)} <small>lits</small>`,
          bulle:`<b>${esc(c.nom)}</b><div class="l">Lits classés<b>${nb(c.lits)}</b></div><div class="l">Hébergements classés<b>${nb(c.nbHeb)}</b></div>
            <div class="l">dont hôtels<b>${nb(c.hotels)}</b></div><div class="l">dont campings<b>${nb(c.campings)}</b></div>`})))
          : `<p class="note">Hébergements classés non disponibles.</p>`}
        ${H.length ? `<h3>Par type d'hébergement</h3>${barres(types.map(t => { const l = H.filter(x => x.type === t);
          return {lib:`${t} (${l.length})`, segments:[{v:somme(l, "capacite"), c:C_EI}], valeur:`${nb(somme(l, "capacite"))} <small>lits</small>`}; }))}` : ""}</div>
      <div class="bloc"><h3>Salariés du tourisme depuis ${A[0] || ""}</h3>
        ${e ? courbes(A.map(String), [{nom:"Salariés du tourisme", c:C_STRUCT, v:e.serie}], {titre:"Salariés du tourisme par année"})
          + `<p class="note petit">Hébergement, restauration, agences de voyage et loisirs : effectifs au 31 décembre, donc hors pic saisonnier de l'été.</p>` : `<p class="note">Emploi non disponible.</p>`}
        ${aActivites() ? `<h3>Hébergements déclarés au répertoire SIRENE</h3>
          ${barres(Object.entries(NAF_HEBERGEMENT).map(([lib, codes]) => { const c = compter("", codes);
            return {lib, segments:[{v:c.n - c.ei, c:C_STRUCT}, {v:c.ei, c:C_EI}], valeur:nb(c.n),
              bulle:`<b>${esc(lib)}</b><div class="l">Établissements actifs<b>${nb(c.n)}</b></div><div class="l">dont entrepreneurs individuels<b>${nb(c.ei)}</b></div>`}; }))}
          <p class="note petit">Classés ou non${stats.complet ? ", entrepreneurs individuels en bleu" : ""}. Un loueur en meublé déclaré compte pour un établissement.</p>` : ""}</div>
    </div>
    <div class="bloc"><h3>Le tourisme commune par commune</h3>
      <div class="cadre libre"><table class="compar"><thead><tr><th>Commune</th><th class="d">Lits classés</th><th class="d">Hôtels classés</th><th class="d">Campings classés</th>
        ${aActivites() ? '<th class="d">Hébergements déclarés</th><th class="d">Restaurants et cafés</th>' : ""}<th class="d">Salariés du tourisme</th><th class="d">Part de l'emploi privé</th></tr></thead>
        <tbody>${coms.map(c => `<tr data-code="${c.code}"><td><a class="lien" href="#/communes/${c.code}">${esc(c.nom)}</a></td><td class="num d">${nb(c.lits)}</td>
          <td class="num d">${nb(c.hotels)}</td><td class="num d">${nb(c.campings)}</td>${aActivites() ? `<td class="num d">${nb(c.decl)}</td><td class="num d">${nb(c.resto)}</td>` : ""}
          <td class="num d">${nb(c.sal)}</td><td class="num d">${c.part == null ? "–" : pct(c.part, 1)}</td></tr>`).join("")}</tbody></table></div></div>
    ${H.length ? `<div class="bloc"><h3>Les ${H.length} hébergements classés</h3>
      <div class="outils no-print" style="margin:0 0 8px"><label>Type<select id="to-type"><option value="">Tous les types</option>${types.map(t =>
        `<option${t === typeChoisi ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></label></div>
      <div class="cadre libre"><table><thead><tr><th>Hébergement</th><th>Type</th><th>Classement</th><th>Commune</th><th class="d">Capacité (personnes)</th><th>Taille</th></tr></thead>
        <tbody>${L.map(x => `<tr style="cursor:default"><td>${x.site ? `<a class="lien" href="${esc(x.site)}" target="_blank" rel="noopener">${esc(x.nom)}</a>` : `<b>${esc(x.nom)}</b>`}</td>
          <td>${esc(x.type)}</td><td>${etoiles(x.etoiles)}</td><td>${esc(nomCommune(x.code_commune))}</td><td class="num d">${x.capacite == null ? "–" : nb(x.capacite)}</td><td>${unite(x)}</td></tr>`).join("")}</tbody></table></div>
      <p class="note petit">Source : Atout France, registre des hébergements classés, au ${dateLongue(tourisme.date)}.</p></div>` : ""}
    ${pied()}`;

  if ($("to-type")) $("to-type").onchange = ev => { typeChoisi = ev.target.value; const y = h.closest(".page").scrollTop; tourismeVue(h); h.closest(".page").scrollTop = y; };
  $("to-xlsx").onclick = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, feuille(coms.map(c => ({...c, part:c.part == null ? "" : Math.round(c.part * 1000) / 10})), [["nom", "Commune"], ["lits", "Lits classés"],
      ["hotels", "Hôtels classés"], ["campings", "Campings classés"], ["decl", "Hébergements déclarés"], ["resto", "Restaurants et cafés"],
      ["sal", "Salariés du tourisme"], ["part", "Part de l'emploi privé (%)"]]), "Communes");
    XLSX.utils.book_append_sheet(wb, feuille(H.map(x => ({...x, commune:nomCommune(x.code_commune)})), [["nom", "Hébergement"], ["type", "Type"], ["etoiles", "Étoiles"],
      ["adresse", "Adresse"], ["code_postal", "Code postal"], ["commune", "Commune"], ["capacite", "Capacité (personnes)"], ["chambres", "Chambres"],
      ["emplacements", "Emplacements"], ["logements", "Logements"], ["date_classement", "Date de classement"], ["site", "Site"]]), "Hébergements classés");
    XLSX.writeFile(wb, `tourisme_ncpa_${jour()}.xlsx`);
  };
}

/* Encart de la fiche commune. */
export function encartTourisme(code){
  const l = heb(code), e = emploiTouristique(code);
  if (!l.length && !(e && e.sal)) return "";
  const k = (v, lib) => `<div><b>${v}</b><span>${lib}</span></div>`;
  return `<div class="bloc"><h3>Tourisme</h3><div class="gros">
    ${l.length ? k(nb(somme(l, "capacite")), `lits classés<br>dans ${nb(l.length)} hébergement${l.length > 1 ? "s" : ""}`) : ""}
    ${e && e.sal ? k(nb(e.sal), `salariés du tourisme<br>fin ${derniereAnnee()}`) + (e.part != null ? k(pct(e.part, 1), "de l'emploi salarié privé<br>de la commune") : "") : ""}</div>
    ${l.length ? `<p class="note">${l.slice().sort((a, b) => (b.capacite || 0) - (a.capacite || 0)).slice(0, 6).map(x => `${esc(x.nom)} (${esc(x.type.toLowerCase())}${x.etoiles ? `, ${x.etoiles}★` : ""})`).join(" ; ")}${l.length > 6 ? "…" : "."}</p>` : ""}
    <p class="note petit no-print"><a class="lien" href="#/themes/tourisme">Voir le tourisme sur tout le territoire →</a></p></div>`;
}
