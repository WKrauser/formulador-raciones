"""Descarga la composición de todas las materias primas de feedtables.com (INRAE-CIRAD-AFZ).

Uso: python3 tools/scrape_ft.py tools/sources/feedtables_raw.json
Luego: python3 tools/build_data.py
"""
import concurrent.futures as cf
import html
import json
import re
import sys
import time
import urllib.request

BASE = 'https://www.feedtables.com'
CATS = {
    'cereal-grains': 'Granos de cereales', 'cereal-byproducts': 'Subproductos de cereales',
    'legumes-and-oilseeds': 'Leguminosas y oleaginosas', 'oil-byproducts': 'Harinas y tortas oleaginosas',
    'animal-products': 'Productos animales', 'dairy-products': 'Productos lácteos',
    'mineral-products': 'Minerales', 'oils-and-fats': 'Aceites y grasas',
    'other-plant-products': 'Otros productos vegetales', 'roots-and-byproducts': 'Raíces y subproductos',
    'fruits-and-byproducts': 'Frutas y subproductos', 'amino-acids-0': 'Aminoácidos',
}


def fetch(path):
    for a in range(6):
        try:
            req = urllib.request.Request(BASE + path, headers={'User-Agent': 'Mozilla/5.0 (feed formulation)'})
            return urllib.request.urlopen(req, timeout=60).read().decode('utf-8', 'ignore')
        except Exception:
            time.sleep(2 ** a)
    raise RuntimeError('No se pudo descargar ' + path)


def clean(c):
    return html.unescape(re.sub(r'<[^>]+>|\s+', ' ', c)).strip()


def num(s):
    try:
        return float(s.replace(',', '').strip())
    except ValueError:
        return None


def feed(slug):
    h = fetch('/content/' + slug)
    m = re.search(r'<title>([^<|]*)', h)
    rows = []
    for r in re.findall(r'<tr[^>]*>(.*?)</tr>', h, flags=re.S):
        cells = {}
        for a, c in re.findall(r'<td([^>]*)>(.*?)</td>', r, flags=re.S):
            k = re.search(r'views-field-field-([a-z0-9\-]+)', a)
            if k:
                cells[k.group(1)] = clean(c)
        if 'parameter' in cells:
            rows.append({'p': cells['parameter'], 'af': num(cells.get('value-as-fed', '')),
                         'dm': num(cells.get('value-on-dm', '')), 'u': cells.get('unit', ''),
                         'o': num(cells.get('value-other-basis', '')), 'u2': cells.get('unit-2', '')})
    return slug, {'title': html.unescape(m.group(1)).strip() if m else slug, 'rows': rows}


def main(out):
    cat_of = {}
    for c, name in CATS.items():
        h = fetch('/content/' + c)
        i = h.find('id="content"')
        for s in set(re.findall(r'href="/content/([a-z0-9\-]+)"', h[i:] if i > 0 else h)):
            cat_of.setdefault(s, name)
    slugs = sorted(s for s in cat_of if s not in CATS)
    data = {}
    with cf.ThreadPoolExecutor(3) as ex:
        for slug, d in ex.map(feed, slugs):
            if d['rows']:
                d['cat'] = cat_of[slug]
                data[slug] = d
    json.dump(data, open(out, 'w', encoding='utf-8'), ensure_ascii=False)
    print(f'{len(data)} materias primas -> {out}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'tools/sources/feedtables_raw.json')
