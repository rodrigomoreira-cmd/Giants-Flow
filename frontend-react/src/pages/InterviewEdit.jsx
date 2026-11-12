import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';

export default function InterviewEdit() {
  const { id } = useParams(); // id pode ser aplicacaoId ou clienteId
  const navigate = useNavigate();

  const [etapaAtual, setEtapaAtual] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [catalogoProdutos, setCatalogoProdutos] = useState([]);
const [ficha, setFicha] = useState({
    aplicacao_id: id,
    razao_social: '',
    nome_fantasia: '',
    nome_empresario: '',
    telefone: '',
    email: '',
    periodo_entrevista: 'Almoço',

    // Etapa 2 - Negociação
    socios: 1,
    forma_entrada: 'Pix',
    valor_entrada: 10000,
    cashback: 0,
    categoria_produto: 'GIANTS',
    produto_nome: 'GIANTS - Titular (Empresa)',
    almoco_pago: false,
    parcelas: 10,
    forma_restante: 'Pix',
    desconto: 0,
    desc_dif: '',

    // Etapa 3 - Contexto
    resumo_entrevista: '',
    dores: '',
    objetivos: '',

    // Etapa 4 - Programa
    mes_encontro: 'Março/2026',
    inicio_programa: '',
    fim_programa: '',

    // Etapa 5 - Resultado
    resultado_comercial: '',
    data_retomada: '',
    resultado_obs: ''
  });

  useEffect(() => {
    async function carregarDadosIniciais() {
      try {
        setCarregando(true);
        setErro('');
        
        // 0. Carregar catálogo oficial de produtos e subprodutos
        const listaProds = await api.get('/produtos').catch(() => []);
        if (Array.isArray(listaProds)) setCatalogoProdutos(listaProds);

        // 1. Carregar lista de clientes para obter dados da aplicação
        const dadosClientes = await api.get('/clientes?turmaId=${localStorage.getItem("turma_ativa_id") || "1491"}');
        const lista = Array.isArray(dadosClientes) ? dadosClientes : dadosClientes.clientes || [];
        const clienteEncontrado = lista.find(c => String(c.id || c.cliente_id || c.aplicacao_id) === String(id));

        if (clienteEncontrado) {
          setFicha(prev => ({
            ...prev,
            aplicacao_id: clienteEncontrado.id || id,
            razao_social: clienteEncontrado.empresa || clienteEncontrado.razao_social || 'Empresa SGA',
            nome_fantasia: clienteEncontrado.nome_fantasia || clienteEncontrado.empresa || '',
            nome_empresario: clienteEncontrado.nome || clienteEncontrado.nome_completo || '',
            telefone: clienteEncontrado.telefone || clienteEncontrado.whatsapp || '',
            email: clienteEncontrado.email || ''
          }));
        } else {
          // Se não encontrou na lista, mantém os dados com ID padrão
          setFicha(prev => ({
            ...prev,
            aplicacao_id: id,
            razao_social: `Empresa Participante #${id}`,
            nome_empresario: `Participante #${id}`
          }));
        }
      } catch (err) {
        setErro('Erro ao carregar dados do participante: ' + err.message);
      } finally {
        setCarregando(false);
      }
    }
    carregarDadosIniciais();
  }, [id]);

  const atualizarCampo = (campo, valor) => {
    setFicha(prev => ({ ...prev, [campo]: valor }));
  };

  // Cálculos comerciais do GIANTS Flow
  const calcularValores = () => {
    const catUpper = String(ficha.categoria_produto || 'GIANTS').toUpperCase();
    const prodSelecionado = catalogoProdutos.find(p => p.nome === ficha.produto_nome)
      || catalogoProdutos.find(p => String(p.categoria || '').toUpperCase() === catUpper && p.tipo_item === 'PRINCIPAL');
    const defaultsPreco = {
      'GIANTS - Titular (Empresa)': 279000,
      'PAC - Completo': 69900,
      'PAC - Compacto': 59900,
      'AE - Condição Especial (Evento)': 29990,
      'AE - Tabela Regular': 45990
    };
    const valorBase = prodSelecionado ? Number(prodSelecionado.valor_base) : (defaultsPreco[ficha.produto_nome] || 279000);

    const itemAdicional = catalogoProdutos.find(p => String(p.categoria || '').toUpperCase() === catUpper && p.tipo_item === 'ADICIONAL');
    const adicional = itemAdicional
      ? Number(itemAdicional.valor_base)
      : (catUpper === 'GIANTS' ? 90000 : catUpper === 'AE' ? 9900 : 0);

    const socios = Math.max(1, Number(ficha.socios) || 1);
    const contrato = valorBase + (socios - 1) * adicional;
    const desconto = Math.max(0, Number(ficha.desconto) || 0);

    const valorNegociado = Math.max(0, contrato - desconto);
    const entrada = Math.max(0, Number(ficha.valor_entrada) || 0);
    const cashback = Math.max(0, Number(ficha.cashback) || 0);
    const saldo = Math.max(0, valorNegociado - entrada - cashback);
    const parcelas = Math.max(1, Number(ficha.parcelas) || 1);
    const valorParcela = saldo > 0 ? (saldo / parcelas) : 0;

    const motivosAprovacao = [];
    if (desconto > 0) motivosAprovacao.push(`Desconto concedido: R$ ${desconto.toLocaleString('pt-BR')}`);
    if (entrada < 10000) motivosAprovacao.push(`Entrada de R$ ${entrada.toLocaleString('pt-BR')} abaixo do piso mínimo`);
    if (ficha.forma_restante === 'Boleto') motivosAprovacao.push('Restante em Boleto bancário (requer 2 aprovadores)');
    if (ficha.desc_dif?.trim()) motivosAprovacao.push('Condição especial declarada');

    return {
      contrato,
      desconto,
      valorNegociado,
      entrada,
      cashback,
      saldo,
      parcelas,
      valorParcela,
      precisaAprovacao: motivosAprovacao.length > 0,
      motivosAprovacao
    };
  };

  const calc = calcularValores();

  const camposFaltantes = [];
  if (!ficha.nome_empresario?.trim()) camposFaltantes.push('Nome do empresário');
  if (!ficha.forma_entrada) camposFaltantes.push('Forma de entrada');
  if (ficha.valor_entrada === undefined || ficha.valor_entrada === null) camposFaltantes.push('Valor de entrada');
  if (!ficha.resultado_comercial) camposFaltantes.push('Resultado comercial');

  const podeSubmeter = camposFaltantes.length === 0;

  const submeterFicha = async () => {
    if (!podeSubmeter) {
      alert(`Preencha os campos obrigatórios:\n- ${camposFaltantes.join('\n- ')}`);
      return;
    }

    try {
      setSalvando(true);
      const appTargetId = Number(ficha.aplicacao_id || id);

      // 1. Registra o resultado da entrevista no backend oficial
      await api.post('/entrevistas/resultado', {
        aplicacaoId: appTargetId,
            turmaId: ficha.turma_id || 1491,
        turno: ficha.periodo_entrevista === 'Almoço' ? 'almoco' : 'jantar',
        resultado: ficha.resultado_comercial,
        observacao: `[${ficha.resultado_comercial}] ${ficha.resultado_obs || ''} | Resumo: ${ficha.resumo_entrevista || 'N/A'}`
      });

      // 2. Se gerou fechamento ou negociação, cria a proposta comercial na API
      if (['Fechou GIANTS', 'Fechou PAC', 'Downsell PAC', 'Fechou AE'].includes(ficha.resultado_comercial)) {
        const prodMatch = catalogoProdutos.find(p => p.nome === ficha.produto_nome)
          || catalogoProdutos.find(p => String(p.categoria || '').toUpperCase() === String(ficha.categoria_produto || 'GIANTS').toUpperCase());
        await api.post('/propostas', {
          aplicacaoId: appTargetId,
          produtoId: prodMatch ? prodMatch.id : 3,
          produtoNome: ficha.produto_nome,
          categoriaProduto: ficha.categoria_produto,
          socios: Number(ficha.socios) || 1,
          valorTotal: calc.valorNegociado,
          valorEntrada: calc.entrada,
          cashback: 0,
          metodoPagamento: `${ficha.forma_entrada} + ${calc.parcelas}x ${ficha.forma_restante}`,
          quantidadeParcelas: calc.parcelas,
          valorParcela: calc.valorParcela
        });
      }

      alert('Entrevista e deliberação comercial registradas com sucesso no servidor!');
      navigate('/interviews');
    } catch (err) {
      alert(`Erro ao registrar: ${err.message}`);
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return <div style={{ padding: '2.5rem', color: '#64748b' }}>Carregando dados do participante...</div>;
  }

  const etapas = [
    { num: 1, rotulo: '1. Participantes' },
    { num: 2, rotulo: '2. Negociação' },
    { num: 3, rotulo: '3. Contexto' },
    { num: 4, rotulo: '4. Programa' },
    { num: 5, rotulo: '5. Resultado' },
    { num: 6, rotulo: '6. Revisão' }
  ];

  return (
    <div style={{ padding: '2rem', width: '100%', boxSizing: 'border-box' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#ff5722', background: '#fff7ed', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
              Ref #{id}
            </span>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>• {ficha.razao_social}</span>
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
            Condução da Entrevista Comercial
          </h1>
        </div>

        <button
          onClick={() => navigate('/interviews')}
          style={{ background: '#fff', border: '1px solid #cbd5e1', padding: '0.45rem 0.9rem', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', color: '#475569', fontSize: '0.85rem' }}
        >
          Sair e Voltar
        </button>
      </div>

      {erro && (
        <div style={{ background: '#fef2f2', color: '#ef4444', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #fecaca' }}>
          {erro}
        </div>
      )}

      {/* Navegação entre etapas */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem', marginBottom: '2rem', overflowX: 'auto' }}>
        {etapas.map(et => (
          <button
            key={et.num}
            onClick={() => setEtapaAtual(et.num)}
            style={{
              background: etapaAtual === et.num ? '#ff5722' : '#f8fafc',
              color: etapaAtual === et.num ? '#fff' : '#64748b',
              border: '1px solid',
              borderColor: etapaAtual === et.num ? '#ff5722' : '#e2e8f0',
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              fontWeight: '700',
              fontSize: '0.85rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            {et.rotulo}
          </button>
        ))}
      </div>

      {/* Conteúdo por Etapa */}
      <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '2rem', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', marginBottom: '2rem' }}>
        
        {/* ETAPA 1 */}
        {etapaAtual === 1 && (
          <div>
            <h3 style={{ margin: '0 0 1.25rem 0', color: '#0f172a', fontSize: '1.15rem' }}>1. Empresa e Participantes</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>Empresa / Razão Social</label>
                <input type="text" value={ficha.razao_social} onChange={(e) => atualizarCampo('razao_social', e.target.value)} style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>Nome do Empresário *</label>
                <input type="text" value={ficha.nome_empresario} onChange={(e) => atualizarCampo('nome_empresario', e.target.value)} placeholder="Ex: Carlos Andrade" style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>Telefone / WhatsApp</label>
                <input type="text" value={ficha.telefone} onChange={(e) => atualizarCampo('telefone', e.target.value)} placeholder="(11) 99999-9999" style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>Período</label>
                <select value={ficha.periodo_entrevista} onChange={(e) => atualizarCampo('periodo_entrevista', e.target.value)} style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', boxSizing: 'border-box' }}>
                  <option value="Almoço">Almoço</option>
                  <option value="Coffee">Coffee Break</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* ETAPA 2 */}
        {etapaAtual === 2 && (
          <div>
            <h3 style={{ margin: '0 0 1.25rem 0', color: '#0f172a', fontSize: '1.15rem' }}>2. Condições da Negociação</h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', background: '#f8fafc', padding: '1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Valor Tabela</span>
                <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#0f172a', marginTop: '0.2rem' }}>
                  {calc.contrato.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Valor Negociado</span>
                <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#059669', marginTop: '0.2rem' }}>
                  {calc.valorNegociado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Saldo a Cobrar</span>
                <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#ff5722', marginTop: '0.2rem' }}>
                  {calc.saldo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>Produto Negociado *</label>
                <select
                  value={ficha.produto_nome}
                  onChange={(e) => {
                    const novoProd = e.target.value;
                    const mapaResultado = { GIANTS: 'Fechou GIANTS', PAC: 'Downsell PAC', AE: 'Fechou AE' };
                    setFicha(prev => ({ ...prev, produto_nome: novoProd, resultado_comercial: mapaResultado[novoProd] || prev.resultado_comercial }));
                  }}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontWeight: '700', boxSizing: 'border-box' }}
                >
                  <option value="GIANTS">GIANTS</option>
                  <option value="PAC">PAC</option>
                  <option value="AE">AE</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>Linha de Produto *</label>
                <select
                  value={ficha.categoria_produto}
                  onChange={(e) => {
                    const novaCat = e.target.value;
                    const primeiroSub = catalogoProdutos.find(p => String(p.categoria || '').toUpperCase() === novaCat && p.tipo_item === 'PRINCIPAL');
                    const fallbackSub = {
                      GIANTS: 'GIANTS - Titular (Empresa)',
                      PAC: 'PAC - Completo',
                      AE: 'AE - Condição Especial (Evento)'
                    };
                    const mapaResultado = { GIANTS: 'Fechou GIANTS', PAC: 'Fechou PAC', AE: 'Fechou AE' };
                    setFicha(prev => ({
                      ...prev,
                      categoria_produto: novaCat,
                      produto_nome: primeiroSub ? primeiroSub.nome : fallbackSub[novaCat],
                      parcelas: primeiroSub ? Number(primeiroSub.parcelas_padrao || 12) : 12,
                      socios: 1,
                      resultado_comercial: mapaResultado[novaCat] || prev.resultado_comercial
                    }));
                  }}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontWeight: '700', boxSizing: 'border-box' }}
                >
                  <option value="GIANTS">GIANTS (Programa 360°)</option>
                  <option value="PAC">PAC (Aceleração Pré-GIANTS)</option>
                  <option value="AE">AE (Acelerador Empresarial)</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>Subproduto / Plano *</label>
                <select
                  value={ficha.produto_nome}
                  onChange={(e) => {
                    const novoSub = e.target.value;
                    const objSub = catalogoProdutos.find(p => p.nome === novoSub);
                    setFicha(prev => ({
                      ...prev,
                      produto_nome: novoSub,
                      parcelas: objSub ? Number(objSub.parcelas_padrao || prev.parcelas) : prev.parcelas
                    }));
                  }}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontWeight: '600', boxSizing: 'border-box' }}
                >
                  {catalogoProdutos
                    .filter(p => String(p.categoria || '').toUpperCase() === String(ficha.categoria_produto || 'GIANTS').toUpperCase() && p.tipo_item === 'PRINCIPAL')
                    .map(p => (
                      <option key={p.id} value={p.nome}>
                        {p.nome} ({Number(p.valor_base).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})
                      </option>
                    ))}
                  {catalogoProdutos.filter(p => String(p.categoria || '').toUpperCase() === String(ficha.categoria_produto || 'GIANTS').toUpperCase() && p.tipo_item === 'PRINCIPAL').length === 0 && (
                    <option value={ficha.produto_nome}>{ficha.produto_nome}</option>
                  )}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>
                  {ficha.categoria_produto === 'AE' ? 'Qtd. Participantes (Vagas)' : ficha.categoria_produto === 'PAC' ? 'Qtd. Empresas' : 'Qtd. de Sócios *'}
                </label>
                <input type="number" min="1" max="10" value={ficha.socios} onChange={(e) => atualizarCampo('socios', Number(e.target.value))} style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>Valor da Entrada (R$) *</label>
                <input type="number" value={ficha.valor_entrada} onChange={(e) => atualizarCampo('valor_entrada', Number(e.target.value))} style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>Forma da Entrada *</label>
                <select value={ficha.forma_entrada} onChange={(e) => atualizarCampo('forma_entrada', e.target.value)} style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', boxSizing: 'border-box' }}>
                  <option value="Pix">Pix</option>
                  <option value="Cartão de Crédito">Cartão de Crédito</option>
                  <option value="Cartão de Débito">Cartão de Débito</option>
                  <option value="Link de Pagamento">Link de Pagamento</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>Parcelas do Restante</label>
                <input type="number" min="1" max="24" value={ficha.parcelas} onChange={(e) => atualizarCampo('parcelas', Number(e.target.value))} style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>Forma do Restante</label>
                <select value={ficha.forma_restante} onChange={(e) => atualizarCampo('forma_restante', e.target.value)} style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', boxSizing: 'border-box' }}>
                  <option value="Pix">Pix</option>
                  <option value="Cartão de Crédito">Cartão de Crédito</option>
                  <option value="Boleto">Boleto (Requer Aprovação)</option>
                </select>
              </div>
              </div>
          </div>
        )}

        {/* ETAPA 3 */}
        {etapaAtual === 3 && (
          <div>
            <h3 style={{ margin: '0 0 1.25rem 0', color: '#0f172a', fontSize: '1.15rem' }}>3. Contexto e Diagnóstico</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>Resumo da Entrevista</label>
                <textarea rows="3" value={ficha.resumo_entrevista} onChange={(e) => atualizarCampo('resumo_entrevista', e.target.value)} placeholder="Tópicos da conversa..." style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>Principais Dores do Negócio</label>
                <textarea rows="3" value={ficha.dores} onChange={(e) => atualizarCampo('dores', e.target.value)} placeholder="Gargalos operacionais..." style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
              </div>
            </div>
          </div>
        )}

        {/* ETAPA 4 */}
        {etapaAtual === 4 && (
          <div>
            <h3 style={{ margin: '0 0 1.25rem 0', color: '#0f172a', fontSize: '1.15rem' }}>4. Programa GIANTS</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>Mês do Encontro</label>
                <input type="text" value={ficha.mes_encontro} onChange={(e) => atualizarCampo('mes_encontro', e.target.value)} style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
              </div>
            </div>
          </div>
        )}

        {/* ETAPA 5 */}
        {etapaAtual === 5 && (
          <div>
            <h3 style={{ margin: '0 0 1.25rem 0', color: '#0f172a', fontSize: '1.15rem' }}>5. Deliberação Comercial *</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>Resultado Comercial *</label>
                <select
                  value={ficha.resultado_comercial}
                  onChange={(e) => {
                    const resVal = e.target.value;
                    const mapaProd = { 'Fechou GIANTS': 'GIANTS', 'Downsell PAC': 'PAC', 'Fechou AE': 'AE' };
                    setFicha(prev => ({ ...prev, resultado_comercial: resVal, produto_nome: mapaProd[resVal] || prev.produto_nome }));
                  }}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', boxSizing: 'border-box' }}
                >
                  <option value="">Selecione o resultado</option>
                  <option value="Fechou GIANTS">Fechou GIANTS</option>
                  <option value="Downsell PAC">Downsell PAC</option>
                  <option value="Fechou AE">Fechou AE</option>
                  <option value="Não fechou">Não fechou</option>
                  <option value="Decisão futura">Decisão futura</option>
                </select>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>Observação do Fechamento</label>
              <textarea rows="3" value={ficha.resultado_obs} onChange={(e) => atualizarCampo('resultado_obs', e.target.value)} placeholder="Detalhes do fechamento..." style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }} />
            </div>
          </div>
        )}

        {/* ETAPA 6 */}
        {etapaAtual === 6 && (
          <div>
            <h3 style={{ margin: '0 0 1.25rem 0', color: '#0f172a', fontSize: '1.15rem' }}>6. Revisão Final e Envio</h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
              <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Empresa / Representante</span>
                <div style={{ fontWeight: '700', color: '#0f172a', marginTop: '0.3rem' }}>{ficha.razao_social}</div>
                <div style={{ fontSize: '0.85rem', color: '#475569' }}>{ficha.nome_empresario}</div>
              </div>

              <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Fechamento Comercial</span>
                <div style={{ fontWeight: '700', color: '#059669', marginTop: '0.3rem' }}>
                  {calc.valorNegociado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#475569' }}>
                  Entrada de {calc.entrada.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} ({ficha.forma_entrada}) + {calc.parcelas}x parcelas
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Resultado</span>
                <div style={{ fontWeight: '700', color: '#ff5722', marginTop: '0.3rem' }}>
                  {ficha.resultado_comercial || 'Pendente'}
                </div>
              </div>
            </div>

            {!podeSubmeter ? (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#dc2626', display: 'block', marginBottom: '0.4rem' }}>
                  Preencha os campos obrigatórios antes de registrar:
                </span>
                <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8rem', color: '#b91c1c' }}>
                  {camposFaltantes.map((c, idx) => <li key={idx}>{c}</li>)}
                </ul>
              </div>
            ) : (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#16a34a' }}>
                  ✔ Dados prontos para registro e sincronização com o banco de dados.
                </span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                disabled={!podeSubmeter || salvando}
                onClick={submeterFicha}
                style={{
                  background: !podeSubmeter ? '#cbd5e1' : '#059669',
                  color: '#fff',
                  border: 'none',
                  padding: '0.8rem 1.75rem',
                  borderRadius: '8px',
                  fontWeight: '700',
                  fontSize: '0.95rem',
                  cursor: !podeSubmeter ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                <span className="material-symbols-outlined">check_circle</span>
                {salvando ? 'Registrando...' : 'Confirmar e Gravar Entrevista'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Controles de navegação */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          disabled={etapaAtual === 1}
          onClick={() => setEtapaAtual(e => Math.max(1, e - 1))}
          style={{ background: '#fff', border: '1px solid #cbd5e1', padding: '0.5rem 1.25rem', borderRadius: '8px', fontWeight: '600', cursor: etapaAtual === 1 ? 'not-allowed' : 'pointer', opacity: etapaAtual === 1 ? 0.5 : 1 }}
        >
          Voltar Etapa
        </button>

        <button
          disabled={etapaAtual === 6}
          onClick={() => setEtapaAtual(e => Math.min(6, e + 1))}
          style={{ background: '#0f172a', color: '#fff', border: 'none', padding: '0.5rem 1.25rem', borderRadius: '8px', fontWeight: '600', cursor: etapaAtual === 6 ? 'not-allowed' : 'pointer', opacity: etapaAtual === 6 ? 0.5 : 1 }}
        >
          Avançar Etapa
        </button>
      </div>
    </div>
  );
}