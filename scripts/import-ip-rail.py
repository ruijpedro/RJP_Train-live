"""Convert an official IP railway shapefile to a separate candidate GeoJSON.
Requires geopandas. Usage: python scripts/import-ip-rail.py input.shp
"""
import argparse
import json
from pathlib import Path
import geopandas as gpd

p = argparse.ArgumentParser()
p.add_argument("source")
p.add_argument("--output", default="public/data/railways-ip-candidate.geojson")
a = p.parse_args()
g = gpd.read_file(a.source)
if g.empty or g.crs is None:
    raise SystemExit("Empty dataset or missing CRS")
if g.crs.to_epsg() != 3763:
    raise SystemExit(f"Unexpected source CRS: {g.crs}")
if not g.geometry.geom_type.isin(["LineString", "MultiLineString"]).all():
    raise SystemExit("Unexpected geometry types")
if g.geometry.is_empty.any() or g.geometry.isna().any() or not g.geometry.is_valid.all():
    raise SystemExit("Invalid geometry")
g = g.to_crs(4326)
xmin,ymin,xmax,ymax = g.total_bounds
if not (-10 <= xmin <= xmax <= -5 and 36 <= ymin <= ymax <= 43):
    raise SystemExit("Unexpected geographical extent")
out = Path(a.output)
out.parent.mkdir(parents=True, exist_ok=True)
data = json.loads(g.to_json(drop_id=True))
data["attribution"] = "Infraestruturas de Portugal, S.A. — Rede Ferroviária Nacional, CC BY 4.0; converted to EPSG:4326"
data["source"] = "https://dados.gov.pt/pt/datasets/rede-ferroviaria-nacional"
out.write_text(json.dumps(data, ensure_ascii=False, allow_nan=False), encoding="utf-8")
print(json.dumps({"features":len(g),"fields":list(g.columns),"bounds":list(g.total_bounds),"output":str(out)},ensure_ascii=False))
