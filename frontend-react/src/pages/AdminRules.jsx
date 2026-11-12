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
      setProdutos(Array.isArray(dadosProdutos) ? dadosProdutos : []);
      setRegras(Array.isArray(dadosRegras) ? dadosRegras : []);
    } finally {
      setCarregandoProdutos(false);
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarTudo();
  }, []);

  const alterarCampoProduto = (id, campo, valor) => {
    setProdutos((prev) => prev.map((p) => (p.id === id ? { ...p, [campo]: valor } : p)));
  };

  const salvarProduto = async (prod) => {
    try {
      setSalvandoProdutoId(prod.id);
      await api.put(`/produtos/${prod.id}`, {
        nome: prod.nome,
        valor_base: Number(prod.valor_base),
        parcelas_padrao: Number(prod.parcelas_padrao) || 12,
        descricao_entregaveis: prod.descricao_entregaveis
      });
      alert(`Produto "${prod.nome}" atualizado com sucesso!\nValor: ${Number(prod.valor_base).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (${prod.parcelas_padrao}x).\nVendas anteriores permanecem congeladas.`);
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

  const badgeCategoria = (cat) => {
    const map = {
      GIANTS: { bg: '#ffedd5', color: '#9a3412' },
      PAC: { bg: '#dbeafe', color: '#1e40af' },
      AE: { bg: '#fef3c7', color: '#92400e' }
    };
    const st = map[cat] || { bg: '#f1f5f9', color: '#334155' };
    return (
      <span style={{ background: st.bg, color: st.color, padding: '0.22rem 0.55rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '800' }}>
        {cat}
      </span>
    );
  };

  return (
    <div style={{ padding: '2rem', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#ff5722', background: '#fff7ed', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
          Administração Geral
        </span>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a', margin: '0.25rem 0 0 0' }}>
          Catálogo de Produtos, Subprodutos & Regras Comerciais
        </h1>
        <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0.25rem 0 0 0' }}>
          Configure os valores de GIANTS, PAC e AE. Alterações afetam apenas novas propostas; vendas já aprovadas permanecem congeladas.
        </p>
      </div>

      {/* BLOCO 1: CATÁLOGO DE PRODUTOS E SUBPRODUTOS */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: '2rem' }}>
        <div style={{ padding: '1rem 1.25rem', background: '#fff7ed', borderBottom: '1px solid #fed7aa' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#9a3412' }}>
            Tabela Oficial de Produtos & Subprodutos (GIANTS, PAC e AE)
          </h2>
          <span style={{ fontSize: '0.8rem', color: '#c2410c' }}>
            Os valores e parcelamentos padrão são carregados em tempo real nas entrevistas comerciais e auditados no log de segurança.
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <tr>
                <th style={{ padding: '0.9rem 1rem', color: '#475569', fontSize: '0.8rem' }}>Linha</th>
                <th style={{ padding: '0.9rem 1rem', color: '#475569', fontSize: '0.8rem' }}>Produto / Subproduto</th>
                <th style={{ padding: '0.9rem 1rem', color: '#475569', fontSize: '0.8rem' }}>Entregáveis & Condições</th>
                <th style={{ padding: '0.9rem 1rem', color: '#475569', fontSize: '0.8rem' }}>Valor Base (R$)</th>
                <th style={{ padding: '0.9rem 1rem', color: '#475569', fontSize: '0.8rem' }}>Parcelas Padrão</th>
                <th style={{ padding: '0.9rem 1rem', color: '#475569', fontSize: '0.8rem', textAlign: 'right' }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {carregandoProdutos ? (
                <tr><td colSpan="6" style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8' }}>Carregando catálogo...</td></tr>
              ) : produtos.length === 0 ? (
                <tr><td colSpan="6" style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8' }}>Nenhum produto cadastrado.</td></tr>
              ) : (
                produtos.map((prod) => {
                  const parcelaMedia = Number(prod.parcelas_padrao) > 0 ? (Number(prod.valor_base) / Number(prod.parcelas_padrao)) : Number(prod.valor_base);
                  return (
                    <tr key={prod.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.9rem 1rem' }}>{badgeCategoria(prod.categoria)}</td>
                      <td style={{ padding: '0.9rem 1rem', fontWeight: '800', color: '#0f172a', fontSize: '0.9rem' }}>
                        {prod.nome}
                        <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                          {prod.tipo_item} • ID #{prod.id}
                        </div>
                      </td>
                      <td style={{ padding: '0.9rem 1rem', color: '#475569', fontSize: '0.8rem', maxWidth: '340px' }}>
                        {prod.descricao_entregaveis || '-'}
                      </td>
                      <td style={{ padding: '0.9rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '700' }}>R$</span>
                          <input
                            type="number"
                            step="10"
                            value={prod.valor_base}
                            onChange={(e) => alterarCampoProduto(prod.id, 'valor_base', e.target.value)}
                            style={{ width: '125px', padding: '0.4rem 0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: '800', fontSize: '0.88rem', color: '#0f172a' }}
                          />
                        </div>
                      </td>
                      <td style={{ padding: '0.9rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <input
                            type="number"
                            min="1"
                            max="24"
                            value={prod.parcelas_padrao || 12}
                            onChange={(e) => alterarCampoProduto(prod.id, 'parcelas_padrao', e.target.value)}
                            style={{ width: '60px', padding: '0.4rem 0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: '700', fontSize: '0.85rem', color: '#0f172a' }}
                          />
                          <span style={{ fontSize: '0.75rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                            x {parcelaMedia.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '0.9rem 1rem', textAlign: 'right' }}>
                        <button
                          onClick={() => salvarProduto(prod)}
                          disabled={salvandoProdutoId === prod.id}
                          style={{
                            background: '#0f172a',
                            color: '#fff',
                            border: 'none',
                            padding: '0.45rem 0.9rem',
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                            fontWeight: '700',
                            cursor: 'pointer'
                          }}
                        >
                          {salvandoProdutoId === prod.id ? 'Salvando...' : 'Atualizar'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
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
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Parâmetro</th>
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
                      <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '700' }}>
                        {String(r.chave || '').includes('pct') ? '%' : 'R$'}
                      </span>
                      <input
                        type="number"
                        step="10"
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