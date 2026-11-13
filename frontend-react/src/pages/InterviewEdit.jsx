import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';

const normalizarEmpresa = (emp) =>
  String(emp || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export default function InterviewEdit() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [etapaAtual, setEtapaAtual] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [catalogoProdutos, setCatalogoProdutos] = useState([]);
  const [modalConclusao, setModalConclusao] = useState(null);
  const [modalReabrir, setModalReabrir] = useState(false);
  const [motivoReabertura, setMotivoReabertura] = useState('');
  const [reabrindoFicha, setReabrindoFicha] = useState(false);

  const sessaoOperador = (() => {
    try {
      return JSON.parse(localStorage.getItem('sessao_operador') || 'null');
    } catch (_) {
      return null;
    }
  })();
  const papelUsuario = String(sessaoOperador?.usuario?.papel || '').toUpperCase();
  const isAdmin = ['ADMIN', 'ADMINISTRADOR', 'SYSTEM'].includes(papelUsuario);

  // Lista de sócios da empresa (cadastrados na turma + adicionados na hora do fechamento)
  const [sociosLista, setSociosLista] = useState([]);
  const [novoSocioNome, setNovoSocioNome] = useState('');
  const [novoSocioCpf, setNovoSocioCpf] = useState('');
  const [novoSocioTelefone, setNovoSocioTelefone] = useState('');

  const [ficha, setFicha] = useState({
    aplicacao_id: id,
    turma_id: Number(localStorage.getItem('turma_ativa_id') || 1491),
    razao_social: '',
    cnpj: '',
    nome_fantasia: '',
    nome_empresario: '',
    telefone: '',
    email: '',
    periodo_entrevista: 'Almoço',

    // Etapa 2 - Negociação
    categoria_produto: 'GIANTS',
    produto_nome: 'GIANTS - Titular (Empresa)',
    socios: 1,
    forma_entrada: 'Pix',
    valor_entrada: 10000,
    cashback: 0,
    almoco_pago: false,
    cashback_almoco_cnpj: 0,
    cashback_upgrade_cnpj: 0,
    historico_produtos_elegiveis: '',
    parcelas: 12,
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

        const turmaAtiva = localStorage.getItem('turma_ativa_id') || '1491';
        const [listaProds, dadosClientes] = await Promise.all([
          api.get('/produtos').catch(() => []),
          api.get(`/clientes?turmaId=${turmaAtiva}`).catch(() => [])
        ]);

        if (Array.isArray(listaProds)) {
          setCatalogoProdutos(listaProds);
        }

        const lista = Array.isArray(dadosClientes) ? dadosClientes : dadosClientes?.clientes || [];
        const clienteEncontrado = lista.find((c) => String(c.id || c.cliente_id || c.aplicacao_id) === String(id));

        if (clienteEncontrado) {
          const cnpjTitular = clienteEncontrado.cnpj || clienteEncontrado.cpf_cnpj || '';
          const cnpjDigits = String(cnpjTitular).replace(/\D/g, '');
          const empTitular = clienteEncontrado.empresa || clienteEncontrado.razao_social || 'Empresa SGA';
          const empNorm = normalizarEmpresa(empTitular);
          const nomeTitular = clienteEncontrado.nome_participante || clienteEncontrado.nome || clienteEncontrado.nome_completo || '';

          // Localiza todos os sócios cadastrados na turma vinculados ao mesmo CNPJ ou mesma empresa
          const sociosMesmaEmpresa = lista.filter((c) => {
            if (c.membro_giants) return false;
            const cDigits = String(c.cnpj || c.cpf_cnpj || '').replace(/\D/g, '');
            if (cnpjDigits.length >= 11 && cDigits === cnpjDigits) return true;
            if (empNorm && empNorm !== 'empresa sga' && normalizarEmpresa(c.empresa) === empNorm) return true;
            return String(c.id) === String(clienteEncontrado.id);
          });

          const listaInicialSocios = (typeof sociosMesmaEmpresa !== 'undefined' ? sociosMesmaEmpresa : []).map((s, idx) => ({
            id: s.id,
            nome: s.nome_participante || s.nome || `Participante #${s.id}`,
            cpf: s.cpf_cnpj || s.cnpj || '',
            telefone: s.telefone || '',
            cargo: s.cargo || (idx === 0 ? 'Sócio Titular' : 'Sócio'),
            titular: String(s.id) === String(clienteEncontrado.id),
            entraNoContrato: String(s.id) === String(clienteEncontrado.id),
            externo: false
          }));

          // Garante o titular no topo
          listaInicialSocios.sort((a, b) => (a.titular === b.titular ? 0 : a.titular ? -1 : 1));
          setSociosLista(listaInicialSocios);

          const qtdEntrando = Math.max(1, listaInicialSocios.filter((s) => s.entraNoContrato).length);
          const temAlmocoPago = (typeof sociosMesmaEmpresa !== 'undefined' ? sociosMesmaEmpresa : []).some((s) => Boolean(s.almoco_pago) || Number(s.valor_almoco || 0) >= 1000);
          const cashbackAlmocoCnpj = temAlmocoPago ? 1000 : 0;
          const cashbackUpgradeCnpj = (typeof sociosMesmaEmpresa !== 'undefined' ? sociosMesmaEmpresa : []).reduce(
            (maxVal, s) => Math.max(maxVal, Number(s.cashback_upgrade_90_pct || 0)),
            0
          );
          const socioComHistorico = (typeof sociosMesmaEmpresa !== 'undefined' ? sociosMesmaEmpresa : []).find((s) => s.historico_produtos_elegiveis);
          const historicoElegivel = socioComHistorico ? socioComHistorico.historico_produtos_elegiveis : '';

          setFicha((prev) => ({
            ...prev,
            aplicacao_id: clienteEncontrado.id || id,
            turma_id: Number(clienteEncontrado.turma_id || turmaAtiva),
            razao_social: empTitular,
            cnpj: cnpjTitular,
            nome_fantasia: clienteEncontrado.nome_fantasia || empTitular,
            nome_empresario: nomeTitular,
            telefone: clienteEncontrado.telefone || clienteEncontrado.whatsapp || '',
            email: clienteEncontrado.email || '',
            almoco_pago: temAlmocoPago,
            cashback_almoco_cnpj: cashbackAlmocoCnpj,
            cashback_upgrade_cnpj: cashbackUpgradeCnpj,
            historico_produtos_elegiveis: historicoElegivel,
            cashback: cashbackAlmocoCnpj + cashbackUpgradeCnpj,
            socios: qtdEntrando
          }));
        } else {
          setSociosLista([
            {
              id: Number(id),
              nome: `Participante #${id}`,
              cpf: '',
              telefone: '',
              cargo: 'Sócio Titular',
              titular: true,
              entraNoContrato: true,
              externo: false
            }
          ]);
          setFicha((prev) => ({
            ...prev,
            aplicacao_id: id,
            razao_social: `Empresa Participante #${id}`,
            nome_empresario: `Participante #${id}`,
            socios: 1
          }));
        }
      } catch (err) {
        setErro('Erro ao carregar dados da empresa: ' + err.message);
      } finally {
        setCarregando(false);
      }
    }
    carregarDadosIniciais();
  }, [id]);

  // Sincroniza automaticamente a contagem de sócios/vagas com os checkboxes marcados
  const sincronizarSociosNoContrato = (novaLista) => {
    setSociosLista(novaLista);
    const totalEntrando = Math.max(1, novaLista.filter((s) => s.entraNoContrato).length);
    setFicha((prev) => ({ ...prev, socios: totalEntrando }));
  };

  const alternarSocioContrato = (index) => {
    const atualizada = sociosLista.map((item, idx) => {
      if (idx !== index) return item;
      // Impede desmarcar o único participante restante
      const totalMarcados = sociosLista.filter((s) => s.entraNoContrato).length;
      if (item.entraNoContrato && totalMarcados <= 1) return item;
      return { ...item, entraNoContrato: !item.entraNoContrato };
    });
    sincronizarSociosNoContrato(atualizada);
  };

  const adicionarNovoSocio = () => {
    if (!novoSocioNome.trim()) {
      alert('Informe o nome completo do sócio ou participante adicional.');
      return;
    }
    const novoItem = {
      id: `ext-${Date.now()}`,
      nome: novoSocioNome.trim(),
      cpf: novoSocioCpf.trim(),
      telefone: novoSocioTelefone.trim(),
      cargo: 'Sócio Adicional (Novo)',
      titular: false,
      entraNoContrato: true,
      externo: true
    };
    sincronizarSociosNoContrato([...sociosLista, novoItem]);
    setNovoSocioNome('');
    setNovoSocioCpf('');
    setNovoSocioTelefone('');
  };

  const removerSocioExterno = (index) => {
    const atualizada = sociosLista.filter((_, idx) => idx !== index);
    sincronizarSociosNoContrato(atualizada);
  };

  const atualizarCampo = (campo, valor) => {
    setFicha((prev) => ({ ...prev, [campo]: valor }));
  };

  // Cálculos comerciais dinâmicos conforme Linha + Subproduto + Sócios Marcados
  const calcularValores = () => {
    const catUpper = String(ficha.categoria_produto || 'GIANTS').toUpperCase();
    const prodSelecionado =
      catalogoProdutos.find((p) => p.nome === ficha.produto_nome) ||
      catalogoProdutos.find((p) => String(p.categoria || '').toUpperCase() === catUpper && p.tipo_item === 'PRINCIPAL');

    const defaultsPreco = {
      'GIANTS - Titular (Empresa)': 279000,
      'PAC - Completo': 69900,
      'PAC - Compacto': 59900,
      'AE - Condição Especial (Evento)': 29990,
      'AE - Tabela Regular': 45990
    };
    const valorBase = prodSelecionado ? Number(prodSelecionado.valor_base) : defaultsPreco[ficha.produto_nome] || 279000;

    const itemAdicional = catalogoProdutos.find(
      (p) => String(p.categoria || '').toUpperCase() === catUpper && p.tipo_item === 'ADICIONAL'
    );
    const adicionalUnitario = itemAdicional
      ? Number(itemAdicional.valor_base)
      : catUpper === 'GIANTS'
      ? 90000
      : catUpper === 'AE'
      ? 9900
      : 0;

    const socios = Math.max(1, Number(ficha.socios) || 1);
    const totalAdicionais = (socios - 1) * adicionalUnitario;
    const contrato = valorBase + totalAdicionais;
    const desconto = Math.max(0, Number(ficha.desconto) || 0);

    const valorNegociado = Math.max(0, contrato - desconto);
    const entrada = Math.max(0, Number(ficha.valor_entrada) || 0);
    const cashback = Math.max(0, Number(ficha.cashback) || 0);
    const saldo = Math.max(0, valorNegociado - entrada - cashback);
    const parcelas = Math.max(1, Number(ficha.parcelas) || 1);
    const valorParcela = saldo > 0 ? saldo / parcelas : 0;

    const motivosAprovacao = [];
    if (desconto > 0) motivosAprovacao.push(`Desconto concedido: R$ ${desconto.toLocaleString('pt-BR')}`);
    if (entrada < 10000) motivosAprovacao.push(`Entrada de R$ ${entrada.toLocaleString('pt-BR')} abaixo do piso mínimo`);
    if (ficha.forma_restante === 'Boleto') motivosAprovacao.push('Restante em Boleto bancário (requer 2 aprovadores)');
    if (ficha.desc_dif?.trim()) motivosAprovacao.push('Condição especial declarada');

    return {
      valorBase,
      adicionalUnitario,
      totalAdicionais,
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
  const sociosQueEntram = sociosLista.filter((s) => s.entraNoContrato);
  const sociosQueNaoEntram = sociosLista.filter((s) => !s.entraNoContrato);

  const camposFaltantes = [];
  if (!ficha.razao_social?.trim()) camposFaltantes.push('Razão Social / Empresa');
  if (!ficha.nome_empresario?.trim()) camposFaltantes.push('Nome do empresário titular');
  if (!ficha.forma_entrada) camposFaltantes.push('Forma de entrada');
  if (ficha.valor_entrada === undefined || ficha.valor_entrada === null) camposFaltantes.push('Valor de entrada');
  if (!ficha.resultado_comercial) camposFaltantes.push('Resultado comercial');

  const podeSubmeter = camposFaltantes.length === 0;

  const submeterFicha = async () => {
    if (ficha.ficha_fechada) {
      alert('Esta ficha já está encerrada e aguardando aprovação do financeiro.');
      return;
    }
    if (!podeSubmeter) {
      alert(`Preencha os campos obrigatórios:\n- ${camposFaltantes.join('\n- ')}`);
      return;
    }

    try {
      setSalvando(true);
      const appTargetId = Number(ficha.aplicacao_id || id);
      const resumoSocios = sociosQueEntram.map((s) => s.nome).join(', ');
      const gerouProposta = ['Fechou GIANTS', 'Fechou PAC', 'Downsell PAC', 'Fechou AE'].includes(ficha.resultado_comercial);

      // 1. Registra o resultado da entrevista no backend oficial (fecha a ficha e libera a mesa da empresa)
      await api.post('/entrevistas/resultado', {
        aplicacaoId: appTargetId,
        turmaId: ficha.turma_id || 1491,
        turno: ficha.periodo_entrevista === 'Almoço' ? 'almoco' : 'jantar',
        resultado: ficha.resultado_comercial,
        observacao: `[${ficha.resultado_comercial}] Empresa: ${ficha.razao_social} | Sócios no contrato (${sociosQueEntram.length}): ${resumoSocios} | ${ficha.resultado_obs || ''} | Resumo: ${ficha.resumo_entrevista || 'N/A'}`
      });

      let propostaCriada = null;

      // 2. Se gerou fechamento, cria a proposta comercial com todos os sócios vinculados e cashback
      if (gerouProposta) {
        const prodMatch =
          catalogoProdutos.find((p) => p.nome === ficha.produto_nome) ||
          catalogoProdutos.find((p) => String(p.categoria || '').toUpperCase() === String(ficha.categoria_produto || 'GIANTS').toUpperCase());

        propostaCriada = await api.post('/propostas', {
          aplicacaoId: appTargetId,
          turmaId: ficha.turma_id || 1491,
          razaoSocial: ficha.razao_social,
          cnpj: ficha.cnpj,
          produtoId: prodMatch ? prodMatch.id : 7,
          produtoNome: ficha.produto_nome,
          categoriaProduto: ficha.categoria_produto,
          socios: sociosQueEntram.length,
          sociosDetalhes: sociosLista,
          valorTabela: calc.contrato,
          valorTotal: calc.valorNegociado,
          desconto: Number(calc.desconto || ficha.desconto || 0),
          valorEntrada: calc.entrada,
          cashback: calc.cashback,
          cashbackAlmoco: Number(ficha.cashback_almoco_cnpj || 0),
          cashbackUpgrade: ficha.categoria_produto === 'GIANTS' ? Number(ficha.cashback_upgrade_cnpj || 0) : 0,
          historicoProdutosElegiveis: ficha.historico_produtos_elegiveis || '',
          formaEntrada: ficha.forma_entrada || 'Pix',
          formaRestante: ficha.forma_restante || 'Pix',
          metodoPagamento: `${ficha.forma_entrada} + ${calc.parcelas}x ${ficha.forma_restante}`,
          quantidadeParcelas: calc.parcelas,
          valorParcela: calc.valorParcela
        });
      }

      setFicha((prev) => ({
        ...prev,
        ficha_fechada: true,
        etapa_funil: 'aguardando_aprovacao',
        status_aprovacao: 'pendente'
      }));

      setModalConclusao({
        protocolo: propostaCriada?.id ? `PROP-${String(propostaCriada.id).padStart(3, '0')}` : `FICHA-${appTargetId}`,
        gerouProposta,
        empresa: ficha.razao_social,
        cnpj: ficha.cnpj,
        resultado: ficha.resultado_comercial,
        produto: ficha.produto_nome,
        socios: sociosQueEntram.map((s) => s.nome),
        valorNegociado: calc.valorNegociado,
        cashback: calc.cashback,
        saldoLiquido: calc.saldo + calc.entrada,
        entrada: calc.entrada,
        formaEntrada: ficha.forma_entrada,
        parcelas: calc.parcelas,
        valorParcela: calc.valorParcela,
        formaRestante: ficha.forma_restante
      });
    } catch (err) {
      alert(`Erro ao registrar: ${err.message}`);
    } finally {
      setSalvando(false);
    }
  };

  const confirmarReaberturaAdmin = async () => {
    try {
      setReabrindoFicha(true);
      await api.post(`/entrevistas/${id}/reabrir`, {
        motivo: motivoReabertura || 'Reaberta pelo Administrador para ajuste comercial'
      });
      setFicha((prev) => ({
        ...prev,
        ficha_fechada: false,
        etapa_funil: 'em_entrevista'
      }));
      setModalReabrir(false);
      setMotivoReabertura('');
    } catch (err) {
      alert(`Erro ao reabrir ficha: ${err.message}`);
    } finally {
      setReabrindoFicha(false);
    }
  };

  if (carregando) {
    return <div style={{ padding: '2.5rem', color: '#64748b' }}>Carregando ficha consolidada da empresa...</div>
              {/* Resumo Cashback Total Abatido */}
              <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: '10px', padding: '0.85rem 1rem', marginTop: '0.75rem', color: '#166534', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: '800' }}>
                  <span>Cashback Total Abatido (CNPJ):</span>
                  <span style={{ fontSize: '1rem' }}>
                    - {Number(ficha.cashback || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>
                <div style={{ fontSize: '0.76rem', marginTop: '0.3rem', color: '#15803d', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <span>• Almoço Pago: <strong>{Number(ficha.cashback_almoco_cnpj || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></span>
                  <span>
                    • Upgrade {/ACELERADOR|\bAE\b|ACE\d/i.test(ficha.historico_produtos_elegiveis || '') ? '100% AE' : '90% PAC'} ({ficha.categoria_produto === 'GIANTS' ? 'Aplicado' : 'Exclusivo GIANTS'}):{' '}
                    <strong>
                      {(ficha.categoria_produto === 'GIANTS' ? Number(ficha.cashback_upgrade_cnpj || 0) : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </strong>
                  </span>
                </div>
              </div>;
  }

  const etapas = [
    { num: 1, rotulo: '1. Empresa & Sócios' },
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#ff5722', background: '#fff7ed', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
              Ficha Empresa #{id}
            </span>
            {ficha.cnpj && (
              <span style={{ fontSize: '0.78rem', fontFamily: 'monospace', color: '#475569', background: '#f1f5f9', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                CNPJ: {ficha.cnpj}
              </span>
            )}
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>• {ficha.razao_social}</span>
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
            Entrevista Comercial por CNPJ
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
        {etapas.map((et) => (
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
        {/* ETAPA 1: EMPRESA + GESTÃO DE SÓCIOS */}
        {etapaAtual === 1 && (
          <div>
            <h3 style={{ margin: '0 0 1.25rem 0', color: '#0f172a', fontSize: '1.15rem' }}>1. Dados do CNPJ & Sócios no Contrato</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>Empresa / Razão Social *</label>
                <input
                  type="text"
                  value={ficha.razao_social}
                  onChange={(e) => atualizarCampo('razao_social', e.target.value)}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>CNPJ</label>
                <input
                  type="text"
                  value={ficha.cnpj}
                  onChange={(e) => atualizarCampo('cnpj', e.target.value)}
                  placeholder="00.000.000/0001-00"
                  style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>Sócio Titular (Responsável) *</label>
                <input
                  type="text"
                  value={ficha.nome_empresario}
                  onChange={(e) => {
                    const novoNome = e.target.value;
                    atualizarCampo('nome_empresario', novoNome);
                    setSociosLista((prev) =>
                      prev.map((s) => (s.titular ? { ...s, nome: novoNome } : s))
                    );
                  }}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>Telefone / WhatsApp</label>
                <input
                  type="text"
                  value={ficha.telefone}
                  onChange={(e) => atualizarCampo('telefone', e.target.value)}
                  placeholder="(11) 99999-9999"
                  style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {/* PAINEL DE SÓCIOS DO CNPJ */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <h4 style={{ margin: 0, color: '#0f172a', fontSize: '1rem', fontWeight: '800' }}>
                    Sócios & Participantes Vinculados ao CNPJ
                  </h4>
                  <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    Marque quem vai entrar junto no fechamento. Cada sócio adicional selecionado soma automaticamente o valor unitário ao contrato.
                  </span>
                </div>
                <span style={{ background: '#0f172a', color: '#fff', padding: '0.3rem 0.7rem', borderRadius: '999px', fontSize: '0.78rem', fontWeight: '700' }}>
                  {sociosQueEntram.length} {sociosQueEntram.length === 1 ? 'participante no contrato' : 'participantes no contrato'}
                </span>
              </div>

              {/* Lista de sócios cadastrados e adicionados */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1.25rem' }}>
                {sociosLista.map((socio, idx) => {
                  const posicaoAdicional = sociosQueEntram.findIndex((s) => s.id === socio.id);
                  const ehTitularContrato = socio.entraNoContrato && posicaoAdicional === 0;
                  return (
                    <div
                      key={socio.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.85rem 1rem',
                        borderRadius: '10px',
                        background: socio.entraNoContrato ? '#fff' : '#f1f5f9',
                        border: socio.entraNoContrato ? '1.5px solid #ff5722' : '1px solid #cbd5e1',
                        gap: '1rem',
                        flexWrap: 'wrap'
                      }}
                    >
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', flex: 1 }}>
                        <input
                          type="checkbox"
                          checked={Boolean(socio.entraNoContrato)}
                          onChange={() => alternarSocioContrato(idx)}
                          style={{ width: '18px', height: '18px', accentColor: '#ff5722', cursor: 'pointer' }}
                        />
                        <div>
                          <div style={{ fontWeight: '800', color: '#0f172a', fontSize: '0.92rem' }}>
                            {socio.nome}
                            {socio.externo && (
                              <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', background: '#dbeafe', color: '#1e40af', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                                Adicionado no fechamento
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                            {socio.cargo} {socio.cpf && `• CPF/CNPJ: ${socio.cpf}`} {socio.telefone && `• Tel: ${socio.telefone}`}
                          </div>
                        </div>
                      </label>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        {socio.entraNoContrato ? (
                          <span
                            style={{
                              fontSize: '0.78rem',
                              fontWeight: '800',
                              padding: '0.28rem 0.65rem',
                              borderRadius: '6px',
                              background: ehTitularContrato ? '#dcfce7' : '#ffedd5',
                              color: ehTitularContrato ? '#166534' : '#9a3412'
                            }}
                          >
                            {ehTitularContrato
                              ? 'Entra como Titular (Plano Base)'
                              : `Entra como Adicional (+ ${calc.adicionalUnitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`}
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#64748b', background: '#e2e8f0', padding: '0.28rem 0.65rem', borderRadius: '6px' }}>
                            Não entra nesta venda
                          </span>
                        )}

                        {socio.externo && (
                          <button
                            type="button"
                            onClick={() => removerSocioExterno(idx)}
                            title="Remover sócio adicionado"
                            style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '6px', padding: '0.3rem 0.55rem', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer' }}
                          >
                            Remover
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Formulário rápido para adicionar sócio não cadastrado na turma */}
              <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '1rem' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#334155', marginBottom: '0.6rem' }}>
                  + Adicionar outro sócio ou participante que não está cadastrado na turma:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.65rem', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={novoSocioNome}
                    onChange={(e) => setNovoSocioNome(e.target.value)}
                    placeholder="Nome completo do sócio *"
                    style={{ padding: '0.55rem 0.7rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  />
                  <input
                    type="text"
                    value={novoSocioCpf}
                    onChange={(e) => setNovoSocioCpf(e.target.value)}
                    placeholder="CPF (opcional)"
                    style={{ padding: '0.55rem 0.7rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  />
                  <input
                    type="text"
                    value={novoSocioTelefone}
                    onChange={(e) => setNovoSocioTelefone(e.target.value)}
                    placeholder="WhatsApp (opcional)"
                    style={{ padding: '0.55rem 0.7rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  />
                  <button
                    type="button"
                    onClick={adicionarNovoSocio}
                    style={{
                      background: '#0f172a',
                      color: '#fff',
                      border: 'none',
                      padding: '0.58rem 0.9rem',
                      borderRadius: '8px',
                      fontWeight: '700',
                      fontSize: '0.82rem',
                      cursor: 'pointer'
                    }}
                  >
                    + Incluir no Contrato
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ETAPA 2: NEGOCIAÇÃO */}
        {etapaAtual === 2 && (
          <div>
            <h3 style={{ margin: '0 0 1.25rem 0', color: '#0f172a', fontSize: '1.15rem' }}>2. Condições da Negociação</h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', background: '#f8fafc', padding: '1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '1.25rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Valor Tabela ({sociosQueEntram.length} {sociosQueEntram.length === 1 ? 'participante' : 'participantes'})</span>
                <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#0f172a', marginTop: '0.2rem' }}>
                  {calc.contrato.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </div>
                {calc.totalAdicionais > 0 && (
                  <div style={{ fontSize: '0.72rem', color: '#475569' }}>
                    Base {calc.valorBase.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} + Adicionais {calc.totalAdicionais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </div>
                )}
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
                <div style={{ fontSize: '0.72rem', color: '#475569' }}>
                  {calc.parcelas}x de {calc.valorParcela.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </div>
              </div>
            </div>

            {/* Demonstrativo de Cashback apurado pelo CNPJ */}
            {(Number(ficha.cashback_almoco_cnpj || 0) > 0 || Number(ficha.cashback_upgrade_cnpj || 0) > 0) && (
              <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: '10px', padding: '0.85rem 1rem', marginBottom: '1rem', fontSize: '0.82rem', color: '#166534' }}>
                <div style={{ fontWeight: '800', marginBottom: '0.25rem' }}>
                  ✔ Crédito de Cashback Identificado no CNPJ ({ficha.cnpj || ficha.razao_social}):
                </div>
                <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
                  {Number(ficha.cashback_almoco_cnpj || 0) > 0 && (
                    <span>• Almoço Exclusivo Pago: <strong>R$ 1.000,00</strong></span>
                  )}
                  {Number(ficha.cashback_upgrade_cnpj || 0) > 0 && (
                    <span>
                      • Upgrade {/ACELERADOR|\bAE\b|ACE\d/i.test(ficha.historico_produtos_elegiveis || '') ? '100% AE' : '90% PAC'} ({ficha.historico_produtos_elegiveis || 'PAC/AE anterior'}):{' '}
                      <strong>
                        {Number(ficha.cashback_upgrade_cnpj).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </strong>{' '}
                      {ficha.categoria_produto === 'GIANTS' ? '(Aplicado no GIANTS)' : '(Disponível apenas se fechar GIANTS)'}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Resumo visual dos sócios vinculados ao cálculo */}
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1.5rem', fontSize: '0.82rem', color: '#9a3412' }}>
              <strong>Participantes vinculados a este contrato:</strong>{' '}
              {sociosQueEntram.map((s, idx) => (
                <span key={s.id}>
                  {idx > 0 && ' • '}
                  {s.nome} ({idx === 0 ? 'Titular' : `+ ${calc.adicionalUnitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`})
                </span>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>Linha de Produto *</label>
                <select
                  value={ficha.categoria_produto}
                  onChange={(e) => {
                    const novaCat = e.target.value;
                    const primeiroSub = catalogoProdutos.find(
                      (p) => String(p.categoria || '').toUpperCase() === novaCat && p.tipo_item === 'PRINCIPAL'
                    );
                    const fallbackSub = {
                      GIANTS: 'GIANTS - Titular (Empresa)',
                      PAC: 'PAC - Completo',
                      AE: 'AE - Condição Especial (Evento)'
                    };
                    const mapaResultado = { GIANTS: 'Fechou GIANTS', PAC: 'Fechou PAC', AE: 'Fechou AE' };
                    setFicha((prev) => {
                      const novoCashback =
                        Number(prev.cashback_almoco_cnpj || 0) +
                        (novaCat === 'GIANTS' ? Number(prev.cashback_upgrade_cnpj || 0) : 0);
                      return {
                        ...prev,
                        categoria_produto: novaCat,
                        produto_nome: primeiroSub ? primeiroSub.nome : fallbackSub[novaCat],
                        parcelas: primeiroSub ? Number(primeiroSub.parcelas_padrao || 12) : 12,
                        cashback: novoCashback,
                        resultado_comercial: mapaResultado[novaCat] || prev.resultado_comercial
                      };
                    });
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
                    const objSub = catalogoProdutos.find((p) => p.nome === novoSub);
                    setFicha((prev) => ({
                      ...prev,
                      produto_nome: novoSub,
                      parcelas: objSub ? Number(objSub.parcelas_padrao || prev.parcelas) : prev.parcelas
                    }));
                  }}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontWeight: '600', boxSizing: 'border-box' }}
                >
                  {catalogoProdutos
                    .filter((p) => String(p.categoria || '').toUpperCase() === String(ficha.categoria_produto || 'GIANTS').toUpperCase() && p.tipo_item === 'PRINCIPAL')
                    .map((p) => (
                      <option key={p.id} value={p.nome}>
                        {p.nome} ({Number(p.valor_base).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})
                      </option>
                    ))}
                  {catalogoProdutos.filter((p) => String(p.categoria || '').toUpperCase() === String(ficha.categoria_produto || 'GIANTS').toUpperCase() && p.tipo_item === 'PRINCIPAL').length === 0 && (
                    <option value={ficha.produto_nome}>{ficha.produto_nome}</option>
                  )}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>Valor da Entrada (R$) *</label>
                <input
                  type="number"
                  value={ficha.valor_entrada}
                  onChange={(e) => atualizarCampo('valor_entrada', Number(e.target.value))}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>Forma da Entrada *</label>
                <select
                  value={ficha.forma_entrada}
                  onChange={(e) => atualizarCampo('forma_entrada', e.target.value)}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', boxSizing: 'border-box' }}
                >
                  <option value="Pix">Pix</option>
                  <option value="Cartão de Crédito">Cartão de Crédito</option>
                  <option value="Cartão de Débito">Cartão de Débito</option>
                  <option value="Link de Pagamento">Link de Pagamento</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>Cashback Abatido (R$)</label>
                <input
                  type="number"
                  value={ficha.cashback}
                  onChange={(e) => atualizarCampo('cashback', Number(e.target.value))}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>Desconto Comercial (R$)</label>
                <input
                  type="number"
                  value={ficha.desconto}
                  onChange={(e) => atualizarCampo('desconto', Number(e.target.value))}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>Parcelas do Restante</label>
                <input
                  type="number"
                  min="1"
                  max="24"
                  value={ficha.parcelas}
                  onChange={(e) => atualizarCampo('parcelas', Number(e.target.value))}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>Forma do Restante</label>
                <select
                  value={ficha.forma_restante}
                  onChange={(e) => atualizarCampo('forma_restante', e.target.value)}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', boxSizing: 'border-box' }}
                >
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
            <h3 style={{ margin: '0 0 1.25rem 0', color: '#0f172a', fontSize: '1.15rem' }}>4. Programa & Cronograma</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>Mês do Encontro / Turma</label>
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
                    const mapaCat = { 'Fechou GIANTS': 'GIANTS', 'Fechou PAC': 'PAC', 'Downsell PAC': 'PAC', 'Fechou AE': 'AE' };
                    const novaCat = mapaCat[resVal];
                    if (novaCat && novaCat !== ficha.categoria_produto) {
                      const primeiroSub = catalogoProdutos.find(
                        (p) => String(p.categoria || '').toUpperCase() === novaCat && p.tipo_item === 'PRINCIPAL'
                      );
                      setFicha((prev) => ({
                        ...prev,
                        resultado_comercial: resVal,
                        categoria_produto: novaCat,
                        produto_nome: primeiroSub ? primeiroSub.nome : prev.produto_nome
                      }));
                    } else {
                      atualizarCampo('resultado_comercial', resVal);
                    }
                  }}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', boxSizing: 'border-box' }}
                >
                  <option value="">Selecione o resultado</option>
                  <option value="Fechou GIANTS">Fechou GIANTS</option>
                  <option value="Fechou PAC">Fechou PAC</option>
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

        {/* ETAPA 6: REVISÃO */}
        {etapaAtual === 6 && (
          <div>
            <h3 style={{ margin: '0 0 1.25rem 0', color: '#0f172a', fontSize: '1.15rem' }}>6. Revisão Final e Envio</h3>

            {(() => {
              const fmtBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
              const valorTabela = Number(calc?.contrato || 0);
              const valorBase = Number(calc?.valorBase || 0);
              const valorAdicionais = Number(calc?.totalAdicionais || 0);
              const valorNegociado = Number(calc?.valorNegociado || valorTabela || 0);
              const cbAlmoco = Number(ficha.cashback_almoco_cnpj || 0);
              const cbUpgradeBruto = Number(ficha.cashback_upgrade_cnpj || 0);
              const cbUpgradeAplicado = ficha.categoria_produto === 'GIANTS' ? cbUpgradeBruto : 0;
              const cbTotalAbatido = Number(calc?.cashback ?? ficha.cashback ?? (cbAlmoco + cbUpgradeAplicado));
              const descontoComercial = Number(calc?.desconto ?? ficha.desconto_comercial ?? ficha.desconto_concedido ?? ficha.desconto ?? 0);
              const saldoLiquido = Math.max(0, valorNegociado - cbTotalAbatido - descontoComercial);
              const valorEntrada = Number(calc?.entrada ?? ficha.valor_entrada ?? 0);
              const saldoRestante = Number(calc?.saldo ?? Math.max(0, saldoLiquido - valorEntrada));
              const qtdParcelas = Math.max(1, Number(calc?.parcelas || ficha.parcelas || 12));
              const valorParcela = Number(calc?.valorParcela ?? (saldoRestante / qtdParcelas));
              const isAE = /ACELERADOR|\bAE\b|ACE\d/i.test(ficha.historico_produtos_elegiveis || '');

              const listaSocios =
                (typeof sociosQueEntram !== 'undefined' && Array.isArray(sociosQueEntram) && sociosQueEntram) ||
                (Array.isArray(ficha?.socios) && ficha.socios) ||
                [];

              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '1.15rem', margin: '1.25rem 0' }}>
                  {/* CARD 1: EMPRESA, CNPJ & PARTICIPANTES NO CONTRATO */}
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      1. Empresa & Sócios no Contrato
                    </div>
                    <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#0f172a', lineHeight: '1.25' }}>
                      {ficha.razao_social || ficha.empresa || ficha.nome_fantasia || 'Empresa não informada'}
                    </div>
                    {ficha.nome_fantasia && ficha.nome_fantasia !== (ficha.razao_social || ficha.empresa) && (
                      <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                        Fantasia: <strong>{ficha.nome_fantasia}</strong>
                      </div>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.8rem', color: '#334155' }}>
                      <span style={{ background: '#e2e8f0', padding: '0.15rem 0.5rem', borderRadius: '6px', fontWeight: '700' }}>
                        CNPJ: {ficha.cnpj || ficha.cpf_cnpj || 'Não informado'}
                      </span>
                      {(ficha.cidade || ficha.estado) && (
                        <span style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '0.15rem 0.5rem', borderRadius: '6px' }}>
                          {[ficha.cidade, ficha.estado].filter(Boolean).join(' - ')}
                        </span>
                      )}
                    </div>
                    {(ficha.nicho || ficha.telefone || ficha.whatsapp) && (
                      <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                        {ficha.nicho && <span>Nicho: <strong>{ficha.nicho}</strong>{ficha.telefone || ficha.whatsapp ? ' • ' : ''}</span>}
                        {(ficha.telefone || ficha.whatsapp) && <span>Contato: <strong>{ficha.telefone || ficha.whatsapp}</strong></span>}
                      </div>
                    )}
                    <div style={{ marginTop: '0.35rem', paddingTop: '0.55rem', borderTop: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '0.76rem', fontWeight: '800', color: '#047857', marginBottom: '0.35rem' }}>
                        Participantes Vinculados ao Contrato ({Math.max(1, listaSocios.length)}):
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#1e293b', display: 'flex', flexDirection: 'column', gap: '0.28rem' }}>
                        {listaSocios.length > 0 ? (
                          listaSocios.map((s, idx) => (
                            <div key={s.id || idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff', padding: '0.32rem 0.55rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                              <span>
                                <strong style={{ color: '#10b981' }}>✓</strong> {s.nome || s.nome_participante}
                              </span>
                              <span style={{ fontSize: '0.7rem', fontWeight: '700', color: idx === 0 || s.isTitular ? '#047857' : '#b45309', background: idx === 0 || s.isTitular ? '#ecfdf5' : '#fffbeb', padding: '0.12rem 0.45rem', borderRadius: '4px' }}>
                                {idx === 0 || s.isTitular ? 'Titular (Base)' : 'Adicional'}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div style={{ background: '#ffffff', padding: '0.32rem 0.55rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                            <strong style={{ color: '#10b981' }}>✓</strong> {ficha.nome_participante || 'Titular'} <strong>(Titular)</strong>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* CARD 2: DEMONSTRATIVO FINANCEIRO & CASHBACK DETALHADO */}
                  <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.45rem', boxShadow: '0 2px 6px rgba(15,23,42,0.03)' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.15rem' }}>
                      2. Demonstrativo Financeiro & Cashback
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', gap: '0.5rem' }}>
                      <span style={{ color: '#64748b' }}>Linha / Plano:</span>
                      <strong style={{ color: '#0f172a', textAlign: 'right' }}>
                        {ficha.produto_nome || ficha.categoria_produto || 'Não selecionado'}
                      </strong>
                    </div>

                    {valorAdicionais > 0 && (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#475569' }}>
                          <span>• Titular (Base):</span>
                          <span>{fmtBRL(valorBase)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#475569' }}>
                          <span>• Sócios Adicionais ({Math.max(1, listaSocios.length - 1)}):</span>
                          <span>+ {fmtBRL(valorAdicionais)}</span>
                        </div>
                      </>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem' }}>
                      <span style={{ color: '#64748b' }}>Valor Tabela Total:</span>
                      <span style={{ color: '#334155', fontWeight: '700' }}>{fmtBRL(valorTabela)}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
                      <span style={{ color: '#0f172a', fontWeight: '700' }}>Valor Negociado:</span>
                      <strong style={{ color: '#059669' }}>{fmtBRL(valorNegociado)}</strong>
                    </div>

                    {cbAlmoco > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#047857', background: '#ecfdf5', padding: '0.28rem 0.55rem', borderRadius: '6px', border: '1px solid #a7f3d0' }}>
                        <span>(-) Cashback Almoço Pago:</span>
                        <strong>- {fmtBRL(cbAlmoco)}</strong>
                      </div>
                    )}

                    {cbUpgradeBruto > 0 && (
                      <div style={{ fontSize: '0.8rem', color: '#047857', background: '#ecfdf5', padding: '0.32rem 0.55rem', borderRadius: '6px', border: '1px solid #a7f3d0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>(-) Upgrade {isAE ? '100% AE' : '90% PAC'}:</span>
                          <strong>- {fmtBRL(cbUpgradeAplicado)}</strong>
                        </div>
                        {ficha.historico_produtos_elegiveis && (
                          <div style={{ fontSize: '0.71rem', color: '#065f46', marginTop: '0.15rem' }}>
                            Origem: {ficha.historico_produtos_elegiveis} {ficha.categoria_produto !== 'GIANTS' ? '(Exclusivo GIANTS)' : ''}
                          </div>
                        )}
                      </div>
                    )}

                    {cbTotalAbatido > 0 && Math.abs(cbTotalAbatido - (cbAlmoco + cbUpgradeAplicado)) > 0.01 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#047857', background: '#ecfdf5', padding: '0.28rem 0.55rem', borderRadius: '6px', border: '1px solid #a7f3d0' }}>
                        <span>(-) Cashback Total Abatido:</span>
                        <strong>- {fmtBRL(cbTotalAbatido)}</strong>
                      </div>
                    )}

                    {descontoComercial > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#b91c1c', background: '#fef2f2', padding: '0.28rem 0.55rem', borderRadius: '6px', border: '1px solid #fecaca' }}>
                        <span>(-) Desconto Comercial:</span>
                        <strong>- {fmtBRL(descontoComercial)}</strong>
                      </div>
                    )}

                    <div style={{ marginTop: 'auto', paddingTop: '0.65rem', borderTop: '1.5px dashed #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.88rem', fontWeight: '800', color: '#0f172a' }}>Saldo Líquido do Contrato:</span>
                      <span style={{ fontSize: '1.15rem', fontWeight: '900', color: '#ea580c' }}>
                        {fmtBRL(saldoLiquido)}
                      </span>
                    </div>
                  </div>

                  {/* CARD 3: CONDIÇÕES DE PAGAMENTO & RESULTADO COMERCIAL */}
                  <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '12px', padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#c2410c', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        3. Pagamento & Status
                      </span>
                      <span style={{ background: '#ffedd5', color: '#9a3412', border: '1px solid #fdba74', padding: '0.18rem 0.6rem', borderRadius: '999px', fontSize: '0.76rem', fontWeight: '800' }}>
                        {ficha.resultado_comercial || 'Em Negociação'}
                      </span>
                    </div>

                    <div style={{ background: '#ffffff', padding: '0.75rem 0.9rem', borderRadius: '8px', border: '1px solid #fed7aa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#9a3412' }}>ENTRADA</div>
                        <div style={{ fontSize: '0.8rem', color: '#c2410c', fontWeight: '600' }}>
                          Forma: {ficha.forma_entrada || 'Pix'}
                        </div>
                      </div>
                      <div style={{ fontSize: '1.15rem', fontWeight: '900', color: '#ea580c' }}>
                        {fmtBRL(valorEntrada)}
                      </div>
                    </div>

                    <div style={{ background: '#ffffff', padding: '0.75rem 0.9rem', borderRadius: '8px', border: '1px solid #fed7aa', flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#9a3412' }}>SALDO RESTANTE PARCELADO</div>
                          <div style={{ fontSize: '0.8rem', color: '#c2410c', fontWeight: '600' }}>
                            Forma: {ficha.forma_restante || 'Pix'}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#0f172a' }}>
                            {qtdParcelas}x de {fmtBRL(valorParcela)}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#9a3412', fontWeight: '700', marginTop: '0.15rem' }}>
                            Total Restante: {fmtBRL(saldoRestante)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {(ficha.resultado_obs || ficha.resumo_entrevista) && (
                      <div style={{ fontSize: '0.76rem', color: '#7c2d12', background: '#ffedd5', padding: '0.45rem 0.65rem', borderRadius: '6px' }}>
                        <strong>Obs.:</strong> {ficha.resultado_obs || ficha.resumo_entrevista}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

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
                  ✔ Ficha da empresa e sócios vinculados prontos para registro no servidor.
                </span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                disabled={!podeSubmeter || salvando || Boolean(ficha.ficha_fechada)}
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
                {ficha.ficha_fechada ? 'Ficha Encerrada (Aguardando Financeiro)' : salvando ? 'Registrando...' : 'Confirmar e Gravar Ficha da Empresa'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Controles de navegação */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          disabled={etapaAtual === 1}
          onClick={() => setEtapaAtual((e) => Math.max(1, e - 1))}
          style={{ background: '#fff', border: '1px solid #cbd5e1', padding: '0.5rem 1.25rem', borderRadius: '8px', fontWeight: '600', cursor: etapaAtual === 1 ? 'not-allowed' : 'pointer', opacity: etapaAtual === 1 ? 0.5 : 1 }}
        >
          Voltar Etapa
        </button>

        <button
          disabled={etapaAtual === 6}
          onClick={() => setEtapaAtual((e) => Math.min(6, e + 1))}
          style={{ background: '#0f172a', color: '#fff', border: 'none', padding: '0.5rem 1.25rem', borderRadius: '8px', fontWeight: '600', cursor: etapaAtual === 6 ? 'not-allowed' : 'pointer', opacity: etapaAtual === 6 ? 0.5 : 1 }}
        >
          Avançar Etapa
        </button>
      </div>
    </div>
  );
}