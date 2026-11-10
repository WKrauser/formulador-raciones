import { Capacitor } from '@capacitor/core';

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * Guarda/comparte un archivo de texto.
 * - Android (Capacitor): lo escribe en caché y abre el diálogo "Compartir" (Drive, WhatsApp, correo, imprimir...).
 * - Windows (Electron) y navegador: descarga directa.
 */
export async function saveFile(filename: string, content: string, mime: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);
    const res = await Filesystem.writeFile({ path: filename, data: toBase64(content), directory: Directory.Cache });
    await Share.share({ title: filename, url: res.uri, dialogTitle: 'Guardar o compartir' });
    return;
  }
  const blob = new Blob([mime.startsWith('text/csv') ? '﻿' + content : content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Abre un documento HTML para imprimir (o guardar como PDF). En Android lo comparte como .html. */
export async function printHtml(filename: string, html: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await saveFile(filename.replace(/\.pdf$/i, '') + '.html', html, 'text/html');
    return;
  }
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow!.document;
  doc.open();
  doc.write(html);
  doc.close();
  await new Promise((r) => setTimeout(r, 250));
  iframe.contentWindow!.focus();
  iframe.contentWindow!.print();
  setTimeout(() => iframe.remove(), 60000);
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file, 'utf-8');
  });
}

/** CSV con separador ";" (compatible con Excel en configuración regional española). */
export function toCSV(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((r) =>
      r
        .map((c) => {
          if (c === null || c === undefined) return '';
          const s = typeof c === 'number' ? String(c).replace('.', ',') : c;
          return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(';'),
    )
    .join('\r\n');
}

/** Lector CSV tolerante: detecta separador ; , o tabulador y comas decimales. */
export function parseCSV(text: string): string[][] {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/)[0] ?? '';
  const sep = [';', '\t', ','].map((s) => [s, first.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) {
      row.push(cur);
      cur = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else cur += ch;
  }
  if (cur !== '' || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function parseNum(s: string | undefined | null): number | null {
  if (s === undefined || s === null) return null;
  const t = String(s).trim();
  if (t === '') return null;
  // "1.234,5" -> 1234.5 ; "1,5" -> 1.5 ; "1.5" -> 1.5
  const norm = t.includes(',') && t.includes('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(',', '.');
  const v = Number(norm);
  return Number.isFinite(v) ? v : null;
}
