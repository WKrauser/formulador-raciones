"""Genera src/data/ingredients.json a partir de:
  - tools/sources/fedna2019.xlsx   (Tablas FEDNA 2019, 4a ed., fundacionfedna.org)
  - tools/sources/feedtables_raw.json (INRAE-CIRAD-AFZ, feedtables.com; generado con tools/scrape_ft.py)

Todos los valores se expresan TAL CUAL (as fed):
  porcentajes en %, microminerales/vitaminas en mg/kg (ppm), energias en kcal/kg.
"""
import json, os, re, sys, unicodedata

import openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "tools", "sources")
OUT = os.path.join(ROOT, "src", "data", "ingredients.json")


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def r(v, nd=4):
    return None if v is None else round(float(v), nd)


# ---------------------------------------------------------------- FEDNA
FEDNA_MAP = {
    "CENIZAS": "cenizas", "PB": "pb", "EE": "ee", "FB": "fb", "FND": "fnd", "FAD": "fad",
    "LAD": "lad", "ALMIDON": "almidon", "AZUCARES": "azucares", "C18:2": "c18_2", "C18:3": "c18_3",
    "Ca": "ca", "P": "p", "Pfítico": "p_fit", "Pdisp.AVES": "p_disp_av", "Pdig.AVES": "p_dig_av",
    "Pdig.PORC": "p_dig_porc", "Na": "na", "Cl": "cl", "Mg": "mg", "K": "k", "S": "s",
    "Cu": "cu", "Fe": "fe", "Mn": "mn", "Zn": "zn", "Vit. E": "vit_e", "Biotina": "biotina",
    "Colina": "colina", "EM_RTES": "em_rum", "UFL": "ufl", "UFC": "ufc", "ENL_RTES": "enl_rum",
    "ENM_RTES": "enm_rum", "ENC_RTES": "eng_rum", "ED_PORC": "ed_porc", "EM_PORC": "em_porc",
    "EN_PORC": "en_porc", "EN_CERDAS": "en_cerdas", "EMA_POLLIT": "em_pollo", "EMA_AVES": "em_aves",
    "ED_CONEJOS": "ed_conejo", "ED_CABALLO": "ed_caballo", "PBDIG_RUM": "pbd_rum",
    "PDIA": "pdia", "PDIE": "pdie", "PDIN": "pdin",
}
AA = {"LYS": "lys", "MET": "met", "M+C": "mc", "THR": "thr", "TRP": "trp", "ILE": "ile",
      "VAL": "val", "ARG": "arg", "GLYeq": "glyeq"}

# Grupos FEDNA (primer ingrediente de cada grupo, en el orden de la hoja)
FEDNA_GROUPS = [
    ("ARROZ PARTIDO", "Granos de cereales"),
    ("ARROZ TRATADO CALOR", "Cereales procesados por calor"),
    ("SALVADO ARROZ 14%EE", "Subproductos de cereales"),
    ("BELLOTA ENTERA", "Frutos, tubérculos, melazas y vinazas"),
    ("SEMILLA ALGODON", "Concentrados de proteína vegetal"),
    ("ALFALFA EN RAMA DESH.", "Alimentos fibrosos"),
    ("CARNE 44/15/28", "Concentrados de proteína animal"),
    ("CASEINA", "Productos lácteos"),
    ("MANTEQUILLA", "Grasas, aceites y glicerina"),
    ("CARBONATO CALCICO", "Minerales"),
    ("UREA", "Nitrógeno no proteico"),
    ("DL METIONINA", "Aminoácidos"),
    ("ALMIDON 96", "Azúcares y almidones"),
    ("AC. CITRICO", "Acidificantes y aditivos"),
    ("CLORURO COLINA 75", "Microingredientes"),
]


