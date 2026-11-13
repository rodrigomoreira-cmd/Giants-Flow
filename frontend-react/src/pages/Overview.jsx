import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useTurma } from '../context/TurmaContext';

export default function Overview() {
  const { turmaSelecionada } = useTurma();
  const [metricas, setMetricas] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    async function carregar() {
      try {
        setCarregando(true);
        const tIdAtiva = turmaSelecionada || localStorage.getItem('turma_ativa_id') || '1491';
        const dados = await api.get(`/hub/metricas?turmaId=${tIdAtiva}`);
        setMetricas(dados);
      } catch (err) {
        setErro(err.message);
      } finally {
        setCarregando(false);
      }
    }
    carregar();
  }, [turmaSelecionada]);

  if (carregando) {
    return <div style={{ padding: '2rem', color: '#64748b' }}>Carregando métricas da operação...</div>;
  }

  if (erro) {
    return (
      <div style={{ padding: '2rem' }}>
        <div style={{ background: '#fef2f2', color: '#ef4444', padding: '1rem', borderRadius: '8px' }}>
          Erro ao carregar métricas: {erro}
        </div>
      </div>
    );
  }

  const faturamentoFormatado = Number(metricas?.faturamentoTotal || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a', marginBottom: '0.25rem' }}>Cockpit Operaçãonal</h1>
      <p style={{ color: '#64748b', marginBottom: '2rem' }}>Indicadores em tempo real da turma ativa no evento.</p>

      {/* Cards de KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '600' }}>Faturamento Total</span>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#059669', marginTop: '0.5rem' }}>{faturamentoFormatado}</div>
        </div>

        <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '600' }}>Total de Vendas</span>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#ff5722', marginTop: '0.5rem' }}>{metricas?.totalVendas || 0}</div>
        </div>

        <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '600' }}>Fichas Registadas</span>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#2563eb', marginTop: '0.5rem' }}>{metricas?.totalFichas || 0}</div>
        </div>

        <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '600' }}>Taxa de Conversão</span>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#7c3aed', marginTop: '0.5rem' }}>{metricas?.taxaConversao || 0}%</div>
        </div>
      </div>

      {/* Últimas Vendas */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#0f172a', marginBottom: '1rem' }}>Últimas Vendas Concretizadas</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.85rem' }}>
              <th style={{ padding: '0.75rem 0' }}>Participante</th>
              <th style={{ padding: '0.75rem 0' }}>Empresa</th>
              <th style={{ padding: '0.75rem 0' }}>Produto</th>
              <th style={{ padding: '0.75rem 0' }}>Valor</th>
              <th style={{ padding: '0.75rem 0' }}>Hora</th>
            </tr>
          </thead>
          <tbody>
            {metricas?.ultimasVendas?.map((venda) => (
              <tr key={venda.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '0.75rem 0', fontWeight: '600', color: '#1e293b' }}>{venda.cliente_nome}</td>
                <td style={{ padding: '0.75rem 0', color: '#64748b' }}>{venda.cliente_empresa || '-'}</td>
                <td style={{ padding: '0.75rem 0', color: '#ff5722', fontWeight: '600' }}>{venda.produto_nome}</td>
                <td style={{ padding: '0.75rem 0', fontWeight: '700', color: '#059669' }}>
                  {Number(venda.valor_total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </td>
                <td style={{ padding: '0.75rem 0', color: '#94a3b8' }}>{venda.hora_venda}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}