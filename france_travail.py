# -*- coding: utf-8 -*-
"""
Emploi et recrutement (data/offres.json et data/bmo.json)
=========================================================
1. Offres d'emploi en cours sur le territoire : API « Offres d'emploi v2 » de France Travail
   (francetravail.io). Elle demande les identifiants d'une application, à fournir dans deux
   variables d'environnement (secrets GitHub) : FT_CLIENT_ID et FT_CLIENT_SECRET.
   L'application doit être abonnée à l'API « Offres d'emploi v2 ».
   Sans identifiants, cette partie est simplement ignorée.
2. Métiers recherchés et difficultés de recrutement : enquête annuelle Besoins en main-d'œuvre
   (BMO) de France Travail, fichier public sans clé, par bassin d'emploi.
   Bassins retenus : variable BMO_BASSINS (par défaut CAEN et LISIEUX).

À la main :  FT_CLIENT_ID=… FT_CLIENT_SECRET=… python france_travail.py
"""
import datetime
import io
import json
import os
import time
from pathlib import Path

import requests

URLS_JETON = ["https://authentification-partenaire.francetravail.io/connexion/oauth2/access_token?realm=%2Fpartenaire",
              "https://francetravail.io/connexion/oauth2/access_token?realm=%2Fpartenaire",
              "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire"]
API_OFFRES = "https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search"
PORTEE = "api_offresdemploiv2 o2dsoffre"
PAGE = 150                 # maximum autorisé par appel
HISTORIQUE_JOURS = 730

JEU_BMO = "561fa564c751df4f2acdbb48"       # « Enquête Besoins en Main d'Oeuvre (BMO) » sur data.gouv.fr
BMO_SECOURS = "https://www.francetravail.org/files/live/sites/peorg/files/documents/Statistiques-et-analyses/Open-data/BMO/Base-open-data-BMO-2026.xlsx"
BMO_DELAI_JOURS = 30


# ---------------------------------------------------------------------------
# Offres d'emploi
# ---------------------------------------------------------------------------
def _jeton(identifiant, secret, portee=PORTEE, nom_api="Offres d'emploi v2"):
    erreur = None
    for url in URLS_JETON:
        try:
            r = requests.post(url, data={"grant_type": "client_credentials", "client_id": identifiant,
                                         "client_secret": secret, "scope": portee},
                              headers={"Content-Type": "application/x-www-form-urlencoded"}, timeout=60)
            if r.status_code == 200:
                return r.json()["access_token"]
            erreur = f"{r.status_code} {r.text[:150]}"
        except requests.RequestException as e:
            erreur = str(e)
    raise RuntimeError(f"identification France Travail refusée ({erreur}) : vérifier FT_CLIENT_ID, FT_CLIENT_SECRET "
                       f"et l'abonnement de l'application à l'API {nom_api} (autorisations : {portee})")


def _offres_commune(session, code):
    """Toutes les offres dont le lieu de travail est la commune (code Insee)."""
    tout, debut = [], 0
    while debut < 3000:
        for tentative in range(4):
            r = session.get(API_OFFRES, params={"commune": code, "distance": 0, "range": f"{debut}-{debut + PAGE - 1}"}, timeout=60)
            if r.status_code != 429:
                break
            time.sleep(float(r.headers.get("Retry-After", 2)))
        if r.status_code == 204:
            break
        if r.status_code not in (200, 206):
            raise RuntimeError(f"API Offres d'emploi : {r.status_code} {r.text[:150]}")
        lot = r.json().get("resultats") or []
        tout += lot
        if r.status_code == 200 or len(lot) < PAGE:
            break
        debut += PAGE
        time.sleep(0.3)
    time.sleep(0.3)
    return tout


def _simplifier(o):
    lieu = o.get("lieuTravail") or {}
    return {
        "id": o.get("id"), "intitule": o.get("intitule") or "",
        "rome": o.get("romeCode") or "", "metier": o.get("romeLibelle") or o.get("appellationlibelle") or "",
        "code_commune": lieu.get("commune") or "",
        "contrat": o.get("typeContrat") or "", "contrat_libelle": o.get("typeContratLibelle") or "",
        "duree": o.get("dureeTravailLibelleConverti") or "", "alternance": bool(o.get("alternance")),
        "experience": o.get("experienceLibelle") or "",
        "secteur": o.get("secteurActiviteLibelle") or "", "naf": o.get("codeNAF") or "",
        "entreprise": (o.get("entreprise") or {}).get("nom") or "",
        "postes": o.get("nombrePostes") or 1,
        "date": (o.get("dateCreation") or "")[:10],
        "url": (o.get("origineOffre") or {}).get("urlOrigine") or "",
    }


