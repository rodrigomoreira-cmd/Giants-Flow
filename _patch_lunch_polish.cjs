const fs = require('fs');

function replaceExact(content, oldStr, newStr, label) {
  if (content.includes(oldStr)) {
    return content.replace(oldStr, newStr);
  }
  const normContent = content.replace(/\r\n/g, '\n');
  const normOld = oldStr.replace(/\r\n/g, '\n');
  if (normContent.includes(normOld)) {
    return normContent.replace(normOld, newStr);
  }
  throw new Error('Trecho nao encontrado em ' + label);
}

const lunchPath = 'frontend-react/src/pages/Lunch.jsx';
let code = fs.readFileSync(lunchPath, 'utf8');

// 1) Helper para contar a quantidade real de entrevistadores ocupando lugares na mesa
code = replaceExact(
  code,
  `const isMembroGiants = (emp) =>
  Boolean(emp?.membro_giants) || String(emp?.origem || '').toUpperCase().includes('GIAN');`,
  `const isMembroGiants = (emp) =>
  Boolean(emp?.membro_giants) || String(emp?.origem || '').toUpperCase().includes('GIAN');

const contarEntrevistadoresMesa = (m) =>
  Array.isArray(m?.entrevistadores_ids) && m.entrevistadores_ids.length > 0
    ? m.entrevistadores_ids.length
    : m?.tem_entrevistador
    ? 1
    : 0;`,
  'Lunch: helper contarEntrevistadoresMesa'
);

// 2) Atualizar todas as somas de ocupação para considerar N entrevistadores escalados
code = replaceExact(
  code,
  `    if (mesaAlvo) {
      const capTotal = Number(mesaAlvo.capacidade_total || 5);
      const ocupados = mesaAlvo.ocupantesLista.length + (mesaAlvo.tem_entrevistador ? 1 : 0);
      const livres = Math.max(0, capTotal - ocupados);`,
  `    if (mesaAlvo) {
      const capTotal = Number(mesaAlvo.capacidade_total || 5);
      const ocupados = mesaAlvo.ocupantesLista.length + contarEntrevistadoresMesa(mesaAlvo);
      const livres = Math.max(0, capTotal - ocupados);`,
  'Lunch: alocarGrupoEmMesa ocupados'
);

code = replaceExact(
  code,
  `          .map((m) => {
            const c = Number(m.capacidade_total || 5);
            const oc = m.ocupantesLista.length + (m.tem_entrevistador ? 1 : 0);
            return { ...m, livres: Math.max(0, c - oc), distancia: Math.abs(Number(m.numero) - Number(mesaAlvo.numero)) };
          })`,
  `          .map((m) => {
            const c = Number(m.capacidade_total || 5);
            const oc = m.ocupantesLista.length + contarEntrevistadoresMesa(m);
            return { ...m, livres: Math.max(0, c - oc), distancia: Math.abs(Number(m.numero) - Number(mesaAlvo.numero)) };
          })`,
  'Lunch: mesasVizinhas ocupados'
);

code = replaceExact(
  code,
  `  mesas.forEach((m) => {
    totalCapacidade += Number(m.capacidade_total || 5);
    const entrevistadorOcupa = m.tem_entrevistador ? 1 : 0;
    totalOcupados += m.ocupantesLista.length + entrevistadorOcupa;
  });`,
  `  mesas.forEach((m) => {
    totalCapacidade += Number(m.capacidade_total || 5);
    totalOcupados += m.ocupantesLista.length + contarEntrevistadoresMesa(m);
  });`,
  'Lunch: totalOcupados geral'
);

