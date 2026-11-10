import { describe, it, expect, beforeAll } from 'vitest';
import loader from 'highs';
import data from '../src/data/ingredients.json';
import { solveFormula, type HighsLike } from '../src/lib/solver';
import { BUILTIN_REQUIREMENTS } from '../src/data/requirements';
import type { Ingredient } from '../src/lib/types';

const items = (data as unknown as { items: Ingredient[] }).items;
const byId = Object.fromEntries(items.map((i) => [i.id, i]));
let highs: HighsLike;
beforeAll(async () => { highs = (await loader()) as unknown as HighsLike; });

const prices: Record<string, number> = {
  'fedna:maiz-nacional': 0.25, 'fedna:hna-soja-47': 0.45, 'fedna:ac-soja': 1.1,
  'fedna:carbonato-calcico': 0.05, 'fedna:fosfato-bicalcico-dihidratado': 0.7,
  'fedna:cloruro-sodico-mina-99': 0.1, 'fedna:dl-metionina': 3.5, 'fedna:l-lisina-hcl': 1.8,
  'fedna:l-treonina': 2.2, 'fedna:trigo-blando-11-2-pb': 0.24,
};

describe('solver', () => {
  it('todas las claves de ingredientes de prueba existen', () => {
    for (const id of Object.keys(prices)) expect(byId[id], id).toBeTruthy();
  });

  it('formula una dieta de pollos 0-3 semanas a costo mínimo', () => {
    const req = BUILTIN_REQUIREMENTS.find((r) => r.id === 'nrc94-broiler-1')!;
    const res = solveFormula(highs, {
      items: Object.entries(prices).map(([ingId, price]) => ({ ingId, price, min: null, max: null })),
      ingredients: byId,
      constraints: req.constraints.filter((c) => !['his', 'leu', 'k', 'mg', 'colina', 'arg', 'ile', 'val', 'trp'].includes(c.key)),
    });
    expect(res.status, res.message).toBe('optimal');
    const total = Object.values(res.inclusion).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(100, 6);
    expect(res.nutrients.pb).toBeGreaterThanOrEqual(23 - 1e-6);
    expect(res.nutrients.em_aves).toBeGreaterThanOrEqual(3200 - 1e-3);
    expect(res.nutrients.lys).toBeGreaterThanOrEqual(1.1 - 1e-6);
    expect(res.nutrients.p_disp_av).toBeGreaterThanOrEqual(0.45 - 1e-6);
    // costo = suma precio*inclusión
    const cost = Object.entries(res.inclusion).reduce((s, [id, p]) => s + prices[id] * p / 100, 0);
    expect(res.costPerKg).toBeCloseTo(cost, 9);
    console.log(Object.fromEntries(Object.entries(res.inclusion).filter(([, v]) => v > 0).map(([k, v]) => [k, +v.toFixed(3)])), res.costPerKg.toFixed(4), res.shadow);
  });

  it('precio sombra coincide con diferencia finita', () => {
    const base = {
      items: Object.entries(prices).map(([ingId, price]) => ({ ingId, price, min: null, max: null })),
      ingredients: byId,
    };
    const mk = (pb: number) => [{ key: 'pb', min: pb, max: null }, { key: 'em_pollo', min: 3100, max: null }, { key: 'ca', min: 0.9, max: 1.0 }, { key: 'p_disp_av', min: 0.4, max: null }];
    const a = solveFormula(highs, { ...base, constraints: mk(21) });
    const b = solveFormula(highs, { ...base, constraints: mk(21.01) });
    expect(a.status).toBe('optimal');
    const fd = (b.costPerKg - a.costPerKg) / 0.01;
    expect(a.shadow['pb:min']).toBeCloseTo(fd, 4);
  });

  it('diagnostica infactibilidad', () => {
    const res = solveFormula(highs, {
      items: [{ ingId: 'fedna:maiz-nacional', price: 0.25, min: null, max: null }, { ingId: 'fedna:trigo-blando-11-2-pb', price: 0.24, min: null, max: null }],
      ingredients: byId,
      constraints: [{ key: 'pb', min: 20, max: null }],
    });
    expect(res.status).toBe('infeasible');
    expect(res.violations?.[0].label).toBe('Proteína bruta');
    expect(res.violations?.[0].achieved).toBeLessThan(20);
  });

  it('respeta relaciones entre nutrientes (Ca:P disp)', () => {
    const res = solveFormula(highs, {
      items: Object.entries(prices).map(([ingId, price]) => ({ ingId, price, min: null, max: null })),
      ingredients: byId,
      constraints: [{ key: 'pb', min: 21, max: null }, { key: 'ca', min: 0.8, max: null }, { key: 'p_disp_av', min: 0.4, max: null }],
      ratios: [{ num: 'ca', den: 'p_disp_av', min: 2, max: 2.1 }],
    });
    expect(res.status).toBe('optimal');
    const r = res.nutrients.ca / res.nutrients.p_disp_av;
    expect(r).toBeGreaterThanOrEqual(2 - 1e-6);
    expect(r).toBeLessThanOrEqual(2.1 + 1e-6);
  });
});
