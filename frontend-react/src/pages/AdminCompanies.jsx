import { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import { useTurma } from '../context/TurmaContext';

export default function AdminCompanies() {
  const { turmaSelecionada } = useTurma();
  const [empresas, setEmpresas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('TODOS');
  const [editandoCvId, setEditandoCvId] = useState(null);
  const [cvTemp, setCvTemp] = useState('');
  const [salvandoId, setSalvandoId] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [abaAtiva, setAbaAtiva] = useState('conciliacao'); // 'conciliacao' | 'duplicidades'
  const [auditoriaDup, setAuditoriaDup] = useState(null);
  const [carregandoDup, setCarregandoDup] = useState(false);
  const [corrigindoDup, setCorrigindoDup] = useState(false);

  const turmaId = turmaSelecionada || localStorage.getItem('turma_ativa_id') || '1491';

  const carregarDados = () => {
    setCarregando(true);
    api
      .get(`/clientes?turmaId=${turmaId}`)
      .then((d) => setEmpresas(Array.isArray(d) ? d : d.clientes || []))
      .catch(() => setEmpresas([]))
      .finally(() => setCarregando(false));
  };

  useEffect(() => {
    carregarDados();
  }, [turmaId]);


  const carregarAuditoriaDuplicidades = () => {
    setCarregandoDup(true);
    api
      .get(`/admin/auditoria-duplicidades?turmaId=${turmaId}`)
      .then((res) => setAuditoriaDup(res))
      .catch(() => setAuditoriaDup(null))
      .finally(() => setCarregandoDup(false));
  };

  useEffect(() => {
    carregarAuditoriaDuplicidades();
  }, [turmaId]);

  const unificarCnpjGrupo = async (grupo) => {
    if (!grupo?.cnpjSugerido) {
      setFeedback({ tipo: 'erro', texto: 'Nenhum CNPJ válido encontrado neste grupo para unificação automática.' });
      return;
    }
    try {
      setCorrigindoDup(true);
      await api.post('/admin/corrigir-duplicidade', {
        acao: 'unificar_cnpj',
        turmaId,
        ids: grupo.registros.map((r) => r.id),
        cnpjUnificado: grupo.cnpjSugerido,
        empresaUnificada: grupo.empresa
      });
      setFeedback({ tipo: 'ok', texto: `CNPJ ${grupo.cnpjSugerido} unificado entre os sócios de ${grupo.empresa}.` });
      carregarDados();
      carregarAuditoriaDuplicidades();
    } catch (err) {
      setFeedback({ tipo: 'erro', texto: err.message });
    } finally {
      setCorrigindoDup(false);
    }
  };

  const mesclarDuplicado = async (idPrincipal, idDuplicado) => {
    try {
      setCorrigindoDup(true);
      const resp = await api.post('/admin/corrigir-duplicidade', {
        acao: 'mesclar_ficha_duplicada',
        turmaId,
        idPrincipal,
        idDuplicado
      });
      setFeedback({ tipo: 'ok', texto: resp?.mensagem || 'Registro duplicado mesclado com sucesso.' });
      carregarDados();
      carregarAuditoriaDuplicidades();
    } catch (err) {
      setFeedback({ tipo: 'erro', texto: err.message });
    } finally {
      setCorrigindoDup(false);
    }
  };

  const classificarStatus = (e) => {
    if (e.membro_giants || String(e.origem || '').toUpperCase() === 'GIANTS') return 'GIANTS';
    if (e.cortesia_almoco) return 'CORTESIA';
    if (e.almoco_pago || Number(e.valor_almoco || 0) > 0) return 'PAGO';
    return 'PENDENTE';
  };

  const kpis = useMemo(() => {
    let pagos = 0;
    let totalCaixaAlmoco = 0;
    let cortesias = 0;
    let giants = 0;
    let pendentes = 0;
    let pagosSemCv = 0;

    for (const e of empresas) {
      const st = classificarStatus(e);
      if (st === 'PAGO') {
        pagos += 1;
        totalCaixaAlmoco += Number(e.valor_almoco || 0);
        if (!String(e.cv_cartao || '').trim()) pagosSemCv += 1;
      } else if (st === 'CORTESIA') {
        cortesias += 1;
      } else if (st === 'GIANTS') {
        giants += 1;
      } else {
        pendentes += 1;
      }
    }

    return { total: empresas.length, pagos, totalCaixaAlmoco, cortesias, giants, pendentes, pagosSemCv };
  }, [empresas]);

  const empresasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return empresas.filter((e) => {
      const st = classificarStatus(e);
      if (filtroStatus === 'PAGO' && st !== 'PAGO') return false;
      if (filtroStatus === 'CORTESIA' && st !== 'CORTESIA') return false;
      if (filtroStatus === 'GIANTS' && st !== 'GIANTS') return false;
      if (filtroStatus === 'PENDENTE' && st !== 'PENDENTE') return false;
      if (filtroStatus === 'SEM_CV' && !(st === 'PAGO' && !String(e.cv_cartao || '').trim())) return false;

      if (!termo) return true;
      const texto = [
        e.id,
        e.empresa,
        e.razao_social,
        e.nome_participante,
        e.nome_cracha,
        e.cnpj,
        e.cv_cartao
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return texto.includes(termo);
    });
  }, [empresas, busca, filtroStatus]);

  const iniciarEdicaoCv = (e) => {
    setEditandoCvId(e.id);
    setCvTemp(e.cv_cartao || '');
    setFeedback(null);
  };

  const salvarCv = async (fichaId) => {
    setSalvandoId(fichaId);
    setFeedback(null);
    try {
      const atualizado = await api.patch(`/clientes/${fichaId}`, { cv_cartao: cvTemp });
      setEmpresas((prev) =>
        prev.map((item) => (item.id === fichaId ? { ...item, cv_cartao: atualizado.cv_cartao ?? (cvTemp.trim() || null) } : item))
      );
      setEditandoCvId(null);
      setFeedback({ tipo: 'ok', texto: `CV do participante #${fichaId} atualizado com sucesso.` });
    } catch (err) {
      setFeedback({ tipo: 'erro', texto: err.message || 'Erro ao salvar comprovante CV.' });
    } finally {
      setSalvandoId(null);
    }
  };

  const renderBadgeStatus = (e) => {
    const st = classificarStatus(e);
    if (st === 'GIANTS') {
      return (
        <span style={{ padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', background: '#fef3c7', color: '#b45309' }}>
          Membro GIANTS
        </span>
      );
    }
    if (st === 'CORTESIA') {
      return (
        <span style={{ padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', background: '#e0e7ff', color: '#4338ca' }}>
          Cortesia Autorizada
        </span>
      );
    }
    if (st === 'PAGO') {
      const val = Number(e.valor_almoco || 0);
      return (
        <span style={{ padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', background: '#dcfce7', color: '#15803d' }}>
          {val > 0 ? `Pago (R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})` : 'Pago (Sócio vinculado)'}
        </span>
      );
    }
    return (
      <span style={{ padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', background: '#fee2e2', color: '#b91c1c' }}>
        Pendente
      </span>
    );
  };

  return (
    <div style={{ padding: '2rem', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#ff5722', background: '#fff7ed', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
            Administração • Conciliação Financeira
          </span>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a', margin: '0.25rem 0 0 0' }}>
            Auditoria de Empresas e CVs de Almoço
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0.25rem 0 0 0' }}>
            Conferência de taxas de almoço, cortesias, membros GIANTS e lançamento/edição rápida de comprovantes (CV).
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setAbaAtiva('conciliacao')}
            style={{
              padding: '0.6rem 1rem',
              borderRadius: '8px',
              border: 'none',
              background: abaAtiva === 'conciliacao' ? '#0f172a' : '#e2e8f0',
              color: abaAtiva === 'conciliacao' ? '#fff' : '#334155',
              fontWeight: '700',
              cursor: 'pointer'
            }}
          >
            Conciliação de Almoço & CVs
          </button>
          <button
            type="button"
            onClick={() => { setAbaAtiva('duplicidades'); carregarAuditoriaDuplicidades(); }}
            style={{
              padding: '0.6rem 1rem',
              borderRadius: '8px',
              border: 'none',
              background: abaAtiva === 'duplicidades' ? '#d97706' : '#fef3c7',
              color: abaAtiva === 'duplicidades' ? '#fff' : '#92400e',
              fontWeight: '800',
              cursor: 'pointer'
            }}
          >
            Auditoria Duplicidades DB ({auditoriaDup?.resumo?.totalPendencias ?? 0})
          </button>
          <button
            type="button"
            onClick={() => { carregarDados(); carregarAuditoriaDuplicidades(); }}
            style={{
              padding: '0.6rem 1rem',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#fff',
              color: '#0f172a',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Revalidar Base
          </button>
        </div>
      </div>

      {abaAtiva === 'duplicidades' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {carregandoDup ? (
            <div style={{ background: '#fff', padding: '2rem', borderRadius: '12px', textAlign: 'center', color: '#64748b' }}>
              Auditando registros importados do banco de dados...
            </div>
          ) : !auditoriaDup || auditoriaDup.resumo?.totalPendencias === 0 ? (
            <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', padding: '1.5rem', borderRadius: '12px', color: '#166534', fontWeight: '700' }}>
              ✔ Nenhuma duplicidade de sócio, CNPJ inválido ou empresa fragmentada encontrada na turma ativa!
            </div>
          ) : (
            <>
              {/* 1. Participantes Duplicados */}
              {auditoriaDup.participantesDuplicados?.length > 0 && (
                <div style={{ background: '#fff', border: '1px solid #fecaca', borderRadius: '12px', padding: '1.25rem' }}>
                  <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: '800', color: '#b91c1c' }}>
                    1. Participantes Duplicados na Mesma Turma ({auditoriaDup.participantesDuplicados.length})
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {auditoriaDup.participantesDuplicados.map((grp) => {
                      const principal = grp.registros[0];
                      return (
                        <div key={grp.chave} style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '9px', padding: '0.85rem' }}>
                          <div style={{ fontWeight: '800', color: '#0f172a', marginBottom: '0.45rem' }}>{grp.nome}</div>
                          {grp.registros.map((reg, idxReg) => (
                            <div key={reg.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', padding: '0.35rem 0', borderTop: idxReg > 0 ? '1px dashed #fca5a5' : 'none', fontSize: '0.8rem' }}>
                              <span>
                                <strong>#{reg.id}</strong> • {reg.empresa || 'Sem empresa'} • CNPJ: <code>{reg.cnpj || reg.cpf_cnpj || '-'}</code> • {reg.almoco_pago ? 'Almoço Pago' : 'Pendente'}
                              </span>
                              {idxReg === 0 ? (
                                <span style={{ background: '#dcfce7', color: '#166534', padding: '0.18rem 0.55rem', borderRadius: '6px', fontWeight: '800', fontSize: '0.72rem' }}>
                                  Registro Principal
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={corrigindoDup}
                                  onClick={() => mesclarDuplicado(principal.id, reg.id)}
                                  style={{ background: '#dc2626', color: '#fff', border: 'none', padding: '0.35rem 0.75rem', borderRadius: '6px', fontWeight: '700', fontSize: '0.75rem', cursor: 'pointer' }}
                                >
                                  Mesclar #{reg.id} no #{principal.id}
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 2. Sócios Fragmentados / Sem CNPJ */}
              {auditoriaDup.empresasFragmentadas?.length > 0 && (
                <div style={{ background: '#fff', border: '1px solid #fde68a', borderRadius: '12px', padding: '1.25rem' }}>
                  <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: '800', color: '#92400e' }}>
                    2. Sócios da Mesma Empresa Fragmentados / Sem CNPJ ({auditoriaDup.empresasFragmentadas.length})
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {auditoriaDup.empresasFragmentadas.map((grp) => (
                      <div key={grp.chave} style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '9px', padding: '0.85rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.45rem' }}>
                          <div>
                            <strong style={{ color: '#0f172a' }}>{grp.empresa}</strong>
                            <div style={{ fontSize: '0.76rem', color: '#92400e' }}>{grp.motivo}</div>
                          </div>
                          {grp.cnpjSugerido && (
                            <button
                              type="button"
                              disabled={corrigindoDup}
                              onClick={() => unificarCnpjGrupo(grp)}
                              style={{ background: '#d97706', color: '#fff', border: 'none', padding: '0.42rem 0.85rem', borderRadius: '7px', fontWeight: '800', fontSize: '0.76rem', cursor: 'pointer' }}
                            >
                              Unificar CNPJ ({grp.cnpjSugerido})
                            </button>
                          )}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#334155', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          {grp.registros.map((r) => (
                            <div key={r.id}>
                              • <strong>#{r.id}</strong> {r.nome_participante} — CNPJ: <code>{r.cnpj || r.cpf_cnpj || 'AUSENTE'}</code>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 3. CNPJs Inválidos ou Divergentes */}
              {(auditoriaDup.cnpjsInvalidos?.length > 0 || auditoriaDup.cnpjsNomesDivergentes?.length > 0) && (
                <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '1.25rem' }}>
                  <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: '800', color: '#0f172a' }}>
                    3. CNPJs Inválidos ou Razões Sociais Divergentes ({(auditoriaDup.cnpjsInvalidos?.length || 0) + (auditoriaDup.cnpjsNomesDivergentes?.length || 0)})
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8rem' }}>
                    {auditoriaDup.cnpjsInvalidos?.map((item) => (
                      <div key={item.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.6rem 0.8rem' }}>
                        <strong>#{item.id}</strong> {item.empresa} ({item.participante}) — CNPJ <code>{item.cnpj}</code>: <span style={{ color: '#dc2626', fontWeight: '700' }}>{item.motivo}</span>
                      </div>
                    ))}
                    {auditoriaDup.cnpjsNomesDivergentes?.map((item) => (
                      <div key={item.cnpj} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.6rem 0.8rem' }}>
                        CNPJ <code>{item.cnpj}</code> compartilhado por nomes distintos: <strong>{item.nomesEncontrados.join(' / ')}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <>
      {/* KPIs de Conciliação */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ background: '#fff', padding: '1rem 1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: '600' }}>Total de Fichas na Turma</div>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#0f172a', marginTop: '0.2rem' }}>{kpis.total}</div>
        </div>
        <div style={{ background: '#fff', padding: '1rem 1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: '600' }}>Almoços Pagos ({kpis.pagos})</div>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#16a34a', marginTop: '0.2rem' }}>
            R$ {kpis.totalCaixaAlmoco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div style={{ background: '#fff', padding: '1rem 1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: '600' }}>Cortesias / GIANTS</div>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#4338ca', marginTop: '0.2rem' }}>
            {kpis.cortesias} <span style={{ fontSize: '0.9rem', color: '#b45309' }}>/ {kpis.giants}</span>
          </div>
        </div>
        <div style={{ background: '#fff', padding: '1rem 1.25rem', borderRadius: '12px', border: kpis.pagosSemCv > 0 ? '1px solid #fb923c' : '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: '600' }}>Pagos sem CV Lançado</div>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: kpis.pagosSemCv > 0 ? '#ea580c' : '#0f172a', marginTop: '0.2rem' }}>
            {kpis.pagosSemCv}
          </div>
        </div>
      </div>

      {/* Barra de Busca e Filtros */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem' }}>
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por ID, empresa, empresário, CNPJ ou CV..."
          style={{
            flex: '1 1 280px',
            padding: '0.65rem 0.9rem',
            borderRadius: '8px',
            border: '1px solid #cbd5e1',
            fontSize: '0.9rem'
          }}
        />
        {[
          { id: 'TODOS', label: `Todos (${empresas.length})` },
          { id: 'PAGO', label: `Pagos (${kpis.pagos})` },
          { id: 'SEM_CV', label: `Pagos sem CV (${kpis.pagosSemCv})` },
          { id: 'CORTESIA', label: `Cortesias (${kpis.cortesias})` },
          { id: 'GIANTS', label: `GIANTS (${kpis.giants})` },
          { id: 'PENDENTE', label: `Pendentes (${kpis.pendentes})` }
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltroStatus(f.id)}
            style={{
              padding: '0.55rem 0.85rem',
              borderRadius: '8px',
              border: filtroStatus === f.id ? '1px solid #ff5722' : '1px solid #e2e8f0',
              background: filtroStatus === f.id ? '#fff7ed' : '#fff',
              color: filtroStatus === f.id ? '#ea580c' : '#475569',
              fontWeight: '600',
              fontSize: '0.82rem',
              cursor: 'pointer'
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {feedback && (
        <div
          style={{
            marginBottom: '1rem',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            fontSize: '0.88rem',
            fontWeight: '600',
            background: feedback.tipo === 'ok' ? '#dcfce7' : '#fee2e2',
            color: feedback.tipo === 'ok' ? '#166534' : '#991b1b'
          }}
        >
          {feedback.texto}
        </div>
      )}

      {/* Tabela de Conciliação */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <tr>
              <th style={{ padding: '0.9rem 1rem', color: '#475569', fontSize: '0.82rem' }}>ID</th>
              <th style={{ padding: '0.9rem 1rem', color: '#475569', fontSize: '0.82rem' }}>Empresa / CNPJ</th>
              <th style={{ padding: '0.9rem 1rem', color: '#475569', fontSize: '0.82rem' }}>Empresário</th>
              <th style={{ padding: '0.9rem 1rem', color: '#475569', fontSize: '0.82rem' }}>Status Almoço</th>
              <th style={{ padding: '0.9rem 1rem', color: '#475569', fontSize: '0.82rem' }}>Comprovante (CV Cartão)</th>
              <th style={{ padding: '0.9rem 1rem', color: '#475569', fontSize: '0.82rem', textAlign: 'right' }}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr>
                <td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                  Carregando conciliação da turma...
                </td>
              </tr>
            ) : empresasFiltradas.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                  Nenhum registro encontrado para o filtro selecionado.
                </td>
              </tr>
            ) : (
              empresasFiltradas.map((e) => {
                const emEdicao = editandoCvId === e.id;
                return (
                  <tr key={e.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.9rem 1rem', fontWeight: '700', color: '#ff5722' }}>#{e.id}</td>
                    <td style={{ padding: '0.9rem 1rem' }}>
                      <div style={{ fontWeight: '700', color: '#0f172a' }}>{e.empresa || e.razao_social || 'Sem empresa'}</div>
                      {e.cnpj && <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '0.15rem' }}>{e.cnpj}</div>}
                    </td>
                    <td style={{ padding: '0.9rem 1rem', color: '#334155', fontWeight: '500' }}>
                      {e.nome_participante || e.nome_cracha || '-'}
                    </td>
                    <td style={{ padding: '0.9rem 1rem' }}>{renderBadgeStatus(e)}</td>
                    <td style={{ padding: '0.9rem 1rem' }}>
                      {emEdicao ? (
                        <input
                          type="text"
                          value={cvTemp}
                          onChange={(ev) => setCvTemp(ev.target.value)}
                          placeholder="Ex: 123456"
                          autoFocus
                          onKeyDown={(ev) => {
                            if (ev.key === 'Enter') salvarCv(e.id);
                            if (ev.key === 'Escape') setEditandoCvId(null);
                          }}
                          style={{
                            padding: '0.4rem 0.6rem',
                            borderRadius: '6px',
                            border: '1px solid #ff5722',
                            fontSize: '0.85rem',
                            width: '150px'
                          }}
                        />
                      ) : e.cv_cartao ? (
                        <span style={{ fontFamily: 'monospace', fontWeight: '700', color: '#0f172a', background: '#f1f5f9', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                          {e.cv_cartao}
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>-</span>
                      )}
                    </td>
                    <td style={{ padding: '0.9rem 1rem', textAlign: 'right' }}>
                      {emEdicao ? (
                        <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                          <button
                            onClick={() => salvarCv(e.id)}
                            disabled={salvandoId === e.id}
                            style={{
                              padding: '0.35rem 0.7rem',
                              borderRadius: '6px',
                              border: 'none',
                              background: '#16a34a',
                              color: '#fff',
                              fontWeight: '700',
                              fontSize: '0.78rem',
                              cursor: 'pointer'
                            }}
                          >
                            {salvandoId === e.id ? 'Salvando...' : 'Salvar'}
                          </button>
                          <button
                            onClick={() => setEditandoCvId(null)}
                            style={{
                              padding: '0.35rem 0.65rem',
                              borderRadius: '6px',
                              border: '1px solid #cbd5e1',
                              background: '#fff',
                              color: '#475569',
                              fontWeight: '600',
                              fontSize: '0.78rem',
                              cursor: 'pointer'
                            }}
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => iniciarEdicaoCv(e)}
                          style={{
                            padding: '0.35rem 0.75rem',
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1',
                            background: '#fff',
                            color: '#0f172a',
                            fontWeight: '600',
                            fontSize: '0.78rem',
                            cursor: 'pointer'
                          }}
                        >
                          {e.cv_cartao ? 'Editar CV' : 'Lançar CV'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
        </>
      )}
    </div>
  );
}
