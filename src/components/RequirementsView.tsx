import { useState } from 'react';
import { db, uid } from '../lib/db';
import type { RequirementProfile } from '../lib/types';
import { useData } from '../state';
import { ConstraintEditor, Modal } from './common';

export function RequirementsView() {
  const { requirements } = useData();
  const [editing, setEditing] = useState<RequirementProfile | null>(null);
  const species = Array.from(new Set(requirements.map((r) => r.species)));

  const blank = (): RequirementProfile => ({
    id: uid('req:'),
    name: '',
    species: '',
    stage: '',
    source: 'Manual',
    builtin: false,
    verified: true,
    constraints: [],
    ratios: [],
  });

  return (
    <section>
      <div className="toolbar">
        <button className="primary" onClick={() => setEditing(blank())}>+ Nuevo requerimiento manual</button>
      </div>
      <p className="muted small">
        Perfiles NRC/NASEM incluidos: aves (NRC 1994) y cerdos en crecimiento (NRC 2012). Están marcados “verificar” porque se transcribieron de
        reproducciones secundarias; compárelos con la publicación oficial. Para bovinos de leche (NASEM 2021), carne (NASEM 2016) y otras especies cuyos
        requerimientos dependen de modelos dinámicos, cree un perfil manual con los valores calculados para su lote.
      </p>
      {species.map((sp) => (
        <div key={sp} className="card">
          <h3>{sp || 'Sin especie'}</h3>
          <ul className="list">
            {requirements
              .filter((r) => r.species === sp)
              .map((r) => (
                <li key={r.id} onClick={() => setEditing(r)}>
                  <span>{r.stage || r.name}</span>
                  <span className="row gap">
                    <span className="badge">{r.source}</span>
                    {r.builtin && !r.verified && <span className="badge warn">verificar</span>}
                    <span className="muted small">{r.constraints.length} restricciones</span>
                  </span>
                </li>
              ))}
          </ul>
        </div>
      ))}
      {editing && <RequirementEditor req={editing} onClose={() => setEditing(null)} onOpen={setEditing} />}
    </section>
  );
}

function RequirementEditor({ req, onClose, onOpen }: { req: RequirementProfile; onClose: () => void; onOpen: (r: RequirementProfile) => void }) {
  const [d, setD] = useState<RequirementProfile>({ ...req, ratios: req.ratios ?? [] });
  const ro = req.builtin;
  async function save() {
    if (!d.species.trim() && !d.name.trim()) return alert('Indique al menos especie o nombre.');
    const name = d.name.trim() || `${d.species} — ${d.stage}`;
    await db.requirements.put({ ...d, name, updatedAt: Date.now() });
    onClose();
  }
  return (
    <Modal title={ro ? req.name : req.name ? 'Editar requerimiento' : 'Nuevo requerimiento'} onClose={onClose} wide>
      {ro && req.note && <p className="note">{req.note}</p>}
      <div className="form-grid">
        <label>Especie<input value={d.species} disabled={ro} onChange={(e) => setD({ ...d, species: e.target.value })} placeholder="ej. Bovinos de leche" /></label>
        <label>Etapa / categoría<input value={d.stage} disabled={ro} onChange={(e) => setD({ ...d, stage: e.target.value })} placeholder="ej. 30 L/d, 650 kg" /></label>
        <label>Nombre<input value={d.name} disabled={ro} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="(automático)" /></label>
        <label>Fuente<input value={d.source} disabled={ro} onChange={(e) => setD({ ...d, source: e.target.value })} placeholder="ej. NASEM 2021 / asesor" /></label>
        {!ro && <label className="span2">Notas<input value={d.note ?? ''} onChange={(e) => setD({ ...d, note: e.target.value })} /></label>}
      </div>
      <ConstraintEditor constraints={d.constraints} ratios={d.ratios ?? []} readOnly={ro} onChange={(c, r) => setD({ ...d, constraints: c, ratios: r })} />
      <div className="row gap end">
        {ro ? (
          <button
            className="primary"
            onClick={() =>
              onOpen({ ...req, id: uid('req:'), builtin: false, name: req.name + ' (copia)', source: req.source + ' (modificado)', verified: true })
            }
          >
            Duplicar para editar
          </button>
        ) : (
          <>
            {req.name && (
              <button className="danger" onClick={async () => { if (confirm('¿Eliminar este perfil?')) { await db.requirements.delete(req.id); onClose(); } }}>
                Eliminar
              </button>
            )}
            <button onClick={onClose}>Cancelar</button>
            <button className="primary" onClick={save}>Guardar</button>
          </>
        )}
      </div>
    </Modal>
  );
}
