# -*- coding: utf-8 -*-
"""
Annonces du BODACC sur le territoire
====================================
Créations, immatriculations, radiations, procédures collectives et ventes de fonds publiées
au Bulletin officiel des annonces civiles et commerciales (API Opendatasoft de la DILA, sans clé).

Chaque nuit, on redemande les 10 derniers jours (24 mois au premier passage), on fusionne avec
data/bodacc.csv et on garde 2 ans d'historique. Un avis rectificatif remplace l'annonce qu'il
corrige ; un avis d'annulation la supprime.

Une annonce est gardée si sa ville est une commune de l'EPCI, ou si son SIREN est dans l'annuaire
(les codes postaux du territoire couvrent aussi des communes voisines).
"""
import datetime
import json
import time

import pandas as pd
import requests

from localisation import mots

API_BODACC = ("https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/"
              "annonces-commerciales/exports/json")
API_COMMUNES_DELEGUEES = "https://geo.api.gouv.fr/communes_associees_deleguees"
FAMILLES = ("creation", "immatriculation", "radiation", "collective", "vente")
RECOUVREMENT = 10            # jours redemandés à chaque passage (annonces publiées en retard, rectificatifs)
PREMIER_PASSAGE = 730        # jours collectés la première fois
COLONNES = ["id", "date", "famille", "evenement", "detail", "nom", "siren", "forme_juridique", "personne_physique",
            "activite", "commune", "code_commune", "code_postal", "type_avis", "url"]

CREATION, IMMAT, RADIATION, VENTE = "Création", "Immatriculation", "Radiation", "Vente de fonds"
OUVERTURE, LIQUIDATION, PLAN = "Ouverture de sauvegarde ou de redressement", "Liquidation judiciaire", "Plan de redressement ou de sauvegarde"
CLOTURE, SUIVI = "Clôture de procédure", "Suivi de procédure"


def log(m):
    print(m, flush=True)


# ---------------------------------------------------------------------------
# Lecture d'une annonce
# ---------------------------------------------------------------------------
def _json(v):
    if isinstance(v, (dict, list)):
        return v
    try:
        return json.loads(v) if v else {}
    except (TypeError, ValueError):
        return {}


def _liste(v):
    return v if isinstance(v, list) else ([v] if v else [])


def _texte(v):
    """Texte lisible d'un champ qui peut être une chaîne, un dict ou une liste."""
    if isinstance(v, dict):
        return " ; ".join(filter(None, (_texte(x) for x in v.values())))
    if isinstance(v, list):
        return " ; ".join(filter(None, (_texte(x) for x in v)))
    return str(v or "").strip()


def _court(t, n=300):
    t = " ".join(str(t or "").split())
    return t if len(t) <= n else t[:n - 1].rstrip() + "…"


def evenement_procedure(nature):
    """Catégorie d'un jugement de procédure collective, d'après sa nature."""
    n = nature.lower()
    if "créance" in n or "creance" in n or "état des" in n:
        return SUIVI                         # « Liste des créances nées après le jugement d'ouverture… »
    if "clôture" in n or "cloture" in n:
        return CLOTURE
    if "liquidation" in n:
        return LIQUIDATION                   # ouverture, conversion, résolution du plan et liquidation
    if ("ouverture" in n or "conversion" in n) and ("redressement" in n or "sauvegarde" in n):
        return OUVERTURE
    if "plan" in n:
        return PLAN
    return SUIVI


def id_precedent(r):
    """Identifiant de l'annonce visée par un rectificatif ou une annulation (ex. « B202602061701 »)."""
    p = _json(r.get("parutionavisprecedent"))
    pub, num, ann = str(p.get("nomPublication", "")), p.get("numeroParution"), p.get("numeroAnnonce")
    if not (pub and num and ann):
        return ""
    return f"{pub.strip()[-1:]}{num}{ann}"


def lire_annonce(r):
    fam = r.get("familleavis", "")
    personnes = _liste(_json(r.get("listepersonnes")).get("personne"))
    p = personnes[0] if personnes else {}
    etabs = _liste(_json(r.get("listeetablissements")).get("etablissement"))
    e = etabs[0] if etabs else {}
    acte = _json(r.get("acte"))
    pp = p.get("typePersonne") == "pp"
    registre = [x for x in _liste(r.get("registre")) if str(x).isdigit() and len(str(x)) == 9]

    if fam == "creation":
        evt = CREATION
        detail = _texte((acte.get("creation") or {}).get("categorieCreation")) or _texte(acte.get("descriptif"))
    elif fam == "immatriculation":
        evt = IMMAT
        detail = _texte((acte.get("immatriculation") or {}).get("categorieImmatriculation")) or _texte(acte.get("descriptif"))
    elif fam == "radiation":
        evt, detail = RADIATION, _texte(_json(r.get("radiationaurcs")))
    elif fam == "vente":
        evt = VENTE
        prec = _liste(_json(r.get("listeprecedentproprietaire")).get("personne"))
        ancien = (prec[0].get("denomination") or " ".join(filter(None, [prec[0].get("prenom"), prec[0].get("nom")]))) if prec else ""
        detail = "; ".join(filter(None, [_texte(e.get("origineFonds")), f"précédent propriétaire : {ancien}" if ancien else ""]))
    else:
        j = _json(r.get("jugement"))
        nature = _texte(j.get("nature"))
        evt = evenement_procedure(nature)
        date_j = str(j.get("date") or "")[:10]
        detail = nature + (f" du {'/'.join(reversed(date_j.split('-')))}" if date_j else "")
        if j.get("complementJugement"):
            detail += ". " + _texte(j["complementJugement"])

    return {
        "id": r.get("id", ""), "date": str(r.get("dateparution", ""))[:10], "famille": fam, "evenement": evt,
        "detail": _court(detail), "nom": _court(r.get("commercant"), 150), "siren": ";".join(dict.fromkeys(registre)),
        "forme_juridique": "Personne physique" if pp else _texte(p.get("formeJuridique")),
        "personne_physique": "Oui" if pp else "Non",
        "activite": _court(_texte(e.get("activite")) or _texte(p.get("activite")), 200),
        "_ville": str(r.get("ville") or ""), "code_postal": str(r.get("cp") or ""),
        "type_avis": {"annonce": "Avis initial", "rectificatif": "Rectificatif"}.get(r.get("typeavis"), r.get("typeavis_lib", "")),
        "url": r.get("url_complete", ""), "_precedent": id_precedent(r) if r.get("typeavis") != "annonce" else "",
    }


