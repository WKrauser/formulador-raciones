import { useMemo, useState } from 'react';
import { NUTRIENT_MAP, fmt } from '../data/nutrients';
import { db, uid } from '../lib/db';
import { printHtml, saveFile, toCSV } from '../lib/files';
import { formulaReportHtml, mixingSheetHtml, mixLines } from '../lib/reports';
import { dmValue, getHighs, solveFormula } from '../lib/solver';
import type { Formula, FormulaItem } from '../lib/types';
import { PRICE_UNIT_LABEL } from '../lib/types';
import { setPrice, useData } from '../state';
import { ConstraintEditor, makeMatcher, Modal, NumInput, SourceBadge } from './common';

export function newFormula(batchKg = 1000): Formula {
  const now = Date.now();
  return { id: uid('f:'), name: 'Nueva fórmula', constraints: [], ratios: [], items: [], batchKg, version: 0, createdAt: now, updatedAt: now };
}

const hashOf = (f: Formula) => JSON.stringify([f.items, f.constraints, f.ratios]);

export function FormulateView({ draft, setDraft }: { draft: Formula; setDraft: (f: Formula) => void }) {
  const data = useData();
  const { byId, prices, requirements, settings, toUnit, fromUnit } = data;
  const [reqId, setReqId] = useState(draft.requirementId ?? '');
  const [busy, setBusy] = useState(false);
  const [solvedHash, setSolvedHash] = useState(draft.result ? hashOf(draft) : '');
  const [savedMsg, setSavedMsg] = useState('');
  const [showMix, setShowMix] = useState(false);
  const stale = !!draft.result && solvedHash !== hashOf(draft);
  const r = draft.result;

  const update = (patch: Partial<Formula>) => setDraft({ ...draft, ...patch });
  const setItem = (i: number, patch: Partial<FormulaItem>) => update({ items: draft.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) });

  function addIngredient(id: string) {
    if (draft.items.some((x) => x.ingId === id)) return;
    update({ items: [...draft.items, { ingId: id, price: prices[id]?.price ?? 0, min: null, max: null }] });
  }

  function loadRequirement() {
    const req = requirements.find((x) => x.id === reqId);
    if (!req) return;
    if (draft.constraints.length && !confirm('¿Reemplazar las restricciones actuales por las del perfil seleccionado?')) return;
    update({
      requirementId: req.id,
      species: draft.species || req.name,
      dmi: req.dmi ?? draft.dmi ?? null,
      constraints: req.constraints.map((c) => ({ ...c })),
      ratios: (req.ratios ?? []).map((c) => ({ ...c })),
    });
  }

  async function solve() {
    setBusy(true);
    try {
      const highs = await getHighs();
      const res = solveFormula(highs, { items: draft.items, ingredients: byId, constraints: draft.constraints, ratios: draft.ratios });
      setDraft({ ...draft, result: res });
      setSolvedHash(hashOf(draft));
    } catch (e) {
      alert('No se pudo ejecutar el solver: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save(asNew: boolean) {
    if (!draft.result || draft.result.status !== 'optimal' || stale) {
      if (!confirm('La fórmula no tiene una solución óptima vigente. ¿Guardar de todas formas?')) return;
    }
    const now = Date.now();
    const snapshot = Object.fromEntries(
      draft.items.map((it) => {
        const g = byId[it.ingId];
        return [it.ingId, { name: g?.name ?? it.ingId, source: g?.source ?? 'Local', category: g?.category ?? '', n: g?.n ?? {} }];
      }),
    );
    const f: Formula = asNew
      ? { ...draft, id: uid('f:'), version: 1, createdAt: now, updatedAt: now, snapshot }
      : { ...draft, version: (draft.version || 0) + 1, updatedAt: now, snapshot };
    await db.formulas.put(f);
    setDraft(f);
    setSavedMsg(`Guardada: ${f.name} (v${f.version})`);
    setTimeout(() => setSavedMsg(''), 4000);
  }

  const names = useMemo(() => {
    const m: Record<string, { name: string; source: string }> = {};
    draft.items.forEach((it) => (m[it.ingId] = byId[it.ingId] ?? { name: draft.snapshot?.[it.ingId]?.name ?? it.ingId, source: '?' }));
    return m;
  }, [draft.items, draft.snapshot, byId]);

  const unitLabel = settings.priceUnit === 'kg' ? '/kg' : settings.priceUnit === 't' ? '/t' : '/qq';

  return (
    <section>
      <div className="card">
        <div className="form-grid">
          <label>Nombre<input value={draft.name} onChange={(e) => update({ name: e.target.value })} /></label>
          <label>Código<input value={draft.code ?? ''} onChange={(e) => update({ code: e.target.value })} /></label>
          <label>Especie / etapa<input value={draft.species ?? ''} onChange={(e) => update({ species: e.target.value })} /></label>
          <label>Notas<input value={draft.notes ?? ''} onChange={(e) => update({ notes: e.target.value })} /></label>
          <label title="Opcional. Para raciones de bovinos: muestra kg por animal y día y permite preparar la mezcla por número de animales.">
            Consumo de MS (kg/animal/día)
            <NumInput value={draft.dmi ?? null} onChange={(v) => update({ dmi: v })} />
          </label>
        </div>
        <div className="row gap wrap">
          <button onClick={() => { if (confirm('¿Empezar una fórmula nueva? Los cambios no guardados se perderán.')) { setDraft(newFormula(settings.defaultBatchKg)); setSolvedHash(''); } }}>Nueva</button>
          <button onClick={() => save(false)}>Guardar{draft.version ? ` (v${draft.version + 1})` : ''}</button>
          <button onClick={() => save(true)}>Guardar como copia</button>
          {savedMsg && <span className="ok">{savedMsg}</span>}
        </div>
      </div>

      <div className="two-col">
        <div className="card">
          <h3>Requerimientos</h3>
          <div className="row gap wrap">
            <select value={reqId} onChange={(e) => setReqId(e.target.value)}>
              <option value="">— elegir perfil —</option>
              {requirements.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name} [{q.source}]{q.builtin && !q.verified ? ' (verificar)' : ''}
                </option>
              ))}
            </select>
            <button disabled={!reqId} onClick={loadRequirement}>Cargar</button>
          </div>
          <ConstraintEditor constraints={draft.constraints} ratios={draft.ratios} onChange={(c, rr) => update({ constraints: c, ratios: rr })} />
        </div>

        <div className="card">
          <h3>Ingredientes</h3>
          <IngredientPicker onPick={addIngredient} exclude={draft.items.map((x) => x.ingId)} />
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th>Ingrediente</th>
                  <th className="n">Precio {unitLabel}</th>
                  <th className="n">Mín %</th>
                  <th className="n">Máx %</th>
                  <th className="n">Fijo %</th>
                  <th className="n">Resultado %</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {draft.items.map((it, i) => (
                  <tr key={it.ingId} className={r && (r.inclusion[it.ingId] ?? 0) > 1e-6 ? 'in' : ''}>
                    <td>
                      {names[it.ingId]?.name} <SourceBadge source={names[it.ingId]?.source ?? ''} />
                      {!byId[it.ingId] && <span className="badge bad">no encontrado</span>}
                    </td>
                    <td>
                      <NumInput
                        value={+toUnit(it.price).toFixed(6)}
                        width={80}
                        ariaLabel="precio"
                        onChange={(v) => {
                          const perKg = fromUnit(v ?? 0);
                          setItem(i, { price: perKg });
                          if (v !== null) setPrice(it.ingId, perKg, prices[it.ingId]?.available ?? true);
                        }}
                      />
                    </td>
                    <td><NumInput value={it.min} width={60} onChange={(v) => setItem(i, { min: v })} ariaLabel="mínimo" /></td>
                    <td><NumInput value={it.max} width={60} onChange={(v) => setItem(i, { max: v })} ariaLabel="máximo" /></td>
                    <td><NumInput value={it.fixed ?? null} width={60} onChange={(v) => setItem(i, { fixed: v })} ariaLabel="fijo" /></td>
                    <td className="n"><b>{r ? fmt(r.inclusion[it.ingId] ?? 0, 3) : ''}</b></td>
                    <td><button className="icon" onClick={() => update({ items: draft.items.filter((_, j) => j !== i) })}>✕</button></td>
                  </tr>
                ))}
                {!draft.items.length && (
                  <tr><td colSpan={7} className="muted">Busque y agregue ingredientes. El precio se toma de la biblioteca y puede ajustarse aquí.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="row gap wrap">
            <button
              onClick={() => update({ items: draft.items.map((it) => ({ ...it, price: prices[it.ingId]?.price ?? it.price })) })}
              title="Toma los precios vigentes de la biblioteca de ingredientes"
            >
              Actualizar precios
            </button>
          </div>
        </div>
      </div>

      <div className="solve-bar">
        <button className="primary big" disabled={busy || !draft.items.length} onClick={solve}>
          {busy ? 'Calculando…' : 'Formular a costo mínimo'}
        </button>
        {r?.status === 'optimal' && (
          <span className="cost">
            {settings.currency} {fmt(toUnit(r.costPerKg), 2)} {unitLabel} · {settings.currency} {fmt(r.costPerKg * 1000, 2)} /t
            {stale && <span className="badge warn">cambios sin recalcular</span>}
          </span>
        )}
      </div>

      {r?.noData && r.noData.length > 0 && (
        <div className="note warn">
          Ningún ingrediente de la fórmula tiene dato de: <b>{r.noData.map((k) => NUTRIENT_MAP[k]?.name ?? k).join(', ')}</b>. Se toma como 0, por lo
          que un mínimo en ese nutriente no se puede cumplir (ej. FEDNA no reporta histidina ni leucina).{' '}
          <button
            onClick={() =>
              update({
                constraints: draft.constraints.filter((c) => !r.noData!.includes(c.key)),
                ratios: draft.ratios.filter((q) => !r.noData!.includes(q.num) && !r.noData!.includes(q.den)),
              })
            }
          >
            Quitar esas restricciones
          </button>
        </div>
      )}
      {r && <Results draft={draft} names={names} />}

      {r?.status === 'optimal' && (
        <div className="card">
          <h3>Informes</h3>
          <div className="row gap wrap">
            <button className="primary" onClick={() => setShowMix(true)}>Hoja de mezclado</button>
            <button onClick={() => printHtml(`Informe_${draft.name}.pdf`, formulaReportHtml(draft, names, settings))}>Informe nutricional y de costos</button>
            <button
              onClick={() =>
                saveFile(
                  `${draft.name}.csv`,
                  toCSV([
                    ['Fórmula', draft.name, 'Versión', draft.version],
                    ['Ingrediente', 'Fuente', 'Inclusión %', `Precio ${settings.currency}${unitLabel}`],
                    ...draft.items.filter((it) => (r.inclusion[it.ingId] ?? 0) > 1e-6).map((it) => [names[it.ingId]?.name, names[it.ingId]?.source, +r.inclusion[it.ingId].toFixed(4), +toUnit(it.price).toFixed(4)]),
                    [],
                    ['Nutriente', 'Unidad', 'Mínimo', 'Máximo', 'Fórmula'],
                    ...draft.constraints.map((c) => [NUTRIENT_MAP[c.key]?.name ?? c.key, (NUTRIENT_MAP[c.key]?.unit ?? '') + (c.basis === 'ms' ? ' MS' : ''), c.min, c.max, +(c.basis === 'ms' ? dmValue(r.nutrients, c.key) : r.nutrients[c.key] ?? 0).toFixed(4)]),
                  ]),
                  'text/csv',
                )
              }
            >
              Exportar CSV (Excel)
            </button>
          </div>
        </div>
      )}
      {showMix && <MixDialog f={draft} names={names} onClose={() => setShowMix(false)} />}
      <p className="muted small">Precios {PRICE_UNIT_LABEL[settings.priceUnit]}. Toda la composición es en base tal cual.</p>
    </section>
  );
}

