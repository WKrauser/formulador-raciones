import { NUTRIENT_MAP, fmt } from '../data/nutrients';
import type { Formula, Settings } from './types';
import { PRICE_UNIT_KG } from './types';

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const STYLE = `
  *{box-sizing:border-box} body{font-family:Segoe UI,Roboto,Arial,sans-serif;color:#111;margin:24px;font-size:12px}
  h1{font-size:18px;margin:0 0 4px} h2{font-size:14px;margin:18px 0 6px;border-bottom:2px solid #2f6b3a;padding-bottom:2px}
  .muted{color:#555} .head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
  .meta{display:grid;grid-template-columns:auto auto;gap:2px 12px;font-size:12px}
  table{border-collapse:collapse;width:100%;margin-top:4px} th,td{border:1px solid #999;padding:4px 6px;text-align:left}
  th{background:#e8f0e9} td.n{text-align:right;font-variant-numeric:tabular-nums} tr.tot td{font-weight:700;background:#f4f4f4}
  .box{display:inline-block;width:14px;height:14px;border:1.5px solid #333}
  .sign{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:40px} .sign div{border-top:1px solid #333;padding-top:4px;text-align:center}
  .warn{color:#8a5a00} .bad{color:#b00020}
  @media print{body{margin:10mm} button{display:none}}
`;

function header(title: string, f: Formula, s: Settings, extra: [string, string][] = []): string {
  const rows: [string, string][] = [
    ['Fórmula', `${f.name}${f.code ? ' (' + f.code + ')' : ''}`],
    ['Versión', String(f.version)],
    ['Especie / etapa', f.species ?? ''],
    ['Fecha', new Date().toLocaleString('es')],
    ...extra,
  ];
  return `<div class="head"><div><h1>${esc(title)}</h1><div class="muted">${esc(s.company || 'Formulador de raciones')}</div></div>
  <div class="meta">${rows.map(([a, b]) => `<b>${esc(a)}:</b><span>${esc(b)}</span>`).join('')}</div></div>`;
}

