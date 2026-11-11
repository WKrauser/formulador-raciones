import { useMemo, useRef, useState } from 'react';
import { NUTRIENTS, NUTRIENT_GROUPS, NUTRIENT_MAP, fmt } from '../data/nutrients';
import { db, uid } from '../lib/db';
import { parseCSV, parseNum, readFileAsText, saveFile, toCSV } from '../lib/files';
import type { Ingredient, Source } from '../lib/types';
import { PRICE_UNIT_LABEL } from '../lib/types';
import { setPrice, useData } from '../state';
import { makeMatcher, Modal, NumInput, SourceBadge } from './common';

const PAGE = 150;

export function IngredientsView() {
  const { ingredients, prices, settings, toUnit } = useData();
  const [q, setQ] = useState('');
  const [src, setSrc] = useState<'' | Source>('');
  const [cat, setCat] = useState('');
  const [onlyPriced, setOnlyPriced] = useState(false);
  const [dmBasis, setDmBasis] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const priceFileRef = useRef<HTMLInputElement>(null);

  const cats = useMemo(
    () => Array.from(new Set(ingredients.filter((i) => !src || i.source === src).map((i) => i.category))).sort(),
    [ingredients, src],
  );
  const list = useMemo(() => {
    const match = makeMatcher(q);
    return ingredients.filter((i) => {
      if (!settings.sources.includes(i.source)) return false;
      if (src && i.source !== src) return false;
      if (cat && i.category !== cat) return false;
      if (onlyPriced && !prices[i.id]) return false;
      return !match || match(i.name + ' ' + (i.code ?? '') + ' ' + i.category);
    });
  }, [ingredients, q, src, cat, onlyPriced, prices, settings.sources]);

  /** Valor de un nutriente tal cual o en base MS según la vista */
  const b = (i: Ingredient, k: string): number | null => {
    const v = i.n[k];
    if (v === undefined) return null;
    return dmBasis && i.n.ms ? (v * 100) / i.n.ms : v;
  };

  const newLocal = () =>
    setEditing({ id: uid('local:'), name: '', source: 'Local', category: 'Ingredientes locales', n: {} });

  async function importLocals(file: File) {
    const rows = parseCSV(await readFileAsText(file));
    if (rows.length < 2) throw new Error('El archivo no tiene datos.');
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const iName = head.findIndex((h) => h === 'nombre' || h === 'name');
    if (iName < 0) throw new Error('Falta la columna "nombre".');
    const iCat = head.findIndex((h) => h === 'categoria' || h === 'categoría' || h === 'category');
    const iPrice = head.findIndex((h) => h === 'precio' || h === 'price');
    const keys = head.map((h) => (NUTRIENT_MAP[h] ? h : null));
    const now = Date.now();
    let count = 0;
    for (const r of rows.slice(1)) {
      const name = r[iName]?.trim();
      if (!name || name.startsWith('(')) continue;
      const n: Record<string, number> = {};
      keys.forEach((k, j) => {
        const v = k ? parseNum(r[j]) : null;
        if (k && v !== null) n[k] = v;
      });
      const existing = await db.ingredients.where('name').equals(name).first();
      const ing: Ingredient = {
        id: existing?.id ?? uid('local:'),
        name,
        source: 'Local',
        category: (iCat >= 0 && r[iCat]?.trim()) || 'Ingredientes locales',
        n,
        updatedAt: now,
      };
      await db.ingredients.put(ing);
      const p = iPrice >= 0 ? parseNum(r[iPrice]) : null;
      if (p !== null) await setPrice(ing.id, p / toUnit(1));
      count++;
    }
    return `${count} ingredientes locales importados/actualizados.`;
  }

  async function importPrices(file: File) {
    const rows = parseCSV(await readFileAsText(file));
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const iId = head.indexOf('id');
    const iP = head.indexOf('precio');
    const iA = head.indexOf('disponible');
    if (iId < 0 || iP < 0) throw new Error('Se requieren las columnas "id" y "precio".');
    let c = 0;
    for (const r of rows.slice(1)) {
      const p = parseNum(r[iP]);
      if (!r[iId] || p === null) continue;
      const avail = iA < 0 ? true : !/^(no|0|false)$/i.test((r[iA] ?? '').trim());
      await setPrice(r[iId].trim(), p / toUnit(1), avail);
      c++;
    }
    return `${c} precios actualizados.`;
  }

  return (
    <section>
      <div className="toolbar">
        <input className="search" placeholder="Buscar ingrediente (ej. maíz, soja 47, fosfato)…" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} />
        <select value={src} onChange={(e) => { setSrc(e.target.value as Source | ''); setCat(''); }}>
          <option value="">Todas las fuentes</option>
          {settings.sources.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Todas las categorías</option>
          {cats.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={onlyPriced} onChange={(e) => setOnlyPriced(e.target.checked)} /> Solo con precio
        </label>
        <label className="check">
          <input type="checkbox" checked={dmBasis} onChange={(e) => setDmBasis(e.target.checked)} /> Base MS
        </label>
      </div>
      <div className="toolbar">
        <button className="primary" onClick={newLocal}>+ Ingrediente local</button>
        <button onClick={() => fileRef.current?.click()}>Importar locales (CSV)</button>
        <button
          onClick={() =>
            saveFile(
              'plantilla_ingredientes_locales.csv',
              toCSV([
                ['nombre', 'categoria', 'precio', ...NUTRIENTS.map((n) => n.key)],
                ['(descripción)', '', `precio ${PRICE_UNIT_LABEL[settings.priceUnit]}`, ...NUTRIENTS.map((n) => `${n.name} (${n.unit})`)],
              ]),
              'text/csv',
            )
          }
        >
          Plantilla CSV
        </button>
        <button
          onClick={() =>
            saveFile(
              'precios.csv',
              toCSV([
                ['id', 'nombre', 'fuente', 'precio', 'disponible'],
                ...ingredients
                  .filter((i) => prices[i.id] || i.source === 'Local')
                  .map((i) => [i.id, i.name, i.source, prices[i.id] ? +toUnit(prices[i.id].price).toFixed(4) : '', prices[i.id]?.available === false ? 'no' : 'si']),
              ]),
              'text/csv',
            )
          }
        >
          Exportar precios
        </button>
        <button onClick={() => priceFileRef.current?.click()}>Importar precios</button>
        <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" hidden onChange={async (e) => {
          const f = e.target.files?.[0]; e.target.value = '';
          if (f) try { setMsg(await importLocals(f)); } catch (err) { setMsg('Error: ' + (err as Error).message); }
        }} />
        <input ref={priceFileRef} type="file" accept=".csv,text/csv,text/plain" hidden onChange={async (e) => {
          const f = e.target.files?.[0]; e.target.value = '';
          if (f) try { setMsg(await importPrices(f)); } catch (err) { setMsg('Error: ' + (err as Error).message); }
        }} />
      </div>
      {msg && <p className="note" onClick={() => setMsg('')}>{msg}</p>}
      <p className="muted small">{list.length} ingredientes. Valores {dmBasis ? 'en base materia seca' : 'tal cual'}. Precio {PRICE_UNIT_LABEL[settings.priceUnit]} ({settings.currency}).</p>
      <div className="table-wrap">
        <table className="grid hover">
          <thead>
            <tr>
              <th>Ingrediente</th>
              <th>Fuente</th>
              <th className="hide-sm">Categoría</th>
              <th className="n">MS %</th>
              <th className="n">PB %</th>
              <th className="n hide-sm">EE %</th>
              <th className="n hide-sm">FDN %</th>
              <th className="n hide-sm" title="Energía metabolizable rumiantes">EM rum. Mcal/kg</th>
              <th className="n">Precio</th>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, limit).map((i) => (
              <tr key={i.id} onClick={() => setEditing(i)}>
                <td>{i.name}</td>
                <td><SourceBadge source={i.source} /></td>
                <td className="hide-sm muted">{i.category}</td>
                <td className="n">{fmt(i.n.ms, 1)}</td>
                <td className="n">{fmt(b(i, 'pb'), 1)}</td>
                <td className="n hide-sm">{fmt(b(i, 'ee'), 1)}</td>
                <td className="n hide-sm">{fmt(b(i, 'fnd'), 1)}</td>
                <td className="n hide-sm">{fmt(i.n.em_rum === undefined ? null : (b(i, 'em_rum') ?? 0) / 1000, 2)}</td>
                <td className="n">{prices[i.id] ? fmt(toUnit(prices[i.id].price), 2) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.length > limit && <button onClick={() => setLimit(limit + PAGE)}>Mostrar más ({list.length - limit})</button>}
      {editing && <IngredientEditor ing={editing} onClose={() => setEditing(null)} onOpen={setEditing} />}
    </section>
  );
}

