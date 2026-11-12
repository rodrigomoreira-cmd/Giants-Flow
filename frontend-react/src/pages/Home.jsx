import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useNavigate } from 'react-router-dom';
import { useTurma } from '../context/TurmaContext';

export default function Home() {
  const [metricas, setMetricas] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const navigate = useNavigate();

  const { turmaSelecionada, turmaAtual } = useTurma();

  const carregarMetricas = async (tId = turmaSelecionada) => {
    try {
      setCarregando(true);
      setErro('');
      const params = {};
      const idFinal = tId || turmaSelecionada || localStorage.getItem('turma_ativa_id') || '1491';
      if (idFinal && idFinal !== 'todas') {
        params.turma_id = idFinal;
      }
      const dados = await api.get('/hub/metricas', { params });
      setMetricas(dados);
    } catch (err) {
      setErro(err.message || 'Erro ao carregar indicadores executivos.');
    } finally {
      setCarregando(false);
    }
  };

  // Recarrega sempre que o seletor do Header trocar a turma
  useEffect(() => {
    carregarMetricas(turmaSelecionada);
  }, [turmaSelecionada]);

  const formatarMoeda = (val) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(val || 0);
  };

  const faturamentoLista = metricas?.faturamentoMensal || [];
  const maxFaturamento = Math.max(...faturamentoLista.map(f => f.valor), 1);
  const totalFaturamento = faturamentoLista.reduce((acc, cur) => acc + (cur.valor || 0), 0);

  return (
    <div style={{ padding: '2rem', width: '100%', boxSizing: 'border-box', background: '#f8fafc', minHeight: '100vh' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#16a34a', display: 'inline-block', boxShadow: '0 0 10px #16a34a' }}></span>
            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Painel Operacional em Tempo Real
            </span>
          </div>
          <h1 style={{ fontSize: '1.9rem', fontWeight: '800', color: '#0f172a', margin: '0.35rem 0 0' }}>
            Visão Geral do Evento
          </h1>
          <p style={{ color: '#64748b', margin: '0.25rem 0 0', fontSize: '0.95rem' }}>
            Acompanhamento de fluxo de participantes, empresas e faturamento comercial
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={() => navigate('/companies')}
            style={{
              background: '#fff',
              border: '1px solid #cbd5e1',
              padding: '0.65rem 1.15rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: '600',
              color: '#334155',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>domain</span>
            Empresas & Triagem
          </button>

          <button
            onClick={() => carregarMetricas(turmaSelecionada)}
            style={{
              background: '#0284c7',
              border: 'none',
              padding: '0.65rem 1.15rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: '600',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: '0 2px 4px rgba(2, 132, 199, 0.25)'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>sync</span>
            Atualizar Dados
          </button>
        </div>
      </div>

      {erro && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
          {erro}
        </div>
      )}

      {/* BLOCO SUPERIOR: PRESENTES AGORA E NO SHOW */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1.3fr) minmax(200px, 0.7fr)', gap: '1.5rem', marginBottom: '1.5rem' }}>
        
        {/* Card Destaque: Total de Aplicações */}
        <div style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          borderRadius: '16px',
          padding: '1.75rem',
          color: '#fff',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 4px 14px rgba(15, 23, 42, 0.12)'
        }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(255, 255, 255, 0.1)', padding: '0.25rem 0.65rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#4ade80', marginBottom: '1rem' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4ade80' }}></span>
            Fluxo Ativo
          </div>
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', fontWeight: '600', color: '#94a3b8' }}>
            Total de Aplicações
          </h3>
          <div style={{ fontSize: '3.2rem', fontWeight: '900', lineHeight: 1, letterSpacing: '-0.02em', color: '#fff' }}>
            {carregando ? '...' : (metricas?.empresasPagantesAlmoco || 0).toLocaleString('pt-BR')}
          </div>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
            CNPJs que pagaram os R$ 1.000 de almoço
          </p>
        </div>

        {/* Card Menor: No Show (%) */}
        <div style={{
          background: '#fff',
          borderRadius: '16px',
          padding: '1.75rem',
          border: '1px solid #e2e8f0',
          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.02)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center'
        }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#fee2e2', padding: '0.25rem 0.65rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#dc2626', marginBottom: '1rem', width: 'fit-content' }}>
            Absenteísmo
          </div>
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', fontWeight: '600', color: '#64748b' }}>
            No Show (%)
          </h3>
          <div style={{ fontSize: '2.5rem', fontWeight: '900', lineHeight: 1, color: '#dc2626' }}>
            {carregando ? '...' : metricas?.noShowPct || '0.0%'}
          </div>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: '#64748b' }}>
            {metricas?.noShowQtd || 0} participantes não compareceram
          </p>
        </div>
      </div>

      {/* BLOCO INTERMEDIÁRIO: OS 4 INDICADORES CENTRAIS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
        
        {/* 1. Total de Empresas na Turma */}
        <div style={{ background: '#fff', borderRadius: '16px', padding: '1.35rem', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#64748b' }}>Total de Empresas na Turma</span>
            <div style={{ background: '#eff6ff', color: '#2563eb', width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.35rem' }}>domain</span>
            </div>
          </div>
          <div style={{ fontSize: '2.1rem', fontWeight: '900', color: '#0f172a', lineHeight: 1 }}>
            {carregando ? '...' : (metricas?.totalEmpresas || 653).toLocaleString('pt-BR')}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ background: '#dbeafe', color: '#1e40af', padding: '0.15rem 0.5rem', borderRadius: '6px', fontWeight: '700', fontSize: '0.72rem' }}>Total</span>
            <span>empresas na turma</span>
          </div>
        </div>

        {/* 2. Total de Alunos */}
        <div style={{ background: '#fff', borderRadius: '16px', padding: '1.35rem', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#64748b' }}>Total de Alunos</span>
            <div style={{ background: '#e0e7ff', color: '#4f46e5', width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.35rem' }}>groups</span>
            </div>
          </div>
          <div style={{ fontSize: '2.1rem', fontWeight: '900', color: '#0f172a', lineHeight: 1 }}>
            {carregando ? '...' : (metricas?.totalAlunos || 0).toLocaleString('pt-BR')}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ background: '#e0e7ff', color: '#3730a3', padding: '0.15rem 0.5rem', borderRadius: '6px', fontWeight: '700', fontSize: '0.72rem' }}>Qtde de Linhas</span>
            <span>participantes no evento</span>
          </div>
        </div>

        {/* 3. Fichas Preenchidas (Almoço Pago) */}
        <div style={{ background: '#fff', borderRadius: '16px', padding: '1.35rem', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#64748b' }}>Fichas Preenchidas</span>
            <div style={{ background: '#fef3c7', color: '#d97706', width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.35rem' }}>restaurant</span>
            </div>
          </div>
          <div style={{ fontSize: '2.1rem', fontWeight: '900', color: '#0f172a', lineHeight: 1 }}>
            {carregando ? '...' : (metricas?.fichasPreenchidas || 0).toLocaleString('pt-BR')}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ background: '#dcfce7', color: '#166534', padding: '0.15rem 0.5rem', borderRadius: '6px', fontWeight: '700', fontSize: '0.72rem' }}>Almoço Pago</span>
            <span>
              {metricas?.empresasPagantesAlmoco || 0} CNPJ(s) pagantes
            </span>
          </div>
        </div>

        {/* 4. Valor Total (Almoço + Fechados) */}
        <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', borderRadius: '16px', padding: '1.35rem', border: '1px solid #334155', boxShadow: '0 4px 14px rgba(15, 23, 42, 0.15)', color: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#94a3b8' }}>Valor Total</span>
            <div style={{ background: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.35rem' }}>payments</span>
            </div>
          </div>
          <div style={{ fontSize: '2.1rem', fontWeight: '900', color: '#22c55e', lineHeight: 1 }}>
            {carregando ? '...' : formatarMoeda(metricas?.valorTotal || 0)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <span style={{ background: 'rgba(255,255,255,0.08)', padding: '0.2rem 0.5rem', borderRadius: '6px', color: '#cbd5e1' }}>
              Almoço: {formatarMoeda(metricas?.valorAlmoco || 0)}
            </span>
            <span>+</span>
            <span style={{ background: 'rgba(255,255,255,0.08)', padding: '0.2rem 0.5rem', borderRadius: '6px', color: '#cbd5e1' }}>
              Fechados: {formatarMoeda(metricas?.valorFechados || 0)}
            </span>
          </div>
        </div>

      </div>

      
        {/* ============================================================== */}
        {/* RESUMO DE FECHAMENTO COMERCIAL (GIANTS, PAC E CONSOLIDADO)    */}
        {/* ============================================================== */}
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '1.75rem', marginBottom: '1.75rem', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span className="material-symbols-outlined" style={{ color: '#0f172a', fontSize: '1.5rem' }}>assignment_turned_in</span>
              <h3 style={{ fontSize: '1.85rem', fontWeight: '800', color: '#0f172a', margin: '0 0 0.35rem 0' }}>{carregando ? '...' : (metricas?.fichasPreenchidas ?? 28).toLocaleString('pt-BR')}</h3>
            </div>
            <span style={{ fontSize: '0.8rem', background: '#f8fafc', padding: '0.35rem 0.75rem', borderRadius: '6px', color: '#64748b', fontWeight: '600', border: '1px solid #e2e8f0' }}>
              Conversão Comercial em Tempo Real
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '1.25rem' }}>
            {/* Bloco 1: GIANTS */}
            <div style={{ background: 'linear-gradient(180deg, #faf5ff 0%, #ffffff 100%)', borderRadius: '14px', border: '1.5px solid #e9d5ff', padding: '1.4rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span className="material-symbols-outlined" style={{ color: '#9333ea', fontSize: '1.3rem' }}>bolt</span>
                    <span style={{ fontWeight: '900', fontSize: '1.05rem', color: '#6b21a8', letterSpacing: '0.02em' }}>GIANTS</span>
                  </div>
                  <span style={{ fontSize: '0.72rem', background: '#f3e8ff', color: '#7e22ce', padding: '0.2rem 0.5rem', borderRadius: '6px', fontWeight: '800' }}>PROGRAMA OFICIAL</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', fontSize: '0.88rem', color: '#334155', marginBottom: '1.2rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #f3e8ff', paddingBottom: '0.35rem' }}>
                    <span>Total de Empresas:</span>
                    <strong style={{ color: '#0f172a', fontSize: '0.95rem' }}>{metricas?.resumoFechamento?.giants?.totalEmpresas ?? 0}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #f3e8ff', paddingBottom: '0.35rem' }}>
                    <span>Total de Pessoas:</span>
                    <strong style={{ color: '#0f172a', fontSize: '0.95rem' }}>{metricas?.resumoFechamento?.giants?.totalPessoas ?? 0}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.35rem' }}>
                    <span>Empresas com sócio:</span>
                    <strong style={{ color: '#0f172a', fontSize: '0.95rem' }}>{metricas?.resumoFechamento?.giants?.empresasComSocio ?? 0}</strong>
                  </div>
                </div>
              </div>

              <div style={{ background: '#fff', borderRadius: '10px', padding: '0.85rem', border: '1px solid #f3e8ff', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.82rem', color: '#16a34a', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    💰 Caixa:
                  </span>
                  <strong style={{ color: '#15803d', fontSize: '1rem' }}>
                    {formatarMoeda(metricas?.resumoFechamento?.giants?.caixa || 0)}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.82rem', color: '#6b21a8', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    📅 Competência:
                  </span>
                  <strong style={{ color: '#581c87', fontSize: '1rem' }}>
                    {formatarMoeda(metricas?.resumoFechamento?.giants?.competencia || 0)}
                  </strong>
                </div>
              </div>
            </div>

            {/* Bloco 2: PAC */}
            <div style={{ background: 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%)', borderRadius: '14px', border: '1.5px solid #bbf7d0', padding: '1.4rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span className="material-symbols-outlined" style={{ color: '#16a34a', fontSize: '1.3rem' }}>ads_click</span>
                    <span style={{ fontWeight: '900', fontSize: '1.05rem', color: '#166534', letterSpacing: '0.02em' }}>PAC</span>
                  </div>
                  <span style={{ fontSize: '0.72rem', background: '#dcfce7', color: '#15803d', padding: '0.2rem 0.5rem', borderRadius: '6px', fontWeight: '800' }}>DOWNSELL COMERCIAL</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', fontSize: '0.88rem', color: '#334155', marginBottom: '1.2rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #dcfce7', paddingBottom: '0.35rem' }}>
                    <span>Total de Empresas:</span>
                    <strong style={{ color: '#0f172a', fontSize: '0.95rem' }}>{metricas?.resumoFechamento?.pac?.totalEmpresas ?? 0}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed transparent', paddingBottom: '0.35rem', color: '#94a3b8' }}>
                    <span>Funil Comercial:</span>
                    <span style={{ fontSize: '0.8rem', fontWeight: '600' }}>Conversão Ativa</span>
                  </div>
                </div>
              </div>

              <div style={{ background: '#fff', borderRadius: '10px', padding: '0.85rem', border: '1px solid #dcfce7', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.82rem', color: '#16a34a', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    💰 Caixa:
                  </span>
                  <strong style={{ color: '#15803d', fontSize: '1rem' }}>
                    {formatarMoeda(metricas?.resumoFechamento?.pac?.caixa || 0)}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.82rem', color: '#0369a1', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    📅 Competência:
                  </span>
                  <strong style={{ color: '#075985', fontSize: '1rem' }}>
                    {formatarMoeda(metricas?.resumoFechamento?.pac?.competencia || 0)}
                  </strong>
                </div>
              </div>
            </div>

            {/* Bloco 3: TOTAL DE FATURAMENTO COM GIANTS & PAC */}
            <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', borderRadius: '14px', border: '1.5px solid #334155', padding: '1.4rem', color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 8px 20px rgba(15, 23, 42, 0.12)' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span className="material-symbols-outlined" style={{ color: '#f59e0b', fontSize: '1.3rem' }}>workspace_premium</span>
                    <span style={{ fontWeight: '900', fontSize: '0.98rem', color: '#f8fafc', letterSpacing: '0.02em' }}>TOTAL CONSOLIDADO</span>
                  </div>
                  <span style={{ fontSize: '0.72rem', background: 'rgba(255,255,255,0.1)', color: '#cbd5e1', padding: '0.2rem 0.5rem', borderRadius: '6px', fontWeight: '700' }}>GIANTS & PAC</span>
                </div>

                <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '0 0 1.2rem 0', lineHeight: 1.4 }}>
                  Faturamento geral de fechamentos combinados da turma selecionada.
                </p>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '0.85rem', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', color: '#4ade80', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    💰 Caixa:
                  </span>
                  <strong style={{ color: '#4ade80', fontSize: '1.15rem', fontWeight: '900' }}>
                    {formatarMoeda(metricas?.resumoFechamento?.total?.caixa || 0)}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '0.4rem' }}>
                  <span style={{ fontSize: '0.85rem', color: '#38bdf8', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    📅 Competência:
                  </span>
                  <strong style={{ color: '#38bdf8', fontSize: '1.15rem', fontWeight: '900' }}>
                    {formatarMoeda(metricas?.resumoFechamento?.total?.competencia || 0)}
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* GRÁFICO: FATURAMENTO MENSAL DO EVENTO */}
      <div style={{ background: '#fff', borderRadius: '16px', padding: '1.75rem', border: '1px solid #e2e8f0', boxShadow: '0 2px 6px rgba(0, 0, 0, 0.02)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: '#0f172a' }}>
              Faturamento Mensal do Evento
            </h3>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#64748b' }}>
              Evolução do volume de propostas comerciais fechadas
            </p>
          </div>
          <div style={{ background: '#fff7ed', padding: '0.4rem 0.85rem', borderRadius: '8px', border: '1px solid #ffedd5' }}>
            <span style={{ fontSize: '0.85rem', color: '#9a3412', fontWeight: '600' }}>Faturamento Acumulado: </span>
            <span style={{ fontSize: '1.1rem', fontWeight: '800', color: '#ff5722' }}>
              {formatarMoeda(totalFaturamento)}
            </span>
          </div>
        </div>

        {/* Barras do Gráfico */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: '220px', gap: '1rem', paddingTop: '1.5rem' }}>
          {faturamentoLista.map((item, idx) => {
            const alturaPorcentagem = maxFaturamento > 0 ? (item.valor / maxFaturamento) * 100 : 0;
            const alturaFinal = Math.max(alturaPorcentagem, 8);

            return (
              <div key={item.chave || idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#0f172a', marginBottom: '0.45rem', whiteSpace: 'nowrap' }}>
                  {formatarMoeda(item.valor)}
                </div>
                <div
                  style={{
                    width: '100%',
                    maxWidth: '48px',
                    height: String(alturaFinal) + '%',
                    background: '#ff5722',
                    borderRadius: '6px 6px 0 0',
                    transition: 'height 0.4s ease'
                  }}
                  title={item.mes + ': ' + formatarMoeda(item.valor)}
                />
                <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', marginTop: '0.65rem' }}>
                  {item.mes}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
