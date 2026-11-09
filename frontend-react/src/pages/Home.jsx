import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useNavigate } from 'react-router-dom';

export default function Home() {
  const [metricas, setMetricas] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const navigate = useNavigate();

  const carregarMetricas = async () => {
    try {
      setCarregando(true);
      setErro('');
      const dados = await api.get('/hub/metricas');
      setMetricas(dados);
    } catch (err) {
      setErro(err.message || 'Erro ao carregar indicadores executivos.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarMetricas();
  }, []);

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
            Acompanhamento de fluxo de participantes, membros GIANTS e evolução de fechamento comercial
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={() => navigate('/companies')}
            style={{
              background: '#fff',
              border: '1px solid #cbd5e1',
              padding: '0.6rem 1.2rem',
              borderRadius: '8px',
              fontWeight: '700',
              fontSize: '0.85rem',
              color: '#334155',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>domain</span>
            Empresas & Triagem
          </button>

          <button
            onClick={carregarMetricas}
            style={{
              background: '#0284c7',
              border: 'none',
              padding: '0.6rem 1.2rem',
              borderRadius: '8px',
              fontWeight: '700',
              fontSize: '0.85rem',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>refresh</span>
            Atualizar Dados
          </button>
        </div>
      </div>

      {erro && (
        <div style={{ background: '#fef2f2', color: '#ef4444', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #fecaca' }}>
          {erro}
        </div>
      )}

      {/* BLOCO SUPERIOR: CARDS DE DESTAQUE */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1.3fr) minmax(200px, 0.7fr)', gap: '1.5rem', marginBottom: '1.5rem' }}>
        
        {/* Card Destaque: Presentes Agora */}
        <div style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          borderRadius: '16px',
          padding: '1.75rem',
          color: '#fff',
          boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ position: 'absolute', right: '-20px', bottom: '-20px', opacity: 0.08 }}>
            <span className="material-symbols-outlined" style={{ fontSize: '12rem' }}>group</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 1 }}>
            <div>
              <span style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', padding: '0.35rem 0.75rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4ade80', animation: 'pulse 1.5s infinite' }}></span>
                FLUXO ATIVO
              </span>
              <h2 style={{ fontSize: '1.2rem', fontWeight: '700', margin: '0.75rem 0 0', color: '#cbd5e1' }}>
                Presentes Agora
              </h2>
            </div>
            <div style={{ background: 'rgba(255, 255, 255, 0.1)', width: '48px', height: '48px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.8rem', color: '#38bdf8' }}>badge</span>
            </div>
          </div>

          <div style={{ marginTop: '1.5rem', zIndex: 1 }}>
            <div style={{ fontSize: '3.2rem', fontWeight: '900', lineHeight: 1, letterSpacing: '-0.02em', color: '#fff' }}>
              {carregando ? '...' : metricas?.presentesAgora || 0}
            </div>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
              Participantes credenciados, sentados nas mesas e em condução de entrevistas
            </p>
          </div>
        </div>

        {/* Card Menor: No Show (%) */}
        <div style={{
          background: '#fff',
          borderRadius: '16px',
          padding: '1.75rem',
          border: '1px solid #e2e8f0',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ background: '#fef2f2', color: '#dc2626', padding: '0.35rem 0.75rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '800' }}>
                ABSENTEÍSMO
              </span>
              <h2 style={{ fontSize: '1.1rem', fontWeight: '700', margin: '0.75rem 0 0', color: '#475569' }}>
                No Show (%)
              </h2>
            </div>
            <div style={{ background: '#fee2e2', width: '44px', height: '44px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.6rem', color: '#dc2626' }}>person_off</span>
            </div>
          </div>

          <div style={{ marginTop: '1.25rem' }}>
            <div style={{ fontSize: '2.5rem', fontWeight: '900', lineHeight: 1, color: '#dc2626' }}>
              {carregando ? '...' : metricas?.noShowPct || '0.0%'}
            </div>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: '#64748b' }}>
              {metricas?.noShowQtd || 0} participantes não compareceram
            </p>
          </div>
        </div>
      </div>

      {/* BLOCO INTERMEDIÁRIO: GRID DE 5 CARDS DE MÉTRICAS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
        
        {/* 1. Total de Empresas */}
        <div style={{ background: '#fff', borderRadius: '14px', padding: '1.25rem', border: '1px solid #e2e8f0', boxShadow: '0 2px 6px rgba(0, 0, 0, 0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div style={{ background: '#eff6ff', color: '#2563eb', width: '38px', height: '38px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.3rem' }}>domain</span>
            </div>
            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#64748b' }}>Total de Empresas</span>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: '800', color: '#0f172a' }}>
            {carregando ? '...' : metricas?.totalEmpresas || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>CNPJs cadastrados</div>
        </div>

        {/* 2. Total de Alunos */}
        <div style={{ background: '#fff', borderRadius: '14px', padding: '1.25rem', border: '1px solid #e2e8f0', boxShadow: '0 2px 6px rgba(0, 0, 0, 0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div style={{ background: '#e0e7ff', color: '#4f46e5', width: '38px', height: '38px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.3rem' }}>school</span>
            </div>
            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#64748b' }}>Total de Alunos</span>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: '800', color: '#0f172a' }}>
            {carregando ? '...' : metricas?.totalAlunos || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>Participantes gerais</div>
        </div>

        {/* 3. GIANTS */}
        <div style={{ background: '#fff', borderRadius: '14px', padding: '1.25rem', border: '1px solid #e2e8f0', boxShadow: '0 2px 6px rgba(0, 0, 0, 0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div style={{ background: '#f3e8ff', color: '#7e22ce', width: '38px', height: '38px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.3rem' }}>workspace_premium</span>
            </div>
            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#64748b' }}>GIANTS</span>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: '800', color: '#7e22ce' }}>
            {carregando ? '...' : metricas?.totalGiants || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>Membros da base oficial</div>
        </div>

        {/* 4. GIANTS Investidor */}
        <div style={{ background: '#fff', borderRadius: '14px', padding: '1.25rem', border: '1px solid #e2e8f0', boxShadow: '0 2px 6px rgba(0, 0, 0, 0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div style={{ background: '#dcfce7', color: '#15803d', width: '38px', height: '38px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.3rem' }}>trending_up</span>
            </div>
            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#64748b' }}>GIANTS Investidor</span>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: '800', color: '#15803d' }}>
            {carregando ? '...' : metricas?.totalInvestidor || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>Perfil investidor</div>
        </div>

        {/* 5. GIANTS Sócio */}
        <div style={{ background: '#fff', borderRadius: '14px', padding: '1.25rem', border: '1px solid #e2e8f0', boxShadow: '0 2px 6px rgba(0, 0, 0, 0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div style={{ background: '#ffedd5', color: '#c2410c', width: '38px', height: '38px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.3rem' }}>handshake</span>
            </div>
            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#64748b' }}>GIANTS Sócio</span>
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: '800', color: '#c2410c' }}>
            {carregando ? '...' : metricas?.totalSocio || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>Perfil sócio do grupo</div>
        </div>
      </div>

      {/* BLOCO INFERIOR: GRÁFICO DE BARRAS DE FATURAMENTO MENSAL GERAL */}
      <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '1.75rem', boxShadow: '0 4px 14px rgba(0, 0, 0, 0.03)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
              Faturamento Mensal Geral
            </h3>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#64748b' }}>
              Evolução do volume de propostas comerciais fechadas
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#f8fafc', padding: '0.5rem 1rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '600' }}>Faturamento Acumulado:</span>
            <span style={{ fontSize: '1.1rem', fontWeight: '800', color: '#ff5722' }}>
              {formatarMoeda(totalFaturamento)}
            </span>
          </div>
        </div>

        {/* Gráfico de Barras SVG Interativo */}
        <div style={{ width: '100%', overflowX: 'auto', paddingBottom: '0.5rem' }}>
          <div style={{ minWidth: '600px', height: '240px', display: 'flex', alignItems: 'flex-end', gap: '2rem', padding: '1rem 1rem 2rem', borderBottom: '2px solid #e2e8f0', position: 'relative' }}>
            
            {/* Linhas de Grade de Fundo */}
            <div style={{ position: 'absolute', left: 0, right: 0, top: '25%', height: '1px', background: '#f1f5f9' }}></div>
            <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: '1px', background: '#f1f5f9' }}></div>
            <div style={{ position: 'absolute', left: 0, right: 0, top: '75%', height: '1px', background: '#f1f5f9' }}></div>

            {faturamentoLista.map((item, idx) => {
              const alturaPorcentagem = maxFaturamento > 0 ? (item.valor / maxFaturamento) * 100 : 0;
              const alturaFinal = Math.max(alturaPorcentagem, 8); // Altura mínima de 8% para visibilidade

              return (
                <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', zIndex: 1 }}>
                  
                  {/* Valor do Mês no Topo da Barra */}
                  <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#0f172a', marginBottom: '0.45rem', whiteSpace: 'nowrap' }}>
                    {formatarMoeda(item.valor)}
                  </div>

                  {/* Barra */}
                  <div
                    style={{
                      width: '44px',
                      height: `${alturaFinal}%`,
                      background: 'linear-gradient(180deg, #ff5722 0%, #ea580c 100%)',
                      borderRadius: '8px 8px 2px 2px',
                      boxShadow: '0 4px 10px rgba(234, 88, 12, 0.25)',
                      transition: 'all 0.3s ease',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scaleY(1.05)';
                      e.currentTarget.style.filter = 'brightness(1.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scaleY(1)';
                      e.currentTarget.style.filter = 'none';
                    }}
                    title={`${item.mes}: ${formatarMoeda(item.valor)}`}
                  />

                  {/* Rótulo do Mês Abaixo da Barra */}
                  <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', fontWeight: '700', color: '#64748b' }}>
                    {item.mes}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}