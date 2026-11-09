# -*- coding: utf-8 -*-
"""
Localisation des établissements
===============================
Chaque établissement reçoit une position (lat, lon), sa source (colonne « localisation »)
et sa précision (colonne « precision »). On retient la première position fiable :

  Adresse avec numéro                         Adresse sans numéro
  1. coordonnées SIRENE                       1. lieu nommé du complément d'adresse ou du nom
  2. géocodage IGN au numéro                     (camping, ZA, résidence, lieu-dit…) trouvé par l'IGN
  3. Annuaire des entreprises (vérifié)       2. Annuaire des entreprises (vérifié)
  4. lieu nommé                               3. coordonnées SIRENE (en général le milieu de la rue)
  5. géocodage IGN à la rue                   4. géocodage IGN à la rue ou au lieu-dit

« Vérifié » : la position de l'Annuaire des entreprises (API Recherche d'entreprises) n'est
retenue que si elle tombe dans la bonne commune ET près de la rue de l'adresse ou du lieu nommé.
Sans ce contrôle, environ une position sur quatre serait sur une autre rue.

Le géocodage IGN est strict : jamais de point au centre de la commune, et le nom de la rue
trouvée doit correspondre à celui de l'adresse (« Général de Gaulle » ≠ « Général de Castelnau »).

Toutes les réponses sont gardées en cache dans data/ pour ne pas refaire les requêtes chaque nuit.
"""
import datetime
import difflib
import re
import threading
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor

import pandas as pd
import requests

API_GEOCODAGE = "https://data.geopf.fr/geocodage/search"
API_INVERSE = "https://data.geopf.fr/geocodage/reverse"
API_ANNUAIRE = "https://recherche-entreprises.api.gouv.fr/search"
SCORE_MIN = 0.5
DISTANCE_VOIE = 250          # m : distance maximale entre le point et une adresse de la bonne rue
DISTANCE_LIEU = 300          # m : distance maximale entre le point et le lieu nommé
VALIDITE_ANNUAIRE = 90       # jours avant de redemander une position à l'Annuaire des entreprises
ANNUAIRE_PAR_SECONDE = 6     # l'API autorise 7 requêtes par seconde

NUMERO, LIEU, RUE, VERIFIEE = "Numéro", "Lieu nommé", "Rue ou lieu-dit", "Vérifiée"
SRC_SIRENE, SRC_ANNUAIRE, SRC_IGN, SRC_AUCUNE = "SIRENE", "Annuaire des entreprises", "Géocodage IGN", "Non localisé"


def log(m):
    print(m, flush=True)


# ---------------------------------------------------------------------------
# Comparaison des noms de voies et de lieux
# ---------------------------------------------------------------------------
PETITS = {"de", "du", "des", "la", "le", "les", "l", "d", "sur", "sous", "en", "aux", "au", "et", "a", "s"}
VOIES = {"rue", "avenue", "route", "chemin", "boulevard", "allee", "place", "impasse", "quai", "square", "sentier",
         "sente", "passage", "cours", "venelle", "ruelle", "promenade", "esplanade", "faubourg", "chaussee",
         "corniche", "montee", "descente", "traverse", "carrefour", "rond", "rocade", "villa", "cite", "residence",
         "lotissement", "hameau", "domaine", "parc", "quartier", "plateau", "plaine", "voie", "venelle"}
ABREV = {"av": "avenue", "ave": "avenue", "bd": "boulevard", "bld": "boulevard", "rte": "route", "che": "chemin",
         "ch": "chemin", "imp": "impasse", "pl": "place", "all": "allee", "res": "residence", "resid": "residence",
         "lot": "lotissement", "ham": "hameau", "sq": "square", "pass": "passage", "fg": "faubourg"}
# Mots qui ne désignent pas un lieu précis : « Camping de la Vallée » se compare sur « vallée »
GENERIQUES = {"camping", "residence", "batiment", "bat", "bt", "appartement", "appt", "apt", "escalier", "esc", "etage",
              "porte", "entree", "zac", "za", "zi", "zae", "zone", "activite", "activites", "artisanale", "industrielle",
              "commerciale", "commercial", "cial", "centre", "galerie", "marchande", "parc", "lotissement", "village",
              "vacances", "club", "site", "lieu", "dit", "lieudit", "ld", "cedex", "bp", "local", "lots", "lot"}
