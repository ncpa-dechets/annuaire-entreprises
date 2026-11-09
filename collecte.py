# -*- coding: utf-8 -*-
"""
Collecte quotidienne de l'annuaire des entreprises
==================================================
Lancé chaque nuit par GitHub Actions (voir .github/workflows/maj_quotidienne.yml),
ou à la main :  INSEE_API_KEY=xxxx python collecte.py

Étapes :
  1. Liste et contours des communes de l'EPCI (geo.api.gouv.fr).
  2. Établissements actifs de chaque commune (API SIRENE de l'Insee, clé requise).
  3. Exclusion des entrepreneurs individuels, mise en forme (adresse, activité, effectif).
  4. Coordonnées (voir localisation.py) : SIRENE quand l'adresse a un numéro, sinon lieu nommé
     ou adresse géocodés par l'IGN, ou position vérifiée de l'Annuaire des entreprises.
  5. Comparaison avec la veille : nouveaux établissements / établissements sortis.
  6. Statistiques du tableau de bord (voir statistiques.py) : comptages par commune et par secteur,
     entrepreneurs individuels compris, créations et fermetures par année.
  7. Emploi salarié privé par commune et par activité (open data de l'Urssaf, voir urssaf.py).
  8. Écriture des fichiers dans data/ (le robot GitHub les enregistre ensuite dans le dépôt).

Sécurité : si la collecte renvoie beaucoup moins d'établissements que la veille
(panne partielle de l'API), le script s'arrête sans rien écraser.
"""
import io
import json
import os
import re
import sys
import time
import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd
import requests

from bodacc import collecter_bodacc
from localisation import localiser
from urssaf import collecter_urssaf
from tourisme import collecter_tourisme
from france_travail import collecter_bmo, collecter_offres
from statistiques import calculer, communes_du_geojson, ecrire as ecrire_stats, periode_courante, resumer
from referentiels import appliquer_corrections, DIVISIONS, SECTIONS, TRANCHES, TYPES_VOIE, section_de_division, type_structure

EPCI = os.environ.get("EPCI_SIREN", "200065563")  # Normandie-Cabourg-Pays d'Auge
DATA = Path(__file__).resolve().parent / "data"
API_SIRENE = "https://api.insee.fr/api-sirene/3.11/siret"
API_GEO = "https://geo.api.gouv.fr/communes"
URL_NAF = "https://www.insee.fr/fr/statistiques/fichier/2120875/naf2008_liste_n5.xls"
SEUIL_BAISSE = 0.80        # arrêt si moins de 80 % des établissements de la veille
JOURNAL_JOURS = 730        # historique conservé dans le journal (2 ans)

COLONNES = ["siret", "siren", "nom", "raison_sociale", "enseigne", "adresse", "complement_adresse",
            "code_postal", "commune", "code_commune", "naf", "naf_libelle", "nomenclature_naf",
            "section", "section_libelle", "division", "division_libelle",
            "tranche_effectif", "tranche_libelle", "effectif_min", "effectif_max", "annee_effectif",
            "employeur", "siege", "date_creation", "categorie_juridique", "type_structure",
            "categorie_entreprise", "ess", "lat", "lon", "localisation", "precision"]
PARIS = ZoneInfo("Europe/Paris")


def log(m):
    print(m, flush=True)


