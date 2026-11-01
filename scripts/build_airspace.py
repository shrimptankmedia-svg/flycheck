# Builds the drone-relevant airspace and aerodrome layers from the ATNS
# "RSA DATA" KMZ (https://www.atns.com/products/aim/RSA%20Airspaces%20in%203D).
#
# Only airspace whose lower limit is the ground or at most 500 ft AGL is kept:
# that is everything a drone flying under 400 ft can actually enter. TMAs,
# CTAs, FIR/ACC sectors and routes all start thousands of feet up and are
# dropped.
#
# Usage: python3 scripts/build_airspace.py "RSA DATA.kmz" site/data
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = {"k": "http://www.opengis.net/kml/2.2"}
MAX_LOW_FT_AGL = 500

# KMZ folder (under "Airspaces/") -> category used by the app.
CATEGORY = [
    ("05. ATZ's & CTR's/Class C", "ctr"),
    ("05. ATZ's & CTR's/Class D", "ctr"),
    ("05. ATZ's & CTR's/Class G", "atz"),
    ("06. FAD,FAP,FAR/PROHIBITED", "prohibited"),
    ("06. FAD,FAP,FAR/RESTRICTED", "restricted"),
    ("06. FAD,FAP,FAR/DANGER", "danger"),
    ("08. Glider Areas", "glider"),
    ("10. Other Airspaces", "other"),
]

AERODROME_TYPE = [
    ("Helistops", "helistop"),
    ("ATNS Aerodromes", "atns"),
    ("Military", "military"),
    ("Licensed", "licensed"),
    ("SACAA Approved", "approved"),
    ("New Aerodrome Register", "registered"),
    ("Un-Licensed", "unlicensed"),
]


def text(el, tag):
    found = el.find("k:" + tag, NS)
    return (found.text or "").strip() if found is not None else ""


def placemarks(root):
    def walk(node, path):
        for child in node:
            tag = child.tag.split("}")[1]
            if tag in ("Folder", "Document"):
                yield from walk(child, path + [text(child, "name")])
            elif tag == "Placemark":
                yield "/".join(path[2:]), child
    yield from walk(root, [])


def limits(description):
    """'GND - 6500FT ALT' style limits from a placemark description."""
    plain = re.sub(r"<[^>]+>", " ", description).split("Freq")[0].split("FREQ")[0]
    for line in plain.splitlines():
        m = re.match(r"^\s*(.+?)\s+-\s+(.+?)\s*$", line)
        if m and re.search(r"GND|SFC|FT|FL|UNL", line):
            return m.group(1).strip(), m.group(2).strip()
    return None, None


def low_enough(low):
    if not low:
        return False
    if re.match(r"^(GND|SFC|SURFACE)", low):
        return True
    m = re.match(r"^(\d+)\s*FT\s*AGL", low)
    return bool(m) and int(m.group(1)) <= MAX_LOW_FT_AGL


def ring(coords):
    pts = []
    for tok in coords.split():
        lon, lat = tok.split(",")[:2]
        pts.append([round(float(lon), 5), round(float(lat), 5)])
    return pts


def main(kmz_path, out_dir):
    with zipfile.ZipFile(kmz_path) as z:
        kml = next(n for n in z.namelist() if n.endswith(".kml"))
        root = ET.fromstring(z.read(kml))

    airspace, aerodromes, seen = [], [], set()
    for path, pm in placemarks(root):
        name = text(pm, "name")
        desc = text(pm, "description")

        if path.startswith("Aerodromes"):
            pt = pm.find(".//k:Point/k:coordinates", NS)
            if pt is None:
                continue
            lon, lat = (float(v) for v in pt.text.strip().split(",")[:2])
            key = (name, round(lat, 3), round(lon, 3))
            if key in seen:
                continue
            seen.add(key)
            # Skip the "Aerodromes & Helistops" root so it doesn't match "Helistops".
            sub = path.split("/", 1)[1] if "/" in path else ""
            kind = next((t for f, t in AERODROME_TYPE if f in sub), "other")
            # The placemark name is the ICAO code or a register number; the
            # aerodrome's own name leads the description, before frequencies.
            label = re.split(r"\s+-\s+ACSA|\s*FREQ|\s+APP:|\s+\w{4} TWR:", re.sub(r"<[^>]+>", " ", desc))[0]
            label = re.sub(r"\s+", " ", label).strip() or name
            ident = name if re.match(r"^[A-Z]{4}$", name) else ""
            aerodromes.append([ident, label, round(lat, 5), round(lon, 5), kind])
            continue

        if not path.startswith("Airspaces/"):
            continue
        sub = path[len("Airspaces/"):]
        cat = next((c for f, c in CATEGORY if sub.startswith(f)), None)
        if not cat:
            continue
        if cat == "ctr" and "ATZ" in name:
            cat = "atz"
        low, high = limits(desc)
        if not low_enough(low):
            continue
        polys = [ring(c.text) for c in pm.findall(".//k:Polygon/k:outerBoundaryIs/k:LinearRing/k:coordinates", NS)]
        if not polys:
            continue
        freq = re.search(r"Freq:\s*([\d.]+\s*MHz[^\n<]*)", desc, re.I)
        airspace.append({
            "type": "Feature",
            "properties": {"name": name, "cat": cat, "low": low, "high": high, "freq": freq.group(1).strip() if freq else None},
            "geometry": {"type": "Polygon", "coordinates": polys} if len(polys) == 1
            else {"type": "MultiPolygon", "coordinates": [[p] for p in polys]},
        })

    source = "ATNS RSA DATA KMZ (" + kml_name(kmz_path) + ")"
    with open(f"{out_dir}/airspace.json", "w") as f:
        json.dump({"type": "FeatureCollection", "source": source, "features": airspace}, f, separators=(",", ":"))
    with open(f"{out_dir}/aerodromes.json", "w") as f:
        json.dump({"source": source, "fields": ["ident", "name", "lat", "lon", "type"], "rows": aerodromes},
                  f, separators=(",", ":"), ensure_ascii=False)
    print(f"{len(airspace)} airspaces, {len(aerodromes)} aerodromes/helistops")


def kml_name(path):
    return path.rsplit("/", 1)[-1]


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