# Établissements dont le nom désigne souvent un lieu repérable (cherché si le complément ne donne rien)
NOMS_LIEUX = {"camping", "golf", "haras", "chateau", "manoir", "college", "lycee", "ecole", "ehpad", "mairie"}


def mots(t):
    t = unicodedata.normalize("NFD", str(t or "").lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return [ABREV.get(m, m) for m in re.findall(r"[a-z0-9]+", t)]


def voie(texte):
    """« 12 bis Avenue du Général de Gaulle » -> ("12", "avenue", ["general", "gaulle"])."""
    m, num = mots(texte), ""
    while m:
        x = re.fullmatch(r"(\d+)(bis|ter|quater|[a-z])?", m[0])
        if x:
            num = num or x.group(1)
        elif not (m[0] in ("bis", "ter", "quater") or (len(m[0]) == 1 and num)):
            break
        m = m[1:]
    typ = ""
    if m[:2] == ["lieu", "dit"]:
        typ, m = "lieu-dit", m[2:]
    elif m[:1] in (["lieudit"], ["ld"]):
        typ, m = "lieu-dit", m[1:]
    elif m[:2] in (["route", "departementale"], ["chemin", "departemental"], ["route", "nationale"]):
        typ, m = "rd", m[2:]
    elif len(m) > 1 and m[0] in ("rd", "cd", "rn", "d") and m[1].isdigit():
        typ, m = "rd", m[1:]
    elif m[:2] == ["grande", "rue"]:
        typ, m = "rue", ["grande"] + m[2:]
    elif m and m[0] in VOIES:
        typ, m = m[0], m[1:]
    return num, typ, [x for x in m if x not in PETITS]


def _proches(a, b, strict=False):
    sa, sb = set(a), set(b)
    if sa == sb:
        return True
    petit, grand = (sa, sb) if len(sa) <= len(sb) else (sb, sa)
    if not strict and petit <= grand and any(len(x) >= 4 for x in petit):
        return True
    return difflib.SequenceMatcher(None, " ".join(a), " ".join(b)).ratio() >= (0.9 if strict else 0.85)


def meme_voie(a, b):
    """Deux libellés désignent-ils la même voie ?
    SIRENE et la Base adresse nationale divergent souvent sur le type (« Avenue » / « Rue Jean Mermoz ») :
    un type différent est toléré, mais le nom doit alors être identique ou presque."""
    _, ta, ma = voie(a)
    _, tb, mb = voie(b)
    if not ma or not mb:
        return False
    return _proches(ma, mb, strict=bool(ta and tb and ta != tb))


def mots_lieu(t, commune=""):
    c = set(mots(commune))
    return [m for m in mots(t) if m not in PETITS and m not in GENERIQUES and m not in c and not m.isdigit() and len(m) > 1]


def meme_lieu(reference, nom, commune=""):
    """Le lieu « nom » (ex. « la Vallée ») correspond-il au texte de référence (ex. « CAMPING DE LA VALLEE ») ?
    Tous les mots du lieu doivent figurer dans la référence et en représenter l'essentiel."""
    a, b = mots_lieu(reference, commune), mots_lieu(nom, commune)
    if not a or not b or not any(len(x) >= 4 for x in b):
        return False
    if set(b) <= set(a):
        couverts = sum(len(x) for x in set(a) if x in b)
        return couverts >= 0.6 * sum(len(x) for x in set(a))
    return difflib.SequenceMatcher(None, " ".join(a), " ".join(b)).ratio() >= 0.85


def texte_lieu(r):
    """Texte décrivant un lieu nommé pour cet établissement : complément d'adresse, sinon nom évocateur."""
    cplt = r["complement_adresse"]
    if cplt and any(len(m) >= 4 for m in mots_lieu(cplt, r["commune"])) and not re.match(r"^\s*\d", cplt):
        return cplt
    num, typ, m = voie(r["adresse"])                 # « Domaine des Monts », « Le Haut Varais » : pas une rue
    if r["adresse"] and not num and typ in ("", "lieu-dit", "hameau", "domaine", "residence", "lotissement") \
            and tuple(m) not in CENTRE_BOURG and any(len(x) >= 4 for x in mots_lieu(r["adresse"], r["commune"])):
        return r["adresse"]
    nom = mots(r["nom"])
    if nom and nom[0] in NOMS_LIEUX and mots_lieu(r["nom"], r["commune"]):
        return r["nom"]
    return ""


# ---------------------------------------------------------------------------
# Géométrie
# ---------------------------------------------------------------------------
def _dans_anneau(x, y, anneau):
    dedans = False
    for (x1, y1), (x2, y2) in zip(anneau, anneau[1:] + anneau[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            dedans = not dedans
    return dedans


def dans_commune(la, lo, geom):
    """Point dans le contour de la commune, avec une tolérance d'environ 100 m (côte, limites)."""
    polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
    for dy, dx in [(0, 0), (.0009, 0), (-.0009, 0), (0, .0014), (0, -.0014)]:
        for p in polys:
            if _dans_anneau(lo + dx, la + dy, p[0]) and not any(_dans_anneau(lo + dx, la + dy, t) for t in p[1:]):
                return True
    return False


def emprise(gj, marge=0.02):
    xs, ys = [], []

    def parcourir(c):
        if isinstance(c[0], (int, float)):
            xs.append(c[0]); ys.append(c[1])
        else:
            for s in c:
                parcourir(s)
    for f in gj["features"]:
        parcourir(f["geometry"]["coordinates"])
    return min(xs) - marge, min(ys) - marge, max(xs) + marge, max(ys) + marge


# ---------------------------------------------------------------------------
# Accès aux services (une réponse None = échec, à retenter la nuit suivante)
# ---------------------------------------------------------------------------
class Cadence:
    """Espace les requêtes pour rester sous un nombre de requêtes par seconde, tous fils confondus."""

    def __init__(self, par_seconde):
        self.pas, self.prochain, self.verrou = 1 / par_seconde, 0.0, threading.Lock()

    def attendre(self):
        with self.verrou:
            maintenant = time.monotonic()
            t = max(self.prochain, maintenant)
            self.prochain = t + self.pas
        time.sleep(max(0.0, t - maintenant))


CADENCE_ANNUAIRE = Cadence(ANNUAIRE_PAR_SECONDE)


def _get(s, url, params, cadence=None):
    for _ in range(3):
        if cadence:
            cadence.attendre()
        try:
            r = s.get(url, params=params, timeout=20)
        except requests.RequestException:
            continue
        if r.status_code == 429:
            time.sleep(2)
            continue
        if 400 <= r.status_code < 500:
            return {}                                    # requête refusée : considérée sans résultat
        if r.status_code == 200:
            return r.json()
        time.sleep(1)
    return None


def _ign(s, q, code, index, limit):
    d = _get(s, API_GEOCODAGE, {"q": q[:190], "citycode": code, "index": index, "limit": limit})
    return None if d is None else d.get("features", [])


def _inverse(s, la, lo, index, limit=20):
    d = _get(s, API_INVERSE, {"lat": la, "lon": lo, "index": index, "limit": limit})
    return None if d is None else d.get("features", [])


def _codes(p):
    c = p.get("citycode") or []
    return [str(x) for x in (c if isinstance(c, list) else [c])]


def _resultat_adresse(feats, reference, code):
    """Meilleur résultat d'adresse dont la voie correspond à la référence (jamais le centre de la commune)."""
    num = voie(reference)[0]
    retenu = None
    for f in feats:
        p = f["properties"]
        if code not in _codes(p) or p.get("score", 0) < SCORE_MIN or p.get("type") == "municipality":
            continue
        if not meme_voie(reference, p.get("street") or p.get("name") or ""):
            continue
        lo, la = f["geometry"]["coordinates"]
        if p.get("type") == "housenumber" and num and re.match(r"\d+", str(p.get("housenumber", ""))) \
                and re.match(r"\d+", str(p["housenumber"])).group() == num:
            return la, lo, NUMERO
        if retenu is None:
            retenu = (la, lo, LIEU if p.get("type") == "locality" else RUE)
    return retenu


CENTRE_BOURG = {("bourg",): RUE, ("mairie",): LIEU}   # adresses qui désignent le centre du village


def geocoder_adresse(s, adresse, cp, commune, code):
    feats = _ign(s, f"{adresse} {cp} {commune}", code, "address", 5)
    if feats is None:
        return None
    trouve = _resultat_adresse(feats, adresse, code)
    if trouve:
        return trouve
    num, typ, m = voie(adresse)
    if not num and not typ and tuple(m) in CENTRE_BOURG:       # « Le Bourg », « Mairie » : centre de la commune
        for f in feats:
            if f["properties"].get("type") == "municipality" and code in _codes(f["properties"]):
                lo, la = f["geometry"]["coordinates"]
                return la, lo, CENTRE_BOURG[tuple(m)]
    return "", "", ""


def geocoder_lieu(s, texte, cp, commune, code):
    """Lieu nommé (camping, zone d'activités, château…) puis, à défaut, le texte lu comme une adresse."""
    feats = _ign(s, f"{texte} {commune}", code, "poi", 5)
    if feats is None:
        return None
    for f in feats:
        p = f["properties"]
        noms = [p.get("toponym")] + list(p.get("name") or [])
        if code in _codes(p) and any(meme_lieu(texte, n, commune) for n in noms if n) \
                and f["geometry"]["type"] == "Point":
            lo, la = f["geometry"]["coordinates"]
            return la, lo, LIEU
    feats = _ign(s, f"{texte} {cp} {commune}", code, "address", 3)
    if feats is None:
        return None
    return _resultat_adresse(feats, texte, code) or ("", "", "")


def coherence(s, la, lo, adresse, lieu, commune):
    """Vérifie qu'un point est près de la rue de l'adresse ou du lieu nommé.
    Renvoie NUMERO/RUE/LIEU si oui, "" si non, None si le service n'a pas répondu."""
    if not adresse and not lieu:
        return RUE                                       # rien à comparer : la vérification de commune suffit
    if adresse:
        feats = _inverse(s, la, lo, "address")
        if feats is None:
            return None
        for f in feats:
            p = f["properties"]
            if p.get("distance", 1e9) <= DISTANCE_VOIE and meme_voie(adresse, p.get("street") or p.get("name") or ""):
                return NUMERO if voie(adresse)[0] else RUE
    if lieu:
        feats = _inverse(s, la, lo, "poi")
        if feats is None:
            return None
        for f in feats:
            p = f["properties"]
            noms = [p.get("toponym")] + list(p.get("name") or [])
            if p.get("distance", 1e9) <= DISTANCE_LIEU and any(meme_lieu(lieu, n, commune) for n in noms if n):
                return LIEU
    return ""


def position_annuaire(s, siret, adresse, lieu, commune, geom):
    """Position de l'établissement dans l'Annuaire des entreprises, et résultat de sa vérification."""
    d = _get(s, API_ANNUAIRE, {"q": siret, "minimal": "true", "include": "matching_etablissements", "per_page": 1},
             CADENCE_ANNUAIRE)
    if d is None:
        return None
    for res in d.get("results") or []:
        for e in res.get("matching_etablissements") or []:
            if e.get("siret") == siret and e.get("latitude") and e.get("longitude"):
                try:
                    la, lo = round(float(e["latitude"]), 6), round(float(e["longitude"]), 6)
                except ValueError:                       # « [NON-DIFFUSIBLE] » : position non publiée
                    return "", "", ""
                if geom is None or not dans_commune(la, lo, geom):
                    return str(la), str(lo), "Hors commune"
                v = coherence(s, la, lo, adresse, lieu, commune)
                return None if v is None else (str(la), str(lo), v or "Hors rue")
    return "", "", ""


def executer(taches, fonction, nom, paralleles=6, lot=150):
    """Applique fonction(session, *arguments) à chaque tâche, en parallèle.
    Si plus de la moitié d'un lot échoue, le service est jugé indisponible : arrêt pour aujourd'hui."""
    local, vus = threading.local(), set()

    def une(item):
        cle, args = item
        if not hasattr(local, "s"):
            local.s = requests.Session()
            local.s.headers["User-Agent"] = "annuaire-entreprises-ncpa (collecte nocturne)"
        try:
            return cle, fonction(local.s, *args)
        except Exception as e:                           # erreur imprévue : signalée une fois, retentée demain
            if type(e).__name__ not in vus:
                vus.add(type(e).__name__)
                log(f"   ⚠ {nom} : {type(e).__name__} {e}")
            return cle, None

    items, res, erreurs, debut = list(taches.items()), {}, 0, time.time()
    if not items:
        return res, 0
    with ThreadPoolExecutor(paralleles) as pool:
        for k in range(0, len(items), lot):
            morceau = items[k:k + lot]
            echecs = 0
            for cle, r in pool.map(une, morceau):
                if r is None:
                    echecs += 1
                else:
                    res[cle] = r
            erreurs += echecs
            log(f"   {nom} : {k + len(morceau)}/{len(items)} ({round(time.time() - debut)} s)")
            if echecs > len(morceau) / 2:
                erreurs += len(items) - k - len(morceau)
                log(f"   ⚠ {nom} : service indisponible, arrêt pour aujourd'hui")
                break
    return res, erreurs


# ---------------------------------------------------------------------------
# Caches
# ---------------------------------------------------------------------------
def lire_cache(fichier, colonnes):
    if not fichier.exists():
        return {}
    c = pd.read_csv(fichier, dtype=str, keep_default_na=False)
    if list(c.columns) != ["cle"] + colonnes:
        log(f"   cache {fichier.name} d'un ancien format : reconstruit")
        return {}
    return {r[0]: tuple(r[1:]) for r in c.itertuples(index=False)}


def ecrire_cache(fichier, cache, colonnes):
    pd.DataFrame([(k, *v) for k, v in cache.items()], columns=["cle"] + colonnes) \
        .sort_values("cle").to_csv(fichier, index=False, lineterminator="\n")


# ---------------------------------------------------------------------------
# Programme
# ---------------------------------------------------------------------------
def localiser(df, gj, data):
    """Ajoute lat, lon, localisation et precision ; retire les colonnes de travail _x et _y."""
    from pyproj import Transformer
    tr = Transformer.from_crs(2154, 4326, always_xy=True)
    x0, y0, x1, y1 = emprise(gj)
    geoms = {f["properties"]["code"]: f["geometry"] for f in gj["features"]}
    aujourd_hui = datetime.date.today()

    lignes = df.to_dict("records")
    for r in lignes:
        r["_sirene"] = None
        try:
            lo, la = tr.transform(float(r["_x"]), float(r["_y"]))
            if x0 <= lo <= x1 and y0 <= la <= y1:
                r["_sirene"] = (la, lo)
        except (TypeError, ValueError):
            pass
        r["_num"] = bool(re.match(r"\d", r["adresse"]))
        r["_lieu"] = texte_lieu(r)
    a_traiter = [r for r in lignes if not (r["_num"] and r["_sirene"])]

    # 1. Géocodage IGN : adresse (si SIRENE n'a pas de coordonnées) et lieux nommés
    f_adr, f_lieu = data / "geocodage_cache.csv", data / "lieux_cache.csv"
    c_adr, c_lieu = lire_cache(f_adr, ["lat", "lon", "precision"]), lire_cache(f_lieu, ["lat", "lon", "precision"])
    t_adr, t_lieu = {}, {}
    for r in a_traiter:
        r["_k_adr"] = f"{r['adresse']}|{r['code_commune']}"
        r["_k_lieu"] = f"{r['_lieu']}|{r['code_commune']}"
        if r["adresse"] and not r["_sirene"] and r["_k_adr"] not in c_adr:
            t_adr[r["_k_adr"]] = (r["adresse"], r["code_postal"], r["commune"], r["code_commune"])
        if r["_lieu"] and r["_k_lieu"] not in c_lieu:
            t_lieu[r["_k_lieu"]] = (r["_lieu"], r["code_postal"], r["commune"], r["code_commune"])
    log(f"   {len(lignes) - len(a_traiter)} établissements localisés au numéro par SIRENE, {len(a_traiter)} à examiner ; "
        f"{len(t_adr)} adresses et {len(t_lieu)} lieux nouveaux à géocoder")
    res, err1 = executer(t_adr, geocoder_adresse, "géocodage des adresses")
    c_adr.update(res)
    res, err2 = executer(t_lieu, geocoder_lieu, "géocodage des lieux nommés")
    c_lieu.update(res)
    ecrire_cache(f_adr, c_adr, ["lat", "lon", "precision"])
    ecrire_cache(f_lieu, c_lieu, ["lat", "lon", "precision"])

    def pos(cache, cle):
        v = cache.get(cle)
        return (float(v[0]), float(v[1]), v[2]) if v and v[0] else None

    # 2. Annuaire des entreprises, pour ce que l'IGN n'a pas déjà localisé précisément
    f_ann = data / "annuaire_cache.csv"
    c_ann = lire_cache(f_ann, ["lat", "lon", "verification", "date"])
    t_ann = {}
    for r in a_traiter:
        r["_ign"] = pos(c_adr, r["_k_adr"]) if r["adresse"] and not r["_sirene"] else None
        r["_lieu_pos"] = pos(c_lieu, r["_k_lieu"]) if r["_lieu"] else None
        if (r["_num"] and r["_ign"] and r["_ign"][2] == NUMERO) or \
                (not r["_num"] and r["_lieu_pos"] and r["_lieu_pos"][2] != RUE):
            continue
        r["_k_ann"] = f"{r['siret']}|{r['adresse']}|{r['_lieu']}|{r['code_commune']}"
        v = c_ann.get(r["_k_ann"])
        if v is None or (aujourd_hui - datetime.date.fromisoformat(v[3])).days > VALIDITE_ANNUAIRE:
            t_ann[r["_k_ann"]] = (r["siret"], r["adresse"], r["_lieu"], r["commune"], geoms.get(r["code_commune"]))
    log(f"   {len(t_ann)} positions à demander à l'Annuaire des entreprises")
    res, err3 = executer(t_ann, position_annuaire, "Annuaire des entreprises", paralleles=4)
    for k, v in res.items():
        c_ann[k] = (*v, aujourd_hui.isoformat())
    ecrire_cache(f_ann, c_ann, ["lat", "lon", "verification", "date"])

    # 3. Choix de la position
    for r in lignes:
        choix = None
        if r["_num"] and r["_sirene"]:
            choix = (*r["_sirene"], NUMERO, SRC_SIRENE)
        else:
            v = c_ann.get(r.get("_k_ann", ""))
            ann = (float(v[0]), float(v[1]), v[2]) if v and v[0] and v[2] in (NUMERO, RUE, LIEU) else None
            sir = (*r["_sirene"], RUE) if r["_sirene"] else None
            ign, lieu = r["_ign"], r["_lieu_pos"]
            if r["_num"]:
                ordre = [(ign if ign and ign[2] == NUMERO else None, SRC_IGN), (ann, SRC_ANNUAIRE),
                         (lieu, SRC_IGN), (ign, SRC_IGN)]
            else:
                # Un complément qui ne mène qu'à une rue (« Villa les Pommiers » -> « Rue des Pommiers »)
                # peut désigner une autre voie que l'adresse : il passe après l'annuaire et SIRENE.
                lieu_sur = lieu if lieu and lieu[2] != RUE else None
                ordre = [(lieu_sur, SRC_IGN), (ann, SRC_ANNUAIRE), (sir, SRC_SIRENE), (lieu, SRC_IGN), (ign, SRC_IGN)]
            choix = next(((*p, src) for p, src in ordre if p), None)
        if choix:
            r["lat"], r["lon"], r["precision"], r["localisation"] = choix
        else:
            r["lat"], r["lon"], r["precision"], r["localisation"] = None, None, "", SRC_AUCUNE

    sortie = pd.DataFrame(lignes, index=df.index)
    sortie = sortie.drop(columns=[c for c in sortie.columns if c.startswith("_")])
    if err1 + err2 + err3:
        log(f"   {err1 + err2 + err3} requêtes sans réponse (service lent ou indisponible) : nouvel essai la nuit prochaine")
    resume = sortie.groupby(["localisation", "precision"]).size()
    for (src, prec), n in resume.items():
        log(f"   {src:<26} {prec or '–':<16} {n:>6}")
    return sortie