# ---------------------------------------------------------------------------
# Accès aux API
# ---------------------------------------------------------------------------
class Sirene:
    """Client minimal de l'API SIRENE, avec respect du quota (30 requêtes par minute)."""

    def __init__(self, cle):
        self.s = requests.Session()
        self.s.headers.update({"X-INSEE-Api-Key-Integration": cle, "Accept": "application/json"})
        self.dernier = 0.0

    def get(self, params):
        for tentative in range(6):
            attente = 2.1 - (time.time() - self.dernier)
            if attente > 0:
                time.sleep(attente)
            self.dernier = time.time()
            try:
                r = self.s.get(API_SIRENE, params=params, timeout=120)
            except requests.RequestException as e:
                log(f"   réseau : {e} – nouvelle tentative")
                time.sleep(10)
                continue
            if r.status_code == 200:
                return r.json()
            if r.status_code == 404:          # aucun résultat pour cette requête
                return {"header": {"curseurSuivant": params.get("curseur")}, "etablissements": []}
            if r.status_code == 429:          # quota dépassé
                log("   quota atteint, pause d'une minute")
                time.sleep(61)
                continue
            if r.status_code in (401, 403):
                raise SystemExit("Clé API SIRENE refusée (vérifier le secret INSEE_API_KEY).")
            log(f"   erreur {r.status_code} : {r.text[:200]} – nouvelle tentative")
            time.sleep(15)
        raise RuntimeError("L'API SIRENE ne répond pas correctement, collecte interrompue.")

    def etablissements_actifs(self, code_commune):
        """Tous les établissements ayant une période active dans la commune (le tri fin se fait ensuite)."""
        q = f"codeCommuneEtablissement:{code_commune} AND periode(etatAdministratifEtablissement:A)"
        curseur, tout = "*", []
        while True:
            d = self.get({"q": q, "nombre": 1000, "curseur": curseur})
            lot = d.get("etablissements") or []
            tout += lot
            suivant = (d.get("header") or {}).get("curseurSuivant")
            if not lot or not suivant or suivant == curseur:
                return tout
            curseur = suivant


def communes_epci(epci):
    r = requests.get(API_GEO, params={"codeEpci": epci, "format": "geojson", "geometry": "contour",
                                      "fields": "nom,code,codesPostaux,population"}, timeout=60)
    r.raise_for_status()
    gj = r.json()
    if not gj.get("features"):
        raise SystemExit(f"Aucune commune trouvée pour l'EPCI {epci}.")
    return gj


def libelles_naf():
    """Libellés des sous-classes NAF (ex. 47.11F). Téléchargés une fois puis gardés dans data/."""
    f = DATA / "naf_libelles.csv"
    if f.exists():
        return dict(pd.read_csv(f, dtype=str).values)
    try:
        r = requests.get(URL_NAF, timeout=60)
        r.raise_for_status()
        x = pd.read_excel(io.BytesIO(r.content), header=None, dtype=str)
        lib = {}
        for code, texte in zip(x.iloc[:, 0], x.iloc[:, 1]):
            code = str(code).strip()
            if re.fullmatch(r"\d{2}\.\d{2}[A-Z]", code):
                lib[code] = str(texte).strip()
        if len(lib) > 600:
            pd.DataFrame(sorted(lib.items()), columns=["code", "libelle"]).to_csv(f, index=False)
            return lib
        log("   ⚠ fichier NAF de l'Insee inattendu, libellés des divisions utilisés à la place")
    except Exception as e:
        log(f"   ⚠ libellés NAF non téléchargés ({e}), libellés des divisions utilisés à la place")
    return {}


# ---------------------------------------------------------------------------
# Mise en forme d'un établissement
# ---------------------------------------------------------------------------
def _v(x):
    return "" if x is None or str(x) in ("None", "[ND]") else str(x).strip()


PETITS_MOTS = {"de", "du", "des", "la", "le", "les", "l", "d", "sur", "sous", "en", "aux", "au", "et", "a", "à"}


def casse_fr(t, debut=True):
    """« DE LA MER » -> « De la Mer » (« de la Mer » si debut=False), « DIVES-SUR-MER » -> « Dives-sur-Mer »."""
    def mot(m, premier):
        parties = m.lower().split("-")
        return "-".join(p if (p in PETITS_MOTS and not (premier and k == 0)) else p[:1].upper() + p[1:]
                        for k, p in enumerate(parties))
    morceaux = re.split(r"(\s+|')", t)
    sortie, premier = [], debut
    for m in morceaux:
        if not m.strip() or m == "'":
            sortie.append(m)
            continue
        sortie.append(mot(m, premier))
        premier = False
    return "".join(sortie)