code = replaceExact(
  code,
  `  const qtdMesasComVagas = mesas.filter((m) => {
    const cap = Number(m.capacidade_total || 5);
    const oc = m.ocupantesLista.length + (m.tem_entrevistador ? 1 : 0);
    return cap - oc > 0;
  }).length;
  const qtdMesasOcupadas = mesas.filter((m) => m.ocupantesLista.length > 0).length;
  const qtdMesasComEntrevistador = mesas.filter((m) => Boolean(m.tem_entrevistador)).length;

  const mesasFiltradasSalao = useMemo(() => {
    return mesas.filter((m) => {
      const cap = Number(m.capacidade_total || 5);
      const oc = m.ocupantesLista.length + (m.tem_entrevistador ? 1 : 0);
      if (filtroMesasSalao === 'com_vagas') return cap - oc > 0;`,
  `  const qtdMesasComVagas = mesas.filter((m) => {
    const cap = Number(m.capacidade_total || 5);
    const oc = m.ocupantesLista.length + contarEntrevistadoresMesa(m);
    return cap - oc > 0;
  }).length;
  const qtdMesasOcupadas = mesas.filter((m) => m.ocupantesLista.length > 0).length;
  const qtdMesasComEntrevistador = mesas.filter((m) => contarEntrevistadoresMesa(m) > 0).length;

  const mesasFiltradasSalao = useMemo(() => {
    return mesas.filter((m) => {
      const cap = Number(m.capacidade_total || 5);
      const oc = m.ocupantesLista.length + contarEntrevistadoresMesa(m);
      if (filtroMesasSalao === 'com_vagas') return cap - oc > 0;`,
  'Lunch: filtros mesas contagem'
);

// 3) Rótulo compacto no topo da mesa ("Agatha +1" em vez de cortar o nome)
code = replaceExact(
  code,
  `                {mesasFiltradasSalao.map((mesa) => {
                  const capTotal = Number(mesa.capacidade_total || 5);
                  const entrevistadorOcupa = mesa.tem_entrevistador ? 1 : 0;
                  const totalOcupadosMesa = mesa.ocupantesLista.length + entrevistadorOcupa;`,
  `                {mesasFiltradasSalao.map((mesa) => {
                  const capTotal = Number(mesa.capacidade_total || 5);
                  const entrevistadorOcupa = contarEntrevistadoresMesa(mesa);
                  const totalOcupadosMesa = mesa.ocupantesLista.length + entrevistadorOcupa;
                  const escaladosMesa = Array.isArray(mesa.entrevistadores_escalados) ? mesa.entrevistadores_escalados : [];
                  const primeiroNomeEnt = escaladosMesa[0]?.nome
                    ? escaladosMesa[0].nome.split(' ')[0]
                    : mesa.entrevistadorNome
                    ? mesa.entrevistadorNome.split(' ')[0]
                    : null;
                  const rotuloConsultorMesa = primeiroNomeEnt
                    ? escaladosMesa.length > 1
                      ? \`\${primeiroNomeEnt} +\${escaladosMesa.length - 1}\`
                      : primeiroNomeEnt
                    : '+ Consultor';`,
  'Lunch: rotuloConsultorMesa'
);

code = replaceExact(
  code,
  `                      {/* Selo Superior do Entrevistador (sem sobreposição com assentos) */}
                      <button
                        type="button"
                        onClick={() => setModalMesaAberta(mesa)}
                        title="Clique para escalar ou trocar o entrevistador desta mesa"
                        style={{`,
  `                      {/* Selo Superior do Entrevistador (sem sobreposição com assentos) */}
                      <button
                        type="button"
                        onClick={() => setModalMesaAberta(mesa)}
                        title={
                          mesa.entrevistadorNome
                            ? \`Consultor(es): \${mesa.entrevistadorNome} — Clique para alterar\`
                            : 'Clique para escalar ou trocar o entrevistador desta mesa'
                        }
                        style={{`,
  'Lunch: tooltip consultor'
);

code = replaceExact(
  code,
  `                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {mesa.entrevistadorNome || '+ Consultor'}
                        </span>`,
  `                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {rotuloConsultorMesa}
                        </span>`,
  'Lunch: render rotuloConsultorMesa'
);

// 4) Modal de Entrevistadores: sem quebra de linha no botão, truncate no e-mail e tag de mesa já atribuída
code = replaceExact(
  code,
  `                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Clique para escalar 1 ou mais entrevistadores
                  </span>`,
  `                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    {(modalMesaAberta.entrevistadores_ids || []).length > 0
                      ? \`\${(modalMesaAberta.entrevistadores_ids || []).length} consultor(es) escalado(s) nesta mesa\`
                      : 'Clique para escalar 1 ou mais entrevistadores'}
                  </span>`,
  'Lunch: subtitulo modal entrevistadores'
);

