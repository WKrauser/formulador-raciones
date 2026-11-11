"""Genera src/data/ingredients.json a partir de:
  - tools/sources/fedna2019.xlsx   (Tablas FEDNA 2019, 4a ed., fundacionfedna.org)
  - tools/sources/feedtables_raw.json (INRAE-CIRAD-AFZ, feedtables.com; generado con tools/scrape_ft.py)
  - tools/sources/fedna_forrajes.json (fichas FEDNA de forrajes y subproductos húmedos; tools/fedna_forrajes.py)
  - tools/sources/NASEM_feed_library.csv (biblioteca de alimentos NASEM 2021, distribuida con el paquete
    abierto nasem_dairy; propiedad intelectual de NASEM)

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
        rup_pct = None
        for row in d["rows"]:
            p, v = row["p"], row["af"]
            if p == "Rumen Undegradable Protein (diet 50% concentrate) NRC 2001" and row.get("o") is not None:
                rup_pct = row["o"]
                continue
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
        if rup_pct is not None and "pb" in n:
            n["pndr"] = r(n["pb"] * rup_pct / 100)
            n["pdr"] = r(n["pb"] - n["pndr"])
        out.append({
            "id": "ft:" + s,
            "name": d["title"],
            "code": s,
            "source": "Feedtables",
            "category": d.get("cat", "Otros"),
            "n": n,
        })
    return out


# ---------------------------------------------------------------- FEDNA forrajes y subproductos húmedos
FF_PCT = {"Cenizas": "cenizas", "PB": "pb", "EE": "ee", "FB": "fb", "FND": "fnd", "FAD": "fad", "LAD": "lad",
          "Almidón": "almidon", "Azúcares": "azucares", "Ca": "ca", "P": "p", "Na": "na", "Cl": "cl",
          "Mg": "mg", "K": "k", "S": "s"}
FF_MCAL = {"EM 3x": "em_rum", "EM": "em_rum", "EN": "enl_rum", "ENI": "enl_rum", "ENm": "enm_rum", "ENc": "eng_rum"}
FF_UF = {"UFI": "ufl", "UFc": "ufc"}
LABEL_HEADERS = {"Materia seca", "MS", "VRF"}


def _num(c):
    c = (c or "").strip().replace(",", ".")
    try:
        return float(c)
    except ValueError:
        return None


def _hdr(h):
    """Normaliza encabezados: quita llamadas de nota (' 1', ' 2', ' 3') salvo en 'EM 3' (EM NRC carne, se omite)."""
    h = h.strip()
    if h == "EM 3":
        return "EM_NRC_CARNE"
    if h.startswith("Degradabilidad del N") or h.startswith("Degrabilidad del N"):
        return "DEG_N"
    return re.sub(r"\s+[123]$", "", h)


def _label_key(lbl):
    lbl = lbl.replace(" ", "")
    m = re.match(r"^([A-Za-zÁÉÍÓÚáéíóú]+)", lbl)
    return m.group(1).lower() if m and not lbl[0] in "<>" else lbl


def _ms_from_class(lbl):
    lbl = lbl.replace(" ", "")
    nums = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", lbl)]
    if not nums:
        return None
    if lbl.startswith("<"):
        return nums[0] - 2.5
    if lbl.startswith(">"):
        return nums[0] + 2.5
    return sum(nums[:2]) / len(nums[:2])


def fedna_forrajes():
    path = os.path.join(SRC, "fedna_forrajes.json")
    if not os.path.exists(path):
        return []
    data = json.load(open(path, encoding="utf-8"))
    out = []
    for slug_, page in data.items():
        common = {}  # valores en base MS que aplican a todas las variantes
        variants = {}  # clave -> {"label": str, "v": {...}}
        order = []
        for t in page["tables"]:
            rows = [row for row in t if row and any(c for c in row)]
            # encabezado = primera fila sin números, distinta de 'RUMIANTES'
            hi = next((i for i, row in enumerate(rows)
                       if len(row) >= 2 and not any(_num(c) is not None for c in row)
                       and [c for c in row if c] != ["RUMIANTES"] and row[0] not in ("VALORES NUTRICIONALES",)), None)
            if hi is None:
                continue
            head = [_hdr(h) for h in rows[hi]]
            body = rows[hi + 1:]
            pdi_pct = any("(%MS)" in c for row in body for c in row)
            body = [row for row in body if not (row and row[0].startswith("("))]
            if head[0] == "Ácidos grasos":
                for row in body:
                    if row and row[0] == "% Alimento":
                        for h, c in zip(head, row):
                            v = _num(c)
                            if v is not None and h in ("C 18:2", "C 18:3"):
                                common["c18_2" if h == "C 18:2" else "c18_3"] = v
                continue
            labeled = head[0] in LABEL_HEADERS
            for row in body:
                vals = {}
                for h, c in zip(head[1:] if labeled else head, row[1:] if labeled else row):
                    v = _num(c)
                    if v is None:
                        continue
                    if h == "Humedad":
                        vals["ms"] = 100 - v
                    elif h in FF_PCT:
                        vals[FF_PCT[h]] = v
                    elif h in FF_MCAL:
                        vals[FF_MCAL[h]] = v * 1000
                    elif h in FF_UF:
                        vals[FF_UF[h]] = v
                    elif h in ("PDIA", "PDIE", "PDIN"):
                        vals[h.lower()] = v if pdi_pct else v / 10
                    elif h == "DEG_N":
                        vals["_deg"] = v
                if labeled:
                    key = _label_key(row[0])
                    if key not in variants:
                        variants[key] = {"label": row[0], "v": {}}
                        order.append(key)
                    elif "(" in row[0]:
                        variants[key]["label"] = row[0]
                    variants[key]["v"].update(vals)
                else:
                    common.update(vals)
        if not order:
            variants = {"_": {"label": None, "v": {}}}
            order = ["_"]
        for key in order:
            dm = {**common, **variants[key]["v"]}
            lbl = variants[key]["label"]
            if "ms" not in dm and lbl:
                ms = _ms_from_class(lbl)
                if ms:
                    dm["ms"] = ms
            if "ms" not in dm or "pb" not in dm:
                continue
            ms = dm["ms"]
            n = {"ms": r(ms, 2)}
            for k, v in dm.items():
                if k in ("ms", "_deg"):
                    continue
                n[k] = r(v * ms / 100, 4 if k not in ("em_rum", "enl_rum", "enm_rum", "eng_rum") else 1)
            if "_deg" in dm:
                n["pdr"] = r(n["pb"] * dm["_deg"] / 100)
                n["pndr"] = r(n["pb"] - n["pdr"])
            if lbl and re.match(r"^[<>]?\s*\d", lbl):
                name = f"{page['title']} — MS {lbl.replace(' ', '')} %"
            elif lbl:
                name = f"{page['title']} — calidad {lbl.replace('(', '(VRF ')}"
            else:
                name = page["title"]
            out.append({
                "id": "fedna:" + slug(slug_ + ("-" + key if key != "_" else "")),
                "name": name,
                "code": slug_,
                "source": "FEDNA",
                "category": page["group"],
                "forage": page["group"] == "Forrajes",
                "n": n,
            })
    return out


# ---------------------------------------------------------------- NASEM 2021 (biblioteca de alimentos)
NASEM_CAT = {
    "Grain Crop Forage": "Forrajes de cultivos de grano", "Grass/Legume Forage": "Forrajes de gramíneas y leguminosas",
    "Pasture": "Pasturas", "Energy Source": "Fuentes de energía", "Plant Protein": "Proteína vegetal",
    "Animal Protein": "Proteína animal", "By-Product/Other": "Subproductos", "By-product/Other": "Subproductos",
    "Vitamin/Mineral": "Minerales y vitaminas", "Fat Supplement": "Grasas", "Fatty Acid Supplement": "Grasas",
    "Additive": "Aditivos", "Calf Liquid Feed": "Alimentos líquidos para terneros", "Sugar/Sugar Alcohol": "Azúcares",
}
NASEM_PCT = {"Fd_CP": "pb", "Fd_CFat": "ee", "Fd_NDF": "fnd", "Fd_ADF": "fad", "Fd_Lg": "lad", "Fd_St": "almidon",
             "Fd_WSC": "azucares", "Fd_Ash": "cenizas", "Fd_Ca": "ca", "Fd_P": "p", "Fd_Na": "na", "Fd_Cl": "cl",
             "Fd_K": "k", "Fd_Mg": "mg", "Fd_S": "s"}
NASEM_PPM = {"Fd_Cu": "cu", "Fd_Fe": "fe", "Fd_Mn": "mn", "Fd_Zn": "zn", "Fd_Se": "se", "Fd_I": "i", "Fd_Co": "co",
             "Fd_Biotin": "biotina", "Fd_Choline": "colina"}
NASEM_AA = {"Lys": "lys", "Met": "met", "Thr": "thr", "Trp": "trp", "Ile": "ile", "Val": "val", "Arg": "arg",
            "Leu": "leu", "His": "his", "Phe": "phe"}


def nrc_ne(me):
    """NEl, NEm y NEg (Mcal/kg MS) a partir de EM (NRC 2001 / NRC 1984)."""
    nel = 0.703 * me - 0.19
    nem = 1.37 * me - 0.138 * me ** 2 + 0.0105 * me ** 3 - 1.12
    neg = 1.42 * me - 0.174 * me ** 2 + 0.0122 * me ** 3 - 1.65
    return max(nel, 0), max(nem, 0), max(neg, 0)


def nasem():
    import csv
    path = os.path.join(SRC, "NASEM_feed_library.csv")
    if not os.path.exists(path):
        return []
    out = []
    for row in csv.DictReader(open(path, encoding="utf-8-sig")):
        f = lambda k: _num(row.get(k))  # noqa: E731
        ms = f("Fd_DM")
        if not ms:
            continue
        cat = row["Fd_Category"]
        k = ms / 100  # % MS -> tal cual
        dm = {}
        for col, key in NASEM_PCT.items():
            if f(col) is not None:
                dm[key] = f(col)
        for col, key in NASEM_PPM.items():
            if f(col) is not None:
                dm[key] = f(col)
        if cat in ("Vitamin/Mineral", "Additive"):
            for key in ("pb", "ee", "fnd", "fad", "ca", "p", "na", "cl", "k", "mg", "s"):
                dm.setdefault(key, 0.0)  # la biblioteca deja vacío lo que el mineral no contiene
        cp = dm.get("pb", 0)
        for aa, key in NASEM_AA.items():
            v = f(f"Fd_{aa}_CP")
            if v is not None and cp:
                dm[key] = v * cp / 100
        if f("Fd_C182_FA") is not None and f("Fd_FA"):
            dm["c18_2"] = f("Fd_C182_FA") * f("Fd_FA") / 100
        de = f("Fd_DE_Base") or 0
        if de > 0:
            if cat in ("Fat Supplement", "Fatty Acid Supplement"):
                me, nel, nem, neg = de, 0.8 * de, 0.8 * de, 0.55 * de  # NRC 2001, grasas
            else:
                ee = dm.get("ee", 0)
                me = 1.01 * de - 0.45 + (0.0046 * (ee - 3) if ee > 3 else 0)
                nel, nem, neg = nrc_ne(me)
            dm.update({"em_rum": me * 1000, "enl_rum": nel * 1000, "enm_rum": nem * 1000, "eng_rum": neg * 1000,
                       "tdn": de / 4.409 * 100})
        elif cat in ("Vitamin/Mineral", "Additive"):
            dm.update({"em_rum": 0, "enl_rum": 0, "enm_rum": 0, "eng_rum": 0, "tdn": 0})
        rup = f("Fd_RUP_base")
        if rup is not None and cp:
            dm["pndr"] = cp * rup / 100
            dm["pdr"] = cp - dm["pndr"]
        # coeficientes de absorción NASEM 2021
        ac_ca = f("Fd_acCa_input")
        if cat == "Vitamin/Mineral":
            ac_p = f("Fd_acPtot_input")
        else:
            ac_p = ((f("Fd_Pinorg_P") or 0) * 0.0084 + (f("Fd_Porg_P") or 0) * 0.0068) or None
        if ac_ca is not None and "ca" in dm:
            dm["ca_abs"] = dm["ca"] * ac_ca
        if ac_p is not None and "p" in dm:
            dm["p_abs"] = dm["p"] * ac_p
        conc = f("Fd_Conc") or 0
        forage = conc < 50 and cat not in ("Vitamin/Mineral", "Additive", "Calf Liquid Feed")
        if forage and "fnd" in dm:
            dm["fnd_forraje"] = dm["fnd"] * (100 - conc) / 100
        n = {"ms": r(ms, 2)}
        for key, v in dm.items():
            n[key] = r(v * k, 1 if key in ("em_rum", "enl_rum", "enm_rum", "eng_rum") else 4)
        out.append({
            "id": "nasem:" + slug(row["Fd_Name"]),
            "name": row["Fd_Name"],
            "code": row.get("UID") or row["Fd_Name"],
            "source": "NASEM",
            "category": NASEM_CAT.get(cat, cat),
            "forage": forage,
            "n": n,
        })
    return out


FORAGE_RE = re.compile(r"alfalfa|heno|paja|forrajer|ensilad|silo|straw|hay\b|grass|ray-grass|pasto|pradera", re.I)
CARBONATE_RE = re.compile(r"carbonat|limestone|caliza|conchilla|seashell|oyster|dolomit|maerl", re.I)
MINERAL_CATS = {"Minerales", "Microingredientes", "Minerales y vitaminas"}


def derive_ruminant(it):
    n = it["n"]
    forage = it.get("forage")
    if forage is None:
        forage = bool(FORAGE_RE.search(it["name"] + " " + it.get("code", ""))) and it["category"] not in MINERAL_CATS
        it["forage"] = forage
    if forage and "fnd" in n and "fnd_forraje" not in n:
        n["fnd_forraje"] = n["fnd"]
    if "tdn" not in n and n.get("em_rum"):
        # EM = 0.82 ED; ED = 4.409 NDT (NRC)
        n["tdn"] = r(n["em_rum"] / 1000 / 0.82 / 4.409 * 100, 2)
    pb = n.get("pb")
    if pb and "pndr" not in n and n.get("pdia") is not None:
        # INRA: PDIA = 1.11 · PB · (1 − DT) · dr ; se asume dr = 0.85 (estimación)
        frac = min(max(n["pdia"] / (1.11 * pb * 0.85), 0), 0.9)
        n["pndr"] = r(pb * frac)
        n["pdr"] = r(pb - n["pndr"])
        it["est"] = sorted(set(it.get("est", []) + ["pndr", "pdr"]))
    if pb is not None and pb <= 0.5 and "pndr" not in n:
        n["pndr"] = 0.0
        n["pdr"] = r(pb)
    if "pndr" in n and "pdr" in n:
        tdn = n.get("tdn", 0)
        # PM estimada (NRC 2001): PBmic = 0.13·NDT limitada por 0.85·PDR; PMmic = 0.64·PBmic; PNDR digestible 80 %
        n["pm_ndt"] = r(0.64 * 0.13 * tdn * 10 + 0.8 * n["pndr"] * 10, 2)
        n["pm_pdr"] = r(0.64 * 0.85 * n["pdr"] * 10 + 0.8 * n["pndr"] * 10, 2)
    if "ca" in n and "ca_abs" not in n:
        ac = 0.45 if CARBONATE_RE.search(it["name"]) else 0.6 if it["category"] in MINERAL_CATS else 0.4 if forage else 0.6
        n["ca_abs"] = r(n["ca"] * ac)
        it["est"] = sorted(set(it.get("est", []) + ["ca_abs"]))
    if "p" in n and "p_abs" not in n:
        ac = 0.70 if it["category"] in MINERAL_CATS else 0.787 if forage else 0.70
        n["p_abs"] = r(n["p"] * ac)
        it["est"] = sorted(set(it.get("est", []) + ["p_abs"]))


def derive(items):
    for it in items:
        n = it["n"]
        if all(k in n for k in ("na", "k", "cl")) and "beb" not in n:
            # Balance electrolítico (mEq/kg) = Na/23 + K/39.1 - Cl/35.45  (g/kg -> mEq)
            n["beb"] = round(n["na"] * 10000 / 22.99 + n["k"] * 10000 / 39.10 - n["cl"] * 10000 / 35.45, 1)
        if "p" in n and "p_fit" in n and "p_nf" not in n:
            n["p_nf"] = round(max(n["p"] - n["p_fit"], 0), 4)
        derive_ruminant(it)
        # elimina ceros espurios en nutrientes no aplicables? se conservan: 0 es dato real.
    return items


def main():
    items = derive(fedna() + fedna_forrajes() + feedtables() + nasem())
    ids = set()
    for it in items:
        base, k = it["id"], 2
        while it["id"] in ids:
            it["id"] = f"{base}-{k}"; k += 1
        ids.add(it["id"])
    keys = sorted({k for it in items for k in it["n"]})
    json.dump({"generated": "FEDNA 2019 (v.15.01.2021) + FEDNA forrajes + Feedtables INRAE-CIRAD-AFZ + NASEM 2021", "items": items},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"{len(items)} ingredientes -> {OUT}")
    print("claves:", " ".join(keys))


if __name__ == "__main__":
    main()
