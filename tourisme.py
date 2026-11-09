# -*- coding: utf-8 -*-
"""
Hébergements touristiques classés du territoire (data/tourisme.json)
====================================================================
Source : Atout France, registre national des hébergements classés (fichier public, mis à jour
chaque jour, sans clé). Y figurent les hôtels, campings, résidences de tourisme, villages de
vacances, parcs résidentiels de loisirs et auberges collectives qui ont demandé un classement
en étoiles. Les hébergements non classés et les meublés de tourisme n'y sont pas.

Le fichier ne donne pas le code Insee : chaque ligne est rattachée à une commune du territoire
par son code postal et son nom. En cas de panne, le fichier précédent est conservé.

À la main :  python tourisme.py
"""
import csv
import datetime
import io
import json
import re
import unicodedata
from pathlib import Path

import requests

URL = "https://data.classement.atout-france.fr/static/exportHebergementsClasses/hebergements_classes.csv"
FICHIER = "tourisme.json"
TYPES = {"HOTEL DE TOURISME": "Hôtel", "CAMPING": "Camping", "RESIDENCE DE TOURISME": "Résidence de tourisme",
         "VILLAGE DE VACANCES": "Village de vacances", "PARC RESIDENTIEL DE LOISIRS": "Parc résidentiel de loisirs",
         "AUBERGE COLLECTIVE": "Auberge collective"}


def cle(texte):
    """« Saint-Pierre-du-Jonquet » et « ST PIERRE DU JONQUET » donnent la même clé."""
    t = unicodedata.normalize("NFD", str(texte or "")).encode("ascii", "ignore").decode().upper()
    t = re.sub(r"[^A-Z0-9]+", " ", t).strip()
    t = re.sub(r"\bSTE\b", "SAINTE", re.sub(r"\bST\b", "SAINT", t))
    return t


def _entier(x):
    m = re.search(r"\d+", str(x or ""))
    return int(m.group()) if m else None


def collecter_tourisme(gj, dossier, journal=print):
    """gj : communes du territoire (GeoJSON de geo.api.gouv.fr). Écrit data/tourisme.json, renvoie un résumé."""
    communes, postaux = {}, set()
    for f in gj["features"]:
        p = f["properties"]
        communes[cle(p["nom"])] = p["code"]
        postaux.update(p.get("codesPostaux") or [])

    r = requests.get(URL, timeout=180)
    r.raise_for_status()
    texte = r.content.decode("utf-8-sig", errors="replace")
    lignes = list(csv.reader(io.StringIO(texte), delimiter=";"))
    entete = [cle(c) for c in lignes[0]]

    def col(debut):
        return next(i for i, c in enumerate(entete) if c.startswith(debut))
    c_date, c_type, c_class, c_nom, c_adr, c_cp, c_com, c_site = (col(x) for x in (
        "DATE DE CLASSEMENT", "TYPOLOGIE", "CLASSEMENT", "NOM COMMERCIAL", "ADRESSE", "CODE POSTAL", "COMMUNE", "SITE INTERNET"))
    c_cap, c_ch, c_emp, c_unit, c_log = (col(x) for x in (
        "CAPACITE D ACCUEIL", "NOMBRE DE CHAMBRES", "NOMBRE D EMPLACEMENTS", "NOMBRE D UNITES", "NOMBRE DE LOGEMENTS"))

    heb, ignores = [], []
    for l in lignes[1:]:
        if len(l) <= c_log or l[c_cp].strip() not in postaux:
            continue
        code = communes.get(cle(l[c_com]))
        if not code:
            ignores.append(f"{l[c_nom]} ({l[c_cp]} {l[c_com]})")     # même code postal, commune hors territoire
            continue
        j, m, a = (l[c_date].strip().split("/") + ["", ""])[:3]
        site = l[c_site].strip()
        heb.append({
            "type": TYPES.get(cle(l[c_type]), l[c_type].strip().capitalize()),
            "etoiles": _entier(l[c_class]), "nom": l[c_nom].strip(), "adresse": l[c_adr].strip(),
            "code_postal": l[c_cp].strip(), "code_commune": code,
            "capacite": _entier(l[c_cap]), "chambres": _entier(l[c_ch]), "emplacements": _entier(l[c_emp]),
            "logements": _entier(l[c_unit]) or _entier(l[c_log]),
            "date_classement": f"{a}-{m}-{j}" if a else "",
            "site": site if site.lower().startswith("http") else "",
        })
    if not heb:
        raise RuntimeError("aucun hébergement classé trouvé pour le territoire")
    heb.sort(key=lambda h: (h["code_commune"], h["type"], h["nom"]))
    donnees = {"date": datetime.date.today().isoformat(), "source": "Atout France, hébergements touristiques classés", "hebergements": heb}
    with open(Path(dossier) / FICHIER, "w", encoding="utf-8") as f:
        json.dump(donnees, f, ensure_ascii=False, separators=(",", ":"))
    resume = {"hebergements": len(heb), "capacite": sum(h["capacite"] or 0 for h in heb)}
    journal(f"   tourisme : {resume['hebergements']} hébergements classés, {resume['capacite']} personnes"
            + (f" ; {len(ignores)} hors territoire au même code postal" if ignores else ""))
    return resume


if __name__ == "__main__":
    data = Path(__file__).resolve().parent / "data"
    collecter_tourisme(json.loads((data / "communes.geojson").read_text(encoding="utf-8")), data)
