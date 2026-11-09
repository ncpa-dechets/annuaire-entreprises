# -*- coding: utf-8 -*-
"""
Statistiques du tableau de bord (data/stats.json)
=================================================
Calculées chaque nuit par collecte.py à partir de TOUTES les réponses de l'API SIRENE :
établissements actifs et fermés, entrepreneurs individuels compris. Le fichier ne contient
que des comptages (aucun nom, aucun SIRET), ce qui permet d'y inclure les entrepreneurs
individuels, absents de l'annuaire nominatif.

Contenu de stats.json (tableaux compacts, une ligne par croisement) :
  stock : [code_commune, section, famille, établissements actifs, employeurs, effectif_min, effectif_max]
  flux  : [année, code_commune, section, indépendant (0/1), créations, fermetures]   depuis ANNEE_DEBUT
  flux_12m : [code_commune, section, indépendant (0/1), créations, fermetures]       12 derniers mois
  ages  : [code_commune, classe d'âge (indice de CLASSES_AGE), indépendant (0/1), établissements actifs]
  activites : [code_commune, code NAF, structures actives, entrepreneurs individuels actifs]
  proximite : catégories de commerces et services de proximité (référentiels.PROXIMITE)

À la main, sans clé SIRENE (version provisoire, d'après l'annuaire déjà collecté : ni entrepreneurs
individuels ni fermetures) :  python statistiques.py
"""
import datetime
import json
from collections import defaultdict
from pathlib import Path

from referentiels import PROXIMITE, TRANCHES, section_de_division, type_structure

FAMILLE_EI = "Entrepreneur individuel"
FAMILLES = ["Société commerciale", FAMILLE_EI, "Société civile (hors SCI)", "Société civile immobilière (SCI)",
            "Association", "Secteur public", "Autre structure privée"]
ANNEE_DEBUT = 2010
# (libellé, âge maximal en années, None = sans limite)
CLASSES_AGE = [("Moins d'1 an", 1), ("1 à 3 ans", 3), ("3 à 5 ans", 5), ("5 à 10 ans", 10),
               ("10 à 20 ans", 20), ("20 ans et plus", None)]


def _v(x):
    return "" if x is None or str(x) in ("None", "[ND]") else str(x).strip()


def periode_courante(e):
    """Période en cours d'un établissement SIRENE (celle qui n'a pas de date de fin)."""
    periodes = e.get("periodesEtablissement") or [{}]
    return next((x for x in periodes if not x.get("dateFin")), periodes[0])


def resumer(e):
    """Réduit un établissement de l'API SIRENE aux quelques champs utiles aux comptages."""
    ul = e.get("uniteLegale") or {}
    periodes = e.get("periodesEtablissement") or [{}]
    p = periode_courante(e)
    actif = p.get("etatAdministratifEtablissement") == "A"
    cj = _v(ul.get("categorieJuridiqueUniteLegale"))
    # Activité : celle de la période en cours, sinon la dernière connue (établissement fermé)
    naf, nomenc = "", ""
    for x in [p] + list(periodes):
        naf = _v(x.get("activitePrincipaleEtablissement"))
        nomenc = _v(x.get("nomenclatureActivitePrincipaleEtablissement"))
        if naf:
            break
    section = section_de_division(naf[:2]) if naf and nomenc == "NAFRev2" else "Z"
    tranche = _v(e.get("trancheEffectifsEtablissement")) or "NN"
    _, emin, emax = TRANCHES.get(tranche, TRANCHES["NN"])
    employeur = _v(p.get("caractereEmployeurEtablissement")) == "O" or (emin is not None and emin >= 1)
    return {
        "siret": _v(e.get("siret")),
        "commune": _v((e.get("adresseEtablissement") or {}).get("codeCommuneEtablissement")),
        "section": section,
        "naf": naf if nomenc == "NAFRev2" else "",
        "famille": FAMILLE_EI if cj == "1000" else type_structure(cj),
        "creation": _v(e.get("dateCreationEtablissement"))[:10],
        "fermeture": "" if actif else _v(p.get("dateDebut"))[:10],
        "actif": actif,
        "employeur": bool(actif and employeur),
        "emin": emin if actif else None,
        "emax": emax if actif else None,
    }


def _classe_age(creation, jour):
    try:
        ans = (jour - datetime.date.fromisoformat(creation)).days / 365.25
    except ValueError:
        return None
    if ans < 0:
        return None
    for i, (_, limite) in enumerate(CLASSES_AGE):
        if limite is None or ans < limite:
            return i
    return None


