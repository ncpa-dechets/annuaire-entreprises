/* Onglet Méthode et qualité des données. */
import {$, esc, nb, dateLongue, sirFmt, estEmployeur, estApprox, APPROX, E, meta, aPosition} from "./commun.js";

export function qualite(){
  const loc = {}; E.forEach(e => loc[e.loc] = (loc[e.loc] || 0) + 1);
  const prec = {}; E.forEach(e => { if (aPosition(e)) prec[e.prec] = (prec[e.prec] || 0) + 1; });
  const parCom = {}; E.forEach(e => { const c = parCom[e.com] ||= {n:0, emp:0, nl:0, ap:0}; c.n++; if (estEmployeur(e)) c.emp++; if (!aPosition(e)) c.nl++; else if (estApprox(e)) c.ap++; });
  const annees = {}; E.forEach(e => { const a = e.aeff || "Non renseigné"; annees[a] = (annees[a] || 0) + 1; });
  const nl = E.filter(e => !aPosition(e));
  const ap = E.filter(e => aPosition(e) && estApprox(e)).sort((a,b) => a.com.localeCompare(b.com, "fr") || a.adr.localeCompare(b.adr, "fr"));
  const pct = n => `${Math.round(100 * (n || 0) / E.length)} %`;
  const voir = e => `<a class="lien" data-voir="${esc(e.siret)}">${esc(e.nom)}</a>`;
  const t = (tete, rows) => `<div class="cadre"><table><thead><tr>${tete.map(x => `<th>${x}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
  $("q-contenu").innerHTML = `
    <h2>Méthode et qualité des données</h2>
    <p class="note">Dernière collecte le ${dateLongue(meta.date_maj)}${meta.duree_secondes ? `, en ${Math.round(meta.duree_secondes/60)} min` : ""}.</p>
    <h3>Comment lire les chiffres</h3>
    <ul class="etapes">
      <li><b>Établissement</b> : un lieu d'activité (un SIRET). Une entreprise peut en avoir plusieurs ; une entreprise dont le siège
        est ailleurs compte pour ses établissements situés sur le territoire.</li>
      <li><b>Synthèse et Communes</b> comptent tous les établissements actifs du répertoire SIRENE, SCI et structures publiques comprises.
        Les <b>entrepreneurs individuels</b> (artisans, commerçants en nom propre, professions libérales, loueurs en meublé…) n'y figurent
        que dans les comptages : ils sont ${nb(meta.nb_entrepreneurs_individuels_exclus || 0)} et restent absents de l'annuaire nominatif.</li>
      <li><b>Créations et fermetures</b> : dates de création et de fermeture des établissements dans SIRENE. Un déménagement, même dans la
        même commune, compte pour une fermeture et une création.</li>
      <li><b>Salariés du privé</b> (Urssaf) : effectifs au 31 décembre des établissements employeurs du secteur privé, par commune et
        par activité, depuis 2006. N'y figurent ni la fonction publique, ni l'agriculture (MSA), ni les particuliers employeurs, ni les
        non-salariés. La <b>spécificité</b> d'un secteur est sa part dans l'emploi local divisée par sa part dans le département.</li>
      <li><b>Salariés, toutes structures</b> : somme des tranches d'effectif déclarées à l'Insee, d'où une fourchette. C'est un ordre de grandeur, souvent
        en retard d'un à deux ans.</li>
      <li><b>Procédures collectives</b> : sauvegardes, redressements et liquidations publiés au BODACC, qui ne couvre que les entreprises
        inscrites au registre du commerce.</li>
      <li><b>Commerces et services de proximité</b> : établissements actifs comptés d'après leur code d'activité SIRENE, entrepreneurs
        individuels compris. Les établissements d'une même entreprise ou situés à la même adresse comptent pour un seul commerce
        (société d'exploitation et holding, plusieurs locaux d'une même boutique) ; en santé, chaque professionnel est compté.
        Une absence est à vérifier sur le terrain : le répertoire recense des établissements déclarés, pas des
        boutiques ouvertes, et un code d'activité peut être mal renseigné. Les distances sont mesurées entre centres de communes.</li>
      <li><b>Tourisme</b> : hébergements classés en étoiles du registre d'Atout France (les hébergements non classés et les locations
        entre particuliers n'y figurent pas) ; l'emploi touristique regroupe l'hébergement, la restauration, les agences de voyage et
        les loisirs, au 31 décembre, donc hors pic de l'été.</li>
      <li><b>Offres d'emploi</b> : offres diffusées par France Travail dont le lieu de travail est une commune du territoire.
        <b>Besoins en main-d'œuvre</b> : enquête annuelle de France Travail auprès des employeurs, publiée par bassin d'emploi.</li>
      <li><b>Habitants</b> : population municipale de l'Insee.</li>
    </ul>
    <h3>Position des établissements sur la carte</h3>
    <div class="gros">
      <div><b>${nb(E.length)}</b><span>établissements</span></div>
      <div><b>${pct(prec["Numéro"])}</b><span>placés au numéro</span></div>
      <div><b>${pct(prec["Lieu nommé"])}</b><span>placés sur un lieu nommé</span></div>
      <div><b>${pct(prec[APPROX])}</b><span>approximatifs (rue ou lieu-dit)</span></div>
      <div><b>${nb(prec["Vérifiée"] || 0)}</b><span>corrigés à la main</span></div>
      <div><b>${nb(nl.length)}</b><span>sans position</span></div>
    </div>
    <p class="note">Sources des positions : ${Object.entries(loc).filter(([k]) => k !== "Non localisé").sort((a,b) => b[1] - a[1])
      .map(([k,n]) => `${esc(k)} ${nb(n)}`).join(" · ")}. Les coordonnées SIRENE ne sont retenues telles quelles que pour les
      adresses avec numéro ; sinon la page cherche un lieu nommé (complément d'adresse), puis la position de l'Annuaire des
      entreprises si elle tombe bien près de la rue indiquée.</p>
    <h3>Corriger une position</h3>
    <ol class="etapes">
      <li>Sur la carte, faites un clic droit à l'emplacement exact, puis « Copier ».</li>
      <li>Dans le dépôt GitHub, ouvrez <code>corrections_localisation.csv</code> et cliquez sur le crayon.</li>
      <li>Ajoutez une ligne <code>SIRET,latitude,longitude,commentaire</code>, puis « Commit changes ». La correction apparaît en une à deux minutes.</li>
    </ol>
    <div class="deux">
      <div><h3>Établissements par commune</h3>${t(["Commune","Établissements","Employeurs","Approximatifs","Sans position"],
        Object.entries(parCom).sort((a,b) => b[1].n - a[1].n).map(([c,v]) => `<tr><td>${esc(c)}</td><td>${nb(v.n)}</td><td>${nb(v.emp)}</td><td>${nb(v.ap)}</td><td>${nb(v.nl)}</td></tr>`))}</div>
      <div><h3>Ancienneté de l'effectif déclaré</h3>
        <p class="note">L'effectif SIRENE est une tranche, mise à jour avec un ou deux ans de retard.</p>
        ${t(["Année","Établissements"], Object.entries(annees).sort().map(([a,n]) => `<tr><td>${esc(a)}</td><td>${nb(n)}</td></tr>`))}</div>
    </div>
    <h3>Établissements sans position (${nb(nl.length)})</h3>
    <p class="note">Adresse absente, incomplète ou introuvable. Ils figurent dans la liste mais pas sur la carte.</p>
    ${t(["Nom","Adresse","Complément","Commune","Activité","SIRET"], nl.map(e =>
      `<tr><td>${esc(e.nom)}</td><td>${esc(e.adr)}</td><td>${esc(e.cplt)}</td><td>${esc(e.com)}</td><td>${esc(e.nafl)}</td><td class="num">${sirFmt(e.siret)}</td></tr>`))}
    <h3>Positions approximatives (${nb(ap.length)})</h3>
    <p class="note">Adresse sans numéro : le point est placé dans la rue ou le lieu-dit, sans savoir où exactement.
      Sur la carte, ce sont les cercles évidés. Cliquez sur un nom pour le voir sur la carte, puis corrigez-le si besoin.</p>
    ${t(["Nom","Adresse","Complément","Commune","Activité","SIRET"], ap.map(e =>
      `<tr><td>${voir(e)}</td><td>${esc(e.adr)}</td><td>${esc(e.cplt)}</td><td>${esc(e.com)}</td><td>${esc(e.nafl)}</td><td class="num">${sirFmt(e.siret)}</td></tr>`))}`;
}
