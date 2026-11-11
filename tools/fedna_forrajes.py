"""Extrae las tablas de las fichas de Forrajes y Subproductos fibrosos húmedos de fundacionfedna.org.

Uso:
  python3 tools/fedna_forrajes.py tools/sources/fedna_forrajes.json            # descarga
  python3 tools/fedna_forrajes.py tools/sources/fedna_forrajes.json DIR_HTML   # usa páginas ya guardadas

Guarda las tablas tal como aparecen (valores en base MS); build_data.py las convierte.
Algunas páginas devuelven una verificación anti-bots; esas se omiten y se informan.
"""
import html
import json
import os
import re
import sys
import urllib.parse
import urllib.request

BASE = 'https://www.fundacionfedna.org'
INDEX = {'/forrajes/introducci%C3%B3n-forrajes': 'Forrajes', '/subproductos-fibrosos-humedos': 'Subproductos fibrosos húmedos'}


def fetch(path):
    req = urllib.request.Request(BASE + path, headers={'User-Agent': 'formulador-raciones/1.0'})
    return urllib.request.urlopen(req, timeout=60).read().decode('utf-8', 'ignore')


def tables(h):
    out = []
    for t in re.findall(r'<table.*?</table>', h, flags=re.S):
        rows = []
        for r in re.findall(r'<tr.*?</tr>', t, flags=re.S):
            cells = [re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', c))).strip()
                     for c in re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', r, flags=re.S)]
            rows.append(cells)
        out.append(rows)
    return out


def parse_page(h):
    m = re.search(r'<title>([^<|]*)', h)
    title = html.unescape(m.group(1)).strip() if m else ''
    if not title or 'One moment' in title or 'no encontrada' in title:
        return None
    return {'title': title, 'tables': tables(h)}


def main(out, local_dir=None):
    pages = {}
    if local_dir:
        # nombre de archivo = slug codificado; el grupo se infiere de la ruta guardada en links.txt
        links = open(os.path.join(local_dir, 'links.txt'), encoding='utf-8').read().split()
        for i, link in enumerate(links, 1):
            f = os.path.join(local_dir, 'pages', f'p{i}.html')
            if os.path.exists(f):
                pages[link] = open(f, encoding='utf-8', errors='ignore').read()
    else:
        for idx in INDEX:
            h = fetch(idx)
            for link in sorted(set(re.findall(r'href="(/(?:forrajes|subproductos_fibrosos_humedos)/[^"]+)"', h))):
                if 'unidades' in link or 'introducci' in link:
                    continue
                try:
                    pages[link] = fetch(urllib.parse.quote(link))
                except Exception as e:  # noqa: BLE001
                    print('error', link, e)
    data, skipped = {}, []
    for link, h in pages.items():
        p = parse_page(h)
        if not p:
            skipped.append(urllib.parse.unquote(link))
            continue
        p['group'] = 'Forrajes' if link.startswith('/forrajes') else 'Subproductos fibrosos húmedos'
        data[urllib.parse.unquote(link).rsplit('/', 1)[1]] = p
    json.dump(data, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print(f'{len(data)} fichas -> {out}')
    if skipped:
        print('Omitidas (no disponibles o verificación anti-bots):', ', '.join(skipped))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