def calculer(resumes, communes, jour, complet=True):
    """resumes : liste de dicts produits par resumer() ; communes : [(code, nom, population ou None)] ;
    jour : date ISO de la collecte. Renvoie le contenu de stats.json."""
    aujourdhui = datetime.date.fromisoformat(jour)
    il_y_a_un_an = (aujourdhui - datetime.timedelta(days=365)).isoformat()
    codes = {c for c, _, _ in communes}
    stock = defaultdict(lambda: [0, 0, 0, 0])
    flux = defaultdict(lambda: [0, 0])
    flux12 = defaultdict(lambda: [0, 0])
    ages = defaultdict(int)
    activites = defaultdict(lambda: [0, 0])
    vus = set()
    for r in resumes:
        if r["commune"] not in codes or (r["siret"] and r["siret"] in vus):
            continue
        vus.add(r["siret"])
        com, sec, ei = r["commune"], r["section"], int(r["famille"] == FAMILLE_EI)
        if r["actif"]:
            s = stock[(com, sec, r["famille"])]
            s[0] += 1
            s[1] += int(r["employeur"])
            if r["emin"] is not None:
                s[2] += r["emin"]
                s[3] += r["emax"]
            if r.get("naf"):
                activites[(com, r["naf"])][ei] += 1
            k = _classe_age(r["creation"], aujourdhui)
            if k is not None:
                ages[(com, k, ei)] += 1
        for date, i in ((r["creation"], 0), (r["fermeture"], 1)):
            if not date or date > jour:
                continue
            if date[:4].isdigit() and int(date[:4]) >= ANNEE_DEBUT:
                flux[(int(date[:4]), com, sec, ei)][i] += 1
            if date > il_y_a_un_an:
                flux12[(com, sec, ei)][i] += 1
    return {
        "date": jour,
        "complet": bool(complet),
        "annee_debut": ANNEE_DEBUT,
        "familles": FAMILLES,
        "classes_age": [lib for lib, _ in CLASSES_AGE],
        "communes": {c: {"nom": n, "population": p} for c, n, p in sorted(communes)},
        "stock": [list(k) + v for k, v in sorted(stock.items())],
        "flux": [list(k) + v for k, v in sorted(flux.items())],
        "flux_12m": [list(k) + v for k, v in sorted(flux12.items())],
        "ages": [list(k) + [v] for k, v in sorted(ages.items())],
        "activites": [list(k) + v for k, v in sorted(activites.items())],
        "proximite": [{"cle": c, "libelle": lib, "famille": f, "codes": codes} for c, lib, f, codes in PROXIMITE],
    }


def ecrire(stats, dossier):
    with open(Path(dossier) / "stats.json", "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, separators=(",", ":"))


def communes_du_geojson(gj):
    return [(f["properties"]["code"], f["properties"]["nom"], f["properties"].get("population"))
            for f in gj["features"]]


def provisoire(dossier):
    """Statistiques d'après l'annuaire déjà collecté : établissements actifs hors entrepreneurs
    individuels, sans fermetures. Sert tant que la collecte complète n'a pas tourné."""
    import pandas as pd
    import requests
    dossier = Path(dossier)
    df = pd.read_csv(dossier / "etablissements.csv", dtype=str, keep_default_na=False)
    meta = json.loads((dossier / "meta.json").read_text(encoding="utf-8"))
    gj = json.loads((dossier / "communes.geojson").read_text(encoding="utf-8"))
    try:      # populations : absentes des anciens communes.geojson
        r = requests.get("https://geo.api.gouv.fr/communes", params={"codeEpci": meta["epci"], "fields": "code,population"}, timeout=60)
        r.raise_for_status()
        pop = {c["code"]: c.get("population") for c in r.json()}
    except Exception as e:
        print(f"populations non récupérées ({e})")
        pop = {}
    communes = [(c, n, p if p is not None else pop.get(c)) for c, n, p in communes_du_geojson(gj)]

    def entier(x):
        return int(float(x)) if x not in ("", None) else None
    resumes = [{
        "siret": r.siret, "commune": r.code_commune, "section": r.section or "Z", "naf": r.naf if r.nomenclature_naf == "NAFRev2" else "", "famille": r.type_structure,
        "creation": r.date_creation[:10], "fermeture": "", "actif": True,
        "employeur": r.employeur == "Oui" or (entier(r.effectif_min) or 0) >= 1,
        "emin": entier(r.effectif_min), "emax": entier(r.effectif_max),
    } for r in df.itertuples()]
    stats = calculer(resumes, communes, meta["date_maj"][:10], complet=False)
    ecrire(stats, dossier)
    print(f"stats.json provisoire : {len(resumes)} établissements, {len(communes)} communes")


if __name__ == "__main__":
    provisoire(Path(__file__).resolve().parent / "data")
