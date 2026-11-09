import { useState, useEffect } from 'react';
import { api } from '../services/api';

export default function Approvals() {
  const [propostas, setPropostas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState('PENDENTE');

  const carregarAprovacoes = async () => {
    try {
      setCarregando(true);
      setErro('');
      // Consulta as propostas encaminhadas para validação financeira/comercial
      const dados = await api.get('/financeiro/propostas');
      const lista = Array.isArray(dados) ? dados : dados.propostas || [];
      setPropostas(lista);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarAprovacoes();
  }, []);

  const analisarProposta = async (propostaId, decisao) => {
    try {
      await api.post('/financeiro/analisar', {
        proposta_id: propostaId,
        decisao // 'aprovado' ou 'recusado'
      });
      carregarAprovacoes();
    } catch (err) {
      alert(`Erro ao registrar decisão: ${err.message}`);
    }
  };

  const propostasFiltradas = propostas.filter((p) => {
    if (filtro === 'TODOS') return true;
    return (p.status_aprovacao || p.status || '').toUpperCase() === filtro;
  });

  return (
    <div style={{ padding: '2rem', width: '100%', boxSizing: 'border-box' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
            Fila de Aprovações
          </h1>
          <p style={{ color: '#64748b', margin: '0.25rem 0 0', fontSize: '0.9rem' }}>
            Validação de propostas comerciais, termos de negociação e condições especiais de adesão
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', background: '#f1f5f9', padding: '0.25rem', borderRadius: '10px' }}>
          {[
            { id: 'PENDENTE', label: 'Pendentes' },
            { id: 'APROVADO', label: 'Aprovadas' },
            { id: 'TODOS', label: 'Todas' }
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
        <div style={{ background: '#fef2f2', color: '#ef4444', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #fecaca' }}>
          {erro}
        </div>
      )}

      {/* Lista de Deliberação */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <tr>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Ref.</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Empresa / Proponente</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Produto Solicitado</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Valor Negociado</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Condição / Pagamento</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem', textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr><td colSpan="6" style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>Carregando pedidos pendentes...</td></tr>
            ) : propostasFiltradas.length === 0 ? (
              <tr><td colSpan="6" style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>Nenhuma proposta aguarda aprovação neste momento.</td></tr>
            ) : (
              propostasFiltradas.map((prop) => (
                <tr key={prop.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '1rem', fontWeight: '700', color: '#ff5722' }}>
                    PROP-{String(prop.id).padStart(3, '0')}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ fontWeight: '600', color: '#0f172a' }}>{prop.cliente_empresa || prop.empresa || 'Empresa SGA'}</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{prop.cliente_nome || prop.nome}</div>
                  </td>
                  <td style={{ padding: '1rem', color: '#334155', fontWeight: '500' }}>
                    {prop.produto_nome || 'Mentoria GIANTS Individual'}
                  </td>
                  <td style={{ padding: '1rem', fontWeight: '700', color: '#059669' }}>
                    {Number(prop.valor_total || 25000).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                  <td style={{ padding: '1rem', color: '#64748b', fontSize: '0.85rem' }}>
                    {prop.forma_pagamento || 'PIX + 10x Cartão'}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => analisarProposta(prop.id, 'aprovado')}
                        style={{ background: '#059669', color: '#fff', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>check</span>
                        Aprovar
                      </button>
                      <button
                        onClick={() => analisarProposta(prop.id, 'recusado')}
                        style={{ background: '#fff', color: '#dc2626', border: '1px solid #fecaca', padding: '0.4rem 0.8rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>close</span>
                        Recusar
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}