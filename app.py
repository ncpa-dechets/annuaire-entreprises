# -*- coding: utf-8 -*-
"""
Annuaire des entreprises de NCPA – application Streamlit
Lancer en local :  streamlit run app.py
Les données (dossier data/) sont produites chaque nuit par collecte.py.
"""
import datetime
import hmac
import io
import json
import unicodedata
from pathlib import Path

import pandas as pd
import streamlit as st

from carte import html_carte
from referentiels import appliquer_corrections, DIVISIONS, SECTIONS, SEUILS_EFFECTIF, TYPES_PAR_DEFAUT, TYPES_STRUCTURE

RACINE = Path(__file__).resolve().parent
DATA = RACINE / "data"
CORRECTIONS = RACINE / "corrections_localisation.csv"
MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre",
        "octobre", "novembre", "décembre"]

st.set_page_config(page_title="Annuaire des entreprises – NCPA", page_icon="🏢", layout="wide")

st.markdown("""
<style>
html, body, .stApp, .stApp p, .stApp label, .stApp input, .stApp textarea, .stApp h1, .stApp h2, .stApp h3,
.stApp h4, .stApp h5, .stApp li, .stApp summary {font-family: Calibri, "Segoe UI", system-ui, sans-serif;}
/* les icônes de Streamlit gardent leur police (sinon leur nom s'affiche en toutes lettres) */
[data-testid="stIconMaterial"] {font-family: "Material Symbols Rounded" !important;}
.block-container {padding-top: 1.2rem; padding-bottom: 2rem; padding-left: 2rem; padding-right: 2rem; max-width: 100%;}

.entete {border-bottom: 3px solid #B91E27; padding-bottom: .55rem; margin-bottom: .9rem;}
.entete .sur {font-size: .78rem; letter-spacing: .08em; text-transform: uppercase; color: #B91E27; font-weight: 700;}
.entete h1 {font-size: 1.7rem; margin: .1rem 0 .2rem; padding: 0; line-height: 1.15;}
.entete p {margin: 0; color: #5f6368; font-size: .95rem;}
.chiffres {display: flex; flex-wrap: wrap; gap: 0; margin: .2rem 0 1rem;}
.chiffres > div {padding: .1rem 1.4rem .1rem .9rem; border-left: 3px solid #B1B993; margin-bottom: .4rem;}
.chiffres .v {font-size: 1.35rem; font-weight: 700; line-height: 1.1;}
.chiffres .l {font-size: .85rem; color: #5f6368;}
.note {font-size: .85rem; color: #5f6368;}
</style>""", unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# Données
# ---------------------------------------------------------------------------
def sans_accents(s):
    s = unicodedata.normalize("NFKD", str(s))
    return "".join(c for c in s if not unicodedata.combining(c)).lower()


def lire_meta():
    f = DATA / "meta.json"
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else None


@st.cache_data(show_spinner="Chargement de l'annuaire…")
def charger(version, version_corrections):
    df = pd.read_csv(DATA / "etablissements.csv", dtype=str, keep_default_na=False)
    for c in ["lat", "lon", "effectif_min", "effectif_max"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    # Corrections appliquées dès leur dépôt, sans attendre la collecte de la nuit
    df, _ = appliquer_corrections(df, CORRECTIONS)
    df["annee_creation"] = pd.to_numeric(df["date_creation"].str[:4], errors="coerce")
    df["_recherche"] = (df["nom"] + " " + df["raison_sociale"] + " " + df["enseigne"] + " " + df["siret"] + " "
                        + df["adresse"] + " " + df["commune"] + " " + df["naf_libelle"] + " "
                        + df["division_libelle"] + " " + df["naf"]).map(sans_accents)
    gj = json.loads((DATA / "communes.geojson").read_text(encoding="utf-8"))
    fj = DATA / "journal.csv"
    journal = pd.read_csv(fj, dtype=str, keep_default_na=False) if fj.exists() else pd.DataFrame()
    return df, gj, journal


def date_fr(iso):
    d = datetime.datetime.fromisoformat(iso)
    return f"{d.day} {MOIS[d.month - 1]} {d.year} à {d:%H:%M}"


def nombre(n):
    return f"{n:,.0f}".replace(",", "\u202f")


meta = lire_meta()
if meta is None or not (DATA / "etablissements.csv").exists():
    st.title("Annuaire des entreprises")
    st.warning("Les données n'ont pas encore été collectées. Dans GitHub, ouvrez l'onglet Actions, choisissez "
               "« Mise à jour quotidienne de l'annuaire » puis « Run workflow ».")
    st.stop()

df, communes_gj, journal = charger(meta["date_maj"], CORRECTIONS.stat().st_mtime if CORRECTIONS.exists() else 0)


# ---------------------------------------------------------------------------
# Accès interne (mot de passe défini dans les « secrets » de Streamlit Cloud)
# ---------------------------------------------------------------------------
def mot_de_passe_attendu():
    try:
        return st.secrets.get("MOT_DE_PASSE_INTERNE", "")
    except Exception:
        return ""


if "interne" not in st.session_state:
    st.session_state.interne = False


# ---------------------------------------------------------------------------
# Volet latéral : recherche et filtres
# ---------------------------------------------------------------------------
with st.sidebar:
    st.markdown("### Rechercher")
    texte = st.text_input("Recherche", placeholder="Nom, activité, adresse, SIRET…", label_visibility="collapsed")

    noms_communes = sorted(df["commune"].unique(), key=sans_accents)
    sel_communes = st.multiselect("Communes", noms_communes, placeholder="Toutes les communes")

    presentes = df["section"].value_counts()
    sel_sections = st.multiselect("Secteurs d'activité", sorted(presentes.index),
                                  format_func=lambda s: f"{SECTIONS.get(s, s)} ({nombre(presentes[s])})",
                                  placeholder="Tous les secteurs")
    base_div = df[df["section"].isin(sel_sections)] if sel_sections else df
    divisions = sorted(d for d in base_div["division"].unique() if d)
    sel_divisions = st.multiselect("Activités détaillées", divisions,
                                   format_func=lambda d: f"{d} – {DIVISIONS.get(d, d)}",
                                   placeholder="Toutes les activités")

    seuil_lib = st.selectbox("Effectif", list(SEUILS_EFFECTIF))
    sel_types = st.multiselect("Types de structure", TYPES_STRUCTURE, default=TYPES_PAR_DEFAUT,
                               help="Les SCI et le secteur public sont masqués par défaut.")

    with st.expander("Plus de filtres"):
        employeurs = st.checkbox("Employeurs uniquement",
                                 help="Établissements déclarés employeurs ou ayant au moins 1 salarié.")
        sieges = st.checkbox("Sièges uniquement")
        recence = st.selectbox("Date de création", ["Toutes", "Moins d'un an", "Moins de 3 ans", "Moins de 5 ans"])

    st.markdown("### Affichage")
    proportionnel = st.radio("Taille des points", ["Selon l'effectif", "Identique"], horizontal=True,
                             label_visibility="collapsed") == "Selon l'effectif"

    st.divider()
    attendu = mot_de_passe_attendu()
    if st.session_state.interne:
        st.success("Accès interne actif")
        if st.button("Se déconnecter"):
            st.session_state.interne = False
            st.rerun()
    elif attendu:
        with st.expander("Accès interne"):
            mdp = st.text_input("Mot de passe", type="password")
            if st.button("Se connecter"):
                if hmac.compare_digest(mdp, attendu):
                    st.session_state.interne = True
                    st.rerun()
                else:
                    st.error("Mot de passe incorrect.")
    st.markdown(f"<p class='note'>Source : Insee, répertoire SIRENE. Mise à jour du {date_fr(meta['date_maj'])}.</p>",
                unsafe_allow_html=True)

interne = st.session_state.interne


# ---------------------------------------------------------------------------
# Application des filtres
# ---------------------------------------------------------------------------
f = df
if texte.strip():
    for mot in sans_accents(texte).split():
        f = f[f["_recherche"].str.contains(mot, regex=False)]
if sel_communes:
    f = f[f["commune"].isin(sel_communes)]
if sel_sections:
    f = f[f["section"].isin(sel_sections)]
if sel_divisions:
    f = f[f["division"].isin(sel_divisions)]
seuil = SEUILS_EFFECTIF[seuil_lib]
if seuil is not None:
    f = f[f["effectif_min"] >= seuil]
f = f[f["type_structure"].isin(sel_types)]
if employeurs:
    f = f[(f["employeur"] == "Oui") | (f["effectif_min"] >= 1)]
if sieges:
    f = f[f["siege"] == "Oui"]
if recence != "Toutes":
    ans = {"Moins d'un an": 1, "Moins de 3 ans": 3, "Moins de 5 ans": 5}[recence]
    limite = (datetime.date.today() - datetime.timedelta(days=365 * ans)).isoformat()
    f = f[f["date_creation"] >= limite]
f = f.sort_values(["effectif_min", "nom"], ascending=[False, True], na_position="last")

# Identifiant de l'état des filtres : une nouvelle liste (et une sélection vide) à chaque changement
etat_filtres = hash((texte, tuple(sel_communes), tuple(sel_sections), tuple(sel_divisions), seuil_lib,
                     tuple(sel_types), employeurs, sieges, recence))
cle_liste = f"liste_{etat_filtres}"
selection = st.session_state.get(cle_liste)
focus = None
if selection and selection.get("selection", {}).get("rows"):
    i = selection["selection"]["rows"][0]
    if i < len(f):
        focus = f.iloc[i]["siret"]


# ---------------------------------------------------------------------------
# En-tête et chiffres clés
# ---------------------------------------------------------------------------
st.markdown(f"""<div class="entete"><div class="sur">Développement économique</div>
<h1>Annuaire des entreprises</h1>
<p>Établissements actifs des {meta['nb_communes']} communes de Normandie-Cabourg-Pays d'Auge, hors entrepreneurs
individuels. Données Insee mises à jour le {date_fr(meta['date_maj'])}.</p></div>""", unsafe_allow_html=True)

n_emp = int(((f["employeur"] == "Oui") | (f["effectif_min"] >= 1)).sum())
eff_bas, eff_haut = f["effectif_min"].sum(), f["effectif_max"].sum()
n_loc = int(f["lat"].notna().sum())
st.markdown(f"""<div class="chiffres">
<div><div class="v">{nombre(len(f))}</div><div class="l">établissements</div></div>
<div><div class="v">{nombre(n_emp)}</div><div class="l">employeurs</div></div>
<div><div class="v">{nombre(eff_bas)} à {nombre(eff_haut)}</div><div class="l">salariés, d'après les tranches Insee</div></div>
<div><div class="v">{nombre(f['commune'].nunique())}</div><div class="l">communes</div></div>
</div>""", unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# Exports
# ---------------------------------------------------------------------------
COLS_EXPORT = {
    "siret": "SIRET", "nom": "Nom", "raison_sociale": "Raison sociale", "enseigne": "Enseigne",
    "adresse": "Adresse", "complement_adresse": "Complément", "code_postal": "Code postal", "commune": "Commune",
    "code_commune": "Code commune", "naf": "Code NAF", "naf_libelle": "Activité", "section_libelle": "Secteur",
    "tranche_libelle": "Effectif (tranche)", "annee_effectif": "Année de l'effectif", "employeur": "Employeur",
    "siege": "Siège", "date_creation": "Date de création", "type_structure": "Type de structure",
    "categorie_juridique": "Catégorie juridique", "categorie_entreprise": "Catégorie d'entreprise",
    "ess": "ESS", "lat": "Latitude", "lon": "Longitude", "localisation": "Localisation",
}


def excel(tables):
    """tables : {nom d'onglet: DataFrame}. Renvoie le classeur en mémoire."""
    sortie = io.BytesIO()
    with pd.ExcelWriter(sortie, engine="openpyxl") as xl:
        for nom, t in tables.items():
            t.to_excel(xl, sheet_name=nom[:31], index=False)
            ws = xl.sheets[nom[:31]]
            ws.freeze_panes = "A2"
            ws.auto_filter.ref = ws.dimensions
            for col in ws.columns:
                larg = max(len(str(c.value or "")) for c in list(col)[:200])
                ws.column_dimensions[col[0].column_letter].width = min(45, max(10, larg + 2))
    return sortie.getvalue()


def geojson(t):
    t = t.dropna(subset=["lat", "lon"])
    feats = [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [r["lon"], r["lat"]]},
              "properties": {COLS_EXPORT[c]: (None if pd.isna(r[c]) else r[c])
                             for c in COLS_EXPORT if c not in ("lat", "lon")}}
             for _, r in t.iterrows()]
    return json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False).encode("utf-8")


