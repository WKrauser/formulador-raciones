import { useRef, useState } from 'react';
import { DATA_SOURCES_NOTE, db, exportBackup, importBackup, TABLE_INGREDIENTS } from '../lib/db';
import { readFileAsText, saveFile } from '../lib/files';
import { PRICE_UNIT_LABEL, type Settings, type Source } from '../lib/types';
import { useData } from '../state';
import { NumInput } from './common';

export function SettingsView() {
  const { settings } = useData();
  const [msg, setMsg] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const put = (patch: Partial<Settings>) => db.settings.put({ ...settings, ...patch, knownSources: ['FEDNA', 'Feedtables', 'NASEM', 'Local'] });
  const count = (s: Source) => TABLE_INGREDIENTS.filter((i) => i.source === s).length;

  return (
    <section>
      <div className="card">
        <h3>Preferencias</h3>
        <div className="form-grid">
          <label>Empresa / granja (aparece en informes)<input value={settings.company} onChange={(e) => put({ company: e.target.value })} /></label>
          <label>Símbolo de moneda<input value={settings.currency} onChange={(e) => put({ currency: e.target.value })} /></label>
          <label>
            Unidad de precio
            <select value={settings.priceUnit} onChange={(e) => put({ priceUnit: e.target.value as Settings['priceUnit'] })}>
              {Object.entries(PRICE_UNIT_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <label>Bachada por defecto (kg)<NumInput value={settings.defaultBatchKg} onChange={(v) => put({ defaultBatchKg: v ?? 1000 })} /></label>
        </div>
        <h4>Fuentes de ingredientes visibles</h4>
        <div className="row gap wrap">
          {(['FEDNA', 'Feedtables', 'NASEM', 'Local'] as Source[]).map((s) => (
            <label className="check" key={s}>
              <input
                type="checkbox"
                checked={settings.sources.includes(s)}
                onChange={(e) => put({ sources: e.target.checked ? [...settings.sources, s] : settings.sources.filter((x) => x !== s) })}
              />{' '}
              {s} {s !== 'Local' && <small className="muted">({count(s)})</small>}
            </label>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Respaldo de datos</h3>
        <p className="muted small">
          Los datos (precios, ingredientes locales, requerimientos y fórmulas) se guardan en este dispositivo. Exporte un respaldo para
          llevarlos entre Windows y Android o para no perderlos.
        </p>
        <div className="row gap wrap">
          <button className="primary" onClick={async () => saveFile(`respaldo_formulador_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await exportBackup()), 'application/json')}>
            Exportar respaldo
          </button>
          <button onClick={() => ref.current?.click()}>Importar respaldo</button>
          <input ref={ref} type="file" accept=".json,application/json" hidden onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = '';
            if (!f) return;
            try { setMsg(await importBackup(JSON.parse(await readFileAsText(f)))); } catch (err) { setMsg('Error: ' + (err as Error).message); }
          }} />
        </div>
        {msg && <p className="note">{msg}</p>}
      </div>

      <div className="card">
        <h3>Fuentes de datos</h3>
        <ul className="small">
          <li><b>FEDNA 2019</b> — Tablas FEDNA de composición y valor nutritivo de alimentos (4ª ed.), Fundación Española para el Desarrollo de la Nutrición Animal. Hoja oficial v. 15.01.2021 (fundacionfedna.org).</li>
          <li><b>Feedtables</b> — Tablas INRAE-CIRAD-AFZ de composición y valor nutritivo de materias primas (feedtables.com). Valores tal cual; AA y minerales convertidos de g/kg a %.</li>
          <li><b>FEDNA forrajes y subproductos húmedos</b> — fichas de fundacionfedna.org (ensilados, henos, pastos, por rango de MS o calidad VRF).</li>
          <li><b>NASEM</b> — biblioteca de alimentos de NASEM (2021) Nutrient Requirements of Dairy Cattle, distribuida con la implementación abierta
            nasem_dairy (U. de Guelph). EM, ENl, ENm y ENg calculadas desde ED con las ecuaciones NRC. La propiedad intelectual es de NASEM: el uso
            comercial requiere su autorización.</li>
          <li><b>Requerimientos</b> — Bovinos de leche: NASEM (2021). Bovinos de carne: NRC (2000) / NASEM (2016). Aves: NRC (1994). Cerdos: NRC/NASEM
            (2012), por verificar.</li>
        </ul>
        <p className="muted small">
          Equivalencias usadas entre tablas: EMAn aves = FEDNA “EMA aves adultas” / Feedtables “AMEn cockerel”; EMAn pollos = FEDNA “EMA pollitos” /
          Feedtables “AMEn broiler”; PNDR = Feedtables “RUP NRC 2001 (50 % concentrado)” / FEDNA forrajes “degradabilidad del N” / FEDNA
          concentrados estimada desde PDIA (dr = 0,85) / NASEM “RUP base”; Ca y P absorbibles con coeficientes NASEM (por defecto 0,4/0,6 Ca y
          0,79/0,70 P en forrajes/concentrados cuando la tabla no los trae); EN porcino = FEDNA “EN porcino” / Feedtables “NE growing pig”; AA digestibles aves = FEDNA “digestible fecal real”
          / Feedtables “ileal standardized poultry”; P digestible porcino = FEDNA “total aparente” / Feedtables “sin fitasa”. Los datos de tablas
          pertenecen a sus autores; para uso comercial o redistribución verifique sus condiciones de uso. {DATA_SOURCES_NOTE}.
        </p>
      </div>
    </section>
  );
}
