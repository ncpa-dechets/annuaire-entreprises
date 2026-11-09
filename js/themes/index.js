/* Onglet Thèmes : un sous-menu et une page par thème (adresse #/themes/commerces…). */
import {$, esc} from "../commun.js";
import {commerces} from "./commerces.js";
import {tourismeVue} from "./tourisme.js";
import {emploiVue} from "./emploi.js";

// [clé de l'adresse, intitulé, fonction d'affichage]
const THEMES = [["commerces", "Commerces et services", commerces], ["tourisme", "Tourisme", tourismeVue],
  ["emploi", "Emploi et recrutement", emploiVue]];

export function themes(param){
  const t = THEMES.find(x => x[0] === param) || THEMES[0];
  $("th-menu").innerHTML = THEMES.map(([k, lib]) => `<a href="#/themes/${k}"${k === t[0] ? ' aria-current="page"' : ""}>${esc(lib)}</a>`).join("");
  t[2]($("th-contenu"));
  $("th-contenu").closest(".page").scrollTop = 0;
}