code = replaceExact(
  code,
  `            <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {entrevistadores
                .filter(
                  (e) =>
                    (e.nome || '').toLowerCase().includes(buscaEntrevistadorModal.toLowerCase()) ||
                    (e.email || '').toLowerCase().includes(buscaEntrevistadorModal.toLowerCase())
                )
                .map((ent) => {
                  const idsMesa = modalMesaAberta.entrevistadores_ids || (modalMesaAberta.entrevistador_id ? [modalMesaAberta.entrevistador_id] : []);
                  const jaSelecionado = idsMesa.includes(ent.id);

                  return (
                    <div
                      key={ent.id}
                      onClick={() => alternarEntrevistadorMesa(modalMesaAberta.id, ent.id)}
                      style={{
                        padding: '0.65rem 0.9rem',
                        borderRadius: '10px',
                        border: '1.5px solid',
                        borderColor: jaSelecionado ? '#0284c7' : '#e2e8f0',
                        background: jaSelecionado ? '#f0f9ff' : '#fff',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: jaSelecionado ? '#0284c7' : '#f1f5f9',
                            color: jaSelecionado ? '#fff' : '#475569',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: '700',
                            fontSize: '0.85rem'
                          }}
                        >
                          {ent.nome.charAt(0)}
                        </div>
                        <div>
                          <div style={{ fontWeight: '700', fontSize: '0.85rem', color: '#0f172a' }}>{ent.nome}</div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{ent.email}</div>
                        </div>
                      </div>

                      <div
                        style={{
                          padding: '0.25rem 0.6rem',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: '700',
                          background: jaSelecionado ? '#0284c7' : '#f1f5f9',
                          color: jaSelecionado ? '#fff' : '#64748b'
                        }}
                      >
                        {jaSelecionado ? '✓ Escalado' : '+ Escalar'}
                      </div>
                    </div>
                  );
                })}
            </div>`,
  `            <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingRight: '0.2rem' }}>
              {entrevistadores
                .filter(
                  (e) =>
                    (e.nome || '').toLowerCase().includes(buscaEntrevistadorModal.toLowerCase()) ||
                    (e.email || '').toLowerCase().includes(buscaEntrevistadorModal.toLowerCase())
                )
                .map((ent) => {
                  const idsMesa = modalMesaAberta.entrevistadores_ids || (modalMesaAberta.entrevistador_id ? [modalMesaAberta.entrevistador_id] : []);
                  const jaSelecionado = idsMesa.includes(ent.id);
                  const outrasMesas = mesas
                    .filter((m) => m.id !== modalMesaAberta.id && (m.entrevistadores_ids || []).includes(ent.id))
                    .map((m) => \`Mesa \${m.numero}\`);

                  return (
                    <div
                      key={ent.id}
                      onClick={() => alternarEntrevistadorMesa(modalMesaAberta.id, ent.id)}
                      style={{
                        padding: '0.65rem 0.85rem',
                        borderRadius: '10px',
                        border: '1.5px solid',
                        borderColor: jaSelecionado ? '#0284c7' : '#e2e8f0',
                        background: jaSelecionado ? '#f0f9ff' : '#fff',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '0.65rem',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: jaSelecionado ? '#0284c7' : '#f1f5f9',
                            color: jaSelecionado ? '#fff' : '#475569',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: '700',
                            fontSize: '0.85rem',
                            flexShrink: 0
                          }}
                        >
                          {ent.nome.charAt(0)}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: '700', fontSize: '0.84rem', color: '#0f172a' }}>{ent.nome}</span>
                            {outrasMesas.length > 0 && (
                              <span style={{ fontSize: '0.64rem', fontWeight: '800', background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', padding: '0.06rem 0.38rem', borderRadius: '999px', whiteSpace: 'nowrap' }}>
                                Na {outrasMesas.join(', ')}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ent.email}
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          padding: '0.32rem 0.7rem',
                          borderRadius: '7px',
                          fontSize: '0.75rem',
                          fontWeight: '800',
                          background: jaSelecionado ? '#0284c7' : '#f1f5f9',
                          color: jaSelecionado ? '#fff' : '#475569',
                          whiteSpace: 'nowrap',
                          flexShrink: 0
                        }}
                      >
                        {jaSelecionado ? '✓ Escalado' : '+ Escalar'}
                      </div>
                    </div>
                  );
                })}
            </div>`,
  'Lunch: lista modal entrevistadores'
);

fs.writeFileSync(lunchPath, code, 'utf8');
console.log('OK: Lunch.jsx refinado com sucesso.');
