import { useMemo, useState } from 'react';
import { NUTRIENT_MAP, fmt } from '../data/nutrients';
import {
  BEEF_BREEDS,
  BEEF_COW_DEFAULT,
  BEEF_GROW_DEFAULT,
  DAIRY_DEFAULT,
  beefCowRequirements,
  beefGrowRequirements,
  dairyRequirements,
  type BeefCowInput,
  type BeefGrowInput,
  type CattleResult,
  type DairyInput,
} from '../lib/cattle';
import { db, uid } from '../lib/db';
import { Modal, NumInput } from './common';

type Kind = 'leche' | 'engorde' | 'cria';

const KIND_INFO: Record<Kind, { title: string; source: string; species: string }> = {
  leche: { title: 'Bovinos de leche', source: 'NASEM 2021', species: 'Bovinos de leche' },
  engorde: { title: 'Bovinos de carne: recría y engorde', source: 'NRC 2000 / NASEM 2016', species: 'Bovinos de carne' },
  cria: { title: 'Bovinos de carne: vaca de cría', source: 'NRC 2000 / NASEM 2016', species: 'Bovinos de carne' },
};

function Num({ label, value, onChange, hint }: { label: string; value: number | null; onChange: (v: number | null) => void; hint?: string }) {
  return (
    <label title={hint}>
      {label}
      <NumInput value={value} onChange={onChange} width="100%" />
    </label>
  );
}

