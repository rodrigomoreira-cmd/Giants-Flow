import { useState, useEffect } from 'react';
import { api } from '../services/api';

export default function AdminRules() {
  const [regras, setRegras] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [salvandoId, setSalvandoId] = useState(null);

  const carregarRegras = async () => {
    try {
      setCarregando(true);
      const dados = await api.get('/regras');
      setRegras(Array.isArray(dados) ? dados : []);
    } catch (err) {
      setRegras([]);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarRegras();
  }, []);

  const alterarValor = (id, valor) => {
    setRegras(prev => prev.map(r => r.id === id ? { ...r, valor_numerico: valor } : r));
  };

  const salvarRegra = async (r) => {
    try {
      setSalvandoId(r.id);
      await api.put(`/regras/${r.id}`, {
        valor_numerico: Number(r.valor_numerico),
        ativa: r.ativa,
        descricao: r.descricao
      });
      alert(`Regra "${r.nome}" atualizada com sucesso!`);
    } catch (err) {
      alert('Erro ao salvar regra: ' + err.message);
    } finally {
      setSalvandoId(null);
    }
  };

  const alternarAtiva = async (r) => {
    try {
      const novoStatus = !r.ativa;
      await api.put(`/regras/${r.id}`, { ...r, ativa: novoStatus });
      setRegras(prev => prev.map(item => item.id === r.id ? { ...item, ativa: novoStatus } : item));
    } catch (err) {
      setRegras(prev => prev.map(item => item.id === r.id ? { ...item, ativa: !r.ativa } : item));
    }
  };

  return (
    <div style={{ padding: '2rem', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#ff5722', background: '#fff7ed', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
          Administração Geral
        </span>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a', margin: '0.25rem 0 0 0' }}>
          Regras Comerciais & Alçadas
        </h1>
        <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0.25rem 0 0 0' }}>
          Parametrização dos pisos de entrada, limites de desconto e regras que acionam a alçada de aprovação.
        </p>
      </div>

      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <tr>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Regra Comercial</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Descrição & Impacto</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Parâmetro (R$)</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Status</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem', textAlign: 'right' }}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Carregando regras...</td></tr>
            ) : regras.length === 0 ? (
              <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Nenhuma regra configurada.</td></tr>
            ) : (
              regras.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '1rem', fontWeight: '800', color: '#0f172a', fontSize: '0.9rem' }}>
                    {r.nome}
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'monospace' }}>{r.chave}</div>
                  </td>
                  <td style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem', maxWidth: '300px' }}>
                    {r.descricao}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '700' }}>R$</span>
                      <input
                        type="number"
                        step="100"
                        value={r.valor_numerico}
                        onChange={e => alterarValor(r.id, e.target.value)}
                        style={{ width: '110px', padding: '0.4rem 0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: '700', fontSize: '0.85rem', color: '#0f172a' }}
                      />
                    </div>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <button
                      onClick={() => alternarAtiva(r)}
                      style={{
                        background: r.ativa ? '#dcfce7' : '#f1f5f9',
                        color: r.ativa ? '#16a34a' : '#64748b',
                        border: 'none',
                        padding: '0.25rem 0.6rem',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      {r.ativa ? '● Ativa' : '○ Inativa'}
                    </button>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <button
                      onClick={() => salvarRegra(r)}
                      disabled={salvandoId === r.id}
                      style={{
                        background: '#ff5722',
                        color: '#fff',
                        border: 'none',
                        padding: '0.4rem 0.85rem',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      {salvandoId === r.id ? 'Salvando...' : 'Salvar'}
                    </button>
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