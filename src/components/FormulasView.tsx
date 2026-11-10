import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { fmt } from '../data/nutrients';
import { db, uid } from '../lib/db';
import { printHtml } from '../lib/files';
import { formulaReportHtml } from '../lib/reports';
import type { Formula } from '../lib/types';
import { useData } from '../state';
import { MixDialog } from './FormulateView';

export function FormulasView({ onOpen }: { onOpen: (f: Formula) => void }) {
  const formulas = useLiveQuery(() => db.formulas.orderBy('updatedAt').reverse().toArray(), []);
  const { byId, settings, toUnit } = useData();
  const [q, setQ] = useState('');
  const [mix, setMix] = useState<Formula | null>(null);
  const list = useMemo(
    () => (formulas ?? []).filter((f) => (f.name + ' ' + (f.species ?? '') + ' ' + (f.code ?? '')).toLowerCase().includes(q.toLowerCase())),
    [formulas, q],
  );
  const namesOf = (f: Formula) =>
    Object.fromEntries(f.items.map((it) => [it.ingId, { name: byId[it.ingId]?.name ?? f.snapshot?.[it.ingId]?.name ?? it.ingId, source: byId[it.ingId]?.source ?? f.snapshot?.[it.ingId]?.source ?? '' }]));
  const unitLabel = settings.priceUnit === 'kg' ? '/kg' : settings.priceUnit === 't' ? '/t' : '/qq';

  return (
    <section>
      <div className="toolbar">
        <input className="search" placeholder="Buscar fórmula…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {formulas && formulas.length === 0 && <p className="muted">Aún no hay fórmulas guardadas. Cree una en la pestaña “Formular” y pulse Guardar.</p>}
      <div className="cards">
        {list.map((f) => (
          <div className="card" key={f.id}>
            <div className="row between">
              <h3>{f.name} {f.code && <small className="muted">({f.code})</small>}</h3>
              <span className="badge">v{f.version}</span>
            </div>
            <p className="muted small">
              {f.species} · {new Date(f.updatedAt).toLocaleString('es')} · {f.items.length} ingredientes
            </p>
            {f.result?.status === 'optimal' ? (
              <p>
                <b>{settings.currency} {fmt(toUnit(f.result.costPerKg), 2)} {unitLabel}</b>{' '}
                <span className="muted">({settings.currency} {fmt(f.result.costPerKg * 1000, 2)} /t)</span>
              </p>
            ) : (
              <p className="warn">Sin solución óptima guardada</p>
            )}
            <div className="row gap wrap">
              <button className="primary" onClick={() => onOpen(structuredClone(f))}>Abrir</button>
              {f.result?.status === 'optimal' && (
                <>
                  <button onClick={() => setMix(f)}>Hoja de mezclado</button>
                  <button onClick={() => printHtml(`Informe_${f.name}.pdf`, formulaReportHtml(f, namesOf(f), settings))}>Informe</button>
                </>
              )}
              <button
                onClick={async () => {
                  const now = Date.now();
                  await db.formulas.put({ ...structuredClone(f), id: uid('f:'), name: f.name + ' (copia)', version: 1, createdAt: now, updatedAt: now });
                }}
              >
                Duplicar
              </button>
              <button className="danger" onClick={async () => { if (confirm(`¿Eliminar "${f.name}"?`)) await db.formulas.delete(f.id); }}>Eliminar</button>
            </div>
          </div>
        ))}
      </div>
      {mix && <MixDialog f={mix} names={namesOf(mix)} onClose={() => setMix(null)} />}
    </section>
  );
}
