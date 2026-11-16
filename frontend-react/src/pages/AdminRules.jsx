import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { alertaSistema, confirmarSistema } from '../context/ModalContext';

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
      alertaSistema(`Produto "${prod.nome}" atualizado com sucesso!\nNovo valor: ${Number(prod.valor_base).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (${prod.parcelas_padrao}x).\nVendas já aprovadas permanecem congeladas.`);
    } catch (err) {
      alertaSistema('Erro ao atualizar produto: ' + err.message);
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
      alertaSistema(`Regra "${r.nome}" atualizada com sucesso!`);
    } catch (err) {
      alertaSistema('Erro ao salvar regra: ' + err.message);
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

  const rotuloTipoItem = (tipo) => {
    if (tipo === 'PRINCIPAL') {
      return { texto: 'Plano Principal', bg: '#dcfce7', color: '#166534' };
    }
    if (tipo === 'ADICIONAL') {
      return { texto: 'Adicional por Sócio/Vaga', bg: '#e0e7ff', color: '#3730a3' };
    }
    return { texto: 'Taxa de Convocação', bg: '#fef3c7', color: '#92400e' };
  };

  const linhasConfig = [
    {
      chave: 'GIANTS',
      titulo: 'Linha GIANTS — Programa 360°',
      subtitulo: 'Titular da empresa, adicional por sócio extra e convocação do Almoço Exclusivo.',
      corBorda: '#fed7aa',
      corHeader: '#fff7ed',
      corTitulo: '#9a3412'
    },
    {
      chave: 'PAC',
      titulo: 'Linha PAC — Programa de Aceleração Pré-GIANTS',
      subtitulo: 'Opções de aceleração intermediária (Completo, Compacto e Vaga Adicional).',
      corBorda: '#bfdbfe',
      corHeader: '#eff6ff',
      corTitulo: '#1e40af'
    },
    {
      chave: 'AE',
      titulo: 'Linha AE — Acelerador Empresarial',
      subtitulo: 'Imersão presencial de 3 dias (Condição Especial do Evento, Tabela Regular e Vaga Adicional).',
      corBorda: '#fde68a',
      corHeader: '#fffbeb',
      corTitulo: '#92400e'
    }
  ];

  return (
    <div style={{ padding: '2rem', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: '1.75rem' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#ff5722', background: '#fff7ed', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
          Administração Geral
        </span>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a', margin: '0.25rem 0 0 0' }}>
          Catálogo de Produtos, Subprodutos & Regras Comerciais
        </h1>
        <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0.25rem 0 0 0' }}>
          Edite valores e parcelas padrão por linha de produto. As alterações valem apenas para novas propostas e ficam registradas na Trilha de Auditoria.
        </p>
      </div>

      {/* BLOCO 1: 3 CARDS SEPARADOS POR LINHA (GIANTS, PAC, AE) */}
      {carregandoProdutos ? (
        <div style={{ padding: '2rem', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', textAlign: 'center', color: '#94a3b8', marginBottom: '2rem' }}>
          Carregando catálogo oficial...
        </div>
      ) : (
        linhasConfig.map((linha) => {
          const itensLinha = produtos.filter((p) => String(p.categoria || '').toUpperCase() === linha.chave);
          return (
            <div
              key={linha.chave}
              style={{ background: '#fff', borderRadius: '12px', border: `1px solid ${linha.corBorda}`, overflow: 'hidden', marginBottom: '1.5rem' }}
            >
              <div style={{ padding: '1rem 1.25rem', background: linha.corHeader, borderBottom: `1px solid ${linha.corBorda}` }}>
                <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: linha.corTitulo }}>
                  {linha.titulo}
                </h2>
                <span style={{ fontSize: '0.8rem', color: '#475569' }}>{linha.subtitulo}</span>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <tr>
                      <th style={{ padding: '0.85rem 1rem', color: '#475569', fontSize: '0.8rem', width: '24%' }}>Subproduto / Plano</th>
                      <th style={{ padding: '0.85rem 1rem', color: '#475569', fontSize: '0.8rem', width: '15%' }}>Tipo</th>
                      <th style={{ padding: '0.85rem 1rem', color: '#475569', fontSize: '0.8rem', width: '31%' }}>Entregáveis & Regra</th>
                      <th style={{ padding: '0.85rem 1rem', color: '#475569', fontSize: '0.8rem', width: '13%' }}>Valor Base (R$)</th>
                      <th style={{ padding: '0.85rem 1rem', color: '#475569', fontSize: '0.8rem', width: '10%' }}>Parcelas</th>
                      <th style={{ padding: '0.85rem 1rem', color: '#475569', fontSize: '0.8rem', textAlign: 'right', width: '7%' }}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itensLinha.map((prod) => {
                      const badge = rotuloTipoItem(prod.tipo_item);
                      const parcelaMedia = Number(prod.parcelas_padrao) > 0
                        ? Number(prod.valor_base) / Number(prod.parcelas_padrao)
                        : Number(prod.valor_base);
                      return (
                        <tr key={prod.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '0.85rem 1rem', fontWeight: '800', color: '#0f172a', fontSize: '0.9rem' }}>
                            {prod.nome}
                          </td>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <span style={{ background: badge.bg, color: badge.color, padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '700', whiteSpace: 'nowrap' }}>
                              {badge.texto}
                            </span>
                          </td>
                          <td style={{ padding: '0.85rem 1rem', color: '#475569', fontSize: '0.8rem' }}>
                            {prod.descricao_entregaveis || '-'}
                          </td>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                              <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: '700' }}>R$</span>
                              <input
                                type="number"
                                step="10"
                                value={prod.valor_base}
                                onChange={(e) => alterarCampoProduto(prod.id, 'valor_base', e.target.value)}
                                style={{ width: '115px', padding: '0.4rem 0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: '800', fontSize: '0.86rem', color: '#0f172a' }}
                              />
                            </div>
                          </td>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <input
                                type="number"
                                min="1"
                                max="24"
                                value={prod.parcelas_padrao || 12}
                                onChange={(e) => alterarCampoProduto(prod.id, 'parcelas_padrao', e.target.value)}
                                style={{ width: '52px', padding: '0.4rem 0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: '700', fontSize: '0.84rem', color: '#0f172a' }}
                              />
                              <span style={{ fontSize: '0.73rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                                x {parcelaMedia.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                            <button
                              onClick={() => salvarProduto(prod)}
                              disabled={salvandoProdutoId === prod.id}
                              style={{
                                background: '#0f172a',
                                color: '#fff',
                                border: 'none',
                                padding: '0.42rem 0.85rem',
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
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}

      {/* BLOCO 2: REGRAS DE ALÇADA E CASHBACK */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', marginTop: '2rem' }}>
        <div style={{ padding: '1rem 1.25rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>
            Regras de Alçada, Entrada Mínima & Cashback de Upgrade
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
                  <td style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem', maxWidth: '320px' }}>
                    {r.descricao}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '700' }}>
                        {String(r.chave || '').includes('pct') ? '%' : r.chave === 'entrada_minima_padrao' ? 'parc.' : 'R$'}
                      </span>
                      <input
                        type="number"
                        step={r.chave === "entrada_minima_padrao" ? "1" : "10"}
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
