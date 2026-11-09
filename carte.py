# -*- coding: utf-8 -*-
"""
Construction de la carte (Leaflet) affichée dans l'application Streamlit.

Fond « Plan » : OpenFreeMap Positron (tuiles vectorielles, via maplibre-gl-leaflet).
Fond « Photo aérienne » : orthophotos IGN (Géoplateforme).
Les établissements sont des cercles dessinés sur un calque « canvas », ce qui reste
fluide même avec plusieurs milliers de points.
"""
import json
import math

from referentiels import COULEURS, SECTIONS

# Cercle le plus grand (en pixels) pour ne pas masquer tout un bourg
RAYON_MAX = 30


def rayon(eff_min, eff_max, proportionnel):
    """Rayon du cercle : proportionnel à la racine de l'effectif (surface ~ effectif)."""
    if not proportionnel:
        return 5
    if eff_min is None or (isinstance(eff_min, float) and math.isnan(eff_min)):
        return 3
    milieu = (eff_min + eff_max) / 2
    if milieu < 1:
        return 3
    return round(min(RAYON_MAX, 3 + 1.5 * math.sqrt(milieu)), 1)


def _num(v):
    try:
        f = float(v)
        return None if math.isnan(f) else f
    except (TypeError, ValueError):
        return None


def html_carte(df, communes_geojson, proportionnel=True, focus=None, hauteur=620):
    """df : établissements filtrés (colonnes lat, lon, section…). focus : SIRET à mettre en évidence."""
    pts = df.dropna(subset=["lat", "lon"]).copy()
    pts["rayon_px"] = [rayon(_num(a), _num(b), proportionnel) for a, b in zip(pts["effectif_min"], pts["effectif_max"])]
    # Les grands cercles d'abord, pour que les petits restent cliquables au-dessus
    pts = pts.sort_values("rayon_px", ascending=False)

    sections = sorted(pts["section"].unique())
    idx_sec = {s: i for i, s in enumerate(sections)}
    legende = [{"code": s, "lib": SECTIONS.get(s, s), "coul": COULEURS.get(s, "#999"),
                "n": int((pts["section"] == s).sum())} for s in sections]

    champs = ["nom", "raison_sociale", "naf", "naf_libelle", "adresse", "code_postal", "commune",
              "tranche_libelle", "annee_effectif", "date_creation", "siege", "siret", "type_structure"]
    lignes = []
    i_focus = -1
    for k, r in enumerate(pts.itertuples(index=False)):
        d = r._asdict()
        lignes.append([round(d["lat"], 6), round(d["lon"], 6), idx_sec[d["section"]], d["rayon_px"],
                       1 if _num(d["effectif_min"]) and _num(d["effectif_min"]) >= 1 else 0]
                      + [("" if d[c] is None else str(d[c])) for c in champs])
        if focus and d["siret"] == focus:
            i_focus = k

    donnees = {"pts": lignes, "champs": champs, "legende": legende, "proportionnel": proportionnel,
               "focus": i_focus, "communes": communes_geojson}
    return (HTML.replace("__HAUTEUR__", str(hauteur))
                .replace("__DONNEES__", json.dumps(donnees, ensure_ascii=False, separators=(",", ":"))
                          .replace("</", "<\\/")))  # empêche un texte de fermer la balise <script>