def adresse_lisible(a):
    num = " ".join(filter(None, [_v(a.get("numeroVoieEtablissement")), _v(a.get("indiceRepetitionEtablissement"))]))
    tv = _v(a.get("typeVoieEtablissement"))
    tv = TYPES_VOIE.get(tv.upper(), tv.title()) if tv else ""
    voie = casse_fr(_v(a.get("libelleVoieEtablissement")), debut=not tv)
    if tv and voie.lower().startswith(tv.lower()):
        tv = ""                                     # évite « Rue Rue … »
    return " ".join(filter(None, [num, tv, voie])).strip()


def transformer(e, naf_lib, noms_communes=None):
    """Renvoie un dict prêt pour le CSV, ou None si l'établissement est à exclure."""
    ul = e.get("uniteLegale") or {}
    p = periode_courante(e)
    if p.get("etatAdministratifEtablissement") != "A":
        return None                                   # fermé aujourd'hui
    cj = _v(ul.get("categorieJuridiqueUniteLegale"))
    if cj == "1000":
        return None                                   # entrepreneur individuel
    a = e.get("adresseEtablissement") or {}

    raison = _v(ul.get("denominationUniteLegale")) or " ".join(
        filter(None, [_v(ul.get("prenomUsuelUniteLegale") or ul.get("prenom1UniteLegale")), _v(ul.get("nomUniteLegale"))]))
    sigle = _v(ul.get("sigleUniteLegale"))
    enseigne = _v(p.get("enseigne1Etablissement")) or _v(p.get("denominationUsuelleEtablissement"))
    nom = enseigne or _v(ul.get("denominationUsuelle1UniteLegale")) or raison or "(sans nom)"

    naf = _v(p.get("activitePrincipaleEtablissement"))
    nomenc = _v(p.get("nomenclatureActivitePrincipaleEtablissement"))
    if naf and nomenc == "NAFRev2":
        div = naf[:2]
        sec = section_de_division(div)
        lib = naf_lib.get(naf) or DIVISIONS.get(div, "")
    else:
        div, sec, lib = "", "Z", (f"Code {naf} (ancienne nomenclature {nomenc})" if naf else "")

    tranche = _v(e.get("trancheEffectifsEtablissement")) or "NN"
    t_lib, t_min, t_max = TRANCHES.get(tranche, TRANCHES["NN"])

    return {
        "siret": _v(e.get("siret")), "siren": _v(e.get("siren")),
        "nom": nom, "raison_sociale": raison + (f" ({sigle})" if sigle and sigle not in raison else ""),
        "enseigne": enseigne,
        "adresse": adresse_lisible(a), "complement_adresse": _v(a.get("complementAdresseEtablissement")),
        "code_postal": _v(a.get("codePostalEtablissement")), "commune": (noms_communes or {}).get(_v(a.get("codeCommuneEtablissement"))) or casse_fr(_v(a.get("libelleCommuneEtablissement"))),
        "code_commune": _v(a.get("codeCommuneEtablissement")),
        "naf": naf, "naf_libelle": lib, "nomenclature_naf": nomenc,
        "section": sec, "section_libelle": SECTIONS[sec], "division": div, "division_libelle": DIVISIONS.get(div, ""),
        "tranche_effectif": tranche, "tranche_libelle": t_lib,
        "effectif_min": t_min, "effectif_max": t_max, "annee_effectif": _v(e.get("anneeEffectifsEtablissement")),
        "employeur": {"O": "Oui", "N": "Non"}.get(_v(p.get("caractereEmployeurEtablissement")), ""),
        "siege": "Oui" if e.get("etablissementSiege") else "Non",
        "date_creation": _v(e.get("dateCreationEtablissement")),
        "categorie_juridique": cj, "type_structure": type_structure(cj),
        "categorie_entreprise": _v(ul.get("categorieEntreprise")),
        "ess": {"O": "Oui", "N": "Non"}.get(_v(ul.get("economieSocialeSolidaireUniteLegale")), ""),
        "_x": _v(a.get("coordonneeLambertAbscisseEtablissement")),
        "_y": _v(a.get("coordonneeLambertOrdonneeEtablissement")),
    }


