import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useTurma } from '../context/TurmaContext';

const fmtBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = (v) => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });

const formatarDataBR = (iso) => {
  if (!iso) return 'Data não definida';
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return 'Data não definida';
  return dt.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
};

const paraInputDate = (iso) => {
  if (!iso) return '';
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
};

const BADGE_STATUS = {
  AO_VIVO: { label: 'AO VIVO NO EVENTO', bg: '#dcfce7', color: '#166534', border: '#86efac' },
  PREPARACAO: { label: 'EM PREPARAÇÃO', bg: '#fef3c7', color: '#92400e', border: '#fde68a' },
  ENCERRADA: { label: 'ENCERRADA', bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' }
};

export default function AdminCohorts() {
  const navigate = useNavigate();
  const { turmaSelecionada, mudarTurma, recarregarTurmas } = useTurma();
  const [turmas, setTurmas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('TODAS'); // ATIVAS | TODAS | ENCERRADAS
  const [turmaOperacionalId, setTurmaOperacionalId] = useState(() => String(localStorage.getItem('turma_ativa_id') || '1491'));

  // Modal de Criação / Edição
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({
    codigo: '',
    nome: '',
    data_inicio: '',
    data_fim: '',
    status_evento: 'AO_VIVO',
    ativa: true,
    meta_competencia: '',
    meta_caixa: '',
    qtd_mesas: 40
  });

  const carregarTurmas = async () => {
    try {
      setCarregando(true);
      const dados = await api.get('/turmas');
      const lista = Array.isArray(dados) ? dados : [];
      setTurmas(lista);
    } catch (err) {
      try {
        const aux = await api.get('/auxiliares');
        setTurmas(aux.turmas || []);
      } catch (_) {
        setTurmas([]);
      }
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarTurmas();
  }, []);

  const definirTurmaOperacional = (t, irParaWarRoom = false) => {
    const idStr = String(t.id);
    const rotulo = t.codigo ? `[${t.codigo}] ${t.nome}` : t.nome;
    localStorage.setItem('turma_ativa_id', idStr);
    localStorage.setItem('turma_ativa_nome', t.nome);
    localStorage.setItem('turma_ativa_label', rotulo);
    setTurmaOperacionalId(idStr);
    mudarTurma(idStr);
    window.dispatchEvent(new Event('storage'));
    if (irParaWarRoom) {
      navigate('/war-room');
    } else {
      alert(`Turma operacional alterada para:\n#${t.id} — ${rotulo}`);
    }
  };

  const abrirModalNova = () => {
    setEditandoId(null);
    setForm({
      codigo: '',
      nome: '',
      data_inicio: '',
      data_fim: '',
      status_evento: 'AO_VIVO',
      ativa: true,
      meta_competencia: '',
      meta_caixa: '',
      qtd_mesas: 40
    });
    setModalAberto(true);
  };

  const abrirModalEdicao = (t) => {
    setEditandoId(t.id);
    const st = t.status_evento || (t.ativa ? 'AO_VIVO' : 'ENCERRADA');
    setForm({
      codigo: t.codigo || '',
      nome: t.nome || '',
      data_inicio: paraInputDate(t.data_inicio),
      data_fim: paraInputDate(t.data_fim),
      status_evento: st,
      ativa: Boolean(t.ativa),
      meta_competencia: Number(t.meta_competencia || 0) > 0 ? String(t.meta_competencia) : '',
      meta_caixa: Number(t.meta_caixa || 0) > 0 ? String(t.meta_caixa) : '',
      qtd_mesas: Number(t.qtd_mesas || 40)
    });
    setModalAberto(true);
  };

  const salvarTurma = async (e) => {
    e.preventDefault();
    if (!form.nome.trim()) return;

    const payload = {
      codigo: form.codigo.trim() || null,
      nome: form.nome.trim(),
      data_inicio: form.data_inicio ? `${form.data_inicio}T03:00:00Z` : null,
      data_fim: form.data_fim ? `${form.data_fim}T23:59:59Z` : null,
      status_evento: form.status_evento,
      ativa: form.status_evento !== 'ENCERRADA',
      meta_competencia: Number(form.meta_competencia) || 0,
      meta_caixa: Number(form.meta_caixa) || 0,
      qtd_mesas: Number(form.qtd_mesas) || 40
    };

    try {
      setSalvando(true);
      if (editandoId) {
        await api.put(`/turmas/${editandoId}`, payload);
      } else {
        await api.post('/turmas', payload);
      }
      setModalAberto(false);
      await carregarTurmas();
      await recarregarTurmas();
    } catch (err) {
      alert('Erro ao salvar turma: ' + err.message);
    } finally {
      setSalvando(false);
    }
  };

  const alternarStatusAtiva = async (t) => {
    const novaAtiva = !t.ativa;
    const novoStatus = novaAtiva ? 'AO_VIVO' : 'ENCERRADA';
    try {
      await api.patch(`/turmas/${t.id}/status`, { ativa: novaAtiva, status_evento: novoStatus });
      setTurmas((prev) =>
        prev.map((item) => (item.id === t.id ? { ...item, ativa: novaAtiva, status_evento: novoStatus } : item))
      );
      await recarregarTurmas();
    } catch (err) {
      alert('Erro ao alterar status da turma: ' + err.message);
    }
  };

  const excluirTurma = async (t) => {
    if (!confirm(`Deseja excluir a turma #${t.id} — ${t.nome}?`)) return;
    try {
      await api.delete(`/turmas/${t.id}`);
      setTurmas((prev) => prev.filter((item) => item.id !== t.id));
      await recarregarTurmas();
    } catch (err) {
      alert(err.message || 'Não foi possível excluir esta turma.');
    }
  };

  const resumoGeral = useMemo(() => {
    return turmas.reduce(
      (acc, t) => ({
        total: acc.total + 1,
        ativas: acc.ativas + (t.ativa ? 1 : 0),
        alunos: acc.alunos + Number(t.total_alunos || 0),
        competencia: acc.competencia + Number(t.competencia_total || 0)
      }),
      { total: 0, ativas: 0, alunos: 0, competencia: 0 }
    );
  }, [turmas]);

  const turmasFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return turmas.filter((t) => {
      if (filtroStatus === 'ATIVAS' && !t.ativa) return false;
      if (filtroStatus === 'ENCERRADAS' && t.ativa) return false;
      if (!q) return true;
      return (
        String(t.id).includes(q) ||
        String(t.codigo || '').toLowerCase().includes(q) ||
        String(t.nome || '').toLowerCase().includes(q)
      );
    });
  }, [turmas, busca, filtroStatus]);

  return (
    <div style={{ padding: '1.75rem 2rem', width: '100%', maxWidth: '1480px', margin: '0 auto', boxSizing: 'border-box' }}>
      {/* CABEÇALHO */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <span style={{ fontSize: '0.76rem', fontWeight: '800', color: '#ff5722', background: '#fff7ed', padding: '0.22rem 0.6rem', borderRadius: '6px', textTransform: 'uppercase' }}>
            Administração Geral • Sincronizado com Banco de Dados
          </span>
          <h1 style={{ fontSize: '1.7rem', fontWeight: '800', color: '#0f172a', margin: '0.3rem 0 0 0' }}>
            Turmas & Eventos Presenciais
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.88rem', margin: '0.2rem 0 0 0' }}>
            Gerencie as edições vindas do banco, defina a turma operacional ativa, acompanhe inscritos reais e configure metas do War Room.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={carregarTurmas}
            style={{
              background: '#ffffff',
              color: '#0f172a',
              border: '1px solid #cbd5e1',
              padding: '0.62rem 1rem',
              borderRadius: '10px',
              fontWeight: '700',
              fontSize: '0.84rem',
              cursor: 'pointer'
            }}
          >
            Atualizar Lista
          </button>

          <button
            type="button"
            onClick={abrirModalNova}
            style={{
              background: '#ff5722',
              color: '#fff',
              border: 'none',
              padding: '0.65rem 1.25rem',
              borderRadius: '10px',
              fontWeight: '800',
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: '0 2px 8px rgba(255,87,34,0.3)'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.15rem' }}>add_circle</span>
            Nova Turma Manual
          </button>
        </div>
      </div>

      {/* KPIs CONSOLIDADOS DO BANCO */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        <div style={{ background: '#0f172a', color: '#fff', borderRadius: '12px', padding: '1rem 1.2rem' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase' }}>
            Turmas no Banco de Dados
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: '900', color: '#fff', marginTop: '0.25rem' }}>
            {fmtNum(resumoGeral.total)}
          </div>
          <div style={{ fontSize: '0.76rem', color: '#fb923c', marginTop: '0.15rem', fontWeight: '700' }}>
            {resumoGeral.ativas} ativa(s) para operação
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem 1.2rem' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>
            Turma Selecionada no Navegador
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: '900', color: '#ff5722', marginTop: '0.25rem' }}>
            #{turmaOperacionalId}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '0.15rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {turmas.find((t) => String(t.id) === turmaOperacionalId)?.nome || 'Turma Operacional Ativa'}
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem 1.2rem' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>
            Total de Alunos (Todas as Turmas)
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: '900', color: '#0f172a', marginTop: '0.25rem' }}>
            {fmtNum(resumoGeral.alunos)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
            Linhas sincronizadas na tabela fichas
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem 1.2rem' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#047857', textTransform: 'uppercase' }}>
            Competência Acumulada
          </div>
          <div style={{ fontSize: '1.55rem', fontWeight: '900', color: '#059669', marginTop: '0.25rem' }}>
            {fmtBRL(resumoGeral.competencia)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
            Contratos fechados nas turmas
          </div>
        </div>
      </div>

      {/* BARRA DE BUSCA E FILTRO */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.9rem 1.15rem', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 280px' }}>
          <span className="material-symbols-outlined" style={{ position: 'absolute', left: '11px', top: '9px', color: '#94a3b8', fontSize: '1.15rem' }}>search</span>
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Filtrar por ID (ex: 1491), código (T-01491) ou nome do evento..."
            style={{ width: '100%', padding: '0.55rem 0.75rem 0.55rem 2.35rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.86rem', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {[
            { id: 'TODAS', label: `Todas (${turmas.length})` },
            { id: 'ATIVAS', label: `Ativas (${resumoGeral.ativas})` },
            { id: 'ENCERRADAS', label: `Inativas / Encerradas (${turmas.length - resumoGeral.ativas})` }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFiltroStatus(tab.id)}
              style={{
                padding: '0.48rem 0.9rem',
                borderRadius: '8px',
                border: filtroStatus === tab.id ? '1.5px solid #ff5722' : '1px solid #cbd5e1',
                background: filtroStatus === tab.id ? '#fff7ed' : '#ffffff',
                color: filtroStatus === tab.id ? '#c2410c' : '#475569',
                fontWeight: '800',
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* GRID DE CARDS DAS TURMAS DO BANCO */}
      {carregando ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b', fontWeight: '700' }}>
          Carregando turmas do banco de dados...
        </div>
      ) : turmasFiltradas.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', color: '#64748b' }}>
          Nenhuma turma encontrada para o filtro selecionado.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '1.25rem' }}>
          {turmasFiltradas.map((t) => {
            const isOperacionalAtual = String(t.id) === turmaOperacionalId;
            const statusKey = t.status_evento || (t.ativa ? 'AO_VIVO' : 'ENCERRADA');
            const badge = BADGE_STATUS[statusKey] || (t.ativa ? BADGE_STATUS.AO_VIVO : BADGE_STATUS.ENCERRADA);
            const metaComp = Number(t.meta_competencia || 0);
            const compAtual = Number(t.competencia_total || 0);
            const pctMeta = metaComp > 0 ? Math.min(100, Math.round((compAtual / metaComp) * 100)) : 0;

            return (
              <div
                key={t.id}
                style={{
                  background: '#ffffff',
                  borderRadius: '14px',
                  border: isOperacionalAtual ? '2px solid #ff5722' : '1px solid #e2e8f0',
                  boxShadow: isOperacionalAtual ? '0 8px 24px rgba(255, 87, 34, 0.12)' : '0 1px 3px rgba(15, 23, 42, 0.04)',
                  padding: '1.35rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '1rem'
                }}
              >
                <div>
                  {/* TOPO DO CARD: ID + CÓDIGO + STATUS */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.74rem', fontWeight: '800', color: '#0f172a', background: '#f1f5f9', padding: '0.22rem 0.55rem', borderRadius: '6px', fontFamily: 'monospace' }}>
                        #{t.id}
                      </span>
                      {t.codigo && (
                        <span style={{ fontSize: '0.74rem', fontWeight: '800', color: '#ff5722', background: '#fff7ed', padding: '0.22rem 0.55rem', borderRadius: '6px' }}>
                          {t.codigo}
                        </span>
                      )}
                      {isOperacionalAtual && (
                        <span style={{ fontSize: '0.68rem', fontWeight: '800', color: '#ffffff', background: '#ff5722', padding: '0.2rem 0.55rem', borderRadius: '6px' }}>
                          EM USO
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => alternarStatusAtiva(t)}
                      title="Clique para alternar entre Ativa (Ao Vivo) e Encerrada"
                      style={{
                        border: `1px solid ${badge.border}`,
                        background: badge.bg,
                        color: badge.color,
                        fontSize: '0.7rem',
                        fontWeight: '800',
                        padding: '0.24rem 0.6rem',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      ● {t.ativa ? badge.label : 'INATIVA / ENCERRADA'}
                    </button>
                  </div>

                  {/* NOME E DATA DO EVENTO */}
                  <h3 style={{ margin: '0.75rem 0 0.25rem', fontSize: '1.08rem', fontWeight: '800', color: '#0f172a', lineHeight: 1.3 }}>
                    {t.nome}
                  </h3>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span>📅 Início: <strong>{formatarDataBR(t.data_inicio)}</strong></span>
                    {t.data_fim && <span>Fim: <strong>{formatarDataBR(t.data_fim)}</strong></span>}
                    <span>🪑 {t.qtd_mesas || 40} mesas</span>
                  </div>

                  {/* MÉTRICAS REAIS DO BANCO PARA ESTA TURMA */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.45rem', marginTop: '0.95rem', textAlign: 'center' }}>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.5rem 0.3rem' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#0f172a' }}>{fmtNum(t.total_alunos)}</div>
                      <div style={{ fontSize: '0.66rem', fontWeight: '700', color: '#64748b' }}>Alunos</div>
                    </div>
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.5rem 0.3rem' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#0f172a' }}>{fmtNum(t.total_empresas)}</div>
                      <div style={{ fontSize: '0.66rem', fontWeight: '700', color: '#64748b' }}>CNPJs</div>
                    </div>
                    <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '0.5rem 0.3rem' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#ff5722' }}>{fmtNum(t.fichas_preenchidas)}</div>
                      <div style={{ fontSize: '0.66rem', fontWeight: '700', color: '#9a3412' }}>Fichas</div>
                    </div>
                    <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '0.5rem 0.3rem' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#0369a1' }}>{fmtNum(t.giants_presentes)}</div>
                      <div style={{ fontSize: '0.66rem', fontWeight: '700', color: '#0369a1' }}>GIANTS</div>
                    </div>
                  </div>

                  {/* FINANCEIRO E META DA TURMA */}
                  {(Number(t.contratos_fechados || 0) > 0 || metaComp > 0) && (
                    <div style={{ marginTop: '0.8rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '9px', padding: '0.65rem 0.8rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                        <span style={{ color: '#475569', fontWeight: '700' }}>
                          {t.contratos_fechados} contrato(s) • Caixa: <strong>{fmtBRL(t.caixa_total)}</strong>
                        </span>
                        <strong style={{ color: '#059669' }}>{fmtBRL(compAtual)}</strong>
                      </div>
                      {metaComp > 0 && (
                        <div style={{ marginTop: '0.45rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#64748b', marginBottom: '0.2rem' }}>
                            <span>Meta Competência: {fmtBRL(metaComp)}</span>
                            <strong>{pctMeta}%</strong>
                          </div>
                          <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                            <div style={{ width: `${pctMeta}%`, height: '100%', background: '#ff5722' }} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* RODAPÉ DE AÇÕES */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap', borderTop: '1px solid #f1f5f9', paddingTop: '0.85rem' }}>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => definirTurmaOperacional(t, false)}
                      style={{
                        background: isOperacionalAtual ? '#0f172a' : '#fff7ed',
                        color: isOperacionalAtual ? '#ffffff' : '#c2410c',
                        border: isOperacionalAtual ? 'none' : '1px solid #fdba74',
                        padding: '0.42rem 0.72rem',
                        borderRadius: '7px',
                        fontSize: '0.75rem',
                        fontWeight: '800',
                        cursor: 'pointer'
                      }}
                    >
                      {isOperacionalAtual ? '✓ Turma Ativa' : 'Usar na Operação'}
                    </button>

                    <button
                      type="button"
                      onClick={() => definirTurmaOperacional(t, true)}
                      style={{
                        background: '#f8fafc',
                        color: '#0f172a',
                        border: '1px solid #cbd5e1',
                        padding: '0.42rem 0.68rem',
                        borderRadius: '7px',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      War Room
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <button
                      type="button"
                      onClick={() => abrirModalEdicao(t)}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        color: '#334155',
                        padding: '0.4rem 0.65rem',
                        borderRadius: '7px',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      Editar / Metas
                    </button>

                    <button
                      type="button"
                      onClick={() => excluirTurma(t)}
                      title="Excluir turma sem vínculos"
                      style={{
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        color: '#dc2626',
                        padding: '0.4rem 0.55rem',
                        borderRadius: '7px',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center'
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }}>delete</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL DE CRIAÇÃO / EDIÇÃO DA TURMA E METAS */}
      {modalAberto && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}
          onClick={() => setModalAberto(false)}
        >
          <div
            style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '540px', padding: '1.75rem', boxShadow: '0 25px 50px rgba(0, 0, 0, 0.25)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '800', color: '#0f172a' }}>
                  {editandoId ? `Configurar Turma #${editandoId}` : 'Nova Turma / Edição'}
                </h3>
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                  Os dados de nome e data alimentam automaticamente o War Room e o Panorama PDF.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setModalAberto(false)}
                style={{ background: 'transparent', border: 'none', fontSize: '1.1rem', fontWeight: '800', color: '#64748b', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={salvarTurma} style={{ display: 'flex', flexDirection: 'column', gap: '0.95rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>
                    Código
                  </label>
                  <input
                    type="text"
                    value={form.codigo}
                    onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                    placeholder="Ex: T-01491"
                    style={{ width: '100%', padding: '0.58rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>
                    Status Operacional
                  </label>
                  <select
                    value={form.status_evento}
                    onChange={(e) => setForm({ ...form, status_evento: e.target.value })}
                    style={{ width: '100%', padding: '0.58rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem', background: '#fff', boxSizing: 'border-box' }}
                  >
                    <option value="AO_VIVO">● Ao Vivo (Ativa no Sistema)</option>
                    <option value="PREPARACAO">○ Em Preparação (Ativa)</option>
                    <option value="ENCERRADA">✕ Encerrada (Inativa / Histórico)</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>
                  Nome Oficial do Evento / Turma *
                </label>
                <input
                  type="text"
                  required
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Ex: Acelerador Empresarial #86 I Presencial [Novembro]"
                  style={{ width: '100%', padding: '0.58rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>
                    Data Início
                  </label>
                  <input
                    type="date"
                    value={form.data_inicio}
                    onChange={(e) => setForm({ ...form, data_inicio: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.84rem', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>
                    Data Fim
                  </label>
                  <input
                    type="date"
                    value={form.data_fim}
                    onChange={(e) => setForm({ ...form, data_fim: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.84rem', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>
                    Mesas no Salão
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="200"
                    value={form.qtd_mesas}
                    onChange={(e) => setForm({ ...form, qtd_mesas: e.target.value })}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.86rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>
                    Meta Competência (R$)
                  </label>
                  <input
                    type="number"
                    step="100"
                    value={form.meta_competencia}
                    onChange={(e) => setForm({ ...form, meta_competencia: e.target.value })}
                    placeholder="Ex: 3500000"
                    style={{ width: '100%', padding: '0.58rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>
                    Meta Caixa (R$)
                  </label>
                  <input
                    type="number"
                    step="100"
                    value={form.meta_caixa}
                    onChange={(e) => setForm({ ...form, meta_caixa: e.target.value })}
                    placeholder="Ex: 600000"
                    style={{ width: '100%', padding: '0.58rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.6rem', borderTop: '1px solid #f1f5f9', paddingTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setModalAberto(false)}
                  style={{ background: '#fff', border: '1px solid #cbd5e1', padding: '0.58rem 1rem', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', color: '#475569' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  style={{ background: '#ff5722', color: '#fff', border: 'none', padding: '0.58rem 1.35rem', borderRadius: '8px', fontWeight: '800', cursor: 'pointer' }}
                >
                  {salvando ? 'Salvando...' : editandoId ? 'Salvar Alterações' : 'Criar Turma'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