function IngredientEditor({ ing, onClose, onOpen }: { ing: Ingredient; onClose: () => void; onOpen: (i: Ingredient) => void }) {
  const { prices, settings, toUnit, fromUnit } = useData();
  const editable = ing.source === 'Local';
  const [draft, setDraft] = useState<Ingredient>(ing);
  const [price, setPriceTxt] = useState<number | null>(prices[ing.id] ? +toUnit(prices[ing.id].price).toFixed(6) : null);
  const [avail, setAvail] = useState(prices[ing.id]?.available ?? true);
  const [showAll, setShowAll] = useState(editable);

  async function save() {
    if (editable) {
      if (!draft.name.trim()) return alert('Escriba un nombre.');
      const n = { ...draft.n };
      if (draft.forage && n.fnd !== undefined) n.fnd_forraje = n.fnd;
      else if (!draft.forage) delete n.fnd_forraje;
      await db.ingredients.put({ ...draft, n, name: draft.name.trim(), updatedAt: Date.now() });
    }
    if (price !== null) await setPrice(ing.id, fromUnit(price), avail);
    else await db.prices.delete(ing.id);
    onClose();
  }

  function duplicate() {
    onOpen({
      id: uid('local:'),
      name: ing.name + ' (local)',
      source: 'Local',
      category: ing.category,
      n: { ...ing.n },
      basedOn: ing.id,
      forage: ing.forage,
      notes: `Basado en ${ing.source}: ${ing.name}`,
    });
  }

  return (
    <Modal title={editable ? (ing.name ? 'Ingrediente local' : 'Nuevo ingrediente local') : ing.name} onClose={onClose} wide>
      <div className="form-grid">
        {editable ? (
          <>
            <label>Nombre<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
            <label>Categoría<input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} /></label>
            <label className="span2">Notas<input value={draft.notes ?? ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
            <label className="check">
              <input type="checkbox" checked={!!draft.forage} onChange={(e) => setDraft({ ...draft, forage: e.target.checked })} /> Es forraje (su FDN cuenta como FDN de forraje)
            </label>
          </>
        ) : (
          <p className="span2 muted">
            <SourceBadge source={ing.source} /> {ing.category} · código <code>{ing.code}</code>. Los valores de tablas no se editan: use “Duplicar como local” para ajustar la composición con su análisis de laboratorio.
          </p>
        )}
        <label>Precio {PRICE_UNIT_LABEL[settings.priceUnit]} ({settings.currency})<NumInput value={price} onChange={setPriceTxt} /></label>
        <label className="check"><input type="checkbox" checked={avail} onChange={(e) => setAvail(e.target.checked)} /> Disponible</label>
      </div>
      <div className="row gap">
        <label className="check"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Mostrar nutrientes sin dato</label>
      </div>
      <div className="nut-groups">
        {NUTRIENT_GROUPS.map((g) => {
          const rows = NUTRIENTS.filter((nu) => nu.group === g && (showAll || draft.n[nu.key] !== undefined));
          if (!rows.length) return null;
          return (
            <fieldset key={g}>
              <legend>{g}</legend>
              {rows.map((nu) => (
                <div className="kv" key={nu.key}>
                  <span>
                    {nu.name} <small className="muted">{nu.unit}</small>
                    {ing.est?.includes(nu.key) && <small className="warn" title="Valor estimado, no medido en la tabla de origen"> (est.)</small>}
                  </span>
                  {editable ? (
                    <NumInput
                      value={draft.n[nu.key] ?? null}
                      width={100}
                      ariaLabel={nu.name}
                      onChange={(v) => {
                        const n = { ...draft.n };
                        if (v === null) delete n[nu.key];
                        else n[nu.key] = v;
                        setDraft({ ...draft, n });
                      }}
                    />
                  ) : (
                    <b className="n">{fmt(ing.n[nu.key], nu.decimals)}</b>
                  )}
                </div>
              ))}
            </fieldset>
          );
        })}
      </div>
      <div className="row gap end">
        {!editable && <button onClick={duplicate}>Duplicar como local</button>}
        {editable && ing.name && (
          <button className="danger" onClick={async () => { if (confirm('¿Eliminar este ingrediente local?')) { await db.ingredients.delete(ing.id); await db.prices.delete(ing.id); onClose(); } }}>
            Eliminar
          </button>
        )}
        <button onClick={onClose}>Cancelar</button>
        <button className="primary" onClick={save}>Guardar</button>
      </div>
    </Modal>
  );
}
