# -*- coding: utf-8 -*-
"""
Référentiels partagés entre la collecte et l'application :
sections et divisions NAF rév. 2, tranches d'effectifs, types de structure,
couleurs de la carte.
"""

# ---------------------------------------------------------------------------
# NAF rév. 2 : sections (21) et divisions (88)
# ---------------------------------------------------------------------------
SECTIONS = {
    "A": "Agriculture, sylviculture et pêche",
    "B": "Industries extractives",
    "C": "Industrie manufacturière",
    "D": "Électricité, gaz, vapeur et air conditionné",
    "E": "Eau, assainissement, déchets et dépollution",
    "F": "Construction",
    "G": "Commerce, réparation d'automobiles et de motocycles",
    "H": "Transports et entreposage",
    "I": "Hébergement et restauration",
    "J": "Information et communication",
    "K": "Activités financières et d'assurance",
    "L": "Activités immobilières",
    "M": "Activités spécialisées, scientifiques et techniques",
    "N": "Services administratifs et de soutien",
    "O": "Administration publique",
    "P": "Enseignement",
    "Q": "Santé humaine et action sociale",
    "R": "Arts, spectacles et activités récréatives",
    "S": "Autres activités de services",
    "T": "Activités des ménages employeurs",
    "U": "Activités extra-territoriales",
    "Z": "Activité non classée",
}

# Section de rattachement de chaque division (2 premiers chiffres du code NAF)
_PLAGES = [("A", 1, 3), ("B", 5, 9), ("C", 10, 33), ("D", 35, 35), ("E", 36, 39), ("F", 41, 43),
           ("G", 45, 47), ("H", 49, 53), ("I", 55, 56), ("J", 58, 63), ("K", 64, 66), ("L", 68, 68),
           ("M", 69, 75), ("N", 77, 82), ("O", 84, 84), ("P", 85, 85), ("Q", 86, 88), ("R", 90, 93),
           ("S", 94, 96), ("T", 97, 98), ("U", 99, 99)]


def section_de_division(div):
    try:
        n = int(div)
    except (TypeError, ValueError):
        return "Z"
    for s, a, b in _PLAGES:
        if a <= n <= b:
            return s
    return "Z"


DIVISIONS = {
    "01": "Culture et production animale, chasse", "02": "Sylviculture et exploitation forestière",
    "03": "Pêche et aquaculture", "05": "Extraction de houille et de lignite",
    "06": "Extraction d'hydrocarbures", "07": "Extraction de minerais métalliques",
    "08": "Autres industries extractives", "09": "Services de soutien aux industries extractives",
    "10": "Industries alimentaires", "11": "Fabrication de boissons", "12": "Fabrication de produits à base de tabac",
    "13": "Fabrication de textiles", "14": "Industrie de l'habillement", "15": "Industrie du cuir et de la chaussure",
    "16": "Travail du bois et fabrication d'articles en bois", "17": "Industrie du papier et du carton",
    "18": "Imprimerie et reproduction d'enregistrements", "19": "Cokéfaction et raffinage",
    "20": "Industrie chimique", "21": "Industrie pharmaceutique",
    "22": "Fabrication de produits en caoutchouc et en plastique",
    "23": "Fabrication d'autres produits minéraux non métalliques", "24": "Métallurgie",
    "25": "Fabrication de produits métalliques", "26": "Fabrication de produits informatiques et électroniques",
    "27": "Fabrication d'équipements électriques", "28": "Fabrication de machines et équipements",
    "29": "Industrie automobile", "30": "Fabrication d'autres matériels de transport",
    "31": "Fabrication de meubles", "32": "Autres industries manufacturières",
    "33": "Réparation et installation de machines", "35": "Électricité, gaz, vapeur et air conditionné",
    "36": "Captage, traitement et distribution d'eau", "37": "Collecte et traitement des eaux usées",
    "38": "Collecte, traitement et élimination des déchets", "39": "Dépollution et autre gestion des déchets",
    "41": "Construction de bâtiments", "42": "Génie civil", "43": "Travaux de construction spécialisés",
    "45": "Commerce et réparation d'automobiles et de motocycles", "46": "Commerce de gros",
    "47": "Commerce de détail", "49": "Transports terrestres", "50": "Transports par eau",
    "51": "Transports aériens", "52": "Entreposage et services auxiliaires des transports",
    "53": "Activités de poste et de courrier", "55": "Hébergement", "56": "Restauration", "58": "Édition",
    "59": "Cinéma, vidéo, télévision, enregistrement sonore", "60": "Programmation et diffusion",
    "61": "Télécommunications", "62": "Programmation, conseil et autres activités informatiques",
    "63": "Services d'information", "64": "Services financiers", "65": "Assurance",
    "66": "Activités auxiliaires de services financiers et d'assurance", "68": "Activités immobilières",
    "69": "Activités juridiques et comptables", "70": "Sièges sociaux, conseil de gestion",
    "71": "Architecture, ingénierie, contrôle et analyses techniques", "72": "Recherche-développement scientifique",
    "73": "Publicité et études de marché", "74": "Autres activités spécialisées, scientifiques et techniques",
    "75": "Activités vétérinaires", "77": "Location et location-bail", "78": "Activités liées à l'emploi",
    "79": "Agences de voyage, voyagistes, réservation", "80": "Enquêtes et sécurité",
    "81": "Services relatifs aux bâtiments et aménagement paysager",
    "82": "Activités administratives et soutien aux entreprises",
    "84": "Administration publique et défense, sécurité sociale", "85": "Enseignement",
    "86": "Activités pour la santé humaine", "87": "Hébergement médico-social et social",
    "88": "Action sociale sans hébergement", "90": "Activités créatives, artistiques et de spectacle",
    "91": "Bibliothèques, archives, musées", "92": "Jeux de hasard et d'argent",
    "93": "Activités sportives, récréatives et de loisirs", "94": "Organisations associatives",
    "95": "Réparation d'ordinateurs et de biens personnels", "96": "Autres services personnels",
    "97": "Ménages employeurs de personnel domestique", "98": "Ménages producteurs pour usage propre",
    "99": "Organisations extraterritoriales",
}

# ---------------------------------------------------------------------------
# Tranches d'effectifs salariés (codes Insee) : code -> (libellé, min, max)
# ---------------------------------------------------------------------------
TRANCHES = {
    "NN": ("Non renseigné", None, None),
    "00": ("0 salarié", 0, 0),
    "01": ("1 ou 2 salariés", 1, 2),
    "02": ("3 à 5 salariés", 3, 5),
    "03": ("6 à 9 salariés", 6, 9),
    "11": ("10 à 19 salariés", 10, 19),
    "12": ("20 à 49 salariés", 20, 49),
    "21": ("50 à 99 salariés", 50, 99),
    "22": ("100 à 199 salariés", 100, 199),
    "31": ("200 à 249 salariés", 200, 249),
    "32": ("250 à 499 salariés", 250, 499),
    "41": ("500 à 999 salariés", 500, 999),
    "42": ("1 000 à 1 999 salariés", 1000, 1999),
    "51": ("2 000 à 4 999 salariés", 2000, 4999),
    "52": ("5 000 à 9 999 salariés", 5000, 9999),
    "53": ("10 000 salariés et plus", 10000, 10000),
}

# Seuils proposés dans le filtre « effectif minimum »
SEUILS_EFFECTIF = {
    "Tous les établissements": None,
    "1 salarié et plus": 1,
    "10 salariés et plus": 10,
    "50 salariés et plus": 50,
    "250 salariés et plus": 250,
}

# ---------------------------------------------------------------------------
# Types de structure, d'après la catégorie juridique (nomenclature Insee)
# ---------------------------------------------------------------------------
TYPES_STRUCTURE = [
    "Société commerciale",
    "Société civile (hors SCI)",
    "Société civile immobilière (SCI)",
    "Association",
    "Secteur public",
    "Autre structure privée",
]
TYPES_PAR_DEFAUT = ["Société commerciale", "Société civile (hors SCI)", "Association", "Autre structure privée"]


def type_structure(cj):
    cj = str(cj or "")
    if cj.startswith("654"):
        return "Société civile immobilière (SCI)"
    if cj.startswith("65"):
        return "Société civile (hors SCI)"
    if cj.startswith("5"):
        return "Société commerciale"
    if cj.startswith("92") or cj.startswith("93"):
        return "Association"
    if cj.startswith("7") or cj.startswith("4"):
        return "Secteur public"
    return "Autre structure privée"


# ---------------------------------------------------------------------------
# Couleurs par section (carte et légende)
# ---------------------------------------------------------------------------
COULEURS = {
    "A": "#5f8f2f", "B": "#8c6d46", "C": "#1f5f8b", "D": "#d4a017", "E": "#2a9d8f",
    "F": "#d9822b", "G": "#c2185b", "H": "#6c5b7b", "I": "#e8590c", "J": "#3d84c6",
    "K": "#264653", "L": "#9c6644", "M": "#7b2cbf", "N": "#8d99ae", "O": "#495057",
    "P": "#e9a23b", "Q": "#2b9348", "R": "#e75480", "S": "#b5838d", "T": "#adb5bd",
    "U": "#adb5bd", "Z": "#9e9e9e",
}

# Types de voie abrégés dans SIRENE
TYPES_VOIE = {
    "ALL": "Allée", "AV": "Avenue", "BD": "Boulevard", "CAR": "Carrefour", "CHE": "Chemin",
    "CHS": "Chaussée", "CITE": "Cité", "COR": "Corniche", "CRS": "Cours", "DOM": "Domaine",
    "DSC": "Descente", "ECA": "Écart", "ESP": "Esplanade", "FG": "Faubourg", "GR": "Grande Rue",
    "HAM": "Hameau", "HLE": "Halle", "IMP": "Impasse", "LD": "Lieu-dit", "LOT": "Lotissement",
    "MAR": "Marché", "MTE": "Montée", "PARC": "Parc", "PAS": "Passage", "PL": "Place",
    "PLN": "Plaine", "PLT": "Plateau", "PRO": "Promenade", "PRV": "Parvis", "QUA": "Quartier",
    "QUAI": "Quai", "RES": "Résidence", "RLE": "Ruelle", "ROC": "Rocade", "RPT": "Rond-point",
    "RTE": "Route", "RUE": "Rue", "SEN": "Sente", "SQ": "Square", "TPL": "Terre-plein",
    "TRA": "Traverse", "VLA": "Villa", "VLGE": "Village", "ZA": "ZA", "ZAC": "ZAC", "ZI": "ZI",
}


# ---------------------------------------------------------------------------
# Corrections manuelles de localisation (fichier corrections_localisation.csv)
# ---------------------------------------------------------------------------
def appliquer_corrections(df, chemin):
    """Remplace les coordonnées des SIRET listés dans le fichier de corrections.
    Colonnes attendues : siret, lat, lon (commentaire facultatif). Séparateur , ou ;"""
    import pandas as pd
    from pathlib import Path
    if not Path(chemin).exists():
        return df, 0
    c = pd.read_csv(chemin, dtype=str, sep=None, engine="python", keep_default_na=False)
    c.columns = [x.strip().lower() for x in c.columns]
    c["siret"] = c["siret"].str.replace(r"\D", "", regex=True)
    c["lat"] = pd.to_numeric(c["lat"].str.replace(",", "."), errors="coerce")
    c["lon"] = pd.to_numeric(c["lon"].str.replace(",", "."), errors="coerce")
    c = c.dropna(subset=["lat", "lon"]).drop_duplicates("siret", keep="last").set_index("siret")
    masque = df["siret"].isin(c.index)
    df = df.copy()
    df["lat"] = pd.to_numeric(df["lat"], errors="coerce")
    df["lon"] = pd.to_numeric(df["lon"], errors="coerce")
    df.loc[masque, "lat"] = df.loc[masque, "siret"].map(c["lat"]).astype(float)
    df.loc[masque, "lon"] = df.loc[masque, "siret"].map(c["lon"]).astype(float)
    df.loc[masque, "localisation"] = "Corrigée manuellement"
    return df, int(masque.sum())