function doc(title: string, body: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${STYLE}</style></head><body>${body}</body></html>`;
}

export interface MixLine {
  id: string;
  name: string;
  pct: number;
  kgBatch: number;
  kgTotal: number;
  micro: boolean;
  liquid: boolean;
}

const LIQUID = /\b(aceite|grasa|sebo|manteca|melaza|vinaza|oleina|glicerina|mantequilla|lecitina|oil|fat|tallow|lard|molasses|vinasse|grease)/i;

export function mixLines(f: Formula, ings: Record<string, { name: string }>, batchKg: number, batches: number): MixLine[] {
  const inc = f.result?.inclusion ?? {};
  return Object.entries(inc)
    .filter(([, p]) => p > 1e-6)
    .map(([id, pct]) => ({
      id,
      name: ings[id]?.name ?? id,
      pct,
      kgBatch: (pct / 100) * batchKg,
      kgTotal: (pct / 100) * batchKg * batches,
      micro: pct < 1 && !LIQUID.test(ings[id]?.name ?? ''),
      liquid: LIQUID.test(ings[id]?.name ?? ''),
    }))
    .sort((a, b) => (a.liquid ? 2 : a.micro ? 1 : 0) - (b.liquid ? 2 : b.micro ? 1 : 0) || b.pct - a.pct);
}

/** Hoja de mezclado: orden de carga, pesos por bachada y totales, con casillas de verificación. */
export function mixingSheetHtml(
  f: Formula,
  ings: Record<string, { name: string }>,
  s: Settings,
  batchKg: number,
  batches: number,
  lot: string,
  mixTimeMin: number,
): string {
  const lines = mixLines(f, ings, batchKg, batches);
  const kgDec = batchKg >= 100 ? 2 : 3;
  let cum = 0;
  const macro = lines.filter((l) => !l.micro && !l.liquid);
  const micro = lines.filter((l) => l.micro);
  const liquid = lines.filter((l) => l.liquid);
  const row = (l: MixLine, i: number) => {
    cum += l.kgBatch;
    return `<tr><td class="n">${i + 1}</td><td>${esc(l.name)}</td><td class="n">${fmt(l.pct, 3)}</td><td class="n">${fmt(
      l.kgBatch,
      kgDec,
    )}</td><td class="n">${fmt(cum, kgDec)}</td><td class="n">${fmt(l.kgTotal, kgDec)}</td><td></td><td style="text-align:center"><span class="box"></span></td></tr>`;
  };
  const microKg = micro.reduce((a, l) => a + l.kgBatch, 0);
  const body = `
  ${header('Hoja de mezclado', f, s, [
    ['Lote', lot],
    ['Tamaño de bachada', `${fmt(batchKg, 0)} kg`],
    ['Número de bachadas', String(batches)],
    ['Total a producir', `${fmt(batchKg * batches, 0)} kg`],
  ])}
  <h2>Orden de carga</h2>
  <table><thead><tr><th>#</th><th>Ingrediente</th><th>%</th><th>kg / bachada</th><th>Acumulado (kg)</th><th>kg total (${batches} bach.)</th><th>Peso real</th><th>✓</th></tr></thead>
  <tbody>
  ${macro.map((l, i) => row(l, i)).join('')}
  ${
    micro.length
      ? `<tr><td colspan="8"><b>Microingredientes</b> (&lt; 1 %). Pesar en balanza de precisión y premezclar con ~${fmt(
          Math.max(microKg * 4, batchKg * 0.01),
          kgDec,
        )} kg del ingrediente principal antes de agregar a la mezcladora.</td></tr>`
      : ''
  }
  ${micro.map((l, i) => row(l, macro.length + i)).join('')}
  ${liquid.length ? '<tr><td colspan="8"><b>Líquidos</b>. Agregar al final, con la mezcladora en marcha.</td></tr>' : ''}
  ${liquid.map((l, i) => row(l, macro.length + micro.length + i)).join('')}
  <tr class="tot"><td></td><td>Total</td><td class="n">${fmt(lines.reduce((a, l) => a + l.pct, 0), 3)}</td><td class="n">${fmt(
    batchKg,
    kgDec,
  )}</td><td></td><td class="n">${fmt(batchKg * batches, kgDec)}</td><td></td><td></td></tr>
  </tbody></table>
  <h2>Instrucciones</h2>
  <ol>
    <li>Verifique la calibración de la báscula y la limpieza de la mezcladora antes de iniciar.</li>
    <li>Cargue los macroingredientes en el orden indicado; agregue la premezcla de microingredientes y por último los líquidos (aceites, melaza).</li>
    <li>Tiempo de mezclado recomendado: <b>${mixTimeMin} min</b> después de la última adición (ajuste según su equipo).</li>
    <li>Registre el peso real de cada ingrediente y marque la casilla al agregarlo.</li>
  </ol>
  <div class="sign"><div>Elaboró</div><div>Supervisó</div><div>Control de calidad</div></div>
  `;
  return doc(`Hoja de mezclado - ${f.name}`, body);
}

/** Informe nutricional y de costos de la fórmula. */
export function formulaReportHtml(f: Formula, ings: Record<string, { name: string; source?: string }>, s: Settings): string {
  const r = f.result;
  if (!r) return doc('Informe', '<p>La fórmula no se ha resuelto.</p>');
  const unitKg = PRICE_UNIT_KG[s.priceUnit];
  const priceLabel = s.priceUnit === 'kg' ? '/kg' : s.priceUnit === 't' ? '/t' : '/qq';
  const items = f.items
    .map((it) => ({ it, pct: r.inclusion[it.ingId] ?? 0 }))
    .filter((x) => x.pct > 1e-6)
    .sort((a, b) => b.pct - a.pct);
  const ingRows = items
    .map(
      ({ it, pct }) =>
        `<tr><td>${esc(ings[it.ingId]?.name ?? it.ingId)}</td><td>${esc(ings[it.ingId]?.source ?? '')}</td><td class="n">${fmt(pct, 3)}</td><td class="n">${fmt(
          it.price * unitKg,
          2,
        )}</td><td class="n">${fmt((it.price * pct) / 100 * 1000, 2)}</td><td class="n">${fmt(((it.price * pct) / 100 / r.costPerKg) * 100, 1)}</td></tr>`,
    )
    .join('');
  const nutRows = f.constraints
    .map((c) => {
      const nu = NUTRIENT_MAP[c.key];
      const dm = c.basis === 'ms';
      const v = dm ? ((r.nutrients[c.key] ?? 0) * 100) / Math.max(r.nutrients.ms ?? 0, 1e-9) : r.nutrients[c.key] ?? 0;
      const tol = 1e-6 * Math.max(1, Math.abs(v));
      const ok = (c.min === null || v >= c.min - tol) && (c.max === null || v <= c.max + tol);
      const sk = dm ? `${c.key}@ms` : c.key;
      const sp = (r.shadow[`${sk}:min`] ?? 0) + (r.shadow[`${sk}:max`] ?? 0);
      return `<tr><td>${esc(nu?.name ?? c.key)}</td><td>${esc((nu?.unit ?? '') + (dm ? ' MS' : ''))}</td><td class="n">${fmt(c.min, nu?.decimals ?? 2)}</td><td class="n">${fmt(
        c.max,
        nu?.decimals ?? 2,
      )}</td><td class="n ${ok ? '' : 'bad'}">${fmt(v, nu?.decimals ?? 2)}</td><td class="n">${sp ? fmt(sp * 1000, 4) : ''}</td></tr>`;
    })
    .join('');
  const constrained = new Set(f.constraints.map((c) => c.key));
  const others = Object.entries(r.nutrients)
    .filter(([k]) => !constrained.has(k) && NUTRIENT_MAP[k])
    .map(([k, v]) => `<tr><td>${esc(NUTRIENT_MAP[k].name)}</td><td>${esc(NUTRIENT_MAP[k].unit)}</td><td class="n">${fmt(v, NUTRIENT_MAP[k].decimals)}</td></tr>`)
    .join('');
  const body = `
  ${header('Informe de fórmula', f, s, [
    ['Costo', `${s.currency} ${fmt(r.costPerKg * unitKg, 2)} ${priceLabel}  ·  ${s.currency} ${fmt(r.costPerKg * 1000, 2)} /t`],
    ['MS de la mezcla', `${fmt(r.nutrients.ms ?? 0, 1)} %`],
    ...((f.dmi && (r.nutrients.ms ?? 0) > 0
      ? [
          [
            'Ración por animal y día',
            `${fmt(f.dmi / ((r.nutrients.ms ?? 0) / 100), 2)} kg TC (${fmt(f.dmi, 2)} kg MS) · ${s.currency} ${fmt(
              (r.costPerKg * f.dmi) / ((r.nutrients.ms ?? 0) / 100),
              2,
            )}`,
          ],
        ]
      : []) as [string, string][]),
  ])}
  <h2>Composición de la fórmula</h2>
  <table><thead><tr><th>Ingrediente</th><th>Fuente</th><th>Inclusión %</th><th>Precio ${esc(s.currency)}${priceLabel}</th><th>Aporte ${esc(
    s.currency,
  )}/t</th><th>% del costo</th></tr></thead><tbody>${ingRows}
  <tr class="tot"><td>Total</td><td></td><td class="n">100,000</td><td></td><td class="n">${fmt(r.costPerKg * 1000, 2)}</td><td class="n">100</td></tr></tbody></table>
  <h2>Especificaciones nutricionales (base tal cual)</h2>
  <table><thead><tr><th>Nutriente</th><th>Unidad</th><th>Mínimo</th><th>Máximo</th><th>Fórmula</th><th>Precio sombra ${esc(
    s.currency,
  )}/t por unidad</th></tr></thead><tbody>${nutRows}</tbody></table>
  ${f.ratios.length ? `<h2>Relaciones</h2><table><thead><tr><th>Relación</th><th>Mín.</th><th>Máx.</th><th>Fórmula</th></tr></thead><tbody>${f.ratios
    .map(
      (q) =>
        `<tr><td>${esc(NUTRIENT_MAP[q.num]?.name ?? q.num)} : ${esc(NUTRIENT_MAP[q.den]?.name ?? q.den)}</td><td class="n">${fmt(q.min, 3)}</td><td class="n">${fmt(
          q.max,
          3,
        )}</td><td class="n">${fmt((r.nutrients[q.num] ?? 0) / Math.max(r.nutrients[q.den] ?? 0, 1e-12), 3)}</td></tr>`,
    )
    .join('')}</tbody></table>` : ''}
  <h2>Otros nutrientes calculados</h2>
  <table><thead><tr><th>Nutriente</th><th>Unidad</th><th>Valor</th></tr></thead><tbody>${others}</tbody></table>
  ${f.notes ? `<h2>Notas</h2><p>${esc(f.notes)}</p>` : ''}
  <p class="muted">Composición de ingredientes: Tablas FEDNA 2019 (fundacionfedna.org), INRAE-CIRAD-AFZ (feedtables.com) e ingredientes locales del usuario.
  Valores calculados a partir de la composición tabulada; verifique con análisis de laboratorio.</p>`;
  return doc(`Informe - ${f.name}`, body);
}
