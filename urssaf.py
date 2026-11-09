# -*- coding: utf-8 -*-
"""
Emploi salarié privé du territoire (data/emploi_urssaf.json)
============================================================
Source : open data de l'Urssaf, « Établissements et effectifs salariés au niveau commune x APE »
(open.urssaf.fr, sans clé). Effectifs au 31 décembre de chaque année depuis 2006, pour les
établissements employeurs du secteur privé : hors fonction publique, agriculture (MSA),
particuliers employeurs et non-salariés.

Le jeu n'est mis à jour qu'une fois par an : il n'est retéléchargé que tous les 30 jours.
En cas de panne, le fichier précédent est conservé.

Contenu du fichier :
  annees    : [2006, …]
  lignes    : [code_commune, section NAF, division, code APE, libellé APE, [établissements par année], [effectifs par année]]
  reference : effectifs et établissements du département, par division NAF (pour l'indice de spécificité)

À la main :  python urssaf.py
"""
import datetime
import json
import re
from pathlib import Path

import requests

from referentiels import section_de_division

JEU = "etablissements-et-effectifs-salaries-au-niveau-commune-x-ape-last"
API = f"https://open.urssaf.fr/api/explore/v2.1/catalog/datasets/{JEU}"
FICHIER = "emploi_urssaf.json"
DELAI_JOURS = 30


def _get(url, params=None):
    r = requests.get(url, params=params, timeout=120)
    r.raise_for_status()
    return r.json()


def _entier(x):
    try:
        return int(round(float(x)))
    except (TypeError, ValueError):
        return 0


def collecter_urssaf(epci, departement, dossier, journal=print):
    """Écrit data/emploi_urssaf.json et renvoie un court résumé pour meta.json."""
    fichier = Path(dossier) / FICHIER
    if fichier.exists():
        ancien = json.loads(fichier.read_text(encoding="utf-8"))
        age = (datetime.date.today() - datetime.date.fromisoformat(ancien["date_telechargement"])).days
        if age < DELAI_JOURS and ancien.get("epci") == epci:
            journal(f"   emploi Urssaf : fichier de {age} jour(s), conservé")
            return resume(ancien)

    info = _get(API)
    annees = sorted(int(m.group(1)) for f in info["fields"] if (m := re.fullmatch(r"effectifs_salaries_(\d{4})", f["name"])))
    if not annees:
        raise RuntimeError("années introuvables dans le jeu Urssaf")

    # Territoire : toutes les lignes commune x APE de l'EPCI
    brut = _get(f"{API}/exports/json", {"where": f'code_epci="{epci}"'})
    lignes = []
    for r in brut:
        ape = str(r.get("code_ape") or "")
        division = ape[:2]
        libelle = str(r.get("ape") or "")
        libelle = libelle[len(ape):].strip() if libelle.startswith(ape) else libelle
        etab = [_entier(r.get(f"nombre_d_etablissements_{a}")) for a in annees]
        eff = [_entier(r.get(f"effectifs_salaries_{a}")) for a in annees]
        if any(etab) or any(eff):
            lignes.append([str(r.get("code_commune") or ""), section_de_division(division), division, ape, libelle, etab, eff])
    if not lignes:
        raise RuntimeError(f"aucune ligne Urssaf pour l'EPCI {epci}")
    lignes.sort(key=lambda x: (x[0], x[3]))

    # Référence : le département, agrégé par division NAF (les 2 premiers caractères de « secteur_na88 »)
    select = "secteur_na88," + ",".join(f"sum(effectifs_salaries_{a}) as e{a},sum(nombre_d_etablissements_{a}) as n{a}" for a in annees)
    ref = _get(f"{API}/records", {"where": f'code_departement="{departement}"', "group_by": "secteur_na88", "select": select, "limit": 100})
    divisions = {}
    for r in ref.get("results", []):
        division = str(r.get("secteur_na88") or "")[:2]
        if division.isdigit():
            divisions[division] = {"eff": [_entier(r.get(f"e{a}")) for a in annees], "etab": [_entier(r.get(f"n{a}")) for a in annees]}
    nom_dep = next((str(r.get("departement")) for r in brut if r.get("departement")), departement)

    donnees = {
        "date_telechargement": datetime.date.today().isoformat(),
        "source_maj": str(info.get("metas", {}).get("default", {}).get("modified") or "")[:10],
        "epci": epci, "annees": annees, "lignes": lignes,
        "reference": {"nom": nom_dep, "code": departement, "divisions": dict(sorted(divisions.items()))},
    }
    with open(fichier, "w", encoding="utf-8") as f:
        json.dump(donnees, f, ensure_ascii=False, separators=(",", ":"))
    r = resume(donnees)
    journal(f"   emploi Urssaf : {r['effectifs']} salariés du privé fin {r['annee']}, {len(lignes)} lignes commune x activité")
    return r


def resume(d):
    return {"annee": d["annees"][-1], "effectifs": sum(x[6][-1] for x in d["lignes"]),
            "etablissements": sum(x[5][-1] for x in d["lignes"]), "source_maj": d.get("source_maj", "")}


if __name__ == "__main__":
    data = Path(__file__).resolve().parent / "data"
    meta = json.loads((data / "meta.json").read_text(encoding="utf-8"))
    gj = json.loads((data / "communes.geojson").read_text(encoding="utf-8"))
    print(collecter_urssaf(meta["epci"], gj["features"][0]["properties"]["code"][:2], data))