# ---------------------------------------------------------------------------
# Journal des changements
# ---------------------------------------------------------------------------
def mettre_a_jour_journal(ancien, nouveau, jour):
    fj = DATA / "journal.csv"
    cols = ["date", "evenement", "siret", "nom", "commune", "code_commune", "naf_libelle", "section",
            "tranche_libelle", "type_structure"]
    journal = pd.read_csv(fj, dtype=str) if fj.exists() else pd.DataFrame(columns=cols)
    if ancien is None:
        return journal                       # premier passage : pas de comparaison possible
    a, n = set(ancien["siret"]), set(nouveau["siret"])
    entrees = nouveau[nouveau["siret"].isin(n - a)].assign(evenement="Nouvel établissement")
    sorties = ancien[ancien["siret"].isin(a - n)].assign(evenement="Établissement sorti")
    ajout = pd.concat([entrees, sorties]).assign(date=jour)[cols]
    journal = pd.concat([journal, ajout], ignore_index=True)
    limite = (datetime.date.fromisoformat(jour) - datetime.timedelta(days=JOURNAL_JOURS)).isoformat()
    journal = journal[journal["date"] >= limite].sort_values(["date", "evenement", "siret"])
    journal.to_csv(fj, index=False, lineterminator="\n")
    log(f"   journal : {len(entrees)} nouveaux, {len(sorties)} sortis")
    return journal


