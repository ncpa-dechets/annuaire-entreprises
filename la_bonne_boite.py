# -*- coding: utf-8 -*-
"""Potentiels d'embauche La Bonne Boîte v2, rapprochés par SIRET de l'annuaire.

Authentification indépendante des Offres d'emploi, avec les mêmes secrets FT_CLIENT_*.
Contrat : GET /partenaire/labonneboite/v2/potentielEmbauche?siret=...&siret=...
Réponse : {hits, items: [{siret, hiring_potential, is_high_potential, ...}]}.
Le score est un indice transformé sur 100, pas un pourcentage de probabilité.
Une absence de résultat ne signifie pas une absence de recrutement.
"""
import datetime
import hashlib
import json
import math
import os
import re
import time
from pathlib import Path

import requests

from france_travail import _jeton

API = "https://api.francetravail.io/partenaire/labonneboite/v2/potentielEmbauche"
PORTEE = "search office api_labonneboitev2"
LOT = 50
INTERVALLE = 0.55           # moins de 2 appels par seconde, reprises comprises
DELAI_JOURS = 7
VERSION = 1


class Client:
    def __init__(self, identifiant, secret):
        self.identifiant, self.secret = identifiant, secret
        self.session = requests.Session()
        self.session.headers.update({"Accept": "application/json"})
        self.prochain = 0.0
        self.authentifier()

    def authentifier(self):
        token = _jeton(self.identifiant, self.secret, PORTEE, "La Bonne Boîte v2")
        self.session.headers["Authorization"] = f"Bearer {token}"

    def chercher(self, sirets):
        for tentative in range(4):
            time.sleep(max(0, self.prochain - time.monotonic()))
            self.prochain = time.monotonic() + INTERVALLE
            try:
                r = self.session.get(API, params=[("siret", s) for s in sirets], timeout=60)
            except requests.RequestException:
                if tentative == 3:
                    raise RuntimeError("La Bonne Boîte : service injoignable, données précédentes conservées") from None
                time.sleep(2 ** tentative)
                continue
            if r.status_code == 401 and tentative < 3:
                self.authentifier()
                continue
            if r.status_code in (414, 422) and len(sirets) > 1:
                # Adapter la taille du lot si le service impose une limite plus basse.
                milieu = len(sirets) // 2
                return self.chercher(sirets[:milieu]) + self.chercher(sirets[milieu:])
            if r.status_code == 429 or r.status_code >= 500:
                try:
                    attente = float(r.headers.get("Retry-After", 2 ** tentative))
                except (TypeError, ValueError):
                    attente = 2 ** tentative
                if tentative < 3:
                    time.sleep(min(30, max(1, attente)))
                    continue
            if r.status_code != 200:
                detail = " ; vérifier l'abonnement La Bonne Boîte v2 et les autorisations search, office, api_labonneboitev2" if r.status_code in (401, 403) else ""
                raise RuntimeError(f"La Bonne Boîte : HTTP {r.status_code}{detail}")
            try:
                data = r.json()
            except ValueError:
                raise RuntimeError("La Bonne Boîte : réponse JSON illisible") from None
            if not isinstance(data, dict) or not isinstance(data.get("items"), list):
                raise RuntimeError("La Bonne Boîte : format de réponse inattendu (items manquant)")
            if data.get("hits") is not None and str(data["hits"]) != str(len(data["items"])):
                raise RuntimeError("La Bonne Boîte : réponse incomplète (hits différent du nombre de résultats)")
            attendus = set(sirets)
            for item in data["items"]:
                if not isinstance(item, dict) or item.get("siret") not in attendus:
                    raise RuntimeError("La Bonne Boîte : résultat sans SIRET attendu")
            return data["items"]
        raise RuntimeError("La Bonne Boîte : service indisponible après plusieurs essais")

    def close(self):
        self.session.close()


