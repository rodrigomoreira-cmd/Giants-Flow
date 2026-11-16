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

        <button
          onClick={carregarDados}
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
          Atualizar Lista
        </button>
      </div>

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
    </div>
  );
}
