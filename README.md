# Annuaire des entreprises – NCPA

Carte et liste des établissements actifs des 38 communes de NCPA (hors entrepreneurs
individuels), d'après le répertoire SIRENE de l'Insee, mises à jour chaque nuit.
Page HTML publiée par GitHub Pages ; données collectées par GitHub Actions.

## Comment ça marche

```
Chaque nuit (GitHub Actions)                     À chaque visite (GitHub Pages)
collecte.py ─► API SIRENE + IGN + Annuaire         index.html ─► lit data/ et corrections_localisation.csv
           └─► écrit data/ ─► commit ──────────────────────► carte, filtres, liste, exports
```

| Fichier | Rôle |
|---|---|
| `index.html` | La page : annuaire (carte + liste), nouveautés, qualité des données |
| `collecte.py`, `referentiels.py` | La collecte quotidienne (API SIRENE, journal) |
| `localisation.py` | Le choix de la position de chaque établissement (voir plus bas) |
| `bodacc.py` | Les annonces du BODACC du territoire (onglet *Vie des entreprises*) |
| `.github/workflows/maj_quotidienne.yml` | La planification nocturne |
| `corrections_localisation.csv` | Vos corrections de position, à remplir à la main |
| `data/` | Données produites par le robot (ne pas modifier) |
| `.nojekyll` | Indique à GitHub Pages de publier les fichiers tels quels |

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
