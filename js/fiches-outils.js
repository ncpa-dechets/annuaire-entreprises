/* Outils sans dépendance de l'atelier Fiches : lecture de l'adresse, choix et tri des listes, nom du fichier.
   Testés par tests/fiches.test.cjs. */
export const TYPES_FICHE = ["territoire", "commune", "selection", "entreprise"];
export const MAX_ENTREPRISES = 30;   // fiches entreprise par document : dirigeants et comptes sont demandés en direct
export const LISTES = {aucune:"Aucune liste", emp:"Employeurs seulement", sans_sci:"Tous, sauf les SCI", tous:"Tous les établissements"};

/* Adresse #/fiches/<type>/<a,b,c> découpée en morceaux : ["commune", "14117,14225"] -> {type, ids, tronque} */
export function lireAdresse(reste = []){
  const [type = "", brut = ""] = reste;
  if (!TYPES_FICHE.includes(type)) return {type:"", ids:[], tronque:false};
  let ids = [...new Set(String(brut).split(",").map(s => s.trim()).filter(Boolean))];
  if (type === "commune") ids = ids.filter(s => s === "toutes" || /^\d[\dAB]\d{3}$/.test(s));
  if (type === "entreprise") ids = [...new Set(ids.map(s => s.replace(/\D/g, "").slice(0, 9)).filter(s => s.length === 9))];
  if (type === "territoire" || type === "selection") ids = [];
  const tronque = type === "entreprise" && ids.length > MAX_ENTREPRISES;
  return {type, ids:tronque ? ids.slice(0, MAX_ENTREPRISES) : ids, tronque};
}

/* Établissements à lister selon le réglage choisi. */
export function filtrerListe(etabs, mode){
  if (mode === "aucune") return [];
  if (mode === "emp") return etabs.filter(e => e.emp === "Oui" || (e.emin != null && e.emin >= 1));
  if (mode === "sans_sci") return etabs.filter(e => e.tstr !== "Société civile immobilière (SCI)");
  return etabs.slice();
}

/* [[section, établissements]] : secteurs les plus fournis d'abord ; dans chacun, les plus gros effectifs puis l'ordre alphabétique. */
export function grouperParSecteur(etabs){
  const g = new Map();
  etabs.forEach(e => { const s = e.sec || "Z"; if (!g.has(s)) g.set(s, []); g.get(s).push(e); });
  const tri = (a, b) => (b.emin ?? -1) - (a.emin ?? -1) || String(a.nom).localeCompare(String(b.nom), "fr");
  return [...g].map(([s, l]) => [s, l.sort(tri)]).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}

/* Nom de fichier proposé par le navigateur à l'enregistrement : sans accent ni espace. */
export function nomFichier(...morceaux){
  return morceaux.filter(Boolean).join("_").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^\w-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 120);
}