function IngredientPicker({ onPick, exclude }: { onPick: (id: string) => void; exclude: string[] }) {
  const { ingredients, prices, settings } = useData();
  const [q, setQ] = useState('');
  const match = makeMatcher(q);
  const res = match
    ? ingredients
        .filter((i) => settings.sources.includes(i.source) && !exclude.includes(i.id))
        .filter((i) => match(i.name + ' ' + i.category))
        .sort((a, b) => Number(!!prices[b.id]) - Number(!!prices[a.id]))
        .slice(0, 25)
    : [];
  return (
    <div className="picker">
      <input className="search" placeholder="Agregar ingrediente…" value={q} onChange={(e) => setQ(e.target.value)} />
      {res.length > 0 && (
        <ul className="dropdown">
          {res.map((i) => (
            <li key={i.id} onClick={() => { onPick(i.id); setQ(''); }}>
              <span>{i.name}</span>
              <span className="row gap">
                {prices[i.id] && <span className="badge ok">precio</span>}
                <SourceBadge source={i.source} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Results({ draft, names }: { draft: Formula; names: Record<string, { name: string; source: string }> }) {
  const { settings, toUnit, byId } = useData();
  const r = draft.result!;
  const dmPct = r.nutrients.ms ?? 0;
  const perAnimal = draft.dmi && draft.dmi > 0 && dmPct > 0 ? draft.dmi / (dmPct / 100) : null;
  const unitLabel = settings.priceUnit === 'kg' ? '/kg' : settings.priceUnit === 't' ? '/t' : '/qq';
  return (
    <div className="card">
      <h3>Resultado</h3>
      {r.message && <p className={r.status === 'optimal' ? 'note' : 'note bad'}>{r.message}</p>}
      {r.violations && r.violations.length > 0 && (
        <div className="table-wrap">
          <table className="grid">
            <thead><tr><th>Restricción no cumplida</th><th>Tipo</th><th className="n">Requerido</th><th className="n">Mejor alcanzable</th></tr></thead>
            <tbody>
              {r.violations.map((v, i) => (
                <tr key={i}><td>{v.label}</td><td>{v.kind === 'min' ? 'mínimo' : 'máximo'}</td><td className="n">{fmt(v.required, 3)}</td><td className="n bad">{fmt(v.achieved, 3)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {r.missing && r.missing.length > 0 && (
        <details className="note warn">
          <summary>{r.missing.length} ingredientes sin dato para algún nutriente restringido (se toman como 0)</summary>
          <ul>
            {r.missing.map((m) => (
              <li key={m.ingId}>{names[m.ingId]?.name}: {m.keys.map((k) => NUTRIENT_MAP[k]?.name ?? k).join(', ')}</li>
            ))}
          </ul>
        </details>
      )}
      {r.status === 'optimal' && (
        <p className="small">
          MS de la mezcla: <b>{fmt(dmPct, 1)} %</b> · Costo por kg de MS: <b>{settings.currency} {fmt(dmPct > 0 ? r.costPerKg / (dmPct / 100) : 0, 3)}</b>
          {perAnimal && (
            <>
              {' '}· Ración: <b>{fmt(perAnimal, 2)} kg TC</b> ({fmt(draft.dmi, 2)} kg MS) por animal y día · Costo: <b>{settings.currency} {fmt(r.costPerKg * perAnimal, 2)}</b> por animal y día
            </>
          )}
        </p>
      )}
      {r.status === 'optimal' && (
        <div className="two-col">
          <div className="table-wrap">
            <table className="grid">
              <thead><tr><th>Ingrediente</th><th className="n">%</th><th className="n">kg/t</th>{perAnimal && <><th className="n" title="kg tal cual por animal y día">kg TC/an/d</th><th className="n" title="kg de materia seca por animal y día">kg MS/an/d</th></>}<th className="n">{settings.currency}/t</th><th>Análisis de precio</th></tr></thead>
              <tbody>
                {draft.items
                  .map((it) => ({ it, pct: r.inclusion[it.ingId] ?? 0 }))
                  .sort((a, b) => b.pct - a.pct)
                  .map(({ it, pct }) => {
                    const rc = r.reduced[it.ingId] ?? 0;
                    let hint = '';
                    if (pct <= 1e-6 && rc > 1e-9) hint = `Entra si precio ≤ ${fmt(toUnit(it.price - rc), 2)} ${unitLabel}`;
                    else if (pct > 1e-6 && rc < -1e-9) hint = `En su máximo; ahorra ${fmt(-rc * 10, 2)} ${settings.currency}/t por cada 1 % más`;
                    else if (pct > 1e-6 && rc > 1e-9) hint = `Forzado por mínimo; cuesta ${fmt(rc * 10, 2)} ${settings.currency}/t por 1 %`;
                    return (
                      <tr key={it.ingId} className={pct > 1e-6 ? 'in' : 'out'}>
                        <td>{names[it.ingId]?.name}</td>
                        <td className="n">{fmt(pct, 3)}</td>
                        <td className="n">{fmt(pct * 10, 2)}</td>
                        {perAnimal && (
                          <>
                            <td className="n">{fmt((perAnimal * pct) / 100, 2)}</td>
                            <td className="n">{fmt((((perAnimal * pct) / 100) * (byId[it.ingId]?.n.ms ?? 0)) / 100, 2)}</td>
                          </>
                        )}
                        <td className="n">{fmt(it.price * pct * 10, 2)}</td>
                        <td className="small muted">{hint}</td>
                      </tr>
                    );
                  })}
                <tr className="tot"><td>Total</td><td className="n">{fmt(Object.values(r.inclusion).reduce((a, b) => a + b, 0), 3)}</td><td className="n">1000</td>{perAnimal && <><td className="n">{fmt(perAnimal, 2)}</td><td className="n">{fmt(draft.dmi, 2)}</td></>}<td className="n">{fmt(r.costPerKg * 1000, 2)}</td><td /></tr>
              </tbody>
            </table>
          </div>
          <div className="table-wrap">
            <table className="grid">
              <thead><tr><th>Nutriente</th><th className="n">Mín</th><th className="n">Máx</th><th className="n">Fórmula</th><th className="n" title="Cambio del costo (moneda/t) por cada unidad adicional del requerimiento">P. sombra /t</th></tr></thead>
              <tbody>
                {draft.constraints.map((c) => {
                  const nu = NUTRIENT_MAP[c.key];
                  const dm = c.basis === 'ms';
                  const v = dm ? dmValue(r.nutrients, c.key) : r.nutrients[c.key] ?? 0;
                  const tol = 1e-6 * Math.max(1, Math.abs(v));
                  const ok = (c.min === null || v >= c.min - tol) && (c.max === null || v <= c.max + tol);
                  const sk = dm ? `${c.key}@ms` : c.key;
                  const sp = (r.shadow[`${sk}:min`] ?? 0) + (r.shadow[`${sk}:max`] ?? 0);
                  return (
                    <tr key={c.key + (c.basis ?? '')}>
                      <td>{nu?.name ?? c.key} <small className="muted">{nu?.unit}{dm ? ' MS' : ''}</small></td>
                      <td className="n">{fmt(c.min, nu?.decimals)}</td>
                      <td className="n">{fmt(c.max, nu?.decimals)}</td>
                      <td className={'n ' + (ok ? '' : 'bad')}><b>{fmt(v, nu?.decimals)}</b></td>
                      <td className="n">{Math.abs(sp) > 1e-9 ? fmt(sp * 1000, 3) : ''}</td>
                    </tr>
                  );
                })}
                {draft.ratios.map((q, i) => (
                  <tr key={'r' + i}>
                    <td>{NUTRIENT_MAP[q.num]?.name} : {NUTRIENT_MAP[q.den]?.name}</td>
                    <td className="n">{fmt(q.min, 3)}</td>
                    <td className="n">{fmt(q.max, 3)}</td>
                    <td className="n"><b>{fmt((r.nutrients[q.num] ?? 0) / Math.max(r.nutrients[q.den] ?? 0, 1e-12), 3)}</b></td>
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function MixDialog({ f, names, onClose }: { f: Formula; names: Record<string, { name: string }>; onClose: () => void }) {
  const { settings } = useData();
  const [batchKg, setBatchKg] = useState<number | null>(f.batchKg || settings.defaultBatchKg);
  const [batches, setBatches] = useState<number | null>(1);
  const [lot, setLot] = useState(new Date().toISOString().slice(0, 10).replace(/-/g, ''));
  const [mixMin, setMixMin] = useState<number | null>(5);
  const [animals, setAnimals] = useState<number | null>(null);
  const dmPct = f.result?.nutrients.ms ?? 0;
  const perAnimal = f.dmi && f.dmi > 0 && dmPct > 0 ? f.dmi / (dmPct / 100) : null;
  const lines = mixLines(f, names, batchKg ?? 0, batches ?? 1);
  return (
    <Modal title="Hoja de mezclado" onClose={onClose} wide>
      {perAnimal && (
        <div className="row gap wrap note">
          <span>
            Ración unifeed: {fmt(perAnimal, 2)} kg tal cual por animal y día. Calcular bachada para
          </span>
          <NumInput value={animals} onChange={setAnimals} width={80} ariaLabel="animales" />
          <span>animales</span>
          <button disabled={!animals} onClick={() => setBatchKg(Math.round(perAnimal * (animals ?? 0) * 10) / 10)}>
            Aplicar
          </button>
        </div>
      )}
      <div className="form-grid">
        <label>Tamaño de bachada (kg)<NumInput value={batchKg} onChange={setBatchKg} /></label>
        <label>Número de bachadas<NumInput value={batches} onChange={setBatches} /></label>
        <label>Lote<input value={lot} onChange={(e) => setLot(e.target.value)} /></label>
        <label>Tiempo de mezclado (min)<NumInput value={mixMin} onChange={setMixMin} /></label>
      </div>
      <div className="table-wrap">
        <table className="grid">
          <thead><tr><th>#</th><th>Ingrediente</th><th className="n">%</th><th className="n">kg/bachada</th><th className="n">kg total</th></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.id} className={l.micro ? 'micro' : ''}><td>{i + 1}</td><td>{l.name}{l.micro && <span className="badge">micro</span>}</td><td className="n">{fmt(l.pct, 3)}</td><td className="n">{fmt(l.kgBatch, 3)}</td><td className="n">{fmt(l.kgTotal, 2)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row gap end">
        <button
          onClick={() =>
            saveFile(
              `Mezclado_${f.name}_${lot}.csv`,
              toCSV([
                ['Hoja de mezclado', f.name, 'Lote', lot, 'Bachada kg', batchKg ?? 0, 'Bachadas', batches ?? 1],
                ['#', 'Ingrediente', '%', 'kg/bachada', 'kg total', 'Peso real', 'Verificado'],
                ...lines.map((l, i) => [i + 1, l.name, +l.pct.toFixed(4), +l.kgBatch.toFixed(3), +l.kgTotal.toFixed(3), '', '']),
              ]),
              'text/csv',
            )
          }
        >
          Exportar CSV
        </button>
        <button className="primary" onClick={() => printHtml(`Mezclado_${f.name}.pdf`, mixingSheetHtml(f, names, settings, batchKg ?? 0, batches ?? 1, lot, mixMin ?? 5))}>
          Imprimir / PDF
        </button>
      </div>
    </Modal>
  );
}
