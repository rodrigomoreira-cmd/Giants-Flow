import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { alertaSistema, confirmarSistema } from '../context/ModalContext';

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
  const [modalConfirmarFinalizacao, setModalConfirmarFinalizacao] = useState(false);
  const [erro, setErro] = useState('');
  const [catalogoProdutos, setCatalogoProdutos] = useState([]);
  const [modalConclusao, setModalConclusao] = useState(null);
  const [modalAviso, setModalAviso] = useState(null);
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
  const isAdmin = ['ADMIN', 'ADMINISTRADOR', 'SUPERADMIN', 'MASTER', 'SYSTEM', 'DIRETOR'].includes(papelUsuario) || Boolean(sessaoOperador?.usuario?.is_admin);

  // Lista de sócios da empresa (cadastrados na turma + adicionados na hora do fechamento)
  const [sociosLista, setSociosLista] = useState([]);
  const [novoSocioNome, setNovoSocioNome] = useState('');
  const [novoSocioTelefone, setNovoSocioTelefone] = useState('');
  const [usarEntradaFutura, setUsarEntradaFutura] = useState(false);
  const [usarPermuta, setUsarPermuta] = useState(false);

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
    momento_aplicacao: '',
    momento_outro_detalhe: '',

    // Etapa 2 - Negociação
    categoria_produto: 'GIANTS',
    produto_nome: 'GIANTS - Titular (Empresa)',
    socios: 1,
    forma_entrada: 'Pix',
    valor_entrada: 10000,
    valor_entrada_complementar: '',
    data_entrada_complementar: '',
    valor_permuta: '',
    identificador_pagamento: '',
    parecer_financeiro: '',
    pagamentosEntrada: [{ forma: 'Pix', valor: 10000, identificador: '', parcelasCartao: 1, comprovante: null }],
    comprovanteEntrada: null,
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
          const alvoEhGiants =
            Boolean(clienteEncontrado.membro_giants) ||
            String(clienteEncontrado.origem || '').toUpperCase().includes('GIAN');
          const rawCnpj = String(clienteEncontrado.cnpj || '').replace(/\D/g, '');
          const rawDoc = String(clienteEncontrado.cpf_cnpj || '').replace(/\D/g, '');
          const cnpjDigits = rawCnpj.length === 14 ? rawCnpj : (rawDoc.length === 14 ? rawDoc : '');
          const cnpjTitular = cnpjDigits ? (clienteEncontrado.cnpj || clienteEncontrado.cpf_cnpj || '') : '';
          const empTitular = clienteEncontrado.empresa || clienteEncontrado.razao_social || 'Empresa SGA';
          const empNorm = normalizarEmpresa(empTitular);
          const nomeTitular = clienteEncontrado.nome_participante || clienteEncontrado.nome || clienteEncontrado.nome_completo || '';

          // GIANTS: cliente único (sem agrupar sócios). AE/PAC: agrupa sócios não-GIANTS pelo CNPJ (14 dígitos)
          const sociosMesmaEmpresa = alvoEhGiants
            ? [clienteEncontrado]
            : lista.filter((c) => {
                if (Boolean(c.membro_giants) || String(c.origem || '').toUpperCase().includes('GIAN')) return false;
                const cCnpj = String(c.cnpj || '').replace(/\D/g, '');
                const cDoc = String(c.cpf_cnpj || '').replace(/\D/g, '');
                const cDigits = cCnpj.length === 14 ? cCnpj : (cDoc.length === 14 ? cDoc : '');
                if (cnpjDigits.length === 14 && cDigits === cnpjDigits) return true;
                if (empNorm && empNorm !== 'empresa sga' && normalizarEmpresa(c.empresa) === empNorm) return true;
                return String(c.id) === String(clienteEncontrado.id);
              });

          const listaInicialSocios = (typeof sociosMesmaEmpresa !== 'undefined' ? sociosMesmaEmpresa : []).map((s, idx) => ({
            id: s.id,
            nome: s.nome_participante || s.nome || `Participante #${s.id}`,
            cpf: '',
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
            ficha_fechada: Boolean(clienteEncontrado.ficha_fechada) || ['aguardando_aprovacao', 'fechamento', 'concluido', 'reprovado'].includes(String(clienteEncontrado.etapa_funil || '').toLowerCase()),
            status_aprovacao: clienteEncontrado.status_aprovacao || '',
            turma_id: Number(clienteEncontrado.turma_id || turmaAtiva),
            razao_social: empTitular,
            cnpj: cnpjTitular,
            nome_fantasia: clienteEncontrado.nome_fantasia || empTitular,
            nome_empresario: nomeTitular,
            telefone: clienteEncontrado.telefone || clienteEncontrado.whatsapp || clienteEncontrado.celular || '',
            email: clienteEncontrado.email || '',
            almoco_pago: temAlmocoPago,
            cashback_almoco_cnpj: cashbackAlmocoCnpj,
            cashback_upgrade_cnpj: cashbackUpgradeCnpj,
            historico_produtos_elegiveis: historicoElegivel,
            cashback: cashbackAlmocoCnpj + cashbackUpgradeCnpj,
            socios: qtdEntrando,
            parecer_financeiro: clienteEncontrado.parecer_financeiro || '',
            momento_aplicacao: clienteEncontrado.momento_aplicacao || '',
            momento_outro_detalhe:
              clienteEncontrado.momento_aplicacao && !['Coffee', 'Almoço', 'Janta'].includes(clienteEncontrado.momento_aplicacao)
                ? clienteEncontrado.momento_aplicacao
                : '',
            periodo_entrevista:
              clienteEncontrado.momento_aplicacao === 'Janta' ? 'Jantar' : 'Almoço',
            ...(clienteEncontrado.dados_proposta && typeof clienteEncontrado.dados_proposta === 'object'
              ? {
                  categoria_produto: clienteEncontrado.dados_proposta.categoriaProduto || 'GIANTS',
                  produto_nome: clienteEncontrado.dados_proposta.produtoNome || 'GIANTS - Titular (Empresa)',
                  valor_entrada: Number(clienteEncontrado.dados_proposta.valorEntrada ?? 10000),
                  forma_entrada: clienteEncontrado.dados_proposta.formaEntrada || 'Pix',
                  valor_entrada_complementar: clienteEncontrado.dados_proposta.entradaComplementar || '',
                  data_entrada_complementar: clienteEncontrado.dados_proposta.dataEntradaComplementar || '',
                  valor_permuta: clienteEncontrado.dados_proposta.permuta || '',
                  identificador_pagamento: clienteEncontrado.dados_proposta.identificadorPagamento || '',
                  cashback: Number(clienteEncontrado.dados_proposta.cashback ?? (cashbackAlmocoCnpj + cashbackUpgradeCnpj)),
                  parcelas: Number(clienteEncontrado.dados_proposta.quantidadeParcelas ?? 12),
                  forma_restante: clienteEncontrado.dados_proposta.formaRestante || 'Pix',
                  desconto: Number(clienteEncontrado.dados_proposta.desconto ?? 0),
                  resultado_obs: clienteEncontrado.dados_proposta.observacoes || '',
                  pagamentosEntrada:
                    Array.isArray(clienteEncontrado.dados_proposta.pagamentosEntrada) &&
                    clienteEncontrado.dados_proposta.pagamentosEntrada.length > 0
                      ? clienteEncontrado.dados_proposta.pagamentosEntrada
                      : [
                          {
                            forma: clienteEncontrado.dados_proposta.formaEntrada || 'Pix',
                            valor: Number(clienteEncontrado.dados_proposta.valorEntrada ?? 10000),
                            identificador: clienteEncontrado.dados_proposta.identificadorPagamento || ''
                          }
                        ]
                }
              : {})
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
      alertaSistema('Informe o nome completo do sócio ou participante adicional.');
      return;
    }
    const novoItem = {
      id: `ext-${Date.now()}`,
      nome: novoSocioNome.trim(),
      cpf: '',
      telefone: novoSocioTelefone.trim(),
      cargo: 'Sócio Adicional (Novo)',
      titular: false,
      entraNoContrato: true,
      externo: true
    };
    sincronizarSociosNoContrato([...sociosLista, novoItem]);
    setNovoSocioNome('');
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

  const formatarDataBR = (valor) => {
    const s = String(valor || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, d] = s.split('-');
      return `${d}/${m}/${y}`;
    }
    return s;
  };

  const paraInputDate = (valor) => {
    const s = String(valor || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return '';
  };

  const formatarLinhaPagamentoLabel = (pg) => {
    const parcStr =
      pg.forma === 'Cartão de Crédito' && Number(pg.parcelasCartao || 1) > 1
        ? ` (${pg.parcelasCartao}x maq.)`
        : '';
    return `${pg.forma || 'Pix'}${parcStr}`;
  };

  const sincronizarPagamentosEntrada = (novasLinhas) => {
    const listaSegura =
      novasLinhas.length > 0
        ? novasLinhas
        : [{ forma: 'Pix', valor: 0, identificador: '', parcelasCartao: 1, comprovante: null }];
    const soma = listaSegura.reduce((acc, item) => acc + Math.max(0, Number(item.valor) || 0), 0);
    const idsConcat = listaSegura
      .map((item) => (item.identificador ? `${formatarLinhaPagamentoLabel(item)}: ${item.identificador}` : ''))
      .filter(Boolean)
      .join(' | ');
    setFicha((prev) => ({
      ...prev,
      pagamentosEntrada: listaSegura,
      valor_entrada: soma,
      forma_entrada: listaSegura[0]?.forma || prev.forma_entrada,
      identificador_pagamento: idsConcat
    }));
  };

  const aplicarValorEntradaSincronizado = (novoTotal, camposExtras = {}) => {
    const valorNum = Math.max(0, Number(novoTotal) || 0);
    setFicha((prev) => {
      const atuais =
        Array.isArray(prev.pagamentosEntrada) && prev.pagamentosEntrada.length > 0
          ? [...prev.pagamentosEntrada]
          : [{ forma: prev.forma_entrada || 'Pix', valor: valorNum, identificador: prev.identificador_pagamento || '', parcelasCartao: 1, comprovante: null }];

      let novasLinhas;
      if (atuais.length === 1) {
        novasLinhas = [{ ...atuais[0], valor: valorNum }];
      } else {
        const somaDemais = atuais.slice(1).reduce((acc, item) => acc + Math.max(0, Number(item.valor) || 0), 0);
        if (valorNum > somaDemais) {
          novasLinhas = [{ ...atuais[0], valor: Math.round((valorNum - somaDemais) * 100) / 100 }, ...atuais.slice(1)];
        } else {
          novasLinhas = [{ ...atuais[0], valor: valorNum }];
        }
      }

      return {
        ...prev,
        ...camposExtras,
        valor_entrada: valorNum,
        pagamentosEntrada: novasLinhas
      };
    });
  };

  const anexarComprovanteNaLinha = (indiceLinha, objComp) => {
    setFicha((prev) => {
      const atuais = Array.isArray(prev.pagamentosEntrada) && prev.pagamentosEntrada.length > 0
        ? [...prev.pagamentosEntrada]
        : [{ forma: prev.forma_entrada || 'Pix', valor: prev.valor_entrada || 0, identificador: prev.identificador_pagamento || '', comprovante: null }];

      const alvoIdx =
        indiceLinha !== null && indiceLinha !== undefined
          ? indiceLinha
          : Math.max(0, atuais.findIndex((item) => !item.comprovante));

      if (atuais[alvoIdx]) {
        atuais[alvoIdx] = { ...atuais[alvoIdx], comprovante: objComp };
      }

      const primeiroComp = atuais.map((x) => x.comprovante).find(Boolean) || null;
      return {
        ...prev,
        pagamentosEntrada: atuais,
        comprovanteEntrada: primeiroComp
      };
    });
  };

  const processarArquivoComprovante = (file, indiceLinha = null) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setErro('O comprovante deve ter no máximo 8 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (file.type.startsWith('image/')) {
        const img = new Image();
        img.onload = () => {
          const maxW = 1280;
          const scale = img.width > maxW ? maxW / img.width : 1;
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const comprimido = canvas.toDataURL('image/jpeg', 0.78);
          anexarComprovanteNaLinha(indiceLinha, {
            nome: file.name || 'comprovante.jpg',
            tipo: 'image/jpeg',
            dataUrl: comprimido
          });
        };
        img.src = dataUrl;
      } else {
        anexarComprovanteNaLinha(indiceLinha, {
          nome: file.name || 'comprovante.pdf',
          tipo: file.type || 'application/pdf',
          dataUrl
        });
      }
    };
    reader.readAsDataURL(file);
  };

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
    const cashback = catUpper === 'PAC' ? 0 : Math.max(0, Number(ficha.cashback) || 0);
    const entradaComplementar = Math.max(0, Number(ficha.valor_entrada_complementar) || 0);
    const permuta = Math.max(0, Number(ficha.valor_permuta) || 0);
    const saldo = Math.max(0, valorNegociado - entrada - entradaComplementar - permuta - cashback);
    const parcelas = Math.max(1, Number(ficha.parcelas) || 1);
    const valorParcela = saldo > 0 ? saldo / parcelas : 0;

    const motivosAprovacao = [];
    if (desconto > 0) motivosAprovacao.push(`Desconto concedido: R$ ${desconto.toLocaleString('pt-BR')}`);
    if (permuta > 0) motivosAprovacao.push(`Abatimento em Permuta: R$ ${permuta.toLocaleString('pt-BR')}`);
    if (valorParcela > 0 && entrada + 0.05 < valorParcela) {
      motivosAprovacao.push(
        `Entrada de R$ ${entrada.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} abaixo do mínimo de 1 parcela (R$ ${valorParcela.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`
      );
    }
    if (ficha.forma_restante === 'Boleto') motivosAprovacao.push('Restante em Boleto bancário (requer 2 aprovadores)');
    if (ficha.desc_dif?.trim()) motivosAprovacao.push('Condição especial declarada');

    return {
      entradaComplementar,
      permuta,
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

  useEffect(() => {
    if (Number(ficha.valor_entrada_complementar || 0) > 0) setUsarEntradaFutura(true);
    if (Number(ficha.valor_permuta || 0) > 0) setUsarPermuta(true);
  }, [ficha.valor_entrada_complementar, ficha.valor_permuta]);

  const camposFaltantes = [];
  if (!ficha.razao_social?.trim()) camposFaltantes.push('Razão Social / Empresa');
  if (!ficha.nome_empresario?.trim()) camposFaltantes.push('Nome do empresário titular');
  if (!ficha.forma_entrada) camposFaltantes.push('Forma de entrada');
  if (ficha.valor_entrada === undefined || ficha.valor_entrada === null) camposFaltantes.push('Valor de entrada');
  if (!ficha.resultado_comercial) camposFaltantes.push('Resultado comercial');
  if (['Fechou GIANTS', 'Fechou PAC', 'Downsell PAC', 'Fechou AE'].includes(ficha.resultado_comercial)) {
    if (Number(ficha.valor_entrada_complementar || 0) > 0 && !String(ficha.data_entrada_complementar || '').trim()) {
      camposFaltantes.push('Data da entrada futura');
    }
    if (Number(ficha.valor_permuta || 0) > 0 && !String(ficha.resultado_obs || '').trim()) {
      camposFaltantes.push('Descrição da permuta nas observações');
    }
  }

  const podeSubmeter = camposFaltantes.length === 0;

  const reabrirFichaDireto = async () => {
    if (!isAdmin || reabrindoFicha) return;
    try {
      setReabrindoFicha(true);
      await api.post('/entrevistas/reabrir', {
        fichaId: Number(ficha.aplicacao_id || id),
        turmaId: ficha.turma_id || 1491,
        cnpj: ficha.cnpj,
        empresa: ficha.razao_social,
        papel: papelUsuario || 'ADMIN'
      });
      setFicha((prev) => ({
        ...prev,
        ficha_fechada: false,
        status_aprovacao: '',
        etapa_funil: 'entrevista'
      }));
      setModalAviso({
        tipo: 'sucesso',
        titulo: 'Ficha Reaberta (Administrador)',
        mensagem: 'A ficha foi desbloqueada para edição. Após ajustar os dados, finalize novamente para gravar.'
      });
    } catch (err) {
      setModalAviso({
        tipo: 'erro',
        titulo: 'Erro ao Reabrir Ficha',
        mensagem: err.message || 'Não foi possível reabrir a ficha.'
      });
    } finally {
      setReabrindoFicha(false);
    }
  };

  const submeterFicha = async () => {
    if (ficha.ficha_fechada) {
      setModalAviso({ tipo: 'aviso', titulo: 'Ficha Encerrada', mensagem: 'Esta ficha já está encerrada e aguardando aprovação do financeiro.' });
      return;
    }
    if (!podeSubmeter) {
      setModalAviso({ tipo: 'erro', titulo: 'Campos Obrigatórios Pendentes', mensagem: 'Preencha os seguintes campos antes de registrar: ' + camposFaltantes.join(', ') });
      return;
    }

    setModalConfirmarFinalizacao(true);
  };

  const confirmarGravacaoFicha = async () => {
    if (ficha.ficha_fechada || salvando) return;
    try {
      setSalvando(true);
      const appTargetId = Number(ficha.aplicacao_id || id);
      const resumoSocios = sociosQueEntram.map((s) => s.nome).join(', ');
      const gerouProposta = ['Fechou GIANTS', 'Fechou PAC', 'Downsell PAC', 'Fechou AE'].includes(ficha.resultado_comercial);

      // 1. Se gerou fechamento, emite a proposta comercial primeiro
      if (gerouProposta) {
        const prodMatch =
          catalogoProdutos.find((p) => p.nome === ficha.produto_nome) ||
          catalogoProdutos.find((p) => String(p.categoria || '').toUpperCase() === String(ficha.categoria_produto || '').toUpperCase() && p.tipo_item === 'PRINCIPAL');

        await api.post('/propostas', {
          aplicacao_id: appTargetId,
          turma_id: ficha.turma_id || 1491,
          produto_id: prodMatch ? prodMatch.id : null,
          categoria_produto: ficha.categoria_produto,
          produto_nome: ficha.produto_nome,
          empresa: ficha.razao_social,
          cnpj: ficha.cnpj,
          participante_nome: ficha.nome_empresario,
          socios_quantidade: sociosQueEntram.length,
          socios_lista: sociosQueEntram,
          valor_tabela: calc.contrato,
          valor_negociado: calc.valorNegociado,
          desconto: calc.desconto,
          cashback: calc.cashback,
          valor_entrada: calc.entrada,
          forma_entrada: ficha.forma_entrada,
          valor_entrada_complementar: calc.entradaComplementar,
          data_entrada_complementar: formatarDataBR(ficha.data_entrada_complementar) || '',
          valor_permuta: calc.permuta,
          identificador_pagamento: ficha.identificador_pagamento || '',
          pagamentosEntrada: ficha.pagamentosEntrada || [],
          comprovanteEntrada: ficha.comprovanteEntrada || null,
          saldo_restante: calc.saldo,
          parcelas: calc.parcelas,
          valor_parcela: calc.valorParcela,
          forma_restante: ficha.forma_restante,
          observacoes: ficha.resultado_obs || ficha.resumo_entrevista || ''
        });
      }

      // 2. Encerra a entrevista no backend, bloqueia a ficha e libera a mesa de toda a empresa
      await api.post('/entrevistas/resultado', {
        aplicacaoId: appTargetId,
        turmaId: ficha.turma_id || 1491,
        turno: (ficha.momento_aplicacao || ficha.periodo_entrevista) === 'Janta' || ficha.periodo_entrevista === 'Jantar' ? 'jantar' : 'almoco',
        momentoAplicacao:
          ficha.momento_aplicacao === 'Outro Momento'
            ? (ficha.momento_outro_detalhe?.trim() || 'Outro Momento')
            : (ficha.momento_aplicacao || ficha.periodo_entrevista || ''),
        resultado: ficha.resultado_comercial,
        sociosIds: sociosLista.map((s) => Number(s.id)).filter((n) => Number.isInteger(n) && n > 0),
        observacao: `[${ficha.resultado_comercial}] Empresa: ${ficha.razao_social} | Sócios no contrato (${sociosQueEntram.length}): ${resumoSocios} | ${ficha.resultado_obs || ''} | Resumo: ${ficha.resumo_entrevista || 'N/A'}`
      });

      // 3. Bloqueia a ficha e o botão em tela até um Administrador reabrir e volta para a tela de Entrevistas
      setFicha((prev) => ({
        ...prev,
        ficha_fechada: true,
        etapa_funil: gerouProposta ? 'aguardando_aprovacao' : 'concluido',
        status_aprovacao: gerouProposta ? 'pendente' : prev.status_aprovacao
      }));
      setModalConfirmarFinalizacao(false);

      navigate('/interviews', {
        state: {
          fichaFinalizada: {
            empresa: ficha.razao_social,
            resultado: ficha.resultado_comercial
          }
        }
      });
    } catch (err) {
      setModalConfirmarFinalizacao(false);
      setModalAviso({
        tipo: 'erro',
        titulo: 'Erro ao Registrar Entrevista',
        mensagem: err.message || 'Não foi possível concluir a finalização da ficha.'
      });
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
      setModalAviso({ tipo: 'erro', titulo: 'Erro ao Reabrir Ficha', mensagem: err.message });
    } finally {
      setReabrindoFicha(false);
    }
  };

  const gerouFechamentoComercial = ['Fechou GIANTS', 'Fechou PAC', 'Downsell PAC', 'Fechou AE'].includes(ficha.resultado_comercial);

  const alternarChipTexto = (campo, chip) => {
    const atual = String(ficha[campo] || '').trim();
    const partes = atual ? atual.split(' • ').map((p) => p.trim()).filter(Boolean) : [];
    const existe = partes.includes(chip);
    const novasPartes = existe ? partes.filter((p) => p !== chip) : [...partes, chip];
    atualizarCampo(campo, novasPartes.join(' • '));
  };

  const chipAtivo = (campo, chip) =>
    String(ficha[campo] || '')
      .split(' • ')
      .map((p) => p.trim())
      .includes(chip);

  const CHIPS_DORES = [
    'Gargalo comercial / vendas',
    'Dependência do dono',
    'Falta de processos e gestão',
    'Margem / lucro apertado',
    'Time desalinhado / contratação',
    'Escala e expansão'
  ];

  const CHIPS_OBJECOES = [
    'Alinhar com sócio ausente',
    'Fluxo de caixa / momento financeiro',
    'Priorizando outras demandas agora',
    'Vai avaliar proposta com calma',
    'Sem fit para o programa atual'
  ];

  const OPCOES_RESULTADO = [
    { valor: 'Fechou GIANTS', titulo: 'Fechou GIANTS', sub: 'Programa 360°', cat: 'GIANTS', cor: '#15803d', bg: '#f0fdf4', borda: '#22c55e' },
    { valor: 'Fechou PAC', titulo: 'Fechou PAC', sub: 'Aceleração Pré-GIANTS', cat: 'PAC', cor: '#0369a1', bg: '#f0f9ff', borda: '#0ea5e9' },
    { valor: 'Fechou AE', titulo: 'Fechou AE', sub: 'Acelerador Empresarial', cat: 'AE', cor: '#7e22ce', bg: '#faf5ff', borda: '#a855f7' },
    { valor: 'Decisão futura', titulo: 'Decisão Futura', sub: 'Follow-up / Retomada', cat: null, cor: '#b45309', bg: '#fffbeb', borda: '#f59e0b' },
    { valor: 'Não fechou', titulo: 'Não Fechou', sub: 'Encerrar sem venda', cat: null, cor: '#475569', bg: '#f8fafc', borda: '#94a3b8' }
  ];

  const obterValorBaseProduto = (cat, prodNome) => {
    const catUpper = String(cat || 'GIANTS').toUpperCase();
    const prod =
      catalogoProdutos.find((p) => p.nome === prodNome) ||
      catalogoProdutos.find((p) => String(p.categoria || '').toUpperCase() === catUpper && p.tipo_item === 'PRINCIPAL');
    const defaults = {
      'GIANTS - Titular (Empresa)': 279000,
      'PAC - Completo': 69900,
      'PAC - Compacto': 59900,
      'AE - Condição Especial (Evento)': 29990,
      'AE - Tabela Regular': 45990
    };
    return prod ? Number(prod.valor_base) : defaults[prodNome] || (catUpper === 'PAC' ? 69900 : 279000);
  };

  const calcularParcelaEntradaPAC = (valorTotal, totalParcelasPlano = 12) => {
    const n = Math.max(1, Number(totalParcelasPlano) || 12);
    return Math.floor((Math.max(0, Number(valorTotal) || 0) / n) * 100) / 100;
  };

  const selecionarResultadoRapido = (op) => {
    if (op.cat) {
      const primeiroSub = catalogoProdutos.find(
        (p) => String(p.categoria || '').toUpperCase() === op.cat && p.tipo_item === 'PRINCIPAL'
      );
      const fallbackSub = {
        GIANTS: 'GIANTS - Titular (Empresa)',
        PAC: 'PAC - Completo',
        AE: 'AE - Condição Especial (Evento)'
      };
      const nomeSub = primeiroSub ? primeiroSub.nome : fallbackSub[op.cat] || ficha.produto_nome;
      const totalPlano = primeiroSub ? Number(primeiroSub.parcelas_padrao || 12) : 12;

      if (op.cat === 'PAC') {
        const basePAC = obterValorBaseProduto('PAC', nomeSub);
        const liquidoPAC = Math.max(0, basePAC - Math.max(0, Number(ficha.desconto) || 0));
        const entrada1Parcela = calcularParcelaEntradaPAC(liquidoPAC, totalPlano);
        aplicarValorEntradaSincronizado(entrada1Parcela, {
          resultado_comercial: op.valor,
          categoria_produto: 'PAC',
          produto_nome: nomeSub,
          cashback: 0,
          parcelas: totalPlano > 1 ? totalPlano - 1 : 1
        });
        return;
      }

      const novoCashback =
        Number(ficha.cashback_almoco_cnpj || 0) +
        (op.cat === 'GIANTS' ? Number(ficha.cashback_upgrade_cnpj || 0) : 0);
      const entradaSugerida = calcularParcelaEntradaPAC(
        Math.max(0, obterValorBaseProduto(op.cat, nomeSub) - novoCashback - Math.max(0, Number(ficha.desconto) || 0)),
        totalPlano > 1 ? totalPlano + 1 : 1
      );
      aplicarValorEntradaSincronizado(entradaSugerida, {
        resultado_comercial: op.valor,
        categoria_produto: op.cat,
        produto_nome: nomeSub,
        parcelas: totalPlano,
        cashback: novoCashback
      });
    } else {
      atualizarCampo('resultado_comercial', op.valor);
    }
  };

  if (carregando) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b', fontWeight: '600' }}>
        Carregando ficha da empresa...
      </div>
    );
  }

  const fmtBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const isFechada = Boolean(ficha.ficha_fechada);
  const isAprovadaFin = ['aprovada', 'aprovado', 'aprovada_com_ressalva'].includes(
    String(ficha.status_aprovacao || '').toLowerCase()
  );

  return (
    <div style={{ padding: '1.5rem 2rem', width: '100%', boxSizing: 'border-box', width: '100%' }}>
      <style>{
        '.ficha-rapida-grid { display: grid; grid-template-columns: minmax(0, 1.85fr) minmax(320px, 1fr); gap: 1.35rem; align-items: start; } ' +
        '@media (max-width: 980px) { .ficha-rapida-grid { grid-template-columns: 1fr; } }'
      }</style>

      {/* CABEÇALHO COMPACTO */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <span style={{ background: '#fff7ed', color: '#ff5722', border: '1px solid #fed7aa', padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '800' }}>
              Ficha Empresa #{id}
            </span>
            {ficha.cnpj && (
              <span style={{ background: '#f1f5f9', color: '#475569', padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.78rem', fontFamily: 'monospace', fontWeight: '700' }}>
                CNPJ: {ficha.cnpj}
              </span>
            )}
            <span style={{ color: '#64748b', fontSize: '0.88rem', fontWeight: '700' }}>• {ficha.razao_social}</span>
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#0f172a', margin: '0.25rem 0 0' }}>
            Atendimento & Fechamento por CNPJ
          </h1>
        </div>

        <button
          type="button"
          onClick={() => navigate('/companies')}
          style={{ background: '#ffffff', border: '1px solid #cbd5e1', color: '#334155', padding: '0.55rem 1rem', borderRadius: '8px', fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer' }}
        >
          Sair e Voltar
        </button>
      </div>

      {erro && (
        <div style={{ background: '#fef2f2', color: '#dc2626', padding: '0.85rem 1rem', borderRadius: '8px', marginBottom: '1rem', border: '1px solid #fecaca', fontSize: '0.85rem', fontWeight: '600' }}>
          {erro}
        </div>
      )}

      {/* NAVEGAÇÃO EM 2 ETAPAS */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setEtapaAtual(1)}
          style={{
            flex: '1 1 240px',
            padding: '0.85rem 1.15rem',
            borderRadius: '10px',
            border: etapaAtual === 1 ? '2px solid #ff5722' : '1px solid #e2e8f0',
            background: etapaAtual === 1 ? '#fff7ed' : '#ffffff',
            color: etapaAtual === 1 ? '#c2410c' : '#475569',
            fontWeight: '800',
            fontSize: '0.9rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            textAlign: 'left'
          }}
        >
          <span>1. Empresa, Sócios & Diagnóstico</span>
          <span style={{ fontSize: '0.75rem', background: etapaAtual === 1 ? '#ff5722' : '#f1f5f9', color: etapaAtual === 1 ? '#fff' : '#64748b', padding: '0.15rem 0.55rem', borderRadius: '999px' }}>
            {sociosQueEntram.length} {sociosQueEntram.length === 1 ? 'sócio' : 'sócios'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setEtapaAtual(2)}
          style={{
            flex: '1 1 240px',
            padding: '0.85rem 1.15rem',
            borderRadius: '10px',
            border: etapaAtual === 2 ? '2px solid #ff5722' : '1px solid #e2e8f0',
            background: etapaAtual === 2 ? '#fff7ed' : '#ffffff',
            color: etapaAtual === 2 ? '#c2410c' : '#475569',
            fontWeight: '800',
            fontSize: '0.9rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            textAlign: 'left'
          }}
        >
          <span>2. Desfecho & Negociação</span>
          <span style={{ fontSize: '0.75rem', background: ficha.resultado_comercial ? '#dcfce7' : '#f1f5f9', color: ficha.resultado_comercial ? '#166534' : '#64748b', padding: '0.15rem 0.55rem', borderRadius: '999px' }}>
            {ficha.resultado_comercial || (isFechada ? 'Encerrada' : 'Pendente')}
          </span>
        </button>
      </div>

      {/* GRID PRINCIPAL: FORMULÁRIO À ESQUERDA + RESUMO FINANCEIRO FIXO À DIREITA */}
      <div className="ficha-rapida-grid">
        <div>
          <div
            data-bloqueio-edicao-ficha="true"
            style={{
              pointerEvents: isFechada ? 'none' : 'auto',
              opacity: isFechada ? 0.86 : 1,
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem'
            }}
          >
            {/* ==================== ETAPA 1: EMPRESA, SÓCIOS & DIAGNÓSTICO ==================== */}
            {etapaAtual === 1 && (
              <>
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.35rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>
                      Dados da Empresa & Momento da Aplicação
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.45rem' }}>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        {[
                          { val: 'Coffee', label: '☕ Coffee' },
                          { val: 'Almoço', label: '🍽️ Almoço' },
                          { val: 'Janta', label: '🌙 Janta' },
                          { val: 'Outro Momento', label: '✨ Outro Momento' }
                        ].map((op) => {
                          const isOutro = op.val === 'Outro Momento';
                          const ativo = isOutro
                            ? ficha.momento_aplicacao === 'Outro Momento' ||
                              (Boolean(ficha.momento_aplicacao) && !['Coffee', 'Almoço', 'Janta'].includes(ficha.momento_aplicacao))
                            : ficha.momento_aplicacao === op.val;
                          return (
                            <button
                              key={op.val}
                              type="button"
                              onClick={() => {
                                atualizarCampo('momento_aplicacao', op.val);
                                atualizarCampo('periodo_entrevista', op.val === 'Janta' ? 'Jantar' : 'Almoço');
                              }}
                              style={{
                                padding: '0.35rem 0.8rem',
                                borderRadius: '999px',
                                border: ativo ? '1.5px solid #ff5722' : '1px solid #cbd5e1',
                                background: ativo ? '#fff7ed' : '#f8fafc',
                                color: ativo ? '#c2410c' : '#475569',
                                fontWeight: '700',
                                fontSize: '0.78rem',
                                cursor: 'pointer'
                              }}
                            >
                              {op.label}
                            </button>
                          );
                        })}
                      </div>
                      {(ficha.momento_aplicacao === 'Outro Momento' ||
                        (Boolean(ficha.momento_aplicacao) && !['Coffee', 'Almoço', 'Janta'].includes(ficha.momento_aplicacao))) && (
                        <input
                          type="text"
                          placeholder="Qual momento? (ex: Happy Hour, Café VIP...)"
                          value={ficha.momento_outro_detalhe || ''}
                          onChange={(e) => {
                            atualizarCampo('momento_outro_detalhe', e.target.value);
                            atualizarCampo('momento_aplicacao', 'Outro Momento');
                          }}
                          style={{
                            padding: '0.35rem 0.7rem',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            fontSize: '0.8rem',
                            minWidth: '240px'
                          }}
                        />
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.95rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>Razão Social / Empresa *</label>
                      <input
                        type="text"
                        value={ficha.razao_social}
                        onChange={(e) => atualizarCampo('razao_social', e.target.value)}
                        disabled={isFechada}
                        style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontWeight: '600' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>CNPJ</label>
                      <input
                        type="text"
                        value={ficha.cnpj}
                        onChange={(e) => atualizarCampo('cnpj', e.target.value)}
                        disabled={isFechada}
                        placeholder="00.000.000/0001-00"
                        style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontFamily: 'monospace' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>Sócio Titular *</label>
                      <input
                        type="text"
                        value={ficha.nome_empresario}
                        onChange={(e) => {
                          const novoNome = e.target.value;
                          atualizarCampo('nome_empresario', novoNome);
                          setSociosLista((prev) => prev.map((s) => (s.titular ? { ...s, nome: novoNome } : s)));
                        }}
                        disabled={isFechada}
                        style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>WhatsApp / Telefone</label>
                      <input
                        type="text"
                        value={ficha.telefone}
                        onChange={(e) => atualizarCampo('telefone', e.target.value)}
                        disabled={isFechada}
                        placeholder="(11) 99999-9999"
                        style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                </div>

                {/* SÓCIOS DO CNPJ */}
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.35rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>
                        Sócios & Participantes no Contrato
                      </h3>
                      <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                        Marque quem fecha junto (sócios não marcados também saem da mesa ao finalizar)
                      </span>
                    </div>
                    <span style={{ background: '#0f172a', color: '#fff', padding: '0.25rem 0.65rem', borderRadius: '999px', fontSize: '0.76rem', fontWeight: '700' }}>
                      {sociosQueEntram.length} no contrato
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginBottom: '1rem' }}>
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
                            padding: '0.7rem 0.9rem',
                            borderRadius: '9px',
                            background: socio.entraNoContrato ? '#fff7ed' : '#f8fafc',
                            border: socio.entraNoContrato ? '1.5px solid #ff5722' : '1px solid #e2e8f0',
                            gap: '0.75rem',
                            flexWrap: 'wrap'
                          }}
                        >
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', cursor: 'pointer', flex: 1 }}>
                            <input
                              type="checkbox"
                              checked={Boolean(socio.entraNoContrato)}
                              disabled={isFechada}
                              onChange={() => alternarSocioContrato(idx)}
                              style={{ width: '17px', height: '17px', accentColor: '#ff5722', cursor: 'pointer' }}
                            />
                            <div>
                              <div style={{ fontWeight: '800', color: '#0f172a', fontSize: '0.88rem' }}>{socio.nome}</div>
                              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                {socio.cargo}
                              </div>
                            </div>
                          </label>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {socio.entraNoContrato ? (
                              <span style={{ fontSize: '0.75rem', fontWeight: '800', padding: '0.22rem 0.6rem', borderRadius: '6px', background: ehTitularContrato ? '#dcfce7' : '#ffedd5', color: ehTitularContrato ? '#166534' : '#9a3412' }}>
                                {ehTitularContrato ? 'Titular (Base)' : 'Adicional (+ ' + fmtBRL(calc.adicionalUnitario) + ')'}
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', background: '#e2e8f0', padding: '0.22rem 0.6rem', borderRadius: '6px' }}>
                                Fora do contrato
                              </span>
                            )}
                            {socio.externo && (
                              <button
                                type="button"
                                disabled={isFechada}
                                onClick={() => removerSocioExterno(idx)}
                                style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '6px', padding: '0.25rem 0.5rem', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer' }}
                              >
                                Remover
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.55rem', paddingTop: '0.85rem', borderTop: '1px dashed #cbd5e1' }}>
                    <input
                      type="text"
                      value={novoSocioNome}
                      onChange={(e) => setNovoSocioNome(e.target.value)}
                      placeholder="+ Nome do sócio adicional"
                      style={{ padding: '0.5rem 0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                    />
                    <button
                      type="button"
                      onClick={adicionarNovoSocio}
                      style={{ background: '#0f172a', color: '#fff', border: 'none', padding: '0.5rem 0.85rem', borderRadius: '8px', fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer' }}
                    >
                      + Incluir Sócio
                    </button>
                  </div>
                </div>

                {/* DIAGNÓSTICO EM 1 TOQUE */}
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.35rem' }}>
                  <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>
                    Diagnóstico Rápido (1 toque)
                  </h3>
                  <p style={{ margin: '0 0 0.85rem 0', fontSize: '0.78rem', color: '#64748b' }}>
                    Toque nas principais dores identificadas na conversa:
                  </p>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginBottom: '0.95rem' }}>
                    {CHIPS_DORES.map((chip) => {
                      const ativo = chipAtivo('dores', chip);
                      return (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => alternarChipTexto('dores', chip)}
                          style={{
                            padding: '0.42rem 0.8rem',
                            borderRadius: '999px',
                            border: ativo ? '1.5px solid #ff5722' : '1px solid #cbd5e1',
                            background: ativo ? '#fff7ed' : '#f8fafc',
                            color: ativo ? '#c2410c' : '#334155',
                            fontWeight: ativo ? '800' : '600',
                            fontSize: '0.78rem',
                            cursor: 'pointer'
                          }}
                        >
                          {ativo ? '✓ ' : '+ '}{chip}
                        </button>
                      );
                    })}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(205px, 1fr))', gap: '0.85rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>Dores / Gargalos Selecionados</label>
                      <input
                        type="text"
                        value={ficha.dores}
                        onChange={(e) => atualizarCampo('dores', e.target.value)}
                        placeholder="Clique nos chips acima ou digite..."
                        style={{ width: '100%', padding: '0.58rem 0.7rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '0.84rem' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#475569', marginBottom: '0.25rem' }}>Nota Rápida da Conversa (Opcional)</label>
                      <input
                        type="text"
                        value={ficha.resumo_entrevista}
                        onChange={(e) => atualizarCampo('resumo_entrevista', e.target.value)}
                        placeholder="Ex: Fatura 300k/mês, quer estruturar time..."
                        style={{ width: '100%', padding: '0.58rem 0.7rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '0.84rem' }}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ==================== ETAPA 2: DESFECHO & NEGOCIAÇÃO ==================== */}
            {etapaAtual === 2 && (
              <>
                {String(ficha.status_aprovacao || '').toLowerCase() === 'ajuste_solicitado' && (
                  <div style={{ background: '#fffbeb', border: '2px solid #f59e0b', borderRadius: '12px', padding: '1rem 1.2rem', color: '#92400e' }}>
                    <div style={{ fontWeight: '900', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <span className="material-symbols-outlined" style={{ color: '#d97706' }}>reply</span>
                      Proposta Devolvida para Ajuste na Mesa
                    </div>
                    <div style={{ fontSize: '0.83rem', marginTop: '0.3rem', fontWeight: '600' }}>
                      Motivo informado: <strong>{ficha.parecer_financeiro || 'Ajustar condições comerciais/pagamento e reenviar.'}</strong>
                    </div>
                  </div>
                )}
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.35rem' }}>
                  <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>
                    1. Qual foi o desfecho na mesa? *
                  </h3>
                  <p style={{ margin: '0 0 0.95rem 0', fontSize: '0.78rem', color: '#64748b' }}>
                    Selecione o resultado para abrir apenas os campos necessários:
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: '0.65rem' }}>
                    {OPCOES_RESULTADO.map((op) => {
                      const selecionado = ficha.resultado_comercial === op.valor || (op.valor === 'Fechou PAC' && ficha.resultado_comercial === 'Downsell PAC');
                      return (
                        <button
                          key={op.valor}
                          type="button"
                          disabled={isFechada}
                          onClick={() => !isFechada && selecionarResultadoRapido(op)}
                          style={{
                            padding: '0.75rem 0.85rem',
                            borderRadius: '10px',
                            border: selecionado ? '2px solid ' + op.borda : '1px solid #e2e8f0',
                            background: selecionado ? op.bg : '#ffffff',
                            textAlign: 'left',
                            cursor: isFechada ? 'not-allowed' : 'pointer',
                            opacity: isFechada && !selecionado ? 0.65 : 1,
                            boxShadow: selecionado ? '0 2px 6px rgba(15,23,42,0.06)' : 'none'
                          }}
                        >
                          <div style={{ fontWeight: '800', fontSize: '0.88rem', color: selecionado ? op.cor : '#0f172a' }}>
                            {selecionado ? '● ' : ''}{op.titulo}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.15rem' }}>{op.sub}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* BLOCO FINANCEIRO (ABRE SOMENTE SE FECHOU) */}
                {gerouFechamentoComercial && (
                  <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.35rem' }}>
                    <h3 style={{ margin: '0 0 0.9rem 0', fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>
                      2. Condições Comerciais & Pagamento
                    </h3>

                    {ficha.categoria_produto === 'PAC' ? (
                      <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '0.7rem 0.95rem', marginBottom: '1rem', fontSize: '0.8rem', color: '#475569', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <span>
                          <strong>Regra PAC:</strong> Não possui abatimento de cashback (créditos são exclusivos para GIANTS) e a entrada padrão equivale a <strong>1 parcela</strong> do plano.
                        </span>
                        <span style={{ background: '#e0f2fe', color: '#0369a1', fontWeight: '800', padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.75rem' }}>
                          1ª Parcela (Entrada): {fmtBRL(calcularParcelaEntradaPAC(calc.valorNegociado, 12))}
                        </span>
                      </div>
                    ) : (Number(ficha.cashback_almoco_cnpj || 0) > 0 || Number(ficha.cashback_upgrade_cnpj || 0) > 0) && (
                      <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: '10px', padding: '0.75rem 0.95rem', marginBottom: '1rem', fontSize: '0.8rem', color: '#166534' }}>
                        <div style={{ fontWeight: '800', marginBottom: '0.2rem' }}>
                          ✔ Crédito de Cashback no CNPJ ({ficha.cnpj || ficha.razao_social}):
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                          {Number(ficha.cashback_almoco_cnpj || 0) > 0 && (
                            <span>• Almoço Pago: <strong>R$ 1.000,00</strong></span>
                          )}
                          {Number(ficha.cashback_upgrade_cnpj || 0) > 0 && (
                            <span>
                              • Upgrade {/ACELERADOR|AE|ACEd/i.test(ficha.historico_produtos_elegiveis || '') ? '100% AE' : '90% PAC'}:{' '}
                              <strong>{fmtBRL(ficha.cashback_upgrade_cnpj)}</strong>
                              {Number(ficha.cashback_upgrade_cnpj || 0) <= 1 && (
                                <span style={{ marginLeft: '0.45rem', background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.71rem', fontWeight: '700' }}>
                                  ⚠️ CRM registrou R$ 0,01 — ajuste abaixo se houver crédito real
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ATALHOS DE ENTRADA E PARCELAMENTO */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginBottom: '1rem', padding: '0.65rem 0.8rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.74rem', fontWeight: '800', color: '#64748b', marginRight: '0.25rem' }}>Atalhos rápidos:</span>
                      {ficha.categoria_produto === 'PAC' ? (
                        [12, 10, 6, 1].map((totalPlano) => {
                          const entParcela = calcularParcelaEntradaPAC(calc.valorNegociado, totalPlano);
                          const ativo = Math.abs(Number(ficha.valor_entrada) - entParcela) < 0.05;
                          return (
                            <button
                              key={totalPlano}
                              type="button"
                              disabled={isFechada}
                              onClick={() =>
                                !isFechada &&
                                aplicarValorEntradaSincronizado(entParcela, {
                                  cashback: 0,
                                  parcelas: totalPlano > 1 ? totalPlano - 1 : 1
                                })
                              }
                              style={{
                                padding: '0.28rem 0.65rem',
                                borderRadius: '6px',
                                border: ativo ? '1.5px solid #0369a1' : '1px solid #cbd5e1',
                                background: ativo ? '#e0f2fe' : '#fff',
                                color: ativo ? '#0369a1' : '#334155',
                                fontSize: '0.75rem',
                                fontWeight: '800',
                                cursor: 'pointer'
                              }}
                            >
                              {totalPlano === 1
                                ? `À vista (${fmtBRL(entParcela)})`
                                : `${totalPlano}x (Entr. ${fmtBRL(entParcela)} + ${totalPlano - 1}x)`}
                            </button>
                          );
                        })
                      ) : (
                        <>
                          {(() => {
                          const totalPags = (Number(ficha.parcelas) || 1) + 1;
                          const valorAPagar = Math.max(0, calc.valorNegociado - calc.cashback - calc.permuta - calc.entradaComplementar);
                          const ent1Parc = Math.ceil((valorAPagar / totalPags) * 100) / 100;
                          const ativo1Parc = Math.abs(Number(ficha.valor_entrada) - ent1Parc) < 0.05;
                          return (
                            <button
                              type="button"
                              disabled={isFechada}
                              onClick={() => !isFechada && aplicarValorEntradaSincronizado(ent1Parc)}
                              style={{
                                padding: '0.25rem 0.6rem',
                                borderRadius: '6px',
                                border: ativo1Parc ? '1.5px solid #0369a1' : '1px solid #bae6fd',
                                background: ativo1Parc ? '#e0f2fe' : '#f0f9ff',
                                color: '#0369a1',
                                fontSize: '0.74rem',
                                fontWeight: '800',
                                cursor: 'pointer'
                              }}
                            >
                              1 Parcela ({fmtBRL(ent1Parc)})
                            </button>
                          );
                        })()}
                        {[10000, 20000, 30000, 50000, 100000].map((vEnt) => (
                            <button
                              key={vEnt}
                              type="button"
                              disabled={isFechada}
                              onClick={() => !isFechada && aplicarValorEntradaSincronizado(vEnt)}
                              style={{
                                padding: '0.25rem 0.55rem',
                                borderRadius: '6px',
                                border: Number(ficha.valor_entrada) === vEnt ? '1.5px solid #059669' : '1px solid #cbd5e1',
                                background: Number(ficha.valor_entrada) === vEnt ? '#dcfce7' : '#fff',
                                color: Number(ficha.valor_entrada) === vEnt ? '#166534' : '#334155',
                                fontSize: '0.74rem',
                                fontWeight: '700',
                                cursor: 'pointer'
                              }}
                            >
                              Entr. {(vEnt / 1000).toFixed(0)}k
                            </button>
                          ))}
                          <span style={{ color: '#cbd5e1' }}>|</span>
                          {[1, 6, 10, 12].map((qtdP) => (
                            <button
                              key={qtdP}
                              type="button"
                              onClick={() => atualizarCampo('parcelas', qtdP)}
                              style={{
                                padding: '0.25rem 0.55rem',
                                borderRadius: '6px',
                                border: Number(ficha.parcelas) === qtdP ? '1.5px solid #ff5722' : '1px solid #cbd5e1',
                                background: Number(ficha.parcelas) === qtdP ? '#fff7ed' : '#fff',
                                color: Number(ficha.parcelas) === qtdP ? '#c2410c' : '#334155',
                                fontSize: '0.74rem',
                                fontWeight: '700',
                                cursor: 'pointer'
                              }}
                            >
                              {qtdP === 1 ? 'À vista (1x)' : qtdP + 'x'}
                            </button>
                          ))}
                        </>
                      )}
                    </div>

                    {/* LINHA 1: PRODUTO E PLANO COM LARGURA COMPLETA */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.95rem', marginBottom: '0.95rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>Linha de Produto *</label>
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
                            const nomeSub = primeiroSub ? primeiroSub.nome : fallbackSub[novaCat];
                            const totalPlano = primeiroSub ? Number(primeiroSub.parcelas_padrao || 12) : 12;

                            if (novaCat === 'PAC') {
                              const basePAC = obterValorBaseProduto('PAC', nomeSub);
                              const liquidoPAC = Math.max(0, basePAC - Math.max(0, Number(ficha.desconto) || 0));
                              aplicarValorEntradaSincronizado(calcularParcelaEntradaPAC(liquidoPAC, totalPlano), {
                                categoria_produto: 'PAC',
                                produto_nome: nomeSub,
                                cashback: 0,
                                parcelas: totalPlano > 1 ? totalPlano - 1 : 1,
                                resultado_comercial: mapaResultado.PAC
                              });
                              return;
                            }

                            const novoCashback =
                              Number(ficha.cashback_almoco_cnpj || 0) +
                              (novaCat === 'GIANTS' ? Number(ficha.cashback_upgrade_cnpj || 0) : 0);
                            const entPadrao = calcularParcelaEntradaPAC(
                              Math.max(0, obterValorBaseProduto(novaCat, nomeSub) - novoCashback - Math.max(0, Number(ficha.desconto) || 0)),
                              totalPlano > 1 ? totalPlano + 1 : 1
                            );
                            aplicarValorEntradaSincronizado(entPadrao, {
                              categoria_produto: novaCat,
                              produto_nome: nomeSub,
                              parcelas: totalPlano,
                              cashback: novoCashback,
                              resultado_comercial: mapaResultado[novaCat] || ficha.resultado_comercial
                            });
                          }}
                          style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontWeight: '700', boxSizing: 'border-box' }}
                        >
                          <option value="GIANTS">GIANTS (Programa 360°)</option>
                          <option value="PAC">PAC (Aceleração Pré-GIANTS)</option>
                          <option value="AE">AE (Acelerador Empresarial)</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>Subproduto / Plano *</label>
                        <select
                          value={ficha.produto_nome}
                          onChange={(e) => {
                            const novoSub = e.target.value;
                            const objSub = catalogoProdutos.find((p) => p.nome === novoSub);
                            const totalPlano = objSub ? Number(objSub.parcelas_padrao || 12) : 12;

                            if (String(ficha.categoria_produto || '').toUpperCase() === 'PAC') {
                              const basePAC = obterValorBaseProduto('PAC', novoSub);
                              const liquidoPAC = Math.max(0, basePAC - Math.max(0, Number(ficha.desconto) || 0));
                              aplicarValorEntradaSincronizado(calcularParcelaEntradaPAC(liquidoPAC, totalPlano), {
                                produto_nome: novoSub,
                                cashback: 0,
                                parcelas: totalPlano > 1 ? totalPlano - 1 : 1
                              });
                              return;
                            }

                            setFicha((prev) => ({
                              ...prev,
                              produto_nome: novoSub,
                              parcelas: objSub ? Number(objSub.parcelas_padrao || prev.parcelas) : prev.parcelas
                            }));
                          }}
                          style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontWeight: '600', boxSizing: 'border-box' }}
                        >
                          {catalogoProdutos
                            .filter((p) => String(p.categoria || '').toUpperCase() === String(ficha.categoria_produto || 'GIANTS').toUpperCase() && p.tipo_item === 'PRINCIPAL')
                            .map((p) => (
                              <option key={p.id} value={p.nome}>
                                {p.nome} ({fmtBRL(p.valor_base)})
                              </option>
                            ))}
                          {catalogoProdutos.filter((p) => String(p.categoria || '').toUpperCase() === String(ficha.categoria_produto || 'GIANTS').toUpperCase() && p.tipo_item === 'PRINCIPAL').length === 0 && (
                            <option value={ficha.produto_nome}>{ficha.produto_nome}</option>
                          )}
                        </select>
                      </div>
                    </div>

                    {/* BLOCO PAGAMENTO DA ENTRADA (HOJE NA MESA) */}
                    <div
                      onPaste={(e) => {
                        const item = Array.from(e.clipboardData?.items || []).find((it) => it.type.startsWith('image/'));
                        if (item) {
                          e.preventDefault();
                          processarArquivoComprovante(item.getAsFile());
                        }
                      }}
                      style={{ background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '10px', padding: '0.9rem', marginBottom: '0.95rem' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div>
                          <span style={{ fontSize: '0.82rem', fontWeight: '800', color: '#0f172a' }}>
                            Pagamento da Entrada (Hoje na Mesa) — Total: {fmtBRL(ficha.valor_entrada)}
                          </span>
                          <span style={{ display: 'block', fontSize: '0.72rem', color: '#64748b' }}>
                            Valor pago agora na mesa. Se o cliente dividir entre Pix e Cartão hoje, adicione outro meio e anexe o comprovante de cada um.
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            sincronizarPagamentosEntrada([
                              ...(ficha.pagamentosEntrada || [{ forma: ficha.forma_entrada, valor: ficha.valor_entrada, identificador: '', parcelasCartao: 1, comprovante: null }]),
                              { forma: 'Cartão de Crédito', valor: 0, identificador: '', parcelasCartao: 1, comprovante: null }
                            ])
                          }
                          style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', borderRadius: '7px', padding: '0.35rem 0.7rem', fontSize: '0.75rem', fontWeight: '800', cursor: 'pointer' }}
                        >
                          + Dividir em outro meio (hoje)
                        </button>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                        {(ficha.pagamentosEntrada || [{ forma: ficha.forma_entrada, valor: ficha.valor_entrada, identificador: '', parcelasCartao: 1, comprovante: null }]).map((pg, idxPg) => (
                          <div
                            key={idxPg}
                            onPaste={(e) => {
                              const item = Array.from(e.clipboardData?.items || []).find((it) => it.type.startsWith('image/'));
                              if (item) {
                                e.preventDefault();
                                e.stopPropagation();
                                processarArquivoComprovante(item.getAsFile(), idxPg);
                              }
                            }}
                            style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '9px', padding: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
                          >
                            <div style={{ display: 'grid', gridTemplateColumns: pg.forma === 'Cartão de Crédito' ? '1.05fr 0.62fr 0.85fr 1.15fr auto' : '1.15fr 0.9fr 1.25fr auto', gap: '0.5rem', alignItems: 'center' }}>
                              <select
                                value={pg.forma}
                                onChange={(e) => {
                                  const copia = [...(ficha.pagamentosEntrada || [])];
                                  copia[idxPg] = { ...copia[idxPg], forma: e.target.value, parcelasCartao: e.target.value === 'Cartão de Crédito' ? (copia[idxPg].parcelasCartao || 1) : 1 };
                                  sincronizarPagamentosEntrada(copia);
                                }}
                                style={{ width: '100%', padding: '0.52rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '0.82rem', fontWeight: '600' }}
                              >
                                <option value="Pix">Pix</option>
                                <option value="Cartão de Crédito">Cartão de Crédito</option>
                                <option value="Cartão de Débito">Cartão de Débito</option>
                                <option value="Link de Pagamento">Link de Pagamento</option>
                                <option value="Cheque">Cheque</option>
                              </select>

                              {pg.forma === 'Cartão de Crédito' && (
                                <select
                                  title="Parcelas na maquininha"
                                  value={pg.parcelasCartao || 1}
                                  onChange={(e) => {
                                    const copia = [...(ficha.pagamentosEntrada || [])];
                                    copia[idxPg] = { ...copia[idxPg], parcelasCartao: Number(e.target.value) };
                                    sincronizarPagamentosEntrada(copia);
                                  }}
                                  style={{ width: '100%', padding: '0.52rem 0.4rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: '0.8rem', fontWeight: '700' }}
                                >
                                  {[1, 2, 3, 4, 5, 6, 10, 12].map((nMaq) => (
                                    <option key={nMaq} value={nMaq}>{nMaq}x maq.</option>
                                  ))}
                                </select>
                              )}

                              <input
                                type="number"
                                min="0"
                                placeholder="Valor (R$)"
                                value={pg.valor}
                                onChange={(e) => {
                                  const copia = [...(ficha.pagamentosEntrada || [])];
                                  copia[idxPg] = { ...copia[idxPg], valor: Number(e.target.value) };
                                  sincronizarPagamentosEntrada(copia);
                                }}
                                style={{ width: '100%', padding: '0.52rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontWeight: '700', fontSize: '0.82rem' }}
                              />

                              <input
                                type="text"
                                placeholder="CV / NSU / ID Pix..."
                                value={pg.identificador || ''}
                                onChange={(e) => {
                                  const copia = [...(ficha.pagamentosEntrada || [])];
                                  copia[idxPg] = { ...copia[idxPg], identificador: e.target.value };
                                  sincronizarPagamentosEntrada(copia);
                                }}
                                style={{ width: '100%', padding: '0.52rem', borderRadius: '8px', border: '1px solid #bae6fd', background: '#f0f9ff', boxSizing: 'border-box', fontSize: '0.8rem' }}
                              />

                              {(ficha.pagamentosEntrada || []).length > 1 ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const copia = (ficha.pagamentosEntrada || []).filter((_, i) => i !== idxPg);
                                    sincronizarPagamentosEntrada(copia);
                                  }}
                                  title="Remover esta forma de pagamento"
                                  style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '6px', padding: '0.45rem 0.6rem', fontWeight: '800', cursor: 'pointer' }}
                                >
                                  ✕
                                </button>
                              ) : <span />}
                            </div>

                            {/* Comprovante individual desta forma de pagamento */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', paddingTop: '0.4rem', borderTop: '1px dashed #e2e8f0' }}>
                              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0.3rem 0.65rem', fontSize: '0.74rem', fontWeight: '700', color: '#334155', cursor: 'pointer' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: '0.95rem', color: '#0284c7' }}>attach_file</span>
                                {pg.comprovante ? `Trocar Comprovante (${pg.forma})` : `Anexar Comprovante — ${pg.forma} (Foto/PDF ou Ctrl+V aqui)`}
                                <input
                                  type="file"
                                  accept="image/*,application/pdf"
                                  onChange={(e) => {
                                    processarArquivoComprovante(e.target.files?.[0], idxPg);
                                    e.target.value = '';
                                  }}
                                  style={{ display: 'none' }}
                                />
                              </label>

                              {pg.comprovante ? (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', background: '#dcfce7', color: '#166534', border: '1px solid #86efac', borderRadius: '6px', padding: '0.25rem 0.6rem', fontSize: '0.73rem', fontWeight: '800' }}>
                                  <span>✔ {pg.comprovante.nome}</span>
                                  <button
                                    type="button"
                                    onClick={() => anexarComprovanteNaLinha(idxPg, null)}
                                    title="Remover comprovante desta linha"
                                    style={{ background: 'transparent', border: 'none', color: '#b91c1c', fontWeight: '900', cursor: 'pointer' }}
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <span style={{ fontSize: '0.71rem', color: '#94a3b8' }}>Clique nesta linha e use Ctrl+V ou anexe o arquivo</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* PARCELAMENTO DO SALDO, DESCONTO E CASHBACK */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: '0.95rem', marginBottom: '0.95rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>Parcelas do Restante *</label>
                        <input
                          type="number"
                          min="1"
                          max="24"
                          value={ficha.parcelas}
                          onChange={(e) => atualizarCampo('parcelas', Number(e.target.value))}
                          style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontWeight: '700' }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>Forma do Restante *</label>
                        <select
                          value={ficha.forma_restante}
                          onChange={(e) => atualizarCampo('forma_restante', e.target.value)}
                          style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', boxSizing: 'border-box', fontWeight: '600' }}
                        >
                          <option value="Pix">Pix</option>
                          <option value="Cartão de Crédito">Cartão de Crédito</option>
                          <option value="Cheque">Cheque</option>
                          <option value="Boleto">Boleto (Requer Aprovação)</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>Desconto Comercial (R$)</label>
                        <input
                          type="number"
                          min="0"
                          value={ficha.desconto}
                          onChange={(e) => {
                            const novoDesc = Math.max(0, Number(e.target.value) || 0);
                            if (String(ficha.categoria_produto || '').toUpperCase() === 'PAC') {
                              const basePAC = obterValorBaseProduto('PAC', ficha.produto_nome);
                              const liquidoPAC = Math.max(0, basePAC - novoDesc);
                              const totalPlano = Number(ficha.parcelas || 11) + 1;
                              aplicarValorEntradaSincronizado(calcularParcelaEntradaPAC(liquidoPAC, totalPlano), {
                                desconto: novoDesc,
                                cashback: 0
                              });
                              return;
                            }
                            atualizarCampo('desconto', novoDesc);
                          }}
                          style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                        />
                      </div>

                      {ficha.categoria_produto !== 'PAC' && (() => {
                        const creditoOficial =
                          Number(ficha.cashback_almoco_cnpj || 0) +
                          (String(ficha.categoria_produto || '').toUpperCase() === 'GIANTS'
                            ? Number(ficha.cashback_upgrade_cnpj || 0)
                            : 0);
                        const travadoOficial =
                          creditoOficial > 0 &&
                          Number(ficha.cashback_upgrade_cnpj || 0) !== 0.01 &&
                          !isAdmin;

                        return (
                          <div>
                            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', fontWeight: '700', color: '#047857', marginBottom: '0.3rem' }}>
                              <span>Cashback Abatido (R$)</span>
                              {travadoOficial && (
                                <span style={{ fontSize: '0.66rem', background: '#dcfce7', color: '#166534', padding: '0.08rem 0.35rem', borderRadius: '4px' }}>
                                  Oficial CNPJ
                                </span>
                              )}
                            </label>
                            <input
                              type="number"
                              readOnly={travadoOficial}
                              value={ficha.cashback}
                              onChange={(e) => !travadoOficial && atualizarCampo('cashback', Math.max(0, Number(e.target.value) || 0))}
                              style={{
                                width: '100%',
                                padding: '0.6rem',
                                borderRadius: '8px',
                                border: '1px solid #86efac',
                                background: travadoOficial ? '#ecfdf5' : '#f0fdf4',
                                color: '#065f46',
                                boxSizing: 'border-box',
                                fontWeight: '700',
                                cursor: travadoOficial ? 'not-allowed' : 'text'
                              }}
                            />
                          </div>
                        );
                      })()}
                    </div>

                    {/* OPÇÕES EXTRAS RECOLHIDAS (ENTRADA EM DATA FUTURA / PERMUTA) */}
                    <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.74rem', fontWeight: '800', color: '#64748b' }}>Condições especiais:</span>

                        <label
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            padding: '0.35rem 0.75rem',
                            borderRadius: '999px',
                            border: usarEntradaFutura ? '1.5px solid #0284c7' : '1px solid #cbd5e1',
                            background: usarEntradaFutura ? '#e0f2fe' : '#f8fafc',
                            color: usarEntradaFutura ? '#0369a1' : '#334155',
                            fontSize: '0.76rem',
                            fontWeight: '700',
                            cursor: 'pointer'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={usarEntradaFutura}
                            onChange={(e) => {
                              const marcado = e.target.checked;
                              setUsarEntradaFutura(marcado);
                              if (!marcado) {
                                setFicha((prev) => ({
                                  ...prev,
                                  valor_entrada_complementar: '',
                                  data_entrada_complementar: ''
                                }));
                              }
                            }}
                          />
                          Entrada complementar em data futura
                        </label>

                        <label
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            padding: '0.35rem 0.75rem',
                            borderRadius: '999px',
                            border: usarPermuta ? '1.5px solid #7e22ce' : '1px solid #cbd5e1',
                            background: usarPermuta ? '#f3e8ff' : '#f8fafc',
                            color: usarPermuta ? '#6b21a8' : '#334155',
                            fontSize: '0.76rem',
                            fontWeight: '700',
                            cursor: 'pointer'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={usarPermuta}
                            onChange={(e) => {
                              const marcado = e.target.checked;
                              setUsarPermuta(marcado);
                              if (!marcado) {
                                atualizarCampo('valor_permuta', '');
                              }
                            }}
                          />
                          Abater parte em Permuta
                        </label>
                      </div>

                      {usarEntradaFutura && (
                        <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '9px', padding: '0.75rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.8rem' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#0369a1', marginBottom: '0.25rem' }}>
                              Valor da Entrada Futura (R$) *
                            </label>
                            <input
                              type="number"
                              min="0"
                              placeholder="Ex: 30000"
                              value={ficha.valor_entrada_complementar}
                              onChange={(e) => {
                                const v = e.target.value === '' ? '' : Number(e.target.value);
                                setFicha((prev) => ({
                                  ...prev,
                                  valor_entrada_complementar: v,
                                  data_entrada_complementar: Number(v) > 0 ? prev.data_entrada_complementar : ''
                                }));
                              }}
                              style={{ width: '100%', padding: '0.55rem', borderRadius: '8px', border: '1px solid #7dd3fc', background: '#ffffff', boxSizing: 'border-box', fontWeight: '700' }}
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#0369a1', marginBottom: '0.25rem' }}>
                              Data do Pagamento Futuro *
                            </label>
                            <input
                              type="date"
                              value={paraInputDate(ficha.data_entrada_complementar)}
                              onChange={(e) => atualizarCampo('data_entrada_complementar', e.target.value)}
                              style={{ width: '100%', padding: '0.52rem', borderRadius: '8px', border: '1px solid #7dd3fc', background: '#ffffff', boxSizing: 'border-box' }}
                            />
                          </div>
                        </div>
                      )}

                      {usarPermuta && (
                        <div style={{ background: '#faf5ff', border: '1px solid #d8b4fe', borderRadius: '9px', padding: '0.75rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.8rem', alignItems: 'center' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#6b21a8', marginBottom: '0.25rem' }}>
                              Valor Abatido em Permuta (R$) *
                            </label>
                            <input
                              type="number"
                              min="0"
                              placeholder="Ex: 90000"
                              value={ficha.valor_permuta}
                              onChange={(e) => atualizarCampo('valor_permuta', e.target.value === '' ? '' : Number(e.target.value))}
                              style={{ width: '100%', padding: '0.55rem', borderRadius: '8px', border: '1px solid #c084fc', background: '#ffffff', boxSizing: 'border-box', fontWeight: '700' }}
                            />
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#6b21a8', lineHeight: 1.4 }}>
                            <strong>Atenção:</strong> Contratos com permuta passam pela <strong>Liberação do Gestor Comercial</strong>. Descreva o bem ou serviço ofertado no campo de observações abaixo.
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* OBJEÇÕES RÁPIDAS & OBSERVAÇÃO */}
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.35rem' }}>
                  {!gerouFechamentoComercial && ficha.resultado_comercial && (
                    <div style={{ marginBottom: '1rem' }}>
                      <h3 style={{ margin: '0 0 0.3rem 0', fontSize: '1rem', fontWeight: '800', color: '#0f172a' }}>
                        Motivo / Objeção Principal (1 toque)
                      </h3>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginTop: '0.6rem' }}>
                        {CHIPS_OBJECOES.map((chip) => {
                          const ativo = chipAtivo('resultado_obs', chip);
                          return (
                            <button
                              key={chip}
                              type="button"
                              onClick={() => alternarChipTexto('resultado_obs', chip)}
                              style={{
                                padding: '0.4rem 0.78rem',
                                borderRadius: '999px',
                                border: ativo ? '1.5px solid #d97706' : '1px solid #cbd5e1',
                                background: ativo ? '#fffbeb' : '#f8fafc',
                                color: ativo ? '#92400e' : '#334155',
                                fontWeight: ativo ? '800' : '600',
                                fontSize: '0.78rem',
                                cursor: 'pointer'
                              }}
                            >
                              {ativo ? '✓ ' : '+ '}{chip}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: Number(ficha.valor_permuta || 0) > 0 ? '#6b21a8' : '#475569', marginBottom: '0.3rem' }}>
                    {gerouFechamentoComercial
                      ? Number(ficha.valor_permuta || 0) > 0
                        ? 'Descrição da Permuta & Observações Comerciais *'
                        : 'Observações Comerciais / Condições Especiais (Opcional)'
                      : 'Observação de Encerramento / Próximos Passos'}
                  </label>
                  <textarea
                    rows="2"
                    value={ficha.resultado_obs}
                    onChange={(e) => atualizarCampo('resultado_obs', e.target.value)}
                    placeholder={
                      gerouFechamentoComercial
                        ? 'Ex: Detalhes da permuta, acordo de vencimento da entrada futura ou observação para o Financeiro...'
                        : 'Detalhes rápidos para encerrar e liberar a mesa...'
                    }
                    style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box', fontSize: '0.85rem' }}
                  />
                </div>
              </>
            )}
          </div>

          {/* BOTÕES DE NAVEGAÇÃO ENTRE ETAPA 1 E ETAPA 2 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
            {etapaAtual === 2 ? (
              <button
                type="button"
                onClick={() => setEtapaAtual(1)}
                style={{ background: '#ffffff', border: '1px solid #cbd5e1', color: '#334155', padding: '0.6rem 1.15rem', borderRadius: '8px', fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer' }}
              >
                ← Voltar para Empresa & Diagnóstico
              </button>
            ) : (
              <span />
            )}

            {etapaAtual === 1 && (
              <button
                type="button"
                onClick={() => setEtapaAtual(2)}
                style={{ background: '#0f172a', color: '#ffffff', border: 'none', padding: '0.7rem 1.4rem', borderRadius: '8px', fontWeight: '800', fontSize: '0.88rem', cursor: 'pointer' }}
              >
                Avançar para Desfecho & Negociação →
              </button>
            )}
          </div>
        </div>

        {/* COLUNA DIREITA: RESUMO FINANCEIRO AO VIVO & FINALIZAÇÃO */}
        <div style={{ position: 'sticky', top: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ background: '#ffffff', border: '1.5px solid #e2e8f0', borderRadius: '14px', padding: '1.25rem', boxShadow: '0 4px 16px rgba(15, 23, 42, 0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.74rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Resumo ao Vivo
              </span>
              <span style={{ fontSize: '0.74rem', fontWeight: '800', background: gerouFechamentoComercial ? '#dcfce7' : '#f1f5f9', color: gerouFechamentoComercial ? '#166534' : '#475569', padding: '0.18rem 0.55rem', borderRadius: '999px' }}>
                {ficha.resultado_comercial || (isFechada ? 'Ficha Encerrada' : 'Selecione o desfecho')}
              </span>
            </div>

            <div style={{ fontSize: '0.95rem', fontWeight: '800', color: '#0f172a', marginBottom: '0.4rem' }}>
              {ficha.razao_social}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#475569', marginBottom: '0.85rem' }}>
              <strong>No contrato ({sociosQueEntram.length}):</strong> {sociosQueEntram.map((s) => s.nome).join(', ')}
            </div>

            {gerouFechamentoComercial ? (
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.42rem', fontSize: '0.82rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Plano:</span>
                  <strong style={{ color: '#0f172a', textAlign: 'right' }}>{ficha.produto_nome}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Tabela ({sociosQueEntram.length} part.):</span>
                  <span style={{ fontWeight: '700' }}>{fmtBRL(calc.contrato)}</span>
                </div>
                {Number(calc.desconto || 0) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#dc2626' }}>
                    <span>(-) Desconto:</span>
                    <strong>- {fmtBRL(calc.desconto)}</strong>
                  </div>
                )}
                {Number(calc.cashback || 0) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#047857' }}>
                    <span>(-) Cashback CNPJ:</span>
                    <strong>- {fmtBRL(calc.cashback)}</strong>
                  </div>
                )}
                {Number(calc.permuta || 0) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#7e22ce' }}>
                    <span>(-) Permuta:</span>
                    <strong>- {fmtBRL(calc.permuta)}</strong>
                  </div>
                )}
                <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '0.5rem', marginTop: '0.2rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: '700', color: '#334155' }}>
                      Entrada 1 {(ficha.pagamentosEntrada || []).length > 1 ? `(${ficha.pagamentosEntrada.length} meios)` : `(${formatarLinhaPagamentoLabel((ficha.pagamentosEntrada || [])[0] || { forma: ficha.forma_entrada })})`}:
                    </span>
                    <strong style={{ color: '#059669' }}>{fmtBRL(calc.entrada)}</strong>
                  </div>
                  {Array.isArray(ficha.pagamentosEntrada) && ficha.pagamentosEntrada.length > 1 && (
                    <div style={{ marginTop: '0.25rem', paddingLeft: '0.5rem', borderLeft: '2px solid #86efac', display: 'flex', flexDirection: 'column', gap: '0.18rem' }}>
                      {ficha.pagamentosEntrada.map((pg, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: '#475569' }}>
                          <span>• {formatarLinhaPagamentoLabel(pg)} {pg.comprovante ? '📎' : ''}</span>
                          <strong style={{ color: '#0f172a' }}>{fmtBRL(pg.valor)}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {Number(calc.entradaComplementar || 0) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#0369a1' }}>
                    <span>Entrada 2 {ficha.data_entrada_complementar ? '(' + formatarDataBR(ficha.data_entrada_complementar) + ')' : ''}:</span>
                    <strong>{fmtBRL(calc.entradaComplementar)}</strong>
                  </div>
                )}
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '0.65rem 0.75rem', marginTop: '0.35rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#9a3412' }}>Saldo Parcelado:</span>
                    <span style={{ fontSize: '1.05rem', fontWeight: '900', color: '#ea580c' }}>{fmtBRL(calc.saldo)}</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#c2410c', fontWeight: '700', marginTop: '0.15rem', textAlign: 'right' }}>
                    {calc.parcelas}x de {fmtBRL(calc.valorParcela)} ({ficha.forma_restante})
                  </div>
                </div>

                {/* Alertas Preventivos antes da finalização */}
                {!isFechada && calc.precisaAprovacao && (
                  <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', padding: '0.55rem 0.7rem', marginTop: '0.3rem', fontSize: '0.73rem', color: '#92400e' }}>
                    <div style={{ fontWeight: '800', marginBottom: '0.2rem' }}>⚠️ Passará por Liberação Comercial:</div>
                    {calc.motivosAprovacao.map((m, idxM) => (
                      <div key={idxM}>• {m}</div>
                    ))}
                  </div>
                )}

                {!isFechada && (ficha.pagamentosEntrada || []).some((p) => Number(p.valor || 0) > 0 && !String(p.identificador || '').trim() && !p.comprovante) && (
                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '0.5rem 0.7rem', marginTop: '0.2rem', fontSize: '0.72rem', color: '#1e40af', fontWeight: '600' }}>
                    💡 Dica: Há meio de pagamento sem CV/ID ou comprovante anexado. Preencher evita devolução pelo Financeiro.
                  </div>
                )}
              </div>
            ) : (
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem', fontSize: '0.78rem', color: '#64748b' }}>
                {ficha.resultado_comercial
                  ? 'Encerramento sem fechamento financeiro. Ao finalizar, toda a empresa sairá da mesa imediatamente.'
                  : 'Escolha o desfecho na Etapa 2 (ou clique em Avançar) para finalizar a entrevista.'}
              </div>
            )}

            {/* STATUS E BOTÃO DE FINALIZAÇÃO */}
            <div style={{ marginTop: '1rem', paddingTop: '0.9rem', borderTop: '1px solid #e2e8f0' }}>
              {isFechada && (
                <div style={{
                  background: isAprovadaFin ? '#f0fdf4' : '#fffbeb',
                  border: isAprovadaFin ? '1px solid #86efac' : '1px solid #fcd34d',
                  borderRadius: '8px',
                  padding: '0.65rem 0.8rem',
                  marginBottom: '0.75rem',
                  fontSize: '0.76rem',
                  fontWeight: '700',
                  color: isAprovadaFin ? '#166534' : '#92400e'
                }}>
                  {isAprovadaFin
                    ? 'Contrato aprovado pelo Financeiro — ficha bloqueada para edição.'
                    : 'Ficha encerrada e bloqueada para edição.'}
                  {isAdmin && (
                    <button
                      type="button"
                      disabled={reabrindoFicha}
                      onClick={reabrirFichaDireto}
                      style={{
                        marginTop: '0.6rem',
                        width: '100%',
                        background: '#d97706',
                        color: '#ffffff',
                        border: 'none',
                        padding: '0.55rem 0.85rem',
                        borderRadius: '7px',
                        fontWeight: '800',
                        fontSize: '0.8rem',
                        cursor: reabrindoFicha ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.35rem'
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>lock_open</span>
                      {reabrindoFicha ? 'Reabrindo Ficha...' : 'Reabrir Ficha (Administrador)'}
                    </button>
                  )}
                </div>
              )}

              {!isFechada && !podeSubmeter && (
                <div style={{ fontSize: '0.75rem', color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '0.6rem 0.75rem', marginBottom: '0.75rem' }}>
                  <strong>Falta preencher:</strong> {camposFaltantes.join(', ')}
                </div>
              )}

              {(() => {
                const bgBotao = isFechada
                  ? isAprovadaFin
                    ? '#dcfce7'
                    : '#fef3c7'
                  : !podeSubmeter
                  ? '#cbd5e1'
                  : '#059669';

                const corTextoBotao = isFechada
                  ? isAprovadaFin
                    ? '#166534'
                    : '#92400e'
                  : '#ffffff';

                const bordaBotao = isFechada
                  ? isAprovadaFin
                    ? '2px solid #22c55e'
                    : '2px solid #f59e0b'
                  : 'none';

                if (isFechada && isAdmin) {
                  return null;
                }

                const iconeBotao = isFechada ? 'lock' : 'check_circle';

                const textoBotao = isFechada
                  ? isAprovadaFin
                    ? 'Ficha Bloqueada — Aprovada (Admin Reabre)'
                    : 'Ficha Bloqueada (Somente Admin Reabre)'
                  : salvando
                  ? 'Registrando...'
                  : 'Finalizar Ficha da Empresa';

                return (
                  <button
                    type="button"
                    disabled={!podeSubmeter || salvando || isFechada}
                    onClick={submeterFicha}
                    style={{
                      width: '100%',
                      background: bgBotao,
                      color: corTextoBotao,
                      border: bordaBotao,
                      padding: '0.85rem 1rem',
                      borderRadius: '10px',
                      fontWeight: '800',
                      fontSize: '0.9rem',
                      cursor: !podeSubmeter || salvando || isFechada ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.45rem'
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '1.15rem' }}>{iconeBotao}</span>
                    {textoBotao}
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* MODAL DE CONFIRMAÇÃO ANTES DE FINALIZAR A ENTREVISTA */}
      {modalConfirmarFinalizacao && (() => {
        const sociosForaContrato = Array.isArray(sociosLista) ? sociosLista.filter((s) => !s.entraNoContrato) : [];

        return (
          <div
            onClick={() => !salvando && setModalConfirmarFinalizacao(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ background: '#ffffff', borderRadius: '14px', maxWidth: '580px', width: '100%', overflow: 'hidden', boxShadow: '0 20px 45px rgba(15, 23, 42, 0.25)', border: '1px solid #e2e8f0' }}
            >
              <div style={{ background: '#ffffff', padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                  <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#fff7ed', color: '#ff5722', border: '1px solid #fed7aa', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '1.5rem' }}>task_alt</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#ff5722', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Ficha #{id} • Confirmação de Finalização
                    </div>
                    <h3 style={{ margin: '0.15rem 0 0', fontSize: '1.15rem', fontWeight: '800', color: '#0f172a' }}>
                      Confirmar encerramento da entrevista?
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={salvando}
                  onClick={() => setModalConfirmarFinalizacao(false)}
                  style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b', width: '32px', height: '32px', borderRadius: '8px', cursor: salvando ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>close</span>
                </button>
              </div>

              <div style={{ padding: '1.35rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.9rem', background: '#f8fafc' }}>
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.95rem 1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: '800', color: '#0f172a' }}>{ficha.razao_social}</span>
                    <span style={{ fontSize: '0.74rem', fontWeight: '800', background: gerouFechamentoComercial ? '#dcfce7' : '#f1f5f9', color: gerouFechamentoComercial ? '#166534' : '#334155', padding: '0.2rem 0.6rem', borderRadius: '999px' }}>
                      {ficha.resultado_comercial}
                    </span>
                  </div>
                  {ficha.cnpj && (
                    <div style={{ fontSize: '0.78rem', color: '#64748b', fontFamily: 'monospace', marginTop: '0.2rem' }}>
                      CNPJ: {ficha.cnpj}
                    </div>
                  )}
                  <div style={{ fontSize: '0.8rem', color: '#334155', marginTop: '0.45rem' }}>
                    <strong>Sócios no contrato ({sociosQueEntram.length}):</strong> {sociosQueEntram.map((s) => s.nome).join(', ')}
                  </div>
                  {sociosForaContrato.length > 0 && (
                    <div style={{ fontSize: '0.78rem', color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', padding: '0.4rem 0.6rem', borderRadius: '6px', marginTop: '0.45rem' }}>
                      <strong>Sócios que não fecharam ({sociosForaContrato.length}):</strong> {sociosForaContrato.map((s) => s.nome).join(', ')} <em>(também sairão da mesa)</em>
                    </div>
                  )}
                </div>

                {gerouFechamentoComercial && calc && (
                  <div style={{ background: '#ffffff', border: '1px solid #fed7aa', borderRadius: '10px', padding: '0.95rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.82rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>Produto / Plano:</span>
                      <strong style={{ color: '#0f172a' }}>{ficha.produto_nome}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>Valor Negociado:</span>
                      <strong>{fmtBRL(calc.valorNegociado)}</strong>
                    </div>
                    {Number(calc.cashback || 0) > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#047857' }}>
                        <span>(-) Cashback CNPJ:</span>
                        <strong>- {fmtBRL(calc.cashback)}</strong>
                      </div>
                    )}
                    {Number(calc.permuta || 0) > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#7e22ce' }}>
                        <span>(-) Permuta:</span>
                        <strong>- {fmtBRL(calc.permuta)}</strong>
                      </div>
                    )}
                    <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: '0.45rem', marginTop: '0.15rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: '700', color: '#334155' }}>Entrada 1 Acordada:</span>
                        <strong style={{ color: '#059669' }}>{fmtBRL(calc.entrada)}</strong>
                      </div>
                      {Array.isArray(ficha.pagamentosEntrada) && ficha.pagamentosEntrada.length > 0 && (
                        <div style={{ marginTop: '0.2rem', paddingLeft: '0.5rem', borderLeft: '2px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                          {ficha.pagamentosEntrada.map((pg, i) => (
                            <div key={i} style={{ fontSize: '0.75rem', color: '#475569' }}>
                              • <strong>{formatarLinhaPagamentoLabel(pg)}</strong>: {fmtBRL(pg.valor)} {pg.identificador ? `(${pg.identificador})` : ''} {pg.comprovante ? '✔ Comprovante' : ''}
                            </div>
                          ))}
                        </div>
                      )}
                      {Number(calc.entradaComplementar || 0) > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#0369a1', marginTop: '0.2rem' }}>
                          <span>Entrada 2 {ficha.data_entrada_complementar ? `(${formatarDataBR(ficha.data_entrada_complementar)})` : ''}:</span>
                          <strong>{fmtBRL(calc.entradaComplementar)}</strong>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem' }}>
                        <span style={{ fontWeight: '700', color: '#334155' }}>Saldo Parcelado:</span>
                        <strong style={{ color: '#ff5722' }}>
                          {calc.parcelas}x de {fmtBRL(calc.valorParcela)} ({ficha.forma_restante})
                        </strong>
                      </div>
                    </div>
                    {ficha.identificador_pagamento && (
                      <div style={{ fontSize: '0.76rem', color: '#0369a1', marginTop: '0.15rem' }}>
                        <strong>Identificador / CV / Link:</strong> {ficha.identificador_pagamento}
                      </div>
                    )}
                  </div>
                )}

                <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '10px', padding: '0.8rem 0.95rem', fontSize: '0.78rem', color: '#92400e', lineHeight: '1.45' }}>
                  <strong>Ao confirmar a finalização:</strong>
                  <div style={{ marginTop: '0.2rem' }}>• A ficha será <strong>encerrada e bloqueada para edição</strong> (reabertura apenas por Administrador na aba Empresas).</div>
                  <div>• <strong>Toda a empresa sairá da mesa imediatamente</strong> (inclusive sócios que não fecharam), deixando a mesa livre no salão.</div>
                  {gerouFechamentoComercial && <div>• A proposta seguirá para a <strong>Fila de Aprovações & Crédito</strong> do Financeiro.</div>}
                </div>
              </div>

              <div style={{ padding: '0.95rem 1.5rem', background: '#ffffff', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled={salvando}
                  onClick={() => setModalConfirmarFinalizacao(false)}
                  style={{ background: '#ffffff', border: '1px solid #cbd5e1', color: '#475569', padding: '0.6rem 1.1rem', borderRadius: '8px', fontWeight: '700', fontSize: '0.82rem', cursor: salvando ? 'not-allowed' : 'pointer' }}
                >
                  Voltar e Revisar
                </button>
                <button
                  type="button"
                  disabled={salvando}
                  onClick={confirmarGravacaoFicha}
                  style={{ background: '#059669', border: 'none', color: '#ffffff', padding: '0.6rem 1.25rem', borderRadius: '8px', fontWeight: '800', fontSize: '0.82rem', cursor: salvando ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '1.05rem' }}>check_circle</span>
                  {salvando ? 'Finalizando e Liberando Mesa...' : 'Confirmar Finalização e Liberar Mesa'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      
      {modalConclusao && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: '14px', maxWidth: '500px', width: '100%', padding: '1.5rem', boxShadow: '0 20px 45px rgba(15,23,42,0.28)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.85rem' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#dcfce7', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined">verified</span>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#15803d', textTransform: 'uppercase' }}>Atendimento Encerrado</div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: '#0f172a' }}>
                  {modalConclusao.titulo || 'Ficha Finalizada e Mesa Liberada!'}
                </h3>
              </div>
            </div>
            <p style={{ margin: '0 0 1.2rem', fontSize: '0.85rem', color: '#334155', lineHeight: '1.5' }}>
              {modalConclusao.mensagem || 'A entrevista foi registrada, a mesa da empresa foi liberada no salão e a ficha está bloqueada.'}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setModalConclusao(null)} style={{ background: '#fff', border: '1px solid #cbd5e1', color: '#334155', padding: '0.55rem 1rem', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>
                Permanecer na Ficha
              </button>
              <button type="button" onClick={() => navigate('/companies')} style={{ background: '#059669', border: 'none', color: '#fff', padding: '0.55rem 1.15rem', borderRadius: '8px', fontWeight: '800', cursor: 'pointer' }}>
                Voltar para Empresas
              </button>
            </div>
          </div>
        </div>
      )}
      
      {modalAviso && (
        <div onClick={() => setModalAviso(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '1rem' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: '12px', maxWidth: '440px', width: '100%', padding: '1.35rem', boxShadow: '0 20px 40px rgba(15,23,42,0.25)' }}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', fontWeight: '800', color: modalAviso.tipo === 'erro' ? '#dc2626' : '#0f172a' }}>
              {modalAviso.titulo || 'Aviso'}
            </h3>
            <p style={{ margin: '0 0 1.1rem', fontSize: '0.86rem', color: '#334155', lineHeight: '1.45' }}>
              {modalAviso.mensagem}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setModalAviso(null)} style={{ background: '#0f172a', color: '#fff', border: 'none', padding: '0.55rem 1.1rem', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
      
    </div>
  );
}