def collecter_offres(codes_communes, dossier, journal=print):
    """Écrit data/offres.json. Renvoie un résumé, ou None si les identifiants sont absents."""
    identifiant = os.environ.get("FT_CLIENT_ID", "").strip()
    secret = os.environ.get("FT_CLIENT_SECRET", "").strip()
    if not identifiant or not secret:
        journal("   offres d'emploi : identifiants France Travail absents (FT_CLIENT_ID, FT_CLIENT_SECRET), partie ignorée")
        return None
    fichier = Path(dossier) / "offres.json"
    ancien = json.loads(fichier.read_text(encoding="utf-8")) if fichier.exists() else {}

    session = requests.Session()
    session.headers.update({"Authorization": f"Bearer {_jeton(identifiant, secret)}", "Accept": "application/json"})
    codes, offres = set(codes_communes), {}
    for code in sorted(codes):
        for o in _offres_commune(session, code):
            s = _simplifier(o)
            if s["id"] and s["code_commune"] in codes:
                offres[s["id"]] = s
    liste = sorted(offres.values(), key=lambda o: (o["date"], o["id"]), reverse=True)

    jour = datetime.date.today().isoformat()
    limite = (datetime.date.today() - datetime.timedelta(days=HISTORIQUE_JOURS)).isoformat()
    historique = [h for h in ancien.get("historique", []) if limite <= h[0] < jour]
    historique.append([jour, len(liste), sum(o["postes"] for o in liste)])
    with open(fichier, "w", encoding="utf-8") as f:
        json.dump({"date": jour, "source": "France Travail, API Offres d'emploi v2", "offres": liste, "historique": historique},
                  f, ensure_ascii=False, separators=(",", ":"))
    journal(f"   offres d'emploi : {len(liste)} offres en cours sur le territoire")
    return {"offres": len(liste), "date": jour}


# ---------------------------------------------------------------------------
# Enquête Besoins en main-d'œuvre (BMO)
# ---------------------------------------------------------------------------
def _url_bmo():
    try:
        r = requests.get(f"https://www.data.gouv.fr/api/1/datasets/{JEU_BMO}/", timeout=60)
        r.raise_for_status()
        for res in r.json().get("resources", []):
            if str(res.get("url", "")).lower().endswith(".xlsx"):
                return res["url"]
    except Exception:
        pass
    return BMO_SECOURS


def collecter_bmo(dossier, journal=print):
    """Écrit data/bmo.json (retéléchargé tous les 30 jours : l'enquête est annuelle)."""
    import pandas as pd
    fichier = Path(dossier) / "bmo.json"
    bassins = [b.strip().upper() for b in os.environ.get("BMO_BASSINS", "CAEN,LISIEUX").split(",") if b.strip()]
    if fichier.exists():
        ancien = json.loads(fichier.read_text(encoding="utf-8"))
        age = (datetime.date.today() - datetime.date.fromisoformat(ancien["date_telechargement"])).days
        if age < BMO_DELAI_JOURS and sorted(ancien.get("bassins", {})) == sorted(bassins):
            journal(f"   BMO : fichier de {age} jour(s), conservé")
            return {"annee": ancien["annee"], "bassins": bassins}

    r = requests.get(_url_bmo(), headers={"User-Agent": "Mozilla/5.0"}, timeout=180)
    r.raise_for_status()
    classeur = pd.ExcelFile(io.BytesIO(r.content))
    feuille = next(s for s in classeur.sheet_names if s.upper().startswith("BMO"))
    df = pd.read_excel(classeur, sheet_name=feuille, dtype=str)
    col_nom = next(c for c in df.columns if c.upper().startswith("NOMBE"))
    col_code = next(c for c in df.columns if "code" in c.lower() and "tier" in c.lower())
    col_metier = next(c for c in df.columns if "nom" in c.lower() and "tier" in c.lower())

    def entier(x):
        try:
            return int(round(float(str(x).replace(",", "."))))
        except (TypeError, ValueError):
            return None            # « * » : secret statistique
    resultat = {}
    for b in bassins:
        d = df[df[col_nom].astype(str).str.strip().str.upper() == b]
        resultat[b] = sorted(([str(l[col_code]), str(l[col_metier]), str(l["Lbl_fam_met"]), entier(l["met"]), entier(l["xmet"]), entier(l["smet"])]
                              for _, l in d.iterrows()), key=lambda x: -(x[3] or 0))
    if not any(resultat.values()):
        raise RuntimeError(f"bassins introuvables dans le fichier BMO : {bassins}")
    annee = int(str(df["annee"].iloc[0])[:4])
    with open(fichier, "w", encoding="utf-8") as f:
        json.dump({"date_telechargement": datetime.date.today().isoformat(), "annee": annee,
                   "source": "France Travail, enquête Besoins en main-d'œuvre", "bassins": resultat},
                  f, ensure_ascii=False, separators=(",", ":"))
    journal(f"   BMO {annee} : " + ", ".join(f"{b} {sum(x[3] or 0 for x in v)} projets" for b, v in resultat.items()))
    return {"annee": annee, "bassins": bassins}


if __name__ == "__main__":
    data = Path(__file__).resolve().parent / "data"
    gj = json.loads((data / "communes.geojson").read_text(encoding="utf-8"))
    print(collecter_bmo(data))
    print(collecter_offres([f["properties"]["code"] for f in gj["features"]], data))