HTML = r"""<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
<script src="https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.1.3/leaflet-maplibre-gl.js"></script>
<style>
:root{--rouge:#B91E27;--vert:#B1B993;--txt:#1e1e1e;--mut:#5f6368}
html,body{margin:0;height:100%;font-family:Calibri,"Segoe UI",system-ui,sans-serif;color:var(--txt)}
#map{position:relative;height:__HAUTEUR__px;width:100%;background:#f2f2ef}
.fiche{min-width:230px;max-width:290px;font-size:13px;line-height:1.35}
.fiche .n{font-size:15px;font-weight:700;margin:0 0 2px}
.fiche .rs{color:var(--mut);font-size:12px;margin-bottom:6px}
.fiche .act{border-left:4px solid #999;padding:2px 0 2px 7px;margin:6px 0 8px}
.fiche table{border-collapse:collapse;width:100%}
.fiche td{padding:2px 0;vertical-align:top}.fiche td:first-child{color:var(--mut);padding-right:8px;white-space:nowrap}
.fiche a{color:var(--rouge);font-weight:600;text-decoration:none;display:inline-block;margin-top:8px}
.fiche a:hover{text-decoration:underline}
.leg{background:#fff;border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,.25);font-size:12px;max-width:270px}
.leg button{all:unset;cursor:pointer;display:block;width:100%;padding:7px 10px;font-weight:700;box-sizing:border-box}
.leg button:focus-visible{outline:2px solid var(--rouge)}
.leg .corps{padding:0 10px 8px;max-height:330px;overflow:auto}
.leg .l{display:flex;align-items:center;gap:7px;margin:3px 0}
.leg .p{width:11px;height:11px;border-radius:50%;flex:none;border:1px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.15)}
.leg .c{margin-left:auto;color:var(--mut);padding-left:6px}
.leg .tailles{display:flex;align-items:flex-end;gap:12px;margin-top:8px;padding-top:8px;border-top:1px solid #e5e5e5}
.leg .tailles div{text-align:center;color:var(--mut)}
.leg .tailles span{display:block;margin:0 auto 3px;border-radius:50%;background:#bbb;border:1px solid #fff}
.btn-vue{background:#fff;border-radius:4px;box-shadow:0 1px 4px rgba(0,0,0,.25);padding:5px 9px;font-size:12px;cursor:pointer;border:0;font-family:inherit}
.btn-vue:focus-visible{outline:2px solid var(--rouge)}
.leaflet-control-layers{font-size:12.5px}
</style></head><body>
<div id="map"></div>
<script>
const D = __DONNEES__;
const C = {}; D.champs.forEach((c,i)=>C[c]=i+5);
const esc = s => String(s??"").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));

const map = L.map("map", {preferCanvas:true, zoomControl:true});
const plan = L.maplibreGL({style:"https://tiles.openfreemap.org/styles/positron",
  attribution:'&copy; <a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">contributeurs OpenStreetMap</a>'});
const ortho = L.tileLayer("https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image%2Fjpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
  {maxNativeZoom:19, maxZoom:20, attribution:"&copy; IGN / Géoplateforme"});
plan.addTo(map);

// Limites communales : grises sur le plan, blanches et fines sur la photo
const styleCom = sat => sat ? {color:"#ffffff",weight:1.2,opacity:.9,fill:false} : {color:"#6f6f6f",weight:1,opacity:.8,dashArray:"4 3",fill:false};
const communes = L.geoJSON(D.communes, {style:styleCom(false), interactive:false}).addTo(map);
map.on("baselayerchange", e => communes.setStyle(styleCom(e.layer===ortho)));

// Établissements
const rendu = L.canvas({padding:.5});
const groupe = L.layerGroup().addTo(map);
const marqueurs = [];
function fiche(p){
  const coul = D.legende[p[2]].coul;
  const rs = p[C.raison_sociale] && p[C.raison_sociale]!==p[C.nom] ? `<div class="rs">${esc(p[C.raison_sociale])}</div>` : "";
  const eff = p[C.tranche_libelle] + (p[C.annee_effectif] ? ` <span style="color:#5f6368">(${esc(p[C.annee_effectif])})</span>` : "");
  const crea = p[C.date_creation] ? p[C.date_creation].split("-").reverse().join("/") : "–";
  return `<div class="fiche"><div class="n">${esc(p[C.nom])}</div>${rs}
   <div class="act" style="border-color:${coul}">${esc(p[C.naf_libelle]||"Activité non renseignée")}${p[C.naf]?` <span style="color:#5f6368">(${esc(p[C.naf])})</span>`:""}</div>
   <table><tr><td>Adresse</td><td>${esc(p[C.adresse])}<br>${esc(p[C.code_postal])} ${esc(p[C.commune])}</td></tr>
   <tr><td>Effectif</td><td>${eff}</td></tr>
   <tr><td>Créé le</td><td>${esc(crea)}</td></tr>
   <tr><td>Établissement</td><td>${p[C.siege]==="Oui"?"Siège":"Établissement secondaire"}</td></tr>
   <tr><td>Structure</td><td>${esc(p[C.type_structure])}</td></tr>
   <tr><td>SIRET</td><td>${esc(p[C.siret].replace(/^(\d{3})(\d{3})(\d{3})(\d{5})$/,"$1 $2 $3 $4"))}</td></tr></table>
   <a href="https://annuaire-entreprises.data.gouv.fr/etablissement/${esc(p[C.siret])}" target="_blank" rel="noopener">Fiche complète sur l'Annuaire des entreprises</a></div>`;
}
D.pts.forEach(p => {
  const coul = D.legende[p[2]].coul;
  const m = L.circleMarker([p[0],p[1]], {renderer:rendu, radius:p[3], color:"#ffffff", weight:.8,
     fillColor:coul, fillOpacity: (D.proportionnel && !p[4]) ? .45 : .82});
  m.bindPopup(() => fiche(p), {maxWidth:310});
  m.bindTooltip(esc(p[C.nom]), {direction:"top", offset:[0,-p[3]]});
  m.addTo(groupe); marqueurs.push(m);
});

L.control.layers({"Plan":plan, "Photo aérienne":ortho}, {"Limites communales":communes, "Établissements":groupe},
  {collapsed:false, position:"topright"}).addTo(map);

// Légende repliable, synchronisée avec les couleurs réellement utilisées
const Leg = L.Control.extend({options:{position:"bottomright"}, onAdd(){
  const d = L.DomUtil.create("div","leg");
  const ouvert = window.innerWidth > 640;
  let h = `<button aria-expanded="${ouvert}">Légende</button><div class="corps"${ouvert?"":" hidden"}>`;
  h += D.legende.map(l=>`<div class="l"><span class="p" style="background:${l.coul}"></span>${esc(l.lib)}<span class="c">${l.n.toLocaleString("fr-FR")}</span></div>`).join("");
  if (D.proportionnel){
    h += `<div class="tailles">` + [[10,"10"],[50,"50"],[250,"250"]].map(([v,t])=>{
      const r = Math.min(30, 3+1.5*Math.sqrt(v));
      return `<div><span style="width:${2*r}px;height:${2*r}px"></span>${t} sal.</div>`;}).join("") +
      `</div><div style="color:#5f6368;margin-top:6px">Cercles pâles : effectif nul ou non renseigné</div>`;
  }
  d.innerHTML = h + "</div>";
  const b = d.querySelector("button"), c = d.querySelector(".corps");
  b.onclick = () => { c.hidden = !c.hidden; b.setAttribute("aria-expanded", String(!c.hidden)); };
  L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d);
  return d;
}});
new Leg().addTo(map);

// Bouton « Vue d'ensemble »
function vueEnsemble(){
  if (marqueurs.length) map.fitBounds(L.featureGroup(marqueurs).getBounds(), {padding:[20,20], maxZoom:16});
  else if (communes.getLayers().length) map.fitBounds(communes.getBounds());
  else map.setView([49.25,-0.05], 11);
}
const Vue = L.Control.extend({options:{position:"topleft"}, onAdd(){
  const b = L.DomUtil.create("button","btn-vue"); b.textContent = "Vue d'ensemble"; b.onclick = vueEnsemble;
  L.DomEvent.disableClickPropagation(b); return b;
}});
new Vue().addTo(map);

if (D.focus >= 0){
  const p = D.pts[D.focus], m = marqueurs[D.focus];
  map.setView([p[0],p[1]], 17);
  L.circleMarker([p[0],p[1]], {radius:p[3]+7, color:"#B91E27", weight:3, fill:false, interactive:false}).addTo(map);
  m.bringToFront(); setTimeout(()=>m.openPopup(), 300);
} else vueEnsemble();
setTimeout(()=>map.invalidateSize(), 200);
</script></body></html>"""
