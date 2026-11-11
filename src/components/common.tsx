import { useEffect, useState, type ReactNode } from 'react';
import { NUTRIENTS, NUTRIENT_GROUPS, NUTRIENT_MAP } from '../data/nutrients';
import type { Constraint, RatioConstraint } from '../lib/types';
import { parseNum } from '../lib/files';

/** Campo numérico que acepta coma o punto decimal y vacío (= null). */
export function NumInput({
  value,
  onChange,
  placeholder,
  disabled,
  width,
  ariaLabel,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  width?: number | string;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(value === null || value === undefined ? '' : String(value));
  useEffect(() => {
    const cur = parseNum(text);
    if (cur !== (value ?? null)) setText(value === null || value === undefined ? '' : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      className="num"
      inputMode="decimal"
      aria-label={ariaLabel}
      style={width ? { width } : undefined}
      value={text}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseNum(e.target.value));
      }}
    />
  );
}

export function NutrientSelect({ value, onChange, exclude = [] }: { value: string; onChange: (k: string) => void; exclude?: string[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {!value && <option value="">— nutriente —</option>}
      {NUTRIENT_GROUPS.map((g) => (
        <optgroup key={g} label={g}>
          {NUTRIENTS.filter((n) => n.group === g && (n.key === value || !exclude.includes(n.key))).map((n) => (
            <option key={n.key} value={n.key}>
              {n.name} ({n.unit})
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export function ConstraintEditor({
  constraints,
  ratios,
  onChange,
  readOnly,
}: {
  constraints: Constraint[];
  ratios: RatioConstraint[];
  onChange?: (c: Constraint[], r: RatioConstraint[]) => void;
  readOnly?: boolean;
}) {
  const [newKey, setNewKey] = useState('');
  const set = (i: number, patch: Partial<Constraint>) =>
    onChange?.(constraints.map((c, j) => (j === i ? { ...c, ...patch } : c)), ratios);
  const setR = (i: number, patch: Partial<RatioConstraint>) =>
    onChange?.(constraints, ratios.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div>
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>Nutriente</th>
              <th>Unidad</th>
              <th title="Tal cual o base materia seca">Base</th>
              <th>Mínimo</th>
              <th>Máximo</th>
              {!readOnly && <th />}
            </tr>
          </thead>
          <tbody>
            {constraints.map((c, i) => (
              <tr key={c.key + i}>
                <td>{NUTRIENT_MAP[c.key]?.name ?? c.key}</td>
                <td className="muted">{NUTRIENT_MAP[c.key]?.unit}</td>
                <td>
                  {readOnly ? (
                    c.basis === 'ms' ? 'MS' : 'TC'
                  ) : (
                    <select className="basis" value={c.basis ?? 'tc'} onChange={(e) => set(i, { basis: e.target.value as 'tc' | 'ms' })} aria-label="base">
                      <option value="tc">TC</option>
                      <option value="ms">MS</option>
                    </select>
                  )}
                </td>
                <td>
                  <NumInput value={c.min} onChange={(v) => set(i, { min: v })} disabled={readOnly} width={90} ariaLabel="mínimo" />
                </td>
                <td>
                  <NumInput value={c.max} onChange={(v) => set(i, { max: v })} disabled={readOnly} width={90} ariaLabel="máximo" />
                </td>
                {!readOnly && (
                  <td>
                    <button className="icon" title="Quitar" onClick={() => onChange?.(constraints.filter((_, j) => j !== i), ratios)}>
                      ✕
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {constraints.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  Sin restricciones de nutrientes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <div className="row gap">
          <NutrientSelect value={newKey} onChange={setNewKey} exclude={constraints.map((c) => c.key)} />
          <button
            disabled={!newKey}
            onClick={() => {
              onChange?.([...constraints, { key: newKey, min: null, max: null, basis: constraints.some((c) => c.basis === 'ms') ? 'ms' : 'tc' }], ratios);
              setNewKey('');
            }}
          >
            + Agregar nutriente
          </button>
        </div>
      )}
      {(ratios.length > 0 || !readOnly) && (
        <>
          <h4>Relaciones entre nutrientes</h4>
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th>Numerador</th>
                  <th>Denominador</th>
                  <th>Mín.</th>
                  <th>Máx.</th>
                  {!readOnly && <th />}
                </tr>
              </thead>
              <tbody>
                {ratios.map((r, i) => (
                  <tr key={i}>
                    <td>{readOnly ? NUTRIENT_MAP[r.num]?.name : <NutrientSelect value={r.num} onChange={(k) => setR(i, { num: k })} />}</td>
                    <td>{readOnly ? NUTRIENT_MAP[r.den]?.name : <NutrientSelect value={r.den} onChange={(k) => setR(i, { den: k })} />}</td>
                    <td>
                      <NumInput value={r.min} onChange={(v) => setR(i, { min: v })} disabled={readOnly} width={70} />
                    </td>
                    <td>
                      <NumInput value={r.max} onChange={(v) => setR(i, { max: v })} disabled={readOnly} width={70} />
                    </td>
                    {!readOnly && (
                      <td>
                        <button className="icon" onClick={() => onChange?.(constraints, ratios.filter((_, j) => j !== i))}>
                          ✕
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!readOnly && (
            <button onClick={() => onChange?.(constraints, [...ratios, { num: 'ca', den: 'p_disp_av', min: null, max: null }])}>+ Agregar relación (ej. Ca:P)</button>
          )}
        </>
      )}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function SourceBadge({ source }: { source: string }) {
  return <span className={'badge src-' + source.toLowerCase()}>{source}</span>;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Sinónimos español → inglés para buscar en tablas NASEM y Feedtables. */
const SYNONYMS: Record<string, string[]> = {
  maiz: ['corn', 'maize'], ensilado: ['silage', 'silo'], ensilaje: ['silage', 'silo'], silo: ['silage', 'ensilado'], heno: ['hay'],
  paja: ['straw'], soja: ['soybean', 'soy'], soya: ['soybean', 'soy', 'soja'], cebada: ['barley'], trigo: ['wheat'], sorgo: ['sorghum'],
  avena: ['oat'], centeno: ['rye'], arroz: ['rice'], pasto: ['pasture', 'grass'], pastura: ['pasture'], hierba: ['grass'], gramineas: ['grass'],
  leguminosa: ['legume'], melaza: ['molasses'], harina: ['meal', 'hna'], hna: ['harina', 'meal'], algodon: ['cotton'], semilla: ['seed'],
  pulpa: ['pulp'], salvado: ['bran'], afrecho: ['bran'], grasa: ['fat'], aceite: ['oil', 'fat'], sebo: ['tallow'], sal: ['salt', 'sodium chloride'],
  caliza: ['limestone'], carbonato: ['carbonate', 'limestone'], fosfato: ['phosphate'], cascarilla: ['hulls'], cascara: ['hulls'],
  girasol: ['sunflower'], colza: ['canola', 'rapeseed'], canola: ['colza'], lino: ['flax', 'linseed'], cacahuete: ['peanut', 'groundnut'],
  mani: ['peanut', 'groundnut'], palmiste: ['palm kernel'], pescado: ['fish'], sangre: ['blood'], plumas: ['feather'], suero: ['whey'],
  leche: ['milk'], levadura: ['yeast'], cerveza: ['brewers'], bagazo: ['bagasse', 'brewers grains'], citricos: ['citrus'], remolacha: ['beet'],
  yuca: ['cassava', 'tapioca'], mandioca: ['cassava', 'tapioca'], guisante: ['pea'], arveja: ['pea'], haba: ['bean', 'faba'], urea: ['urea'],
  premezcla: ['premix'], vitamina: ['vit'], magnesio: ['magnesium'], bicarbonato: ['bicarbonate'], destilados: ['distillers', 'ddgs'],
  gluten: ['gluten'], grano: ['grain'], molido: ['ground'], humedo: ['wet', 'hm'], seco: ['dry'], alfalfa: ['alfalfa', 'legume'],
};

/** Devuelve una función que prueba si un texto contiene todos los términos buscados (con sinónimos). */
export function makeMatcher(query: string): ((text: string) => boolean) | null {
  const terms = norm(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return null;
  const alts = terms.map((t) => [t, ...(SYNONYMS[t] ?? [])]);
  return (text: string) => {
    const h = norm(text);
    return alts.every((a) => a.some((t) => h.includes(t)));
  };
}