def nice_es(name):
    name = name.strip()
    keep = {"DDGS", "PB", "EE", "ALM", "HCL", "HCl", "DL", "MET", "TBCC"}
    out = []
    for w in name.split(" "):
        out.append(w if w in keep or any(ch.isdigit() for ch in w) else w.capitalize())
    s = " ".join(out)
    s = s.replace("Hna.", "Harina ").replace("Hna ", "Harina ").replace("  ", " ")
    s = re.sub(r"^Ac\. ", "Aceite ", s) if not re.match(r"^Ac\. (Citrico|Fumarico|Propionico|Formico|Butirico|Malico|Benzoico|Acetico|Lactico|Sorbico)", s) else s.replace("Ac. ", "Ácido ")
    return s


def fedna():
    wb = openpyxl.load_workbook(os.path.join(SRC, "fedna2019.xlsx"), data_only=True)
    ws = wb["Valores 2019"]
    hdr = [c.value for c in ws[1]]
    units = [c.value for c in ws[2]]
    cols = {}
    for i, (h, u) in enumerate(zip(hdr, units)):
        if not h or i == 0:
            continue
        h = h.strip()
        if h == "HUMEDAD":
            cols[i] = ("ms", "hum")
        elif h in FEDNA_MAP:
            cols[i] = (FEDNA_MAP[h], None)
        elif u == "(%)" and h in AA:
            cols[i] = (AA[h], None)
        elif "_" in h and h.split("_")[0] in AA and h.split("_")[1] in ("DIS", "DR"):
            base, kind = h.split("_")
            cols[i] = (("sid_" if kind == "DIS" else "dav_") + AA[base], None)
    out = []
    group = None
    gmap = dict(FEDNA_GROUPS)
    for row in ws.iter_rows(min_row=3, values_only=True):
        name = row[0]
        if not name or not str(name).strip():
            continue
        name = str(name).strip()
        group = gmap.get(name, group)
        n = {}
        for i, (key, tr) in cols.items():
            v = row[i]
            if v is None or v == "" or isinstance(v, str):
                continue
            if tr == "hum":
                n["ms"] = r(100 - float(v), 3)
            else:
                n[key] = r(v)
        disp = nice_es(name)
        if group == "Grasas, aceites y glicerina" and name == "POLLO":
            disp = "Grasa de pollo"
        elif group == "Grasas, aceites y glicerina" and name.startswith("PESCADO "):
            disp = "Aceite de pescado " + name.split(" ", 1)[1].capitalize()
        out.append({
            "id": "fedna:" + slug(name),
            "name": disp,
            "code": name,
            "source": "FEDNA",
            "category": group,
            "n": n,
        })
    return out


# ---------------------------------------------------------------- Feedtables
FT_PCT = {  # unidad % -> %
    "Dry matter": "ms", "Crude protein": "pb", "Crude fat": "ee", "Crude fibre": "fb", "NDF": "fnd",
    "ADF": "fad", "Lignin": "lad", "Starch": "almidon", "Total sugars": "azucares", "Ash": "cenizas",
    "TDN 1x ruminants NRC 2001": "tdn",
}
FT_GKG = {  # g/kg -> % (/10)
    "C18:2 linoleic acid": "c18_2", "C18:3 linolenic acid": "c18_3", "Calcium": "ca", "Phosphorus": "p",
    "Phytate phosphorus": "p_fit", "Available P broiler": "p_disp_av",
    "Digestible P pig (no phytase)": "p_dig_porc", "Sodium": "na", "Chlorine": "cl", "Magnesium": "mg",
    "Potassium": "k", "Sulfur": "s",
    "PDIA INRA 2007": "pdia", "PDIE INRA 2007": "pdie", "PDIN INRA 2007": "pdin", "PDI INRA 2018": "pdi",
    "Lysine": "lys", "Methionine": "met", "Methionine + cystine": "mc", "Threonine": "thr",
    "Tryptophan": "trp", "Isoleucine": "ile", "Valine": "val", "Arginine": "arg", "Leucine": "leu",
    "Histidine": "his", "Phenylalanine": "phe",
}
FT_PPM = {
    "Copper": "cu", "Iron": "fe", "Manganese": "mn", "Zinc": "zn", "Selenium": "se", "Iodine": "i",
    "Cobalt": "co", "Choline": "colina", "Vitamin E": "vit_e", "Biotin": "biotina",
}
FT_KCAL = {
    "ME ruminants INRA 2018 (kcal)": "em_rum", "DE growing pig (kcal)": "ed_porc",
    "ME growing pig (kcal)": "em_porc", "NE growing pig (kcal)": "en_porc",
    "NE adult pig (kcal)": "en_cerdas", "AMEn cockerel (kcal)": "em_aves",
    "AMEn broiler (kcal)": "em_pollo", "DE rabbit (kcal)": "ed_conejo", "DE salmonids (kcal)": "ed_salmon",
}
FT_MCAL = {"NE Lactation 3x ruminants NRC 2001": "enl_rum", "NE Maintenance 3x ruminants NRC 2001": "enm_rum",
           "NE Gain 3x ruminants NRC 2001": "eng_rum"}