def simplifier(item):
    score = item.get("hiring_potential")
    if score is not None:
        try:
            if isinstance(score, bool):
                raise ValueError
            score = float(score)
            if not math.isfinite(score) or not 0 <= score <= 100:
                raise ValueError
        except (TypeError, ValueError):
            raise RuntimeError("La Bonne Boîte : indice hors de l'intervalle 0–100") from None
    fort = item.get("is_high_potential")
    if fort is not None and not isinstance(fort, bool):
        raise RuntimeError("La Bonne Boîte : indicateur de fort potentiel invalide")
    return {"siret": item["siret"], "indice": score, "fort_potentiel": fort}


def resume(data):
    return {"date": data["date"], "interroges": data["interroges"],
            "renseignes": len(data["etablissements"]),
            "fort_potentiel": sum(e["fort_potentiel"] is True for e in data["etablissements"])}


def collecter_bonne_boite(sirets, dossier, journal=print, forcer=False):
    """Actualise le fichier une fois par semaine ou si le périmètre SIRET change.

Le fichier précédent reste intact si un lot échoue. Aucun résultat partiel n'est publié.
Seuls les indices des SIRET déjà présents dans l'annuaire sont enregistrés.
"""
    identifiant = os.environ.get("FT_CLIENT_ID", "").strip()
    secret = os.environ.get("FT_CLIENT_SECRET", "").strip()
    if not identifiant or not secret:
        journal("   La Bonne Boîte : identifiants France Travail absents, partie ignorée")
        return None
    sirets = sorted(set(str(s) for s in sirets))
    if not sirets or any(not re.fullmatch(r"\d{14}", s) for s in sirets):
        raise ValueError("La Bonne Boîte : liste de SIRET vide ou invalide")
    empreinte = hashlib.sha256("\n".join(sirets).encode()).hexdigest()
    fichier = Path(dossier) / "la_bonne_boite.json"
    aujourd_hui = datetime.date.today()
    if fichier.exists() and not forcer:
        try:
            ancien = json.loads(fichier.read_text(encoding="utf-8"))
            age = (aujourd_hui - datetime.date.fromisoformat(ancien["date"])).days
            if ancien.get("version") == VERSION and ancien.get("empreinte_sirets") == empreinte and 0 <= age < DELAI_JOURS:
                resultat = resume(ancien)
                journal(f"   La Bonne Boîte : consultation de {age} jour(s), {resultat['fort_potentiel']} établissements à fort potentiel, conservée")
                return resultat
        except (ValueError, KeyError, TypeError):
            pass

    client = Client(identifiant, secret)
    etablissements = {}
    try:
        for debut in range(0, len(sirets), LOT):
            for item in client.chercher(sirets[debut:debut + LOT]):
                e = simplifier(item)
                if e["siret"] in etablissements:
                    raise RuntimeError("La Bonne Boîte : plusieurs résultats pour un même SIRET")
                etablissements[e["siret"]] = e
            if debut % (10 * LOT) == 0 or debut + LOT >= len(sirets):
                journal(f"   La Bonne Boîte : {min(debut + LOT, len(sirets))}/{len(sirets)} SIRET interrogés")
    finally:
        client.close()
    data = {"version": VERSION, "date": aujourd_hui.isoformat(), "source": "France Travail, La Bonne Boîte v2",
            "horizon_mois": 6, "empreinte_sirets": empreinte, "interroges": len(sirets),
            "etablissements": sorted(etablissements.values(), key=lambda e: e["siret"])}
    # Remplacement atomique uniquement lorsque tous les lots ont été validés.
    temporaire = fichier.with_suffix(".json.tmp")
    try:
        temporaire.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        temporaire.replace(fichier)
    finally:
        temporaire.unlink(missing_ok=True)
    resultat = resume(data)
    journal(f"   La Bonne Boîte : {resultat['renseignes']} renseignés, {resultat['fort_potentiel']} à fort potentiel sur {len(sirets)} SIRET")
    return resultat


if __name__ == "__main__":
    import argparse
    import csv
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--forcer", action="store_true", help="Actualiser même si la consultation a moins de 7 jours")
    args = parser.parse_args()
    data = Path(__file__).resolve().parent / "data"
    with (data / "etablissements.csv").open(encoding="utf-8-sig", newline="") as f:
        sirets = [r["siret"] for r in csv.DictReader(f)]
    collecter_bonne_boite(sirets, data, forcer=args.forcer)
