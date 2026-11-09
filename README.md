# Annuaire des entreprises – NCPA

Carte et liste des établissements actifs des 38 communes de NCPA (hors entrepreneurs
individuels), à partir du répertoire SIRENE de l'Insee, mises à jour chaque nuit.

## Comment ça marche

```
Chaque nuit (GitHub Actions)                 À chaque visite (Streamlit Cloud)
collecte.py ─► API SIRENE + géocodage IGN    app.py ─► lit les fichiers de data/
           └─► écrit data/*.csv ─► commit ─────────► affiche carte, liste, filtres
```

Le robot GitHub interroge l'API une fois par nuit et enregistre le résultat dans le dépôt.
L'application ne fait que lire ces fichiers : elle est rapide et ne consomme pas le quota de l'API.

| Fichier | Rôle |
|---|---|
| `app.py` | L'application Streamlit (volet de filtres, carte, liste, vues internes) |
| `carte.py` | La carte Leaflet (fond OpenFreeMap Positron, photo aérienne IGN) |
| `collecte.py` | La collecte quotidienne (API SIRENE, géocodage, journal des changements) |
| `referentiels.py` | Libellés NAF, tranches d'effectifs, types de structure, couleurs |
| `.github/workflows/maj_quotidienne.yml` | La planification nocturne |
| `data/` | Les données produites (ne pas modifier à la main) |

## Mise en ligne, pas à pas

1. **Créer le dépôt GitHub** (public ou privé) et y déposer tout le contenu de ce dossier,
   y compris les dossiers cachés `.github` et `.streamlit`.
2. **Ajouter la clé SIRENE** : dans le dépôt, *Settings › Secrets and variables › Actions ›
   New repository secret*. Nom : `INSEE_API_KEY`, valeur : votre clé du portail API de l'Insee.
3. **Lancer la première collecte** : onglet *Actions* › *Mise à jour quotidienne de l'annuaire*
   › *Run workflow*. Comptez quelques minutes. À la fin, le dossier `data/` contient les fichiers.
4. **Publier l'application** : sur share.streamlit.io, *Create app*, choisir le dépôt,
   la branche `main` et le fichier `app.py`.
5. **Définir le mot de passe interne** : dans l'application sur Streamlit Cloud,
   *Settings › Secrets*, coller :
   ```
   MOT_DE_PASSE_INTERNE = "choisissez-un-mot-de-passe"
   ```

Ensuite, tout est automatique : chaque nuit les données sont rafraîchies et l'application
les prend en compte. Si une collecte échoue, GitHub envoie un e-mail au propriétaire du dépôt.

## Vue publique et vue interne

- **Publique** : recherche, filtres, carte, fiche de chaque établissement, liste.
- **Interne** (après mot de passe, dans le volet latéral) : colonnes supplémentaires,
  exports Excel et GeoJSON (QGIS), onglet *Nouveautés* (établissements apparus ou sortis
  depuis 7 jours à 12 mois), onglet *Qualité des données*.

Le mot de passe protège ces fonctions de confort ; il ne remplace pas une vraie authentification.
Toutes les données affichées sont des données publiques (licence ouverte de l'Insee).

## Fiabilité : ce qu'il faut savoir

- **Effectifs** : SIRENE ne donne qu'une tranche (ex. 10 à 19 salariés), souvent mise à jour
  avec un ou deux ans de retard. Les cercles et le total de salariés sont des ordres de grandeur.
- **Localisation** : les coordonnées viennent de SIRENE ; à défaut, l'adresse est géocodée
  par l'IGN (uniquement si le résultat tombe dans la bonne commune). Les établissements restants
  sont listés dans *Qualité des données*.
- **Établissements actifs ≠ activité réelle** : certaines structures restent inscrites sans activité
  (SCI notamment, masquées par défaut).
- **Garde-fou** : si une nuit l'API renvoie moins de 80 % des établissements de la veille,
  la collecte s'arrête sans rien écraser. Pour passer outre (après vérification),
  relancer à la main avec `forcer` = `1`.
- **Nomenclature NAF 2025** : l'Insee prévoit de basculer SIRENE vers la nouvelle nomenclature.
  Les codes non NAF rév. 2 apparaissent en « Activité non classée » ; `referentiels.py` sera à mettre à jour.

## Tester sur son poste

```
pip install -r requirements.txt -r requirements-collecte.txt
set INSEE_API_KEY=votre_cle        (sous Windows ; export INSEE_API_KEY=... ailleurs)
python collecte.py
streamlit run app.py
```

Pour un autre EPCI : variable `EPCI_SIREN` (par défaut 200065563).
