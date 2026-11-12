import { useState, useEffect } from 'react';
import { api } from '../services/api';

export default function AdminRules() {
  const [produtos, setProdutos] = useState([]);
  const [carregandoProdutos, setCarregandoProdutos] = useState(true);
  const [salvandoProdutoId, setSalvandoProdutoId] = useState(null);

  const [regras, setRegras] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [salvandoId, setSalvandoId] = useState(null);

  const carregarTudo = async () => {
    try {
      setCarregandoProdutos(true);
      setCarregando(true);
      const [dadosProdutos, dadosRegras] = await Promise.all([
        api.get('/produtos').catch(() => []),
        api.get('/regras').catch(() => [])
      ]);
      const listaProd = Array.isArray(dadosProdutos) ? dadosProdutos : [];
      // Exibe os 3 produtos oficiais (GIANTS, PAC, AE) em destaque
      const oficiais = listaProd.filter((p) => ['GIANTS', 'PAC', 'AE'].includes(String(p.nome || '').toUpperCase()));
      setProdutos(oficiais.length > 0 ? oficiais : listaProd);
      setRegras(Array.isArray(dadosRegras) ? dadosRegras : []);
    } finally {
      setCarregandoProdutos(false);
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarTudo();
  }, []);

  const alterarValorProduto = (id, valor) => {
    setProdutos((prev) => prev.map((p) => (p.id === id ? { ...p, valor_base: valor } : p)));
  };

  const salvarProduto = async (prod) => {
    try {
      setSalvandoProdutoId(prod.id);
      await api.put(`/produtos/${prod.id}`, {
        nome: prod.nome,
        valor_base: Number(prod.valor_base)
      });
      alert(`Valor do produto "${prod.nome}" atualizado para ${Number(prod.valor_base).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}!\nVendas anteriores permanecem inalteradas.`);
    } catch (err) {
      alert('Erro ao atualizar produto: ' + err.message);
    } finally {
      setSalvandoProdutoId(null);
    }
  };

  const alterarValor = (id, valor) => {
    setRegras((prev) => prev.map((r) => (r.id === id ? { ...r, valor_numerico: valor } : r)));
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
      setRegras((prev) => prev.map((item) => (item.id === r.id ? { ...item, ativa: novoStatus } : item)));
    } catch {
      setRegras((prev) => prev.map((item) => (item.id === r.id ? { ...item, ativa: !r.ativa } : item)));
    }
  };

  return (
    <div style={{ padding: '2rem', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#ff5722', background: '#fff7ed', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
          Administração Geral
        </span>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a', margin: '0.25rem 0 0 0' }}>
          Tabela de Produtos & Regras Comerciais
        </h1>
        <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0.25rem 0 0 0' }}>
          Alterações de valores valem apenas para novas propostas. Propostas já fechadas mantêm o valor histórico congelado.
        </p>
      </div>

      {/* BLOCO 1: CATÁLOGO DE PRODUTOS (GIANTS, PAC, AE) */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: '2rem' }}>
        <div style={{ padding: '1rem 1.25rem', background: '#fff7ed', borderBottom: '1px solid #fed7aa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#9a3412' }}>
              Catálogo Oficial de Produtos (GIANTS, PAC e AE)
            </h2>
            <span style={{ fontSize: '0.8rem', color: '#c2410c' }}>
              Define o valor base carregado automaticamente na condução de entrevistas comerciais.
            </span>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <tr>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Produto</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Regra de Aplicação</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Valor Base (R$)</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem', textAlign: 'right' }}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {carregandoProdutos ? (
              <tr><td colSpan="4" style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8' }}>Carregando produtos...</td></tr>
            ) : produtos.length === 0 ? (
              <tr><td colSpan="4" style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8' }}>Nenhum produto cadastrado.</td></tr>
            ) : (
              produtos.map((prod) => {
                const descricoes = {
                  GIANTS: 'Programa principal (+ R$ 90.000 por sócio adicional na entrevista).',
                  PAC: 'Programa de Aceleração Comercial (Downsell / entrada intermediária).',
                  AE: 'Programa AE (Aceleração Empresarial / oferta específica).'
                };
                return (
                  <tr key={prod.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '1rem', fontWeight: '800', color: '#0f172a', fontSize: '0.95rem' }}>
                      <span style={{ background: '#0f172a', color: '#fff', padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.8rem', marginRight: '0.5rem' }}>
                        {prod.nome}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'monospace' }}>ID #{prod.id}</span>
                    </td>
                    <td style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>
                      {descricoes[String(prod.nome || '').toUpperCase()] || 'Produto comercial do catálogo.'}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '700' }}>R$</span>
                        <input
                          type="number"
                          step="100"
                          value={prod.valor_base}
                          onChange={(e) => alterarValorProduto(prod.id, e.target.value)}
                          style={{ width: '135px', padding: '0.45rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: '800', fontSize: '0.9rem', color: '#0f172a' }}
                        />
                      </div>
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      <button
                        onClick={() => salvarProduto(prod)}
                        disabled={salvandoProdutoId === prod.id}
                        style={{
                          background: '#0f172a',
                          color: '#fff',
                          border: 'none',
                          padding: '0.45rem 0.95rem',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          fontWeight: '700',
                          cursor: 'pointer'
                        }}
                      >
                        {salvandoProdutoId === prod.id ? 'Atualizando...' : 'Atualizar Preço'}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* BLOCO 2: REGRAS DE ALÇADA */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.25rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>
            Regras de Alçada, Entrada Mínima & Cashback
          </h2>
        </div>

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
              regras.map((r) => (
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
                        onChange={(e) => alterarValor(r.id, e.target.value)}
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
                      {r.ativa ? 'Ativa' : 'Inativa'}
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