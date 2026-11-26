# -*- coding: utf-8 -*-
"""Marché du travail v1 (API « stats-offres-demandes-emploi » de France Travail) : étape de découverte.

L'API publie des statistiques trimestrielles (offres OFF_1, demandeurs DE_1, tension PERSP_2…)
pour un territoire donné. La documentation ne liste pas les codes valides (types de territoire,
code de l'EPCI ou de la zone d'emploi, nomenclatures) : ils se lisent dans les référentiels de
l'API elle-même. Cette étape les interroge et les enregistre dans data/marche_travail_referentiel.json,
pour choisir ensuite les bons paramètres des indicateurs sans les deviner.

Mêmes secrets que les autres API France Travail : FT_CLIENT_ID et FT_CLIENT_SECRET.
L'application doit être abonnée à « Marché du travail v1 ».
À la main :  FT_CLIENT_ID=… FT_CLIENT_SECRET=… python marche_travail.py
"""
import datetime
import json
import os
import re
import sys
import time
from pathlib import Path

import requests

from france_travail import _jeton

API = "https://api.francetravail.io/partenaire/stats-offres-demandes-emploi/v1"
PORTEE = "api_stats-offres-demandes-emploiv1 offresetdemandesemploi"
INDICATEURS = ("OFF_1", "DE_1", "PERSP_2", "EMB_1")
# Libellés cherchés dans les référentiels de territoires.
FILTRES = ("CABOURG", "CAEN", "LISIEUX", "CALVADOS", "PAYS D'AUGE")
TYPES_UTILES = re.compile(r"EPCI|ZE|ZONE|BASSIN|BAS|DEP|COM", re.I)
DELAI_JOURS = 7
LISTES_DETAIL = ("listeTypesTerritoiresIndicateur", "listeTypesActivitesIndicateur", "listeTypesPeriodesIndicateur",
                 "listeTypesNomenclaturesIndicateur", "listeTypesValeurs", "listeTypesCracteristiqueIndicateur")


class Client:
    def __init__(self, identifiant, secret):
        self.session = requests.Session()
        self.session.headers.update({"Accept": "application/json",
                                     "Authorization": f"Bearer {_jeton(identifiant, secret, PORTEE, 'Marché du travail v1')}"})

    def get(self, chemin, **params):
        for tentative in range(4):
            r = self.session.get(f"{API}{chemin}", params=params or None, timeout=60)
            if r.status_code == 429 and tentative < 3:
                time.sleep(float(r.headers.get("Retry-After", 2)))
                continue
            break
        time.sleep(0.15)                          # 10 appels par seconde autorisés
        if r.status_code == 204:
            return None
        if r.status_code != 200:
            raise RuntimeError(f"Marché du travail {chemin} : HTTP {r.status_code} {r.text[:150]}")
        return r.json()

    def close(self):
        self.session.close()


def _liste(data, *cles):
    """Les référentiels renvoient soit une liste, soit un objet qui contient la liste."""
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for cle in cles:
            if isinstance(data.get(cle), list):
                return data[cle]
        listes = [v for v in data.values() if isinstance(v, list)]
        if len(listes) == 1 and not any(k.startswith("code") for k in data):   # enveloppe au nom inconnu
            return listes[0]
    return []


def decouvrir(client, epci, journal=print):
    resultat = {"types_territoire": [], "indicateurs": {}, "territoires": {}, "erreurs": []}

    def essayer(nom, action):
        try:
            return action()
        except Exception as e:                     # une erreur sur un référentiel n'empêche pas les autres
            resultat["erreurs"].append(f"{nom} : {type(e).__name__} : {e}")
            return None

    types = _liste(essayer("type-territoires", lambda: client.get("/referentiel/type-territoires")), "listeTypeTerritoire")
    resultat["types_territoire"] = types
    for code in INDICATEURS:
        detail = essayer(f"details-indicateurs {code}", lambda: client.get("/referentiel/details-indicateurs", codeIndicateur=code))
        details = _liste(detail, "listeDetailIndicateur") or ([detail] if isinstance(detail, dict) else [])
        resultat["indicateurs"][code] = [{k: d.get(k) for k in ("codeIndicateur", "libelleIndicateur", "disponibiliteIndicateur") + LISTES_DETAIL}
                                         for d in details if isinstance(d, dict)]

    codes_types = sorted({t.get("codeTypeTerritoire") for t in types if isinstance(t, dict) and t.get("codeTypeTerritoire")})
    for code_type in [c for c in codes_types if TYPES_UTILES.search(c)]:
        trouves = {}
        for filtre in (epci,) + FILTRES:
            lot = _liste(essayer(f"territoires {code_type} {filtre}",
                                 lambda: client.get(f"/referentiel/territoires/{code_type}", filtreTerritoire=filtre)), "listeTerritoire")
            for t in lot[:30]:
                if isinstance(t, dict) and t.get("codeTerritoire"):
                    trouves[t["codeTerritoire"]] = {k: t.get(k) for k in ("codeTerritoire", "libelleTerritoire", "codeTypeTerritoire")}
        resultat["territoires"][code_type] = sorted(trouves.values(), key=lambda t: t["codeTerritoire"])
    journal(f"   Marché du travail : {len(codes_types)} types de territoire, "
            f"{sum(len(v) for v in resultat['territoires'].values())} territoires repérés, {len(resultat['erreurs'])} erreur(s)")
    return resultat


def collecter_marche_travail(epci, dossier, journal=print, forcer=False):
    """Écrit data/marche_travail_referentiel.json (au plus une fois par semaine). None sans identifiants."""
    identifiant = os.environ.get("FT_CLIENT_ID", "").strip()
    secret = os.environ.get("FT_CLIENT_SECRET", "").strip()
    if not identifiant or not secret:
        journal("   Marché du travail : identifiants France Travail absents, partie ignorée")
        return None
    fichier = Path(dossier) / "marche_travail_referentiel.json"
    aujourd_hui = datetime.date.today()
    if fichier.exists() and not forcer:
        try:
            ancien = json.loads(fichier.read_text(encoding="utf-8"))
            if 0 <= (aujourd_hui - datetime.date.fromisoformat(ancien["date"])).days < DELAI_JOURS and not ancien.get("erreurs"):
                journal(f"   Marché du travail : référentiels du {ancien['date']} conservés")
                return {"date": ancien["date"], "etape": "decouverte"}
        except (ValueError, KeyError, TypeError):
            pass
    client = Client(identifiant, secret)
    try:
        data = decouvrir(client, epci, journal)
    finally:
        client.close()
    for erreur in data["erreurs"][:5]:
        journal(f"   ⚠ {erreur}")
    data = {"date": aujourd_hui.isoformat(), "source": "France Travail, API Marché du travail v1 (référentiels)", **data}
    with open(fichier, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    return {"date": data["date"], "etape": "decouverte", "erreurs": len(data["erreurs"])}


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    collecter_marche_travail(os.environ.get("EPCI_SIREN", "200065563"), Path(__file__).parent / "data", forcer="--forcer" in sys.argv)
