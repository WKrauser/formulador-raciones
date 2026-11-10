import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { mixingSheetHtml, mixLines, formulaReportHtml } from '../src/lib/reports';
import { DEFAULT_SETTINGS, type Formula } from '../src/lib/types';

const f: Formula = {
  id: 'f1', name: 'Prueba', species: 'Pollos', constraints: [{ key: 'pb', min: 20, max: null }], ratios: [],
  items: [
    { ingId: 'a', price: 0.25, min: null, max: null },
    { ingId: 'b', price: 0.45, min: null, max: null },
    { ingId: 'c', price: 3.5, min: null, max: null },
    { ingId: 'd', price: 1.1, min: null, max: null },
  ],
  result: { status: 'optimal', inclusion: { a: 60.8, b: 35, c: 0.2, d: 4 }, costPerKg: 0.32, nutrients: { pb: 20 }, shadow: {}, reduced: {} },
  batchKg: 500, version: 2, createdAt: 0, updatedAt: 0,
};
const names = { a: { name: 'Maíz', source: 'FEDNA' }, b: { name: 'Soja <47>', source: 'FEDNA' }, c: { name: 'DL-Metionina', source: 'FEDNA' }, d: { name: 'Aceite Soja', source: 'FEDNA' } };

describe('informes', () => {
  it('ordena macro antes que micro y suma el tamaño de bachada', () => {
    const l = mixLines(f, names, 500, 3);
    expect(l.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(l[3].liquid).toBe(true);
    expect(l[2].micro).toBe(true);
    expect(l.reduce((s, x) => s + x.kgBatch, 0)).toBeCloseTo(500, 9);
    expect(l[0].kgTotal).toBeCloseTo(0.608 * 1500, 9);
  });
  it('genera HTML escapado', () => {
    const h = mixingSheetHtml(f, names, DEFAULT_SETTINGS, 500, 3, 'L1', 5);
    expect(h).toContain('Soja &lt;47&gt;');
    expect(h).toContain('Microingredientes');
    if (process.env.REPORT_OUT) {
      writeFileSync(process.env.REPORT_OUT + '/mix.html', h);
      writeFileSync(process.env.REPORT_OUT + '/rep.html', formulaReportHtml(f, names, DEFAULT_SETTINGS));
    }
  });
});
