/* Démarrage et navigation entre les onglets (adresse de la forme #/communes/14117). */
import {charger, $, meta, dateLongue} from "./commun.js";
import {initAnnuaire, redimensionner, voir, filtrer} from "./annuaire.js";
import {initVie, vieEntreprises} from "./vie.js";
import {qualite} from "./qualite.js";
import {synthese} from "./synthese.js";
import {communes} from "./communes.js";
import {secteurs} from "./secteurs.js";
import {dynamique} from "./dynamique.js";
import {themes} from "./themes/index.js";
import {activerBulles} from "./graphes.js";

const ROUTES = {synthese:"v-synthese", communes:"v-communes", secteurs:"v-secteurs", dynamique:"v-bodacc", vie:"v-bodacc", themes:"v-themes", annuaire:"v-annuaire", methode:"v-qualite"};
let courante = "", annuairePret = false;

function montrer(){
  // Les ancres internes d'une page (#p-bodacc…) ne changent pas d'onglet
  if (courante && location.hash && !location.hash.startsWith("#/")) return;
  const [nom, param] = location.hash.replace(/^#\/?/, "").split("/");
  const route = ROUTES[nom] ? nom : "synthese", id = ROUTES[route];
  courante = route;
  document.body.dataset.vue = route;
  document.querySelectorAll(".onglets a").forEach(a => a.setAttribute("aria-selected", String(a.dataset.vue === id)));
  document.querySelectorAll(".vue").forEach(v => v.hidden = v.id !== id);
  if (route === "synthese") synthese();
  if (route === "communes") communes(param);
  if (route === "annuaire"){ if (annuairePret) redimensionner(); else { initAnnuaire(); annuairePret = true; } }
  if (route === "secteurs") secteurs();
  if (route === "themes") themes(param);
  if (route === "dynamique" || route === "vie"){ dynamique(); vieEntreprises(); }
  if (route === "methode" && !$("q-contenu").innerHTML) qualite();
}

function aller(route){
  if (courante !== route){ history.pushState(null, "", `#/${route}`); montrer(); }
}

function demarrer(){
  $("maj").innerHTML = `Données Insee<br>du ${dateLongue(meta.date_maj)}`;
  $("src-maj").textContent = `Mise à jour du ${dateLongue(meta.date_maj)}.`;
  initVie();
  activerBulles();
  window.addEventListener("hashchange", montrer);
  document.addEventListener("click", ev => {
    const el = ev.target.closest?.("[data-voir], [data-annuaire-commune], [data-annuaire-secteur], [data-annuaire-nafs], [data-imprimer]");
    if (!el) return;
    if (el.dataset.voir){ aller("annuaire"); voir(el.dataset.voir); }
    else if (el.dataset.annuaireCommune || el.dataset.annuaireSecteur || el.dataset.annuaireNafs){ aller("annuaire");
      filtrer({commune:el.dataset.annuaireCommune, secteur:el.dataset.annuaireSecteur, nafs:el.dataset.annuaireNafs?.split(","), libelle:el.dataset.annuaireLibelle}); }
    else window.print();
  });
  montrer();
  $("chargement").hidden = true;
}

charger().then(demarrer).catch(err => {
  console.error(err);
  $("chargement").innerHTML = location.protocol === "file:"
    ? "La page doit être ouverte depuis GitHub Pages ou un petit serveur local<br>(<code>python -m http.server</code> dans le dossier, puis http://localhost:8000)."
    : "Les données ne sont pas encore disponibles.<br>Lancez la collecte depuis l'onglet <b>Actions</b> du dépôt GitHub.";
});