FT_UNIT = {"UFL INRA 2018": "ufl", "UFV INRA 2018": "ufc"}
for a, k in [("Lysine", "lys"), ("Methionine", "met"), ("Methionine + cystine", "mc"),
             ("Threonine", "thr"), ("Tryptophan", "trp"), ("Isoleucine", "ile"), ("Valine", "val"),
             ("Arginine", "arg")]:
    FT_GKG[a + ", ileal standardised, pig"] = "sid_" + k
    FT_GKG[a + ", ileal standardized, poultry"] = "dav_" + k


def feedtables():
    raw = json.load(open(os.path.join(SRC, "feedtables_raw.json"), encoding="utf-8"))
    out = []
    for s, d in raw.items():
        n = {}
        gly = ser = sid_gly = sid_ser = None
        for row in d["rows"]:
            p, v = row["p"], row["af"]
            if v is None:
                continue
            if p in FT_PCT:
                n[FT_PCT[p]] = r(v)
            elif p in FT_GKG:
                n[FT_GKG[p]] = r(v / 10)
            elif p in FT_PPM:
                n[FT_PPM[p]] = r(v)
            elif p in FT_KCAL:
                n[FT_KCAL[p]] = r(v, 1)
            elif p in FT_MCAL:
                n[FT_MCAL[p]] = r(v * 1000, 1)
            elif p in FT_UNIT:
                n[FT_UNIT[p]] = r(v)
            elif p == "Glycine":
                gly = v
            elif p == "Serine":
                ser = v
        if gly is not None:
            n["glyeq"] = r((gly + 0.7143 * (ser or 0)) / 10)
        out.append({
            "id": "ft:" + s,
            "name": d["title"],
            "code": s,
            "source": "Feedtables",
            "category": d.get("cat", "Otros"),
            "n": n,
        })
    return out


def derive(items):
    for it in items:
        n = it["n"]
        if all(k in n for k in ("na", "k", "cl")) and "beb" not in n:
            # Balance electrolítico (mEq/kg) = Na/23 + K/39.1 - Cl/35.45  (g/kg -> mEq)
            n["beb"] = round(n["na"] * 10000 / 22.99 + n["k"] * 10000 / 39.10 - n["cl"] * 10000 / 35.45, 1)
        if "p" in n and "p_fit" in n and "p_nf" not in n:
            n["p_nf"] = round(max(n["p"] - n["p_fit"], 0), 4)
        # elimina ceros espurios en nutrientes no aplicables? se conservan: 0 es dato real.
    return items


def main():
    items = derive(fedna() + feedtables())
    ids = set()
    for it in items:
        base, k = it["id"], 2
        while it["id"] in ids:
            it["id"] = f"{base}-{k}"; k += 1
        ids.add(it["id"])
    keys = sorted({k for it in items for k in it["n"]})
    json.dump({"generated": "FEDNA 2019 (v.15.01.2021) + Feedtables INRAE-CIRAD-AFZ", "items": items},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"{len(items)} ingredientes -> {OUT}")
    print("claves:", " ".join(keys))


if __name__ == "__main__":
    main()