# ---------------------------------------------------------------------------
# Programme principal
# ---------------------------------------------------------------------------
def main():
    debut = time.time()
    cle = os.environ.get("INSEE_API_KEY", "").strip()
    if not cle:
        raise SystemExit("Variable INSEE_API_KEY absente (clé de l'API SIRENE).")
    DATA.mkdir(exist_ok=True)
    forcer = os.environ.get("FORCER", "") == "1"

    log("1. Communes de l'EPCI")
    gj = communes_epci(EPCI)
    communes = sorted((f["properties"]["code"], f["properties"]["nom"]) for f in gj["features"])
    log(f"   {len(communes)} communes")

    log("2. Établissements actifs (API SIRENE)")
    naf_lib = libelles_naf()
    api = Sirene(cle)
    brut, exclus_ei, resumes = [], 0, []
    for code, nom in communes:
        lot = api.etablissements_actifs(code)
        retenus = [t for t in (transformer(e, naf_lib, dict(communes)) for e in lot) if t]
        exclus_ei += sum(1 for e in lot if _v((e.get("uniteLegale") or {}).get("categorieJuridiqueUniteLegale")) == "1000")
        brut += retenus
        resumes += [resumer(e) for e in lot]       # actifs, fermés et entrepreneurs individuels : comptages seulement
        log(f"   {nom:<35} {len(retenus):>6} établissements retenus")
    df = pd.DataFrame(brut).drop_duplicates("siret")
    if df.empty:
        raise SystemExit("Aucun établissement récupéré, collecte interrompue.")

    fichier = DATA / "etablissements.csv"
    ancien = pd.read_csv(fichier, dtype=str, keep_default_na=False) if fichier.exists() else None
    if ancien is not None and len(df) < SEUIL_BAISSE * len(ancien) and not forcer:
        raise SystemExit(f"Seulement {len(df)} établissements contre {len(ancien)} la veille : "
                         "collecte jugée incomplète, données conservées. (FORCER=1 pour passer outre.)")

    log("3. Localisation")
    df = localiser(df, gj, DATA)

    df, n_corr = appliquer_corrections(df, DATA.parent / "corrections_localisation.csv")
    if n_corr:
        log(f"   {n_corr} localisation(s) corrigée(s) manuellement")

    log("4. Écriture des fichiers")
    df = df[COLONNES].sort_values("siret")
    df["lat"] = df["lat"].astype(float).round(6)
    df["lon"] = df["lon"].astype(float).round(6)
    df.to_csv(fichier, index=False, lineterminator="\n")
    with open(DATA / "communes.geojson", "w", encoding="utf-8") as f:
        json.dump(gj, f, ensure_ascii=False)

    maintenant = datetime.datetime.now(PARIS)
    jour = maintenant.date().isoformat()
    stats = calculer(resumes, communes_du_geojson(gj), jour)
    ecrire_stats(stats, DATA)
    log(f"   statistiques : {sum(r[3] for r in stats['stock'])} établissements actifs, entrepreneurs individuels compris")
    mettre_a_jour_journal(ancien, df.astype(str), jour)

    log("5. Annonces du BODACC")
    # Une panne du BODACC ne doit pas empêcher la mise à jour de l'annuaire : on garde alors le fichier de la veille.
    try:
        bodacc = collecter_bodacc(gj, df.astype(str), DATA, JOURNAL_JOURS)
    except Exception as e:
        log(f"   ⚠ BODACC non mis à jour aujourd'hui ({type(e).__name__} : {e}), annonces de la veille conservées")
        ancien_meta = json.loads((DATA / "meta.json").read_text(encoding="utf-8")) if (DATA / "meta.json").exists() else {}
        bodacc = ancien_meta.get("bodacc", {})

    log("6. Emploi salarié privé (Urssaf)")
    ancien_meta = json.loads((DATA / "meta.json").read_text(encoding="utf-8")) if (DATA / "meta.json").exists() else {}
    try:
        urssaf = collecter_urssaf(EPCI, communes[0][0][:2], DATA, log)
    except Exception as e:
        log(f"   ⚠ emploi Urssaf non mis à jour aujourd'hui ({type(e).__name__} : {e}), fichier précédent conservé")
        urssaf = ancien_meta.get("urssaf", {})

    log("7. Hébergements touristiques classés (Atout France)")
    try:
        tourisme = collecter_tourisme(gj, DATA, log)
    except Exception as e:
        log(f"   ⚠ tourisme non mis à jour aujourd'hui ({type(e).__name__} : {e}), fichier précédent conservé")
        tourisme = ancien_meta.get("tourisme", {})

    log("8. Emploi et recrutement (France Travail)")
    emploi = dict(ancien_meta.get("france_travail", {}))
    for cle, action in (("offres", lambda: collecter_offres([c for c, _ in communes], DATA, log)), ("bmo", lambda: collecter_bmo(DATA, log))):
        try:
            resultat = action()
            if resultat:
                emploi[cle] = resultat
        except Exception as e:
            log(f"   ⚠ {cle} non mis à jour aujourd'hui ({type(e).__name__} : {e}), fichier précédent conservé")

    meta = {
        "date_maj": maintenant.isoformat(timespec="minutes"), "epci": EPCI, "nb_communes": len(communes),
        "nb_etablissements": int(len(df)), "nb_entrepreneurs_individuels_exclus": int(exclus_ei),
        "localisation": {k: int(v) for k, v in df["localisation"].value_counts().items()},
        "precision": {(k or "Non localisé"): int(v) for k, v in df["precision"].value_counts().items()},
        "duree_secondes": round(time.time() - debut), "source": "Insee, répertoire SIRENE (API Sirene 3.11)",
        "bodacc": bodacc, "urssaf": urssaf, "tourisme": tourisme, "france_travail": emploi,
    }
    with open(DATA / "meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    log(f"Terminé : {len(df)} établissements en {meta['duree_secondes']} s")


if __name__ == "__main__":
    try:
        main()
    except SystemExit as e:
        log(f"ARRÊT : {e}")
        sys.exit(1)