# ---------------------------------------------------------------------------
# Onglet « Annuaire » : carte + liste liée
# ---------------------------------------------------------------------------
def vue_annuaire():
    if f.empty:
        st.info("Aucun établissement ne correspond à ces critères. Élargissez la recherche ou retirez un filtre.")
        return
    page = html_carte(f, communes_gj, proportionnel, focus, interne=interne)
    if hasattr(st, "iframe"):
        st.iframe(page, height="content")      # la carte calcule elle-même sa hauteur
    else:                                   # anciennes versions de Streamlit
        import streamlit.components.v1 as components
        components.html(page, height=700)
    n_sans = len(f) - n_loc
    if n_sans:
        st.markdown(f"<p class='note'>{nombre(n_sans)} établissement(s) sans localisation précise : "
                    "ils figurent dans la liste mais pas sur la carte.</p>", unsafe_allow_html=True)

    st.markdown("#### Liste des établissements")
    st.caption("Cliquez sur une ligne pour la situer sur la carte.")
    cols = {"nom": "Nom", "naf_libelle": "Activité", "commune": "Commune", "adresse": "Adresse",
            "tranche_libelle": "Effectif", "annee_creation": "Création"}
    if interne:
        cols = {"nom": "Nom", "raison_sociale": "Raison sociale", "naf_libelle": "Activité", "commune": "Commune",
                "adresse": "Adresse", "tranche_libelle": "Effectif", "annee_effectif": "Année eff.",
                "annee_creation": "Création", "type_structure": "Structure", "siege": "Siège",
                "siret": "SIRET", "localisation": "Localisation"}
    st.dataframe(f[list(cols)].rename(columns=cols), key=cle_liste, on_select="rerun", selection_mode="single-row",
                 hide_index=True, width="stretch", height=420,
                 column_config={"Création": st.column_config.NumberColumn(format="%d")})

    if interne:
        c1, c2 = st.columns(2)
        horodatage = datetime.date.today().isoformat()
        c1.download_button("Télécharger la sélection (Excel)",
                           excel({"Établissements": f[list(COLS_EXPORT)].rename(columns=COLS_EXPORT)}),
                           f"annuaire_entreprises_{horodatage}.xlsx", width="stretch")
        c2.download_button("Télécharger la sélection (GeoJSON pour QGIS)", geojson(f),
                           f"annuaire_entreprises_{horodatage}.geojson", mime="application/geo+json",
                           width="stretch")


# ---------------------------------------------------------------------------
# Onglet « Nouveautés » (interne)
# ---------------------------------------------------------------------------
def vue_nouveautes():
    if journal.empty:
        st.info("Le suivi démarre après la deuxième mise à jour : il compare chaque jour l'annuaire à celui de la veille.")
        return
    periode = st.selectbox("Période", ["7 derniers jours", "30 derniers jours", "90 derniers jours", "12 derniers mois"],
                           index=1)
    jours = {"7 derniers jours": 7, "30 derniers jours": 30, "90 derniers jours": 90, "12 derniers mois": 365}[periode]
    debut = (datetime.date.today() - datetime.timedelta(days=jours)).isoformat()
    j = journal[journal["date"] >= debut]
    if sel_communes:
        j = j[j["commune"].isin(sel_communes)]
    if sel_sections:
        j = j[j["section"].isin(sel_sections)]
    entrees = j[j["evenement"] == "Nouvel établissement"]
    sorties = j[j["evenement"] == "Établissement sorti"]
    st.markdown(f"""<div class="chiffres">
    <div><div class="v">{nombre(len(entrees))}</div><div class="l">nouveaux établissements</div></div>
    <div><div class="v">{nombre(len(sorties))}</div><div class="l">établissements sortis</div></div></div>""",
                unsafe_allow_html=True)
    st.caption("Un nouvel établissement peut être une création ou une arrivée sur le territoire ; un établissement "
               "sorti, une fermeture ou un départ. Les filtres Communes et Secteurs du volet latéral s'appliquent ici.")
    cols = {"date": "Date", "nom": "Nom", "commune": "Commune", "naf_libelle": "Activité",
            "tranche_libelle": "Effectif", "type_structure": "Structure", "siret": "SIRET"}
    c1, c2 = st.columns(2)
    with c1:
        st.markdown("##### Nouveaux établissements")
        st.dataframe(entrees[list(cols)].rename(columns=cols).sort_values("Date", ascending=False),
                     hide_index=True, width="stretch", height=380)
    with c2:
        st.markdown("##### Établissements sortis")
        st.dataframe(sorties[list(cols)].rename(columns=cols).sort_values("Date", ascending=False),
                     hide_index=True, width="stretch", height=380)
    st.download_button("Télécharger ces mouvements (Excel)",
                       excel({"Nouveaux": entrees[list(cols)].rename(columns=cols),
                              "Sortis": sorties[list(cols)].rename(columns=cols)}),
                       f"mouvements_entreprises_{datetime.date.today().isoformat()}.xlsx")


# ---------------------------------------------------------------------------
# Onglet « Qualité des données » (interne)
# ---------------------------------------------------------------------------
def vue_qualite():
    loc = df["localisation"].value_counts()
    st.markdown(f"""<div class="chiffres">
    <div><div class="v">{nombre(len(df))}</div><div class="l">établissements dans l'annuaire</div></div>
    <div><div class="v">{nombre(meta.get('nb_entrepreneurs_individuels_exclus', 0))}</div><div class="l">entrepreneurs individuels exclus</div></div>
    <div><div class="v">{loc.get('SIRENE', 0) / len(df):.0%}</div><div class="l">localisés par SIRENE</div></div>
    <div><div class="v">{nombre(loc.get('Adresse géocodée', 0))}</div><div class="l">localisés par géocodage</div></div>
    <div><div class="v">{nombre(loc.get('Non localisé', 0))}</div><div class="l">non localisés</div></div>
    <div><div class="v">{nombre(loc.get('Corrigée manuellement', 0))}</div><div class="l">corrigés à la main</div></div></div>""",
                unsafe_allow_html=True)
    st.caption("Position erronée ? Faites un clic droit au bon endroit sur la carte pour obtenir ses coordonnées, "
               "puis ajoutez une ligne au fichier corrections_localisation.csv du dépôt GitHub. "
               "La correction s'applique aussitôt et à chaque collecte.")
    st.caption(f"Dernière collecte : {date_fr(meta['date_maj'])}, en {meta.get('duree_secondes', '?')} secondes.")

    c1, c2 = st.columns(2)
    with c1:
        st.markdown("##### Ancienneté de l'effectif déclaré")
        st.caption("L'effectif SIRENE est une tranche, mise à jour avec retard. "
                   "« Non renseigné » regroupe les établissements sans salarié connu.")
        a = df["annee_effectif"].replace("", "Non renseigné").value_counts().sort_index()
        st.dataframe(a.rename("Établissements").rename_axis("Année"), width="stretch")
    with c2:
        st.markdown("##### Établissements par commune")
        c = df.groupby("commune").agg(Établissements=("siret", "size"),
                                      Employeurs=("employeur", lambda s: int((s == "Oui").sum())),
                                      **{"Non localisés": ("lat", lambda s: int(s.isna().sum()))})
        st.dataframe(c.sort_values("Établissements", ascending=False), width="stretch", height=360)

    nl = df[df["lat"].isna()]
    if len(nl):
        st.markdown("##### Établissements non localisés")
        st.caption("Adresse absente, incomplète ou introuvable. À compléter si besoin dans QGIS.")
        cols = {"nom": "Nom", "adresse": "Adresse", "complement_adresse": "Complément",
                "commune": "Commune", "naf_libelle": "Activité", "siret": "SIRET"}
        st.dataframe(nl[list(cols)].rename(columns=cols), hide_index=True, width="stretch", height=300)


if interne:
    t1, t2, t3 = st.tabs(["Annuaire", "Nouveautés", "Qualité des données"])
    with t1:
        vue_annuaire()
    with t2:
        vue_nouveautes()
    with t3:
        vue_qualite()
else:
    vue_annuaire()
    with st.expander("À propos de cet annuaire"):
        st.markdown(
            "L'annuaire recense les établissements actifs inscrits au répertoire SIRENE de l'Insee, "
            "hors entrepreneurs individuels. Il est mis à jour chaque nuit.\n\n"
            "L'effectif est une tranche déclarative, parfois ancienne : la taille des cercles est indicative. "
            "Une erreur sur votre établissement ? Les informations se corrigent auprès de l'Insee ou "
            "du guichet unique des formalités d'entreprises (formalites.entreprises.gouv.fr).")