export function CattleCalculator({ onClose, onSaved }: { onClose: () => void; onSaved: (msg: string) => void }) {
  const [kind, setKind] = useState<Kind>('leche');
  const [dairy, setDairy] = useState<DairyInput>(DAIRY_DEFAULT);
  const [grow, setGrow] = useState<BeefGrowInput>(BEEF_GROW_DEFAULT);
  const [cow, setCow] = useState<BeefCowInput>(BEEF_COW_DEFAULT);
  const [name, setName] = useState('');

  const res: CattleResult | null = useMemo(() => {
    try {
      if (kind === 'leche') return dairyRequirements(dairy);
      if (kind === 'engorde') return beefGrowRequirements(grow);
      return beefCowRequirements(cow);
    } catch {
      return null;
    }
  }, [kind, dairy, grow, cow]);

  const d = (patch: Partial<DairyInput>) => setDairy({ ...dairy, ...patch });
  const g = (patch: Partial<BeefGrowInput>) => setGrow({ ...grow, ...patch });
  const c = (patch: Partial<BeefCowInput>) => setCow({ ...cow, ...patch });
  const n0 = (v: number | null) => v ?? 0;

  const stage = (() => {
    if (kind === 'leche') {
      const st = dairy.state === 'lactante' ? `${dairy.milk} kg leche, ${dairy.dim} DEL` : dairy.state === 'seca' ? `seca, ${dairy.gestDay} d gestación` : 'novilla';
      return `${dairy.breed} ${dairy.bw} kg, ${st}`;
    }
    if (kind === 'engorde') return `${grow.bw} kg, GDP ${grow.adg} kg/d (${grow.sex})`;
    return `Vaca ${cow.bw} kg, ${cow.lactating ? `${cow.milk} kg leche` : 'seca'}${cow.gestDay > 0 ? `, ${cow.gestDay} d gestación` : ''}`;
  })();

  async function save() {
    if (!res) return;
    const info = KIND_INFO[kind];
    const inputs = kind === 'leche' ? dairy : kind === 'engorde' ? grow : cow;
    await db.requirements.put({
      id: uid('req:'),
      name: name.trim() || `${info.species} — ${stage}`,
      species: info.species,
      stage,
      source: info.source,
      builtin: false,
      verified: true,
      note:
        `Calculado con ${info.source} (consumo ${fmt(res.dmi, 2)} kg MS/d). Requerimientos expresados en base MS. ` +
        'Las restricciones de FDN, FDN de forraje y grasa son guías prácticas editables. ' +
        res.warnings.join(' '),
      constraints: res.constraints,
      ratios: [],
      dmi: Math.round(res.dmi * 100) / 100,
      inputs: { kind, ...inputs } as Record<string, unknown>,
      updatedAt: Date.now(),
    });
    onSaved(`Perfil guardado. Cárguelo en la pestaña Formular desde "Requerimientos".`);
    onClose();
  }

  return (
    <Modal title="Calcular requerimientos de bovinos" onClose={onClose} wide>
      <div className="tabs-inline">
        {(Object.keys(KIND_INFO) as Kind[]).map((k) => (
          <button key={k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>
            {KIND_INFO[k].title}
          </button>
        ))}
      </div>

      {kind === 'leche' && (
        <div className="calc-grid">
          <label>
            Estado
            <select value={dairy.state} onChange={(e) => d({ state: e.target.value as DairyInput['state'] })}>
              <option value="lactante">Vaca en lactancia</option>
              <option value="seca">Vaca seca</option>
              <option value="novilla">Novilla en crecimiento</option>
            </select>
          </label>
          <label>
            Raza
            <select value={dairy.breed} onChange={(e) => d({ breed: e.target.value as DairyInput['breed'] })}>
              <option>Holstein</option>
              <option>Jersey</option>
            </select>
          </label>
          <Num label="Peso vivo (kg)" value={dairy.bw} onChange={(v) => d({ bw: n0(v) })} />
          <Num label="Peso adulto (kg)" value={dairy.bwMature} onChange={(v) => d({ bwMature: n0(v) })} />
          {dairy.state !== 'novilla' && <Num label="Condición corporal (1–5)" value={dairy.bcs} onChange={(v) => d({ bcs: n0(v) })} />}
          {dairy.state === 'lactante' && (
            <>
              <label>
                Partos
                <select value={dairy.multiparous ? 'm' : 'p'} onChange={(e) => d({ multiparous: e.target.value === 'm' })}>
                  <option value="p">Primípara</option>
                  <option value="m">Multípara</option>
                </select>
              </label>
              <Num label="Días en leche" value={dairy.dim} onChange={(v) => d({ dim: n0(v) })} />
              <Num label="Producción de leche (kg/d)" value={dairy.milk} onChange={(v) => d({ milk: n0(v) })} />
              <Num label="Grasa (%)" value={dairy.fat} onChange={(v) => d({ fat: n0(v) })} />
              <Num label="Proteína verdadera (%)" value={dairy.tp} onChange={(v) => d({ tp: n0(v) })} hint="Proteína verdadera ≈ proteína bruta × 0,95" />
              <Num label="Lactosa (%)" value={dairy.lactose} onChange={(v) => d({ lactose: n0(v) })} />
            </>
          )}
          <Num label="Días de gestación (0 = vacía)" value={dairy.gestDay} onChange={(v) => d({ gestDay: n0(v) })} />
          <Num label="Peso del ternero al nacer (kg)" value={dairy.calfBW} onChange={(v) => d({ calfBW: n0(v) })} />
          <Num label="Ganancia de crecimiento (kg/d)" value={dairy.frameGain} onChange={(v) => d({ frameGain: n0(v) })} hint="Crecimiento estructural; vacas adultas: 0" />
          <Num label="Cambio de reservas (kg/d)" value={dairy.reserveGain} onChange={(v) => d({ reserveGain: n0(v) })} hint="Recuperación (+) o movilización (−) de condición corporal" />
          <Num label="FDN esperada de la dieta (% MS)" value={dairy.dietNDF} onChange={(v) => d({ dietNDF: n0(v) })} hint="Se usa para la proteína endógena fecal" />
          <label className="check">
            <input type="checkbox" checked={dairy.grazing} onChange={(e) => d({ grazing: e.target.checked })} /> En pastoreo
          </label>
          {dairy.grazing && <Num label="Suplemento en pastoreo (kg MS/d)" value={dairy.pastureSupplKg} onChange={(v) => d({ pastureSupplKg: n0(v) })} />}
          <Num label="Distancia a la sala de ordeño (m)" value={dairy.distParlor} onChange={(v) => d({ distParlor: n0(v) })} />
          <Num label="Viajes a la sala por día" value={dairy.tripsParlor} onChange={(v) => d({ tripsParlor: n0(v) })} />
          <Num label="Desnivel recorrido (m/d)" value={dairy.topo} onChange={(v) => d({ topo: n0(v) })} />
          <Num label="Consumo de MS fijado (kg/d, opcional)" value={dairy.dmi} onChange={(v) => d({ dmi: v })} hint="Vacío = consumo previsto por NASEM" />
        </div>
      )}

      {kind === 'engorde' && (
        <div className="calc-grid">
          <Num label="Peso vivo actual (kg)" value={grow.bw} onChange={(v) => g({ bw: n0(v) })} />
          <Num label="Ganancia diaria de peso (kg/d)" value={grow.adg} onChange={(v) => g({ adg: n0(v) })} />
          <Num
            label="Peso final en ayuno al acabado (kg)"
            value={grow.fsbw}
            onChange={(v) => g({ fsbw: n0(v) })}
            hint="Peso en ayuno al que el animal alcanzará el engrasamiento objetivo (o peso adulto para vaquillonas de reposición)"
          />
          <label>
            Punto de terminación
            <select value={grow.srw} onChange={(e) => g({ srw: Number(e.target.value) as BeefGrowInput['srw'] })}>
              <option value={478}>Marmoleo pequeño (28 % grasa) — 478 kg</option>
              <option value={462}>Marmoleo leve (27 %) — 462 kg</option>
              <option value={435}>Marmoleo traza (25 %) — 435 kg</option>
            </select>
          </label>
          <label>
            Sexo
            <select value={grow.sex} onChange={(e) => g({ sex: e.target.value as BeefGrowInput['sex'] })}>
              <option value="castrado">Novillo castrado</option>
              <option value="hembra">Vaquillona</option>
              <option value="entero">Toro entero (+15 % ENm)</option>
            </select>
          </label>
          <label>
            Tipo racial
            <select value={grow.be} onChange={(e) => g({ be: Number(e.target.value) })}>
              {BEEF_BREEDS.map((b) => (
                <option key={b.label} value={b.be}>
                  {b.label} ({b.be})
                </option>
              ))}
            </select>
          </label>
          <Num label="Condición corporal (1–9)" value={grow.cs} onChange={(v) => g({ cs: n0(v) })} />
          <Num label="Temperatura media previa (°C)" value={grow.tempPrev} onChange={(v) => g({ tempPrev: n0(v) })} />
          <label>
            Ecuación de consumo
            <select value={grow.calf ? 'c' : 'y'} onChange={(e) => g({ calf: e.target.value === 'c' })}>
              <option value="c">Ternero en crecimiento</option>
              <option value="y">Añojo / novillo</option>
            </select>
          </label>
          <Num label="Consumo de MS fijado (kg/d, opcional)" value={grow.dmi} onChange={(v) => g({ dmi: v })} hint="Vacío = consumo previsto (NRC)" />
        </div>
      )}

      {kind === 'cria' && (
        <div className="calc-grid">
          <Num label="Peso vivo (kg)" value={cow.bw} onChange={(v) => c({ bw: n0(v) })} />
          <Num label="Condición corporal (1–9)" value={cow.cs} onChange={(v) => c({ cs: n0(v) })} />
          <label>
            Tipo racial
            <select value={cow.be} onChange={(e) => c({ be: Number(e.target.value) })}>
              {BEEF_BREEDS.map((b) => (
                <option key={b.label} value={b.be}>
                  {b.label} ({b.be})
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={cow.lactating} onChange={(e) => c({ lactating: e.target.checked })} /> En lactancia
          </label>
          {cow.lactating && (
            <>
              <Num label="Leche (kg/d)" value={cow.milk} onChange={(v) => c({ milk: n0(v) })} />
              <Num label="Grasa (%)" value={cow.fat} onChange={(v) => c({ fat: n0(v) })} />
              <Num label="Sólidos no grasos (%)" value={cow.snf} onChange={(v) => c({ snf: n0(v) })} />
              <Num label="Proteína (%)" value={cow.protein} onChange={(v) => c({ protein: n0(v) })} />
            </>
          )}
          <Num label="Días de gestación (0 = vacía)" value={cow.gestDay} onChange={(v) => c({ gestDay: n0(v) })} />
          <Num label="Peso del ternero al nacer (kg)" value={cow.calfBW} onChange={(v) => c({ calfBW: n0(v) })} />
          <Num label="Temperatura media previa (°C)" value={cow.tempPrev} onChange={(v) => c({ tempPrev: n0(v) })} />
          <Num label="Consumo de MS fijado (kg/d, opcional)" value={cow.dmi} onChange={(v) => c({ dmi: v })} />
        </div>
      )}

      {res && (
        <>
          {res.warnings.map((w) => (
            <p key={w} className="note warn">
              {w}
            </p>
          ))}
          <div className="two-col">
            <div className="table-wrap">
              <table className="grid">
                <thead>
                  <tr>
                    <th>Requerimiento por animal</th>
                    <th className="n">Valor</th>
                    <th>Unidad</th>
                  </tr>
                </thead>
                <tbody>
                  {res.lines.map((l) => (
                    <tr key={l.label}>
                      <td>{l.label}</td>
                      <td className="n">{fmt(l.value, l.unit === 'kg' || l.unit === 'g/d' ? 0 : 2)}</td>
                      <td className="muted">{l.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-wrap">
              <table className="grid">
                <thead>
                  <tr>
                    <th>Restricción de la dieta (base MS)</th>
                    <th className="n">Mín.</th>
                    <th className="n">Máx.</th>
                  </tr>
                </thead>
                <tbody>
                  {res.constraints.map((k) => (
                    <tr key={k.key}>
                      <td>
                        {NUTRIENT_MAP[k.key]?.name ?? k.key} <small className="muted">{NUTRIENT_MAP[k.key]?.unit}</small>
                      </td>
                      <td className="n">{fmt(k.min, NUTRIENT_MAP[k.key]?.decimals)}</td>
                      <td className="n">{fmt(k.max, NUTRIENT_MAP[k.key]?.decimals)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted small">
                La PM aportada se estima por ingrediente (NRC 2001): proteína microbiana = 0,13 × NDT, limitada por 0,85 × PDR; PM = 0,64 × PB
                microbiana + 0,80 × PNDR. Por eso se restringen ambos límites.
              </p>
            </div>
          </div>
          <div className="row gap end wrap">
            <input placeholder={`Nombre (ej. ${KIND_INFO[kind].species} — ${stage})`} value={name} onChange={(e) => setName(e.target.value)} style={{ flex: '1 1 260px' }} />
            <button onClick={onClose}>Cerrar</button>
            <button className="primary" onClick={save}>
              Guardar como perfil de requerimiento
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
