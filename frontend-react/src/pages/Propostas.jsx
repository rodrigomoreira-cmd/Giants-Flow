import { useState, useEffect } from 'react';
import { api } from '../services/api';

export default function Propostas() {
  const [propostas, setPropostas] = useState([]);
  const [selecionadaId, setSelecionadaId] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState('TODOS');

  const carregarPropostas = async () => {
    try {
      setCarregando(true);
      setErro('');
      const dados = await api.get('/propostas');
      const lista = Array.isArray(dados) ? dados : dados.propostas || [];
      setPropostas(lista);
      if (lista.length > 0 && !selecionadaId) {
        setSelecionadaId(lista[0].id);
      }
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarPropostas();
  }, []);

  const propostaAtiva = propostas.find((p) => p.id === selecionadaId) || propostas[0];

  const propostasFiltradas = propostas.filter((p) => {
    if (filtro === 'TODOS') return true;
    return (p.status || '').toUpperCase() === filtro;
  });

  const concretizarVenda = async (id) => {
    try {
      await api.patch(`/propostas/${id}/vender`, {});
      carregarPropostas();
    } catch (err) {
      alert(`Erro ao concretizar venda: ${err.message}`);
    }
  };

  return (
    <div style={{ width: '100%', boxSizing: 'border-box', padding: '1.75rem 2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Cabeçalho da Página */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
            Mesa de Propostas & Fechamento Comercial
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0.25rem 0 0' }}>
            Emissão de condições, contratos e registro de pagamentos
          </p>
        </div>

        {/* Filtros de Topo */}
        <div style={{ display: 'flex', gap: '0.5rem', background: '#f1f5f9', padding: '0.25rem', borderRadius: '10px' }}>
          {[
            { id: 'TODOS', label: 'Todos' },
            { id: 'EM_NEGOCIACAO', label: 'Em Negociação' },
            { id: 'AGUARDANDO_PAGAMENTO', label: 'Aguardando Pagamento' },
            { id: 'CONCRETIZADA', label: 'Concretizada' }
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setFiltro(item.id)}
              style={{
                border: 'none',
                background: filtro === item.id ? '#ff5722' : 'transparent',
                color: filtro === item.id ? '#fff' : '#64748b',
                padding: '0.45rem 0.9rem',
                borderRadius: '8px',
                fontWeight: '600',
                fontSize: '0.8rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {erro && (
        <div style={{ background: '#fef2f2', color: '#ef4444', padding: '1rem', borderRadius: '8px', border: '1px solid #fecaca' }}>
          {erro}
        </div>
      )}

      {/* Conteúdo Principal Dividido: Lista à Esquerda (340px) e Detalhe Total à Direita */}
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '1.5rem', alignItems: 'start', width: '100%' }}>
        {/* Painel Esquerdo: Fila de Negociações */}
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', background: '#fafbfc' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#1e293b' }}>
              Fila de Negociações ({propostasFiltradas.length})
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {carregando ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>Carregando propostas...</div>
            ) : propostasFiltradas.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>Nenhuma proposta encontrada.</div>
            ) : (
              propostasFiltradas.map((prop) => {
                const ativo = prop.id === (propostaAtiva?.id);
                return (
                  <div
                    key={prop.id}
                    onClick={() => setSelecionadaId(prop.id)}
                    style={{
                      padding: '1rem 1.25rem',
                      cursor: 'pointer',
                      borderBottom: '1px solid #f1f5f9',
                      borderLeft: ativo ? '4px solid #ff5722' : '4px solid transparent',
                      background: ativo ? '#fff7ed' : '#fff',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: '700', color: '#0f172a', fontSize: '0.95rem' }}>
                        {prop.cliente_nome || prop.nome || 'Participante'}
                      </span>
                      <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#ff5722' }}>
                        PROP-{String(prop.id).padStart(3, '0')}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.5rem' }}>
                      {prop.produto_nome || 'Mentoria Premium'} • {prop.cliente_empresa || prop.empresa || 'Empresa'}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: '800', color: '#0f172a', fontSize: '0.95rem' }}>
                        {Number(prop.valor_total || prop.valor_fecho || 23000).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </span>
                      <span style={{ fontSize: '0.7rem', fontWeight: '700', background: '#fef3c7', color: '#d97706', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                        {prop.status || 'Em Negociação'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Painel Direito: Detalhe Completo do Fecho */}
        {propostaAtiva ? (
          <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' }}>
                  PROP-{String(propostaAtiva.id).padStart(3, '0')}
                </span>
                <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#0f172a', margin: '0.2rem 0 0' }}>
                  {propostaAtiva.cliente_nome || propostaAtiva.nome || 'Mariângela Albuquerque'}
                </h2>
                <span style={{ fontSize: '0.9rem', color: '#64748b' }}>
                  {propostaAtiva.cliente_empresa || propostaAtiva.empresa || 'Grupo Tech'}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  onClick={() => concretizarVenda(propostaAtiva.id)}
                  style={{ background: '#059669', color: '#fff', border: 'none', padding: '0.65rem 1.25rem', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>check_circle</span>
                  Concretizar Venda
                </button>
                <button
                  style={{ background: '#0f172a', color: '#fff', border: 'none', padding: '0.65rem 1.25rem', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>send</span>
                  Enviar Cobrança
                </button>
              </div>
            </div>

            {/* Três Cards de Valores */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Valor de Tabela</span>
                <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0f172a', marginTop: '0.4rem' }}>
                  {Number(propostaAtiva.valor_tabela || 25000).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Condição Aplicada</span>
                <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#dc2626', marginTop: '0.4rem' }}>
                  - R$ 2.000,00
                </div>
              </div>

              <div style={{ background: '#fff7ed', padding: '1.25rem', borderRadius: '10px', border: '1px solid #fed7aa' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#ea580c', textTransform: 'uppercase' }}>Valor de Fecho</span>
                <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#ea580c', marginTop: '0.4rem' }}>
                  {Number(propostaAtiva.valor_total || 23000).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </div>
              </div>
            </div>

            {/* Forma de Liquidação */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1.25rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#1e293b', display: 'block', marginBottom: '0.75rem' }}>
                Forma de Liquidação Acordada
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#334155', fontWeight: '600', fontSize: '0.95rem' }}>
                <span className="material-symbols-outlined" style={{ color: '#ff5722' }}>credit_card</span>
                <span>{propostaAtiva.forma_pagamento || 'PIX + 10x Cartão'}</span>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
            Selecione uma proposta na fila lateral para visualizar os detalhes.
          </div>
        )}
      </div>
    </div>
  );
}