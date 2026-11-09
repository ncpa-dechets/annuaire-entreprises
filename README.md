# Entreprises du territoire – NCPA

Tableau de bord économique des 38 communes de NCPA, d'après le répertoire SIRENE de l'Insee et le
BODACC, mis à jour chaque nuit : synthèse du territoire, comparaison et fiche de chaque commune
(imprimables), annuaire cartographique, vie des entreprises.
Page HTML publiée par GitHub Pages ; données collectées par GitHub Actions.

## Comment ça marche

```
Chaque nuit (GitHub Actions)                     À chaque visite (GitHub Pages)
collecte.py ─► API SIRENE + IGN + Annuaire         index.html ─► lit data/ et corrections_localisation.csv
           └─► écrit data/ ─► commit ──────────────────────► synthèse, communes, carte, listes, exports
```

| Fichier | Rôle |
|---|---|
| `index.html`, `css/`, `js/` | La page. Un fichier par onglet dans `js/` : `synthese.js`, `communes.js`, `annuaire.js`, `vie.js`, `qualite.js` ; `secteurs.js`, `dynamique.js`, `themes/` (commerces, tourisme, emploi) ; `commun.js` (données et outils), `stats.js`, `emploi.js`, `blocs.js` et `graphes.js` (chiffres et graphiques), `app.js` (navigation) |
| `collecte.py`, `referentiels.py` | La collecte quotidienne (API SIRENE, journal) |
| `statistiques.py` | Les comptages du tableau de bord (`data/stats.json`) |
| `urssaf.py` | L'emploi salarié privé par commune et par activité (`data/emploi_urssaf.json`) |
| `tourisme.py` | Les hébergements touristiques classés (`data/tourisme.json`) |
| `france_travail.py` | Les offres d'emploi en cours (`data/offres.json`) et l'enquête Besoins en main-d'œuvre (`data/bmo.json`) |
| `localisation.py` | Le choix de la position de chaque établissement (voir plus bas) |
| `bodacc.py` | Les annonces du BODACC du territoire (onglet *Vie des entreprises*) |
| `.github/workflows/maj_quotidienne.yml` | La planification nocturne |
| `corrections_localisation.csv` | Vos corrections de position, à remplir à la main |
| `data/` | Données produites par le robot (ne pas modifier) |
| `.nojekyll` | Indique à GitHub Pages de publier les fichiers tels quels |

## Les onglets

- **Synthèse** : chiffres clés du territoire, secteurs, carte des communes selon un indicateur au choix,
  créations et fermetures par an, principaux employeurs.
- **Communes** : tableau comparatif triable (export Excel) ; un clic ouvre la fiche d'une commune,
  dont l'adresse peut être envoyée telle quelle (`…/#/communes/14117`).
- **Secteurs** : emploi salarié privé depuis 2006 (Urssaf), évolution comparée au Calvados, poids et
  spécificité de chaque secteur ; un clic sur un secteur détaille ses activités (codes APE).
  Le périmètre peut être réduit à une commune.
- **Dynamique** : créations et fermetures par an et par secteur, taux de création, âge des
  établissements ; puis les annonces BODACC et les mouvements de l'annuaire (ancien onglet
  *Vie des entreprises*).
- **Thèmes** : trois pages.
  - *Commerces et services* : pour une vingtaine de commerces et services de proximité, les communes
    qui en ont, celles qui n'en ont pas et la commune la plus proche qui en dispose. La liste des
    catégories et de leurs codes NAF est dans `referentiels.py` (`PROXIMITE`) : on peut en ajouter.
  - *Tourisme* : hébergements classés (Atout France), hébergements déclarés (SIRENE) et emploi
    touristique (Urssaf).
  - *Emploi et recrutement* : offres en cours (France Travail) et métiers recherchés (enquête BMO).
- **Annuaire**, **Méthode et qualité** : comme avant.

Le bouton « Imprimer ou enregistrer en PDF » de la Synthèse et des fiches produit un portrait A4.

Les statistiques (`statistiques.py`) comptent tous les établissements actifs, **entrepreneurs
individuels compris** : ceux-ci n'apparaissent que dans les comptages, jamais nominativement.
Les créations et fermetures par année viennent des dates SIRENE, fermés compris, depuis 2010.
`python statistiques.py` recalcule une version provisoire à partir de l'annuaire déjà collecté,
sans clé SIRENE (sans entrepreneurs individuels ni fermetures) ; la collecte nocturne la remplace.

L'emploi (`urssaf.py`) vient de l'open data de l'Urssaf, sans clé : effectifs salariés du secteur
privé au 31 décembre, hors fonction publique, agriculture et non-salariés. Le jeu n'étant mis à
jour qu'une fois par an, il n'est retéléchargé que tous les 30 jours (`python urssaf.py` à la main,
après avoir supprimé `data/emploi_urssaf.json` pour forcer).

## Offres d'emploi : identifiants France Travail

Les offres viennent de l'API « Offres d'emploi v2 » de [francetravail.io](https://francetravail.io).
Une application y a deux valeurs : un **identifiant client** et une **clé secrète**.

1. Sur francetravail.io, vérifier que l'application est abonnée à l'API *Offres d'emploi v2*.
2. Dans le dépôt : *Settings › Secrets and variables › Actions › New repository secret*, deux fois :
   `FT_CLIENT_ID` (l'identifiant client) et `FT_CLIENT_SECRET` (la clé secrète).
3. *Actions › Mise à jour quotidienne › Run workflow*. Le journal indique le nombre d'offres trouvées.

Sans ces secrets, la collecte fonctionne normalement et la page signale que les offres ne sont
pas disponibles. L'enquête Besoins en main-d'œuvre ne demande aucune clé ; ses bassins d'emploi
se règlent par la variable `BMO_BASSINS` de `france_travail.py` (par défaut Caen et Lisieux).

## Passer de la version Streamlit à cette version

1. Dans le dépôt, **supprimer** : `app.py`, `carte.py`, `requirements.txt`, le dossier `.streamlit`.
2. **Ajouter** `index.html` et `.nojekyll` ; **remplacer** `README.md`.
   Ne pas toucher à `data/`, `collecte.py`, `referentiels.py`, au workflow ni aux corrections.
3. *Settings › Pages* : Source « Deploy from a branch », branche `main`, dossier `/ (root)`, *Save*.
   L'adresse de la page s'affiche après une à deux minutes.
4. Supprimer l'application sur share.streamlit.io (*Manage app › Delete*), devenue inutile.

GitHub Pages gratuit demande un dépôt public. Les données étant publiques, ce n'est pas gênant ;
la clé SIRENE reste protégée dans les secrets du dépôt.

## Première mise en place (nouveau dépôt)

1. Déposer tout le contenu de ce dossier, y compris `.github` et `.nojekyll`.
2. *Settings › Secrets and variables › Actions › New repository secret* :
   nom `INSEE_API_KEY`, valeur : votre clé du portail API de l'Insee.
3. *Actions › Mise à jour quotidienne de l'annuaire › Run workflow* (quelques minutes la première fois).
4. Activer GitHub Pages comme ci-dessus.

## Corriger une position

1. Sur la carte, clic droit à l'emplacement exact, puis « Copier ».
2. Sur GitHub, ouvrir `corrections_localisation.csv`, cliquer sur le crayon, ajouter une ligne :
   `56210980100075,49.2812,-0.1123,Usine – position vérifiée sur la photo aérienne`
3. *Commit changes* : la correction apparaît sur la page en une à deux minutes.

## Fiabilité : ce qu'il faut savoir

- **Effectifs** : SIRENE ne donne qu'une tranche, souvent mise à jour avec retard.
  Cercles et total de salariés sont des ordres de grandeur.
- **Localisation** (`localisation.py`) : chaque établissement a une source et une précision
  (*au numéro*, *lieu nommé*, *rue ou lieu-dit*, *vérifiée*). Ordre de préférence :
  - adresse avec numéro : coordonnées SIRENE, sinon géocodage IGN au numéro ;
  - adresse sans numéro : SIRENE ne place alors le point qu'au milieu de la rue. On cherche d'abord
    le lieu nommé du complément d'adresse (camping, ZA, résidence…) dans les données IGN ;
  - puis la position de l'[Annuaire des entreprises](https://annuaire-entreprises.data.gouv.fr)
    (API Recherche d'entreprises, sans clé), **seulement si** elle tombe dans la bonne commune et
    près de la rue ou du lieu indiqué. Environ une sur quatre est écartée par ce contrôle ;
  - en dernier recours, le géocodage IGN à la rue ou au lieu-dit, jamais au centre de la commune,
    et seulement si le nom de la rue trouvée correspond à celui de l'adresse.

  Les positions approximatives apparaissent en cercles évidés sur la carte et sont listées dans
  l'onglet *Qualité des données*. Les réponses des services sont gardées en cache dans `data/`
  (`geocodage_cache.csv`, `lieux_cache.csv`, `annuaire_cache.csv`). Celles de l'Annuaire sont
  redemandées tous les 90 jours.
- **Fond de carte** : Positron (OpenFreeMap) par défaut, photo aérienne IGN en bascule. Si un poste
  ne peut pas afficher Positron (WebGL désactivé), la page passe automatiquement au Plan IGN.
- **BODACC** (onglet *Vie des entreprises*) : créations, immatriculations, radiations, procédures
  collectives et ventes de fonds publiées au BODACC (API de la DILA, sans clé), sur 2 ans. N'y
  figurent que les entreprises inscrites au registre du commerce : pas les associations ni la
  plupart des artisans. Les annonces paraissent quelques jours à quelques semaines après l'acte,
  et une même procédure collective en produit plusieurs (ouverture, état des créances, clôture…).
  Les commerçants en nom propre sont inclus, avec une case pour les masquer ; les SCI sont
  masquées par défaut. L'effectif (tranche Insee) vient des établissements du territoire si
  l'entreprise est dans l'annuaire, sinon du dernier effectif connu de l'entreprise, même fermée
  (API Recherche d'entreprises, gardé en cache dans `data/entreprises_cache.csv`, 90 jours).
  Un guide en bas de l'onglet explique chaque type d'annonce. Les rectificatifs
  remplacent l'annonce d'origine, les annulations la retirent. Si le BODACC ne répond pas une nuit,
  les annonces de la veille sont conservées et l'annuaire est mis à jour normalement.
- **Garde-fou** : si une nuit l'API renvoie moins de 80 % des établissements de la veille,
  rien n'est écrasé. Pour passer outre, relancer le workflow à la main avec `forcer` = `1`.

## Tester sur son poste

La page lit des fichiers : elle ne fonctionne pas en double-cliquant dessus.
Dans le dossier : `python -m http.server`, puis ouvrir http://localhost:8000.
