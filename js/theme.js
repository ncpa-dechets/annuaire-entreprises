/* Bascule entre thème clair et sombre. Le thème initial est posé dans <head> (index.html) avant l'affichage.
   Le choix est mémorisé dans le navigateur ; sans choix, le site suit le réglage du système, y compris s'il change. */
const CLE = "theme", racine = document.documentElement, bouton = document.getElementById("btn-theme");
const systeme = matchMedia("(prefers-color-scheme: dark)");

function appliquer(t){
  racine.dataset.theme = t;
  const lib = t === "dark" ? "Passer au thème clair" : "Passer au thème sombre";
  bouton?.setAttribute("aria-label", lib); bouton?.setAttribute("title", lib);
}
const choixEnregistre = () => { try { const t = localStorage.getItem(CLE); return t === "dark" || t === "light" ? t : null; } catch(e){ return null; } };

appliquer(choixEnregistre() || (systeme.matches ? "dark" : "light"));
bouton?.addEventListener("click", () => {
  const t = racine.dataset.theme === "dark" ? "light" : "dark";
  appliquer(t);
  try { localStorage.setItem(CLE, t); } catch(e){}
});
systeme.addEventListener("change", ev => { if (!choixEnregistre()) appliquer(ev.matches ? "dark" : "light"); });