# ---------------------------------------------------------------------------
# Collecte
# ---------------------------------------------------------------------------
def _cle_commune(nom):
    return " ".join("saint" if m == "st" else "sainte" if m == "ste" else m for m in mots(nom))


def _exporter(where):
    for essai in range(3):
        try:
            r = requests.get(API_BODACC, params={"where": where}, timeout=180)
            if r.status_code == 200:
                return r.json()
            log(f"   BODACC : erreur {r.status_code} {r.text[:150]}")
        except (requests.RequestException, ValueError) as e:
            log(f"   BODACC : {e}")
        time.sleep(10 * (essai + 1))
    raise RuntimeError("API BODACC indisponible")


def collecter_bodacc(gj, etablissements, data, jours_historique=730):
    """Met à jour data/bodacc.csv. `etablissements` : le tableau de l'annuaire (siren, siret, siege, commune…)."""
    fichier = data / "bodacc.csv"
    ancien = pd.read_csv(fichier, dtype=str, keep_default_na=False) if fichier.exists() else pd.DataFrame(columns=COLONNES)
    aujourd_hui = datetime.date.today()
    depuis = (datetime.date.fromisoformat(ancien["date"].max()) - datetime.timedelta(days=RECOUVREMENT)) \
        if len(ancien) else aujourd_hui - datetime.timedelta(days=PREMIER_PASSAGE)

    communes = {_cle_commune(f["properties"]["nom"]): (f["properties"]["nom"], f["properties"]["code"]) for f in gj["features"]}
    deps = sorted({f["properties"]["code"][:3 if f["properties"]["code"].startswith("97") else 2] for f in gj["features"]})
    # Anciennes communes associées ou déléguées (« Saint-Aubin-Lébizay ») rattachées à une commune de l'EPCI
    par_code = {code: (nom, code) for nom, code in communes.values()}
    try:
        for dep in deps:
            r = requests.get(API_COMMUNES_DELEGUEES, params={"codeDepartement": dep, "fields": "nom,chefLieu"}, timeout=60)
            r.raise_for_status()
            for c in r.json():
                if c.get("chefLieu") in par_code:
                    communes.setdefault(_cle_commune(c["nom"]), par_code[c["chefLieu"]])
    except (requests.RequestException, ValueError) as e:
        log(f"   ⚠ communes déléguées non lues ({e}) : seules les communes actuelles sont reconnues")
    cps = sorted({c for f in gj["features"] for c in f["properties"].get("codesPostaux", [])})
    liste = lambda xs: ", ".join(f"'{x}'" for x in xs)
    base = f"numerodepartement in ({liste(deps)}) and dateparution >= date'{depuis.isoformat()}' and familleavis in ({liste(FAMILLES)})"

    brut = _exporter(f"{base} and cp in ({liste(cps)})")
    annulations = _exporter(f"{base} and typeavis = 'annulation'")   # sans ville ni code postal
    log(f"   BODACC depuis le {depuis:%d/%m/%Y} : {len(brut)} annonces sur les codes postaux, {len(annulations)} annulations")

    # Rattachement au territoire : ville de l'EPCI, sinon SIREN connu de l'annuaire (siège de préférence)
    et = etablissements.sort_values("siege", ascending=False).drop_duplicates("siren")
    par_siren = dict(zip(et["siren"], zip(et["commune"], et["code_commune"])))
    nouvelles = []
    for r in brut:
        a = lire_annonce(r)
        lieu = next((communes[k] for k in (_cle_commune(v) for v in a["_ville"].split(",")) if k in communes), None)
        if lieu is None:
            lieu = next((par_siren[s] for s in a["siren"].split(";") if s in par_siren), None)
        if lieu is None:
            continue
        a["commune"], a["code_commune"] = lieu
        nouvelles.append(a)

    df = pd.DataFrame(nouvelles, columns=COLONNES + ["_precedent"])
    remplaces = set(df.loc[df["_precedent"] != "", "_precedent"]) | {id_precedent(r) for r in annulations}
    tout = pd.concat([ancien[COLONNES], df[COLONNES]], ignore_index=True).drop_duplicates("id", keep="last")
    avant = len(tout)
    tout = tout[~tout["id"].isin(remplaces - {""})]
    limite = (aujourd_hui - datetime.timedelta(days=jours_historique)).isoformat()
    tout = tout[tout["date"] >= limite].sort_values(["date", "id"], ascending=False)
    tout.to_csv(fichier, index=False, lineterminator="\n")
    log(f"   BODACC : {len(df)} annonces du territoire lues, {avant - len(tout)} retirées "
        f"(rectifiées, annulées ou trop anciennes), {len(tout)} conservées")
    return {"date_max": tout["date"].max() if len(tout) else "", "nb_annonces": int(len(tout)),
            "par_evenement": {k: int(v) for k, v in tout["evenement"].value_counts().items()}}
