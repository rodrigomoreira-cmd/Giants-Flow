import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useTurma } from '../context/TurmaContext';

export default function Overview() {
  const { turmaSelecionada } = useTurma();
  const [metricas, setMetricas] = useState(null);
  const [fichasTurma, setFichasTurma] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    async function carregar() {
      try {
        setCarregando(true);
        const tIdAtiva = turmaSelecionada || localStorage.getItem('turma_ativa_id') || '1491';
        const [dados, listaFichas] = await Promise.all([
          api.get(`/hub/metricas?turmaId=${tIdAtiva}`),
          api.get(`/clientes?turmaId=${tIdAtiva}`).catch(() => [])
        ]);
        setMetricas(dados);
        setFichasTurma(Array.isArray(listaFichas) ? listaFichas : []);
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

  // Agrupamento de preenchimento por Momento da Aplicação
  const categoriasMomento = [
    { chave: 'Coffee', titulo: 'Coffee', icone: '☕', cor: '#b45309', bg: '#fef3c7', barra: '#f59e0b' },
    { chave: 'Almoço', titulo: 'Almoço', icone: '🍽️', cor: '#c2410c', bg: '#ffedd5', barra: '#ff5722' },
    { chave: 'Janta', titulo: 'Janta', icone: '🌙', cor: '#4338ca', bg: '#e0e7ff', barra: '#6366f1' },
    { chave: 'Outro Momento', titulo: 'Outro Momento', icone: '✨', cor: '#0f766e', bg: '#ccfbf1', barra: '#14b8a6' }
  ];

  const contagemMomentos = {
    Coffee: 0,
    Almoço: 0,
    Janta: 0,
    'Outro Momento': 0
  };
  let semMomento = 0;

  fichasTurma.forEach((f) => {
    const m = String(f.momento_aplicacao || '').trim();
    if (!m) {
      semMomento += 1;
    } else if (m === 'Coffee') {
      contagemMomentos.Coffee += 1;
    } else if (m === 'Almoço' || m === 'Almoco') {
      contagemMomentos.Almoço += 1;
    } else if (m === 'Janta' || m === 'Jantar') {
      contagemMomentos.Janta += 1;
    } else {
      contagemMomentos['Outro Momento'] += 1;
    }
  });

  const totalComMomento = Object.values(contagemMomentos).reduce((acc, v) => acc + v, 0);
  const maiorQtd = Math.max(...Object.values(contagemMomentos), 0);

  const resumoMomentos = categoriasMomento
    .map((cat) => {
      const qtd = contagemMomentos[cat.chave] || 0;
      const pct = totalComMomento > 0 ? Math.round((qtd / totalComMomento) * 100) : 0;
      return {
        ...cat,
        qtd,
        pct,
        lider: maiorQtd > 0 && qtd === maiorQtd
      };
    })
    .sort((a, b) => b.qtd - a.qtd);

  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a', marginBottom: '0.25rem' }}>Cockpit Operacional</h1>
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
          <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '600' }}>Fichas Registradas</span>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#2563eb', marginTop: '0.5rem' }}>{metricas?.totalFichas || fichasTurma.length || 0}</div>
        </div>

        <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '600' }}>Taxa de Conversão</span>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#7c3aed', marginTop: '0.5rem' }}>{metricas?.taxaConversao || 0}%</div>
        </div>
      </div>

      {/* Painel: Preenchimento de Fichas por Momento da Aplicação */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
              Preenchimento de Fichas por Momento da Aplicação
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>
              Comparativo de captação e preenchimento entre os momentos do evento ({totalComMomento} fichas classificadas{semMomento > 0 ? ` • ${semMomento} sem momento definido` : ''}).
            </p>
          </div>
          {maiorQtd > 0 && (
            <span style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', padding: '0.35rem 0.85rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: '700' }}>
              🏆 Líder: {resumoMomentos[0].icone} {resumoMomentos[0].titulo} ({resumoMomentos[0].qtd} {resumoMomentos[0].qtd === 1 ? 'ficha' : 'fichas'})
            </span>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          {resumoMomentos.map((item) => (
            <div
              key={item.chave}
              style={{
                padding: '1.1rem 1.25rem',
                borderRadius: '10px',
                border: item.lider ? `2px solid ${item.barra}` : '1px solid #e2e8f0',
                background: item.lider ? '#fffaf5' : '#f8fafc'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: '700', fontSize: '0.95rem', color: '#0f172a' }}>
                  <span>{item.icone}</span>
                  <span>{item.titulo}</span>
                </span>
                {item.lider && (
                  <span style={{ background: item.bg, color: item.cor, fontSize: '0.7rem', fontWeight: '800', padding: '0.15rem 0.5rem', borderRadius: '999px' }}>
                    MAIOR VOLUME
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.6rem' }}>
                <span style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a' }}>{item.qtd}</span>
                <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#64748b' }}>
                  {item.qtd === 1 ? 'ficha' : 'fichas'} ({item.pct}%)
                </span>
              </div>

              <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${item.pct}%`,
                    height: '100%',
                    background: item.barra,
                    borderRadius: '999px',
                    transition: 'width 0.3s ease'
                  }}
                />
              </div>
            </div>
          ))}
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
