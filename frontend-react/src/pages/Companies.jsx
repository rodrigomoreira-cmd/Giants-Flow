import { toastSistema } from '../context/ModalContext';
import { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import { useTurma } from '../context/TurmaContext';
import { useNavigate, useLocation } from 'react-router-dom';

const isMembroGiants = (emp) =>
  Boolean(emp?.membro_giants) || String(emp?.origem || '').toUpperCase().includes('GIAN');

const extrairCnpjEmpresa = (emp) => {
  const cnpjCol = String(emp?.cnpj || '').replace(/\D/g, '');
  if (cnpjCol.length === 14) {
    return cnpjCol.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  const docCol = String(emp?.cpf_cnpj || '').replace(/\D/g, '');
  if (docCol.length === 14) {
    return docCol.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  return '';
};

const normalizarChaveEmpresa = (emp) => {
  // Membro GIANTS: vínculo individual exclusivamente pelo ID da inscrição (conformidade LGPD, sem CPF)
  if (isMembroGiants(emp)) {
    return `giants:id:${emp.id}`;
  }

  // AE e PAC: vínculo agrupado por CNPJ da empresa (pessoa jurídica)
  const cnpjDigits = extrairCnpjEmpresa(emp).replace(/\D/g, '');
  if (cnpjDigits.length === 14) return `cnpj:${cnpjDigits}`;

  const empNorm = String(emp.empresa || emp.razao_social || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (empNorm && !['empresa sga', 'sem empresa', 'empresa não informada', 'empresa nao informada'].includes(empNorm)) {
    return `emp:${empNorm}`;
  }
  return `id:${emp.id}`;
};

const obterPapelUsuarioLogado = () => {
  try {
    const rawSessao = localStorage.getItem('sessao_operador') || sessionStorage.getItem('sessao_operador');
    if (rawSessao) {
      const s = JSON.parse(rawSessao);
      const papelSessao = String(
        s?.usuario?.papel || s?.usuario?.role || s?.papel || s?.role || ''
      ).trim().toUpperCase();
      if (papelSessao) return papelSessao;
      if (s?.usuario?.is_admin === true || s?.is_admin === true) return 'ADMIN';
    }
  } catch (_) {}
  return '';
};

const isUsuarioAdmin = () => {
  const p = obterPapelUsuarioLogado();
  return ['ADMIN', 'ADMINISTRADOR', 'SUPERADMIN', 'MASTER', 'SYSTEM', 'DIRETOR'].includes(p);
};

export default function Companies() {
  const { turmaSelecionada } = useTurma();
  const [participantes, setParticipantes] = useState([]);
  const [propostasFinanceiro, setPropostasFinanceiro] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [filtroAlmoco, setFiltroAlmoco] = useState('todos'); // 'todos' | 'pagos' | 'giants' | 'cortesia' | 'pendentes'
  const [pagina, setPagina] = useState(1);
  const itensPorPagina = 60;
  const navigate = useNavigate();
  const location = useLocation();
  const [avisoRetornoFicha, setAvisoRetornoFicha] = useState(location.state?.fichaFinalizada || null);
  const usuarioEhAdmin = useMemo(() => isUsuarioAdmin(), []);
  const usuarioEhFinanceiro = useMemo(() => obterPapelUsuarioLogado() === 'FINANCEIRO', []);

  // Modal Unificado da Empresa (Sócios não-GIANTS + Pagamento + Checklist de Participantes no Almoço)
  const [modalEmpresaAberto, setModalEmpresaAberto] = useState(false);
  const [grupoAlvo, setGrupoAlvo] = useState(null);
  const [tipoAlmoco, setTipoAlmoco] = useState('pago');
  const [cvCartao, setCvCartao] = useState('');
  const [sociosSelecionadosAlmoco, setSociosSelecionadosAlmoco] = useState([]);
  const [salvandoAlmoco, setSalvandoAlmoco] = useState(false);
  const [grupoReabrir, setGrupoReabrir] = useState(null);
  const [reabrindoFicha, setReabrindoFicha] = useState(false);
  const [retomandoId, setRetomandoId] = useState(null);
  const [, setTickSla] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTickSla((t) => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  const carregarDados = async () => {
    try {
      setCarregando(true);
      setErro('');
      const turmaIdAtiva = turmaSelecionada || localStorage.getItem('turma_ativa_id') || '1491';
      const [dados, propsRes] = await Promise.all([
        api.get(`/clientes?turmaId=${turmaIdAtiva}`),
        api.get(`/financeiro/propostas?turmaId=${turmaIdAtiva}`).catch(() => [])
      ]);
      const lista = Array.isArray(dados) ? dados : dados.clientes || [];
      const listaProps = Array.isArray(propsRes) ? propsRes : propsRes?.propostas || [];
      setParticipantes(lista);
      setPropostasFinanceiro(listaProps);
    } catch (err) {
      setErro(err.message || 'Erro ao carregar dados de empresas.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    if (turmaSelecionada) {
      setPagina(1);
      carregarDados();
    }
  }, [turmaSelecionada]);

  // Agrupa todos os participantes em 1 linha única por Empresa (CNPJ)
  const gruposEmpresas = useMemo(() => {
    const mapa = new Map();

    participantes.forEach((p) => {
      const chave = normalizarChaveEmpresa(p);
      const isGiant = Boolean(p.membro_giants) || String(p.origem || '').toUpperCase().includes('GIAN');
      const itemNorm = {
        ...p,
        nomeExibicao: p.nome || p.nome_participante || p.nome_completo || `Participante #${p.id}`,
        isGiant
      };

      if (!mapa.has(chave)) {
        mapa.set(chave, {
          chave,
          idPrincipal: p.id,
          empresa: (p.empresa || p.razao_social || 'Empresa não informada').trim(),
          cnpj: extrairCnpjEmpresa(p),
          todosMembros: [itemNorm]
        });
      } else {
        const g = mapa.get(chave);
        g.todosMembros.push(itemNorm);
        if (!g.cnpj && (extrairCnpjEmpresa(p))) {
          g.cnpj = extrairCnpjEmpresa(p);
        }
      }
    });

    return Array.from(mapa.values())
      .map((g) => {
        // Ordena pagante primeiro, depois não-GIANTS, depois GIANTS
        g.todosMembros.sort((a, b) => {
          const valDiff = Number(b.valor_almoco || 0) - Number(a.valor_almoco || 0);
          if (valDiff !== 0) return valDiff;
          if (a.isGiant !== b.isGiant) return a.isGiant ? 1 : -1;
          return a.nomeExibicao.localeCompare(b.nomeExibicao, 'pt-BR', { sensitivity: 'base' });
        });

        const sociosNaoGiants = g.todosMembros.filter((m) => !m.isGiant);
        const sociosGiants = g.todosMembros.filter((m) => m.isGiant);
        const titular = sociosNaoGiants[0] || g.todosMembros[0];

        const algumPago = sociosNaoGiants.some((m) => Boolean(m.almoco_pago) || Number(m.valor_almoco || 0) >= 1000);
        const algumCortesia = !algumPago && sociosNaoGiants.some((m) => Boolean(m.cortesia_almoco));
        const algumSemAlmoco = !algumPago && !algumCortesia && sociosNaoGiants.some((m) => Boolean(m.atendimento_sem_almoco));
        const apenasGiants = sociosNaoGiants.length === 0 && sociosGiants.length > 0;

        const participantesAlmoco = sociosNaoGiants.filter((m) => Boolean(m.almoco_pago || m.cortesia_almoco || m.atendimento_sem_almoco));
        const alocadosMesa = participantesAlmoco.filter((m) => Boolean(m.mesa_alocada));
        const paganteComCv = sociosNaoGiants.find((m) => m.cv_cartao);

        const idsGrupo = new Set(g.todosMembros.map((m) => Number(m.id)));
        const cnpjGrupoLimpo = String(g.cnpj || '').replace(/\D/g, '');
        const propFin = (Array.isArray(propostasFinanceiro) ? propostasFinanceiro : []).find((pf) => {
          if (idsGrupo.has(Number(pf.aplicacao_id || pf.ficha_id || pf.cliente_id))) return true;
          const cnpjPf = String(pf.cnpj || pf.cpf_cnpj || pf.dados_proposta?.cnpj || '').replace(/\D/g, '');
          return cnpjGrupoLimpo.length === 14 && cnpjPf === cnpjGrupoLimpo;
        });

        const statusAprovacaoFin = String(
          propFin?.status_aprovacao ||
            sociosNaoGiants.find((m) => m.status_aprovacao)?.status_aprovacao ||
            ''
        )
          .trim()
          .toUpperCase();

        const isDevolvidoAjuste =
          statusAprovacaoFin === 'AJUSTE_SOLICITADO' ||
          sociosNaoGiants.some((m) => String(m.etapa_funil || '').trim().toLowerCase() === 'ajuste_solicitado');

        const isRecusadoFin =
          !isDevolvidoAjuste && ['RECUSADA', 'RECUSADO'].includes(statusAprovacaoFin);

        const isFechadoAprovado =
          !isDevolvidoAjuste &&
          !isRecusadoFin &&
          (['APROVADA', 'APROVADO', 'APROVADA_COM_RESSALVA'].includes(statusAprovacaoFin) ||
            sociosNaoGiants.some((m) => {
              const st = String(m.status_aprovacao || '').trim().toLowerCase();
              const et = String(m.etapa_funil || '').trim().toLowerCase();
              return (
                ['aprovada', 'aprovado', 'aprovada_com_ressalva'].includes(st) ||
                ['fechamento', 'concluido', 'concluida', 'vendido'].includes(et)
              );
            }));

        const isDecisaoFutura =
          !isDevolvidoAjuste &&
          !isFechadoAprovado &&
          sociosNaoGiants.some((m) => {
            const et = String(m.etapa_funil || '').trim().toLowerCase();
            return ['decisao_futura', 'follow_up'].includes(et);
          });

        const isNaoFechou =
          !isDevolvidoAjuste &&
          !isFechadoAprovado &&
          !isDecisaoFutura &&
          (isRecusadoFin ||
            sociosNaoGiants.some((m) => {
              const et = String(m.etapa_funil || '').trim().toLowerCase();
              return ['reprovado', 'nao_fechou', 'sem_interesse'].includes(et);
            }));

        const isAguardandoFinanceiro =
          !isDevolvidoAjuste &&
          !isFechadoAprovado &&
          !isDecisaoFutura &&
          !isNaoFechou &&
          sociosNaoGiants.some((m) => {
            const et = String(m.etapa_funil || '').trim().toLowerCase();
            const st = String(m.status_aprovacao || '').trim().toLowerCase();
            return et === 'aguardando_aprovacao' || st === 'pendente' || (Boolean(m.ficha_fechada) && Boolean(m.dados_proposta));
          });

        const fichaComProposta = sociosNaoGiants.find((m) => m.dados_proposta || Number(m.valor_negociado || 0) > 0);
        const produtoFechado =
          propFin?.dados_proposta?.categoriaProduto ||
          propFin?.produto_nome ||
          fichaComProposta?.dados_proposta?.categoriaProduto ||
          fichaComProposta?.dados_proposta?.produtoNome ||
          '';

        const motivoDevolucaoFin =
          propFin?.motivo_devolucao ||
          propFin?.af_observacoes_auditoria ||
          propFin?.parecer_financeiro ||
          sociosNaoGiants.find((m) => m.motivo_reabertura)?.motivo_reabertura ||
          '';

        const obsComercialFicha =
          sociosNaoGiants.find((m) => String(m.resultado_obs || '').trim())?.resultado_obs ||
          propFin?.dados_proposta?.observacoes ||
          '';

        const entrevistadorMesa =
          alocadosMesa.find((m) => m.entrevistador_nome || m.vendedor_nome)?.entrevistador_nome ||
          alocadosMesa.find((m) => m.vendedor_nome)?.vendedor_nome ||
          '';

        const refEsperaMesa =
          participantesAlmoco
            .map((m) => m.almoco_validado_em || m.updated_at || m.created_at)
            .filter(Boolean)
            .sort()[0] || null;

        const isPendente =
          !apenasGiants &&
          !algumPago &&
          !algumCortesia &&
          !algumSemAlmoco &&
          !isFechadoAprovado &&
          !isAguardandoFinanceiro &&
          !isDecisaoFutura &&
          !isNaoFechou &&
          !isDevolvidoAjuste;

        const isAguardandoMesa =
          !isPendente &&
          !apenasGiants &&
          !isFechadoAprovado &&
          !isAguardandoFinanceiro &&
          !isDecisaoFutura &&
          !isNaoFechou &&
          !isDevolvidoAjuste &&
          alocadosMesa.length === 0;

        const isEmMesa =
          !isPendente &&
          !apenasGiants &&
          !isFechadoAprovado &&
          !isAguardandoFinanceiro &&
          !isDecisaoFutura &&
          !isNaoFechou &&
          !isDevolvidoAjuste &&
          alocadosMesa.length > 0;

        return {
          ...g,
          idPrincipal: titular.id,
          titular,
          sociosNaoGiants,
          sociosGiants,
          algumPago,
          algumCortesia,
          algumSemAlmoco,
          apenasGiants,
          statusAprovacaoFin,
          isDevolvidoAjuste,
          isRecusadoFin,
          isFechadoAprovado,
          isDecisaoFutura,
          isNaoFechou,
          isAguardandoFinanceiro,
          isAguardandoMesa,
          isEmMesa,
          produtoFechado,
          motivoDevolucaoFin,
          obsComercialFicha,
          entrevistadorMesa,
          refEsperaMesa,
          isPendente,
          participantesAlmoco,
          alocadosMesa,
          cvCartao: paganteComCv?.cv_cartao || ''
        };
      })
      .sort((a, b) => a.empresa.localeCompare(b.empresa, 'pt-BR', { sensitivity: 'base' }));
  }, [participantes, propostasFinanceiro]);

  const empresasFiltradas = gruposEmpresas.filter((g) => {
    const termo = (busca || '').toLowerCase().trim();
    const matchTermo =
      !termo ||
      g.empresa.toLowerCase().includes(termo) ||
      String(g.cnpj || '').toLowerCase().includes(termo) ||
      String(g.idPrincipal).includes(termo) ||
      g.todosMembros.some((m) => m.nomeExibicao.toLowerCase().includes(termo));

    if (!matchTermo) return false;

    if (filtroAlmoco === 'pendentes') return g.isPendente;
    if (filtroAlmoco === 'aguardando_mesa') return g.isAguardandoMesa;
    if (filtroAlmoco === 'em_mesa') return g.isEmMesa;
    if (filtroAlmoco === 'aguardando_fin') return g.isAguardandoFinanceiro;
    if (filtroAlmoco === 'devolvidos') return g.isDevolvidoAjuste;
    if (filtroAlmoco === 'decisao_futura') return g.isDecisaoFutura;
    if (filtroAlmoco === 'fechados') return g.isFechadoAprovado || g.isAguardandoFinanceiro;
    if (filtroAlmoco === 'pagos') return g.algumPago;
    if (filtroAlmoco === 'giants') return g.apenasGiants || g.sociosGiants.length > 0;
    if (filtroAlmoco === 'cortesia') return g.algumCortesia;
    if (filtroAlmoco === 'sem_almoco') return g.algumSemAlmoco;
    return true;
  });

  const totalPendentes = gruposEmpresas.filter((g) => g.isPendente).length;
  const totalAguardandoMesa = gruposEmpresas.filter((g) => g.isAguardandoMesa).length;
  const totalEmMesa = gruposEmpresas.filter((g) => g.isEmMesa).length;
  const totalAguardandoFin = gruposEmpresas.filter((g) => g.isAguardandoFinanceiro).length;
  const totalDevolvidos = gruposEmpresas.filter((g) => g.isDevolvidoAjuste).length;
  const totalDecisaoFutura = gruposEmpresas.filter((g) => g.isDecisaoFutura).length;
  const totalFechados = gruposEmpresas.filter((g) => g.isFechadoAprovado || g.isAguardandoFinanceiro).length;
  const totalPagos = gruposEmpresas.filter((g) => g.algumPago).length;
  const totalGiants = gruposEmpresas.filter((g) => g.apenasGiants || g.sociosGiants.length > 0).length;
  const totalCortesia = gruposEmpresas.filter((g) => g.algumCortesia).length;
  const totalSemAlmoco = gruposEmpresas.filter((g) => g.algumSemAlmoco).length;

  const totalPaginas = Math.ceil(empresasFiltradas.length / itensPorPagina) || 1;
  const indiceInicial = (pagina - 1) * itensPorPagina;
  const empresasExibidas = empresasFiltradas.slice(indiceInicial, indiceInicial + itensPorPagina);

  // Abre o modal consolidado da empresa mostrando os sócios não-GIANTS e o checklist do almoço
  const abrirModalEmpresa = (grupo) => {
    if (usuarioEhFinanceiro) return;
    setGrupoAlvo(grupo);

    if (grupo.apenasGiants) {
      setTipoAlmoco('giants');
    } else if (grupo.algumCortesia) {
      setTipoAlmoco('cortesia');
    } else if (grupo.algumSemAlmoco) {
      setTipoAlmoco('sem_almoco');
    } else {
      setTipoAlmoco('pago');
    }

    setCvCartao(grupo.cvCartao || '');

    // Pré-seleciona no checklist quem já está marcado para o almoço ou, se ainda pendente, todos os sócios não-GIANTS
    const jaMarcados = grupo.sociosNaoGiants
      .filter((m) => Boolean(m.almoco_pago || m.cortesia_almoco || m.atendimento_sem_almoco))
      .map((m) => m.id);

    setSociosSelecionadosAlmoco(
      jaMarcados.length > 0 ? jaMarcados : grupo.sociosNaoGiants.map((m) => m.id)
    );
    setModalEmpresaAberto(true);
  };

  const alternarSocioChecklist = (socioId) => {
    setSociosSelecionadosAlmoco((prev) => {
      if (prev.includes(socioId)) {
        // Garante ao menos 1 participante marcado quando o almoço estiver pago ou cortesia
        if (prev.length <= 1) return prev;
        return prev.filter((id) => id !== socioId);
      }
      return [...prev, socioId];
    });
  };

  const salvarModalEmpresa = async (e) => {
    e.preventDefault();
    if (usuarioEhFinanceiro) return;
    if (!grupoAlvo) return;

    try {
      setSalvandoAlmoco(true);
      const idsNaoGiants = grupoAlvo.sociosNaoGiants.map((m) => m.id);
      const alvoId = grupoAlvo.idPrincipal;

      await api.patch(`/clientes/${alvoId}/almoco`, {
        tipo: tipoAlmoco,
        cv_cartao: tipoAlmoco === 'pago' ? cvCartao : null,
        participantes_ids: tipoAlmoco === 'pendente' ? [] : sociosSelecionadosAlmoco,
        todos_empresa_ids: idsNaoGiants.length > 0 ? idsNaoGiants : [alvoId]
      });

      await carregarDados();
      setModalEmpresaAberto(false);
    } catch (err) {
      setErro('Erro ao salvar validação de almoço da empresa: ' + err.message); setModalEmpresaAberto(false);
    } finally {
      setSalvandoAlmoco(false);
    }
  };

  const executarReaberturaFicha = async () => {
    if (!usuarioEhAdmin) {
      setErro('Acesso negado: somente Administrador pode reabrir fichas encerradas.');
      setGrupoReabrir(null);
      return;
    }
    if (!grupoReabrir) return;
    try {
      setReabrindoFicha(true);
      await api.post('/entrevistas/reabrir', {
        fichaId: grupoReabrir.idPrincipal,
        turmaId: turmaSelecionada || localStorage.getItem('turma_ativa_id') || '1491',
        cnpj: grupoReabrir.cnpj,
        empresa: grupoReabrir.empresa,
        papel: obterPapelUsuarioLogado() || 'ENTREVISTADOR'
      });
      const idDestino = grupoReabrir.idPrincipal;
      setGrupoReabrir(null);
      navigate(`/interviews/${idDestino}/edit`);
    } catch (err) {
      setErro('Erro ao reabrir ficha: ' + err.message);
      setGrupoReabrir(null);
    } finally {
      setReabrindoFicha(false);
    }
  };

  const retomarFichaParaAtendimento = async (grupo, motivoTexto) => {
    if (usuarioEhFinanceiro || retomandoId) return;
    try {
      setRetomandoId(grupo.idPrincipal);
      await api.post(`/entrevistas/${grupo.idPrincipal}/reabrir`, {
        motivo: motivoTexto
      });
      navigate(`/interviews/${grupo.idPrincipal}/edit`);
    } catch (err) {
      setErro('Não foi possível reabrir a ficha: ' + err.message);
    } finally {
      setRetomandoId(null);
    }
  };

  const calcularMinutosEspera = (isoDate) => {
    if (!isoDate) return null;
    const ts = new Date(isoDate).getTime();
    if (Number.isNaN(ts)) return null;
    return Math.max(0, Math.floor((Date.now() - ts) / 60000));
  };

  const formatarRotuloAlmoco = (g, qtdNoAlmoco) => {
    const sufixoSocios =
      g.sociosNaoGiants.length > 1 && qtdNoAlmoco < g.sociosNaoGiants.length
        ? ` (${qtdNoAlmoco}/${g.sociosNaoGiants.length} sócios)`
        : '';
    if (g.algumPago) {
      return g.cvCartao ? `● Pago ${g.cvCartao}${sufixoSocios}` : `● Pago R$ 1.000${sufixoSocios}`;
    }
    if (g.algumCortesia) return `● Cortesia${sufixoSocios}`;
    if (g.algumSemAlmoco) return `● Sem Almoço${sufixoSocios}`;
    return '● Validado';
  };

  const obterEstagioGrupo = (g) => {
    const qtdNoAlmoco = g.participantesAlmoco.length || g.sociosNaoGiants.length;
    const rotuloAlmocoBase = formatarRotuloAlmoco(g, qtdNoAlmoco);
    const bgAlmocoBase = g.algumPago ? '#dcfce7' : '#e0f2fe';
    const corAlmocoBase = g.algumPago ? '#15803d' : '#0369a1';

    if (g.isDevolvidoAjuste) {
      return {
        passo: 3.2,
        devolvidoAjuste: true,
        rotuloAlmoco: rotuloAlmocoBase,
        bgAlmoco: bgAlmocoBase,
        corAlmoco: corAlmocoBase,
        rotuloMesa: 'Devolvido p/ Ajuste',
        iconeMesa: 'reply',
        bgMesa: '#fef2f2',
        corMesa: '#b91c1c',
        bordaMesa: '#fecaca',
        podeEntrevista: false
      };
    }

    if (g.isFechadoAprovado) {
      return {
        passo: 4,
        fechado: true,
        rotuloAlmoco: rotuloAlmocoBase,
        bgAlmoco: bgAlmocoBase,
        corAlmoco: corAlmocoBase,
        rotuloMesa: 'Concluído (Mesa Liberada)',
        iconeMesa: 'task_alt',
        bgMesa: '#f0fdf4',
        corMesa: '#15803d',
        bordaMesa: '#bbf7d0',
        podeEntrevista: false
      };
    }

    if (g.isDecisaoFutura) {
      return {
        passo: 4,
        fechado: true,
        decisaoFutura: true,
        rotuloAlmoco: rotuloAlmocoBase,
        bgAlmoco: bgAlmocoBase,
        corAlmoco: corAlmocoBase,
        rotuloMesa: 'Decisão Futura (Follow-up)',
        iconeMesa: 'schedule',
        bgMesa: '#f3e8ff',
        corMesa: '#7e22ce',
        bordaMesa: '#d8b4fe',
        podeEntrevista: false
      };
    }

    if (g.isNaoFechou) {
      return {
        passo: 4,
        fechado: true,
        naoFechou: true,
        rotuloAlmoco: rotuloAlmocoBase,
        bgAlmoco: bgAlmocoBase,
        corAlmoco: corAlmocoBase,
        rotuloMesa: g.isRecusadoFin ? 'Recusada pelo Financeiro' : 'Não Fechou (Encerrada)',
        iconeMesa: 'cancel',
        bgMesa: '#f1f5f9',
        corMesa: '#475569',
        bordaMesa: '#cbd5e1',
        podeEntrevista: false
      };
    }

    if (g.isAguardandoFinanceiro) {
      return {
        passo: 3.5,
        aguardandoFinanceiro: true,
        rotuloAlmoco: rotuloAlmocoBase,
        bgAlmoco: bgAlmocoBase,
        corAlmoco: corAlmocoBase,
        rotuloMesa: 'Em Análise Financeira',
        iconeMesa: 'hourglass_top',
        bgMesa: '#fffbeb',
        corMesa: '#b45309',
        bordaMesa: '#fde68a',
        podeEntrevista: false
      };
    }

    if (g.apenasGiants) {
      return {
        passo: 3,
        rotuloAlmoco: '● GIANTS (Isento)',
        bgAlmoco: '#f3e8ff',
        corAlmoco: '#7e22ce',
        rotuloMesa: 'Isento Triagem',
        bgMesa: '#faf5ff',
        corMesa: '#7e22ce',
        podeEntrevista: false
      };
    }

    if (g.isPendente) {
      return {
        passo: 1,
        rotuloAlmoco: '⚠️ Almoço Pendente',
        bgAlmoco: '#fef3c7',
        corAlmoco: '#b45309',
        rotuloMesa: 'Bloqueado',
        bgMesa: '#f1f5f9',
        corMesa: '#94a3b8',
        podeEntrevista: false
      };
    }

    if (g.alocadosMesa.length === 0) {
      const minsEspera = calcularMinutosEspera(g.refEsperaMesa);
      return {
        passo: 2,
        rotuloAlmoco: rotuloAlmocoBase,
        bgAlmoco: bgAlmocoBase,
        corAlmoco: corAlmocoBase,
        rotuloMesa: `Alocar Mesa (${qtdNoAlmoco})`,
        minsEspera,
        bgMesa: '#fff7ed',
        corMesa: '#c2410c',
        podeEntrevista: false
      };
    }

    const mesasUnicas = [...new Set(g.alocadosMesa.map((m) => `Mesa ${m.mesa_alocada}`))].join(', ');
    return {
      passo: 3,
      rotuloAlmoco: rotuloAlmocoBase,
      bgAlmoco: bgAlmocoBase,
      corAlmoco: corAlmocoBase,
      rotuloMesa: `${mesasUnicas} (${g.alocadosMesa.length}/${qtdNoAlmoco})`,
      entrevistadorMesa: g.entrevistadorMesa,
      bgMesa: '#eff6ff',
      corMesa: '#1d4ed8',
      podeEntrevista: true
    };
  };

  return (
    <div style={{ padding: '2rem', width: '100%', boxSizing: 'border-box' }}>
      {/* Cabeçalho Alinhado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.15rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
            Base de Empresas — Fluxo Pré-Entrevista
          </h1>
          <p style={{ color: '#64748b', margin: '0.25rem 0 0', fontSize: '0.88rem' }}>
            1. Validar Almoço (Checklist de Sócios) → 2. Alocar na Mesa → 3. Entrevista e Fechamento por CNPJ
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <a
            href={`${import.meta.env.VITE_API_URL || '/api'}/financeiro/exportar-csv?turmaId=${turmaSelecionada || localStorage.getItem('turma_ativa_id') || '1491'}`}
            target="_blank"
            rel="noreferrer"
            style={{
              background: '#059669',
              color: '#ffffff',
              padding: '0.52rem 0.95rem',
              borderRadius: '8px',
              fontWeight: '800',
              fontSize: '0.8rem',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.38rem'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.05rem' }}>download</span>
            Exportar Planilha (Excel/CSV)
          </a>
          <button
            onClick={() => navigate('/lunch')}
            style={{ background: '#f0f9ff', border: '1px solid #bae6fd', padding: '0.52rem 0.95rem', borderRadius: '8px', fontWeight: '700', fontSize: '0.8rem', cursor: usuarioEhFinanceiro ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.38rem', color: '#0369a1' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>restaurant</span>
            Ver Salão & Mesas
          </button>
          <button
            onClick={carregarDados}
            style={{ background: '#fff', border: '1px solid #cbd5e1', padding: '0.52rem 0.95rem', borderRadius: '8px', fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#334155' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>refresh</span>
            Atualizar
          </button>
        </div>
      </div>

      {avisoRetornoFicha && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', padding: '0.85rem 1.1rem', borderRadius: '10px', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', fontSize: '0.86rem', fontWeight: '700' }}>
          <span>
            ✔ Ficha da empresa <strong>{avisoRetornoFicha.empresa}</strong> ({avisoRetornoFicha.resultado}) finalizada e bloqueada — mesa liberada no salão!
          </span>
          <button
            type="button"
            onClick={() => setAvisoRetornoFicha(null)}
            style={{ background: 'transparent', border: 'none', color: '#166534', fontWeight: '800', cursor: 'pointer', fontSize: '1rem' }}
          >
            ✕
          </button>
        </div>
      )}

      {erro && (
        <div style={{ background: '#fef2f2', color: '#ef4444', padding: '1rem', borderRadius: '8px', marginBottom: '1.25rem', border: '1px solid #fecaca' }}>
          {erro}
        </div>
      )}

      {/* Painel de Funil Clicável por Etapa */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.85rem' }}>
        {[
          { id: 'todos', label: 'Todas as Empresas', count: gruposEmpresas.length, bg: '#f1f5f9', cor: '#0f172a', borda: '#cbd5e1' },
          { id: 'pendentes', label: '1. Almoço Pendente', count: totalPendentes, bg: '#fef3c7', cor: '#92400e', borda: '#fcd34d' },
          { id: 'aguardando_mesa', label: '2. Aguardando Mesa', count: totalAguardandoMesa, bg: '#fff7ed', cor: '#c2410c', borda: '#fdba74' },
          { id: 'em_mesa', label: '3. Em Mesa', count: totalEmMesa, bg: '#eff6ff', cor: '#1d4ed8', borda: '#bfdbfe' },
          { id: 'aguardando_fin', label: 'Em Análise Fin.', count: totalAguardandoFin, bg: '#fefce8', cor: '#a16207', borda: '#fde047' },
          ...(totalDevolvidos > 0
            ? [{ id: 'devolvidos', label: '↩ Devolvidos p/ Ajuste', count: totalDevolvidos, bg: '#fef2f2', cor: '#b91c1c', borda: '#fca5a5' }]
            : []),
          { id: 'decisao_futura', label: 'Decisão Futura', count: totalDecisaoFutura, bg: '#f3e8ff', cor: '#7e22ce', borda: '#d8b4fe' },
          { id: 'fechados', label: '🏆 Fechados', count: totalFechados, bg: '#dcfce7', cor: '#166534', borda: '#86efac' }
        ].map((tab) => {
          const ativo = filtroAlmoco === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => { setFiltroAlmoco(tab.id); setPagina(1); }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.45rem 0.85rem',
                borderRadius: '999px',
                border: ativo ? `2px solid ${tab.cor}` : `1px solid ${tab.borda}`,
                background: ativo ? tab.bg : '#ffffff',
                color: ativo ? tab.cor : '#475569',
                fontSize: '0.78rem',
                fontWeight: ativo ? '800' : '700',
                cursor: 'pointer',
                boxShadow: ativo ? '0 2px 6px rgba(15,23,42,0.08)' : 'none'
              }}
            >
              <span>{tab.label}</span>
              <span style={{ background: ativo ? tab.cor : '#e2e8f0', color: ativo ? '#ffffff' : '#334155', padding: '0.08rem 0.45rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: '800' }}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Barra de Pesquisa + Subfiltros de Modalidade */}
      <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '280px', background: '#fff', padding: '0.72rem 1.1rem', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '0.65rem', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
          <span className="material-symbols-outlined" style={{ color: '#94a3b8' }}>search</span>
          <input
            type="text"
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setPagina(1); }}
            placeholder="Pesquisar por Razão Social, Nome do Sócio, CNPJ ou ID..."
            style={{ width: '100%', border: 'none', outline: 'none', fontSize: '0.9rem', color: '#1e293b' }}
          />
          {busca && (
            <button
              type="button"
              onClick={() => { setBusca(''); setPagina(1); }}
              style={{ background: '#f1f5f9', border: 'none', borderRadius: '6px', padding: '0.15rem 0.45rem', fontWeight: '800', color: '#475569', cursor: 'pointer', fontSize: '0.78rem' }}
            >
              ✕
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {[
            { id: 'pagos', label: `Almoço Pago (${totalPagos})` },
            { id: 'cortesia', label: `Cortesia (${totalCortesia})` },
            { id: 'sem_almoco', label: `Sem Almoço (${totalSemAlmoco})` },
            { id: 'giants', label: `Com GIANTS (${totalGiants})` }
          ].map((chip) => {
            const ativo = filtroAlmoco === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => { setFiltroAlmoco(ativo ? 'todos' : chip.id); setPagina(1); }}
                style={{
                  padding: '0.42rem 0.72rem',
                  borderRadius: '8px',
                  border: ativo ? '1.5px solid #0284c7' : '1px solid #cbd5e1',
                  background: ativo ? '#e0f2fe' : '#ffffff',
                  color: ativo ? '#0369a1' : '#475569',
                  fontSize: '0.75rem',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tabela Consolidada por Empresa (1 linha = 1 CNPJ) */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <tr>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem', width: '75px' }}>Ref.</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Empresa / Sócios na Turma</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>CNPJ / Documento</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>1. Almoço (Checklist)</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>2. Mesa Lunch</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem', textAlign: 'right' }}>3. Entrevista</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr><td colSpan="6" style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>Carregando empresas...</td></tr>
            ) : empresasExibidas.length === 0 ? (
              <tr><td colSpan="6" style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>Nenhuma empresa encontrada.</td></tr>
            ) : (
              empresasExibidas.map((g) => {
                const estagio = obterEstagioGrupo(g);
                const proximoAlocar = g.participantesAlmoco.find((m) => !m.mesa_alocada) || g.participantesAlmoco[0] || g.titular;
                return (
                  <tr key={g.chave} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '1rem', fontWeight: '700', color: '#ff5722' }}>
                      #{g.idPrincipal}
                    </td>

                    {/* Empresa + Sócios clicável para abrir o modal */}
                    <td style={{ padding: '1rem' }}>
                      <div
                        onClick={() => !usuarioEhFinanceiro && abrirModalEmpresa(g)}
                        title={usuarioEhFinanceiro ? "Visualização somente leitura (Financeiro não valida almoço)" : "Clique para abrir os sócios da empresa e configurar o almoço"}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap', cursor: 'pointer' }}
                      >
                        <span style={{ fontWeight: '800', color: '#0f172a', fontSize: '0.92rem' }}>
                          {g.empresa}
                        </span>

                        {g.isDevolvidoAjuste && (
                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: '800',
                            background: '#fef2f2',
                            color: '#b91c1c',
                            border: '1px solid #fca5a5',
                            padding: '0.16rem 0.55rem',
                            borderRadius: '999px'
                          }}>
                            ↩ Devolvido p/ Ajuste
                          </span>
                        )}

                        {g.isFechadoAprovado && (
                          <>
                            <span style={{
                              fontSize: '0.72rem',
                              fontWeight: '800',
                              background: '#15803d',
                              color: '#ffffff',
                              padding: '0.18rem 0.6rem',
                              borderRadius: '999px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem'
                            }}>
                              🏆 FECHADO {g.produtoFechado ? `(${g.produtoFechado})` : ''}
                            </span>
                            {g.statusAprovacaoFin === 'APROVADA_COM_RESSALVA' ? (
                              <span style={{ fontSize: '0.7rem', fontWeight: '800', background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', padding: '0.15rem 0.5rem', borderRadius: '999px' }}>
                                ⚠ Aprovado c/ Ressalva
                              </span>
                            ) : ['APROVADA', 'APROVADO'].includes(g.statusAprovacaoFin) ? (
                              <span style={{ fontSize: '0.7rem', fontWeight: '800', background: '#dcfce7', color: '#166534', border: '1px solid #86efac', padding: '0.15rem 0.5rem', borderRadius: '999px' }}>
                                ✔ Financeiro OK
                              </span>
                            ) : null}
                          </>
                        )}

                        {g.isAguardandoFinanceiro && (
                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: '800',
                            background: '#fef3c7',
                            color: '#92400e',
                            border: '1px solid #fcd34d',
                            padding: '0.16rem 0.55rem',
                            borderRadius: '999px'
                          }}>
                            ⏳ {g.produtoFechado ? `${g.produtoFechado} • ` : ''}Em Análise Fin.
                          </span>
                        )}

                        {(() => {
                          const membros = g.sociosNaoGiants || g.membros || g.socios || g.participantes || [];
                          const cbAlmoco = membros.some((m) => Boolean(m.almoco_pago) || Number(m.valor_almoco || 0) >= 1000) ? 1000 : 0;
                          const cbUpgrade = membros.reduce((mx, m) => Math.max(mx, Number(m.cashback_upgrade_90_pct) || 0), 0);
                          const cbTotal = Math.max(Number(g.cashbackTotalCnpj || 0), cbAlmoco + cbUpgrade);
                          if (cbTotal <= 0) return null;
                          const hist = g.historicoUpgradeCnpj || (membros.find((m) => m.historico_produtos_elegiveis) || {}).historico_produtos_elegiveis || '';
                          return (
                            <span
                              title={hist ? `Almoço + Upgrade 90%: ${hist}` : 'Crédito de Almoço Pago'}
                              style={{
                                background: '#ecfdf5',
                                color: '#047857',
                                border: '1px solid #6ee7b7',
                                padding: '0.15rem 0.55rem',
                                borderRadius: '999px',
                                fontSize: '0.72rem',
                                fontWeight: '800',
                                display: 'inline-flex',
                                alignItems: 'center'
                              }}
                            >
                              Cashback: {cbTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                          );
                        })()}

                        {g.sociosGiants.length > 0 && (
                          <span style={{ fontSize: '0.72rem', fontWeight: '700', background: '#f3e8ff', color: '#7e22ce', padding: '0.15rem 0.5rem', borderRadius: '999px' }}>
                            {g.sociosGiants.length} GIANTS
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.22rem' }}>
                        {g.sociosNaoGiants.length > 0 ? (
                          <span>
                            <strong>Sócios ({g.sociosNaoGiants.length}):</strong>{' '}
                            {g.sociosNaoGiants.map((s, i) => {
                              const vaiAlmoco = Boolean(s.almoco_pago || s.cortesia_almoco || s.atendimento_sem_almoco);
                              return (
                                <span key={s.id}>
                                  {i > 0 && ', '}
                                  <span style={{ color: vaiAlmoco ? '#15803d' : '#475569', fontWeight: vaiAlmoco ? '700' : '400' }}>
                                    {s.nomeExibicao}
                                    {vaiAlmoco ? ' ✓' : ''}
                                  </span>
                                </span>
                              );
                            })}
                          </span>
                        ) : (
                          <span>
                            <strong>Membro GIANTS:</strong> {g.sociosGiants.map((s) => s.nomeExibicao).join(', ')}
                          </span>
                        )}
                      </div>

                      {g.isDevolvidoAjuste && g.motivoDevolucaoFin && (
                        <div style={{ fontSize: '0.74rem', color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '0.25rem 0.55rem', marginTop: '0.3rem', display: 'inline-block' }}>
                          <strong>Motivo Financeiro:</strong> {g.motivoDevolucaoFin}
                        </div>
                      )}

                      {(g.isDecisaoFutura || g.isNaoFechou) && g.obsComercialFicha && (
                        <div style={{ fontSize: '0.74rem', color: g.isDecisaoFutura ? '#6b21a8' : '#475569', background: g.isDecisaoFutura ? '#faf5ff' : '#f8fafc', border: `1px solid ${g.isDecisaoFutura ? '#e9d5ff' : '#e2e8f0'}`, borderRadius: '6px', padding: '0.22rem 0.55rem', marginTop: '0.3rem', display: 'inline-block' }}>
                          <strong>Motivo:</strong> {g.obsComercialFicha}
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '1rem', color: '#64748b', fontSize: '0.85rem', fontFamily: 'monospace' }}>
                      {g.apenasGiants ? (
                        `Inscrição Individual • Ref #${g.idPrincipal}`
                      ) : g.cnpj ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span>{g.cnpj}</span>
                          <button
                            type="button"
                            className="btn-copy-chip"
                            title="Copiar CNPJ"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard?.writeText(g.cnpj).then(() => {
                                toastSistema(`CNPJ copiado: ${g.cnpj}`, 'sucesso', 2200);
                              }).catch(() => {});
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '0.82rem' }}>content_copy</span>
                          </button>
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>

                    {/* 1. Almoço */}
                    <td style={{ padding: '1rem' }}>
                      <button
                        onClick={() => !usuarioEhFinanceiro && abrirModalEmpresa(g)}
                        style={{
                          background: estagio.bgAlmoco,
                          color: estagio.corAlmoco,
                          border: 'none',
                          padding: '0.35rem 0.75rem',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          fontWeight: '700',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem'
                        }}
                        title="Clique para validar almoço e marcar quais sócios vão participar"
                      >
                        {estagio.rotuloAlmoco}
                        {!usuarioEhFinanceiro && <span className="material-symbols-outlined" style={{ fontSize: '0.85rem' }}>edit</span>}
                      </button>
                    </td>

                    {/* 2. Mesa Lunch */}
                    <td style={{ padding: '1rem' }}>
                      {estagio.devolvidoAjuste || estagio.fechado ? (
                        <span style={{
                          background: estagio.bgMesa || '#f0fdf4',
                          color: estagio.corMesa || '#15803d',
                          border: `1px solid ${estagio.bordaMesa || '#bbf7d0'}`,
                          padding: '0.35rem 0.75rem',
                          borderRadius: '6px',
                          fontSize: '0.78rem',
                          fontWeight: '700',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem'
                        }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>{estagio.iconeMesa || 'task_alt'}</span>
                          {estagio.rotuloMesa}
                        </span>
                      ) : estagio.aguardandoFinanceiro ? (
                        <span style={{
                          background: '#fffbeb',
                          color: '#b45309',
                          border: '1px solid #fde68a',
                          padding: '0.35rem 0.75rem',
                          borderRadius: '6px',
                          fontSize: '0.78rem',
                          fontWeight: '700',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem'
                        }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>hourglass_top</span>
                          {estagio.rotuloMesa}
                        </span>
                      ) : estagio.passo === 1 ? (
                        <button
                          onClick={() => !usuarioEhFinanceiro && abrirModalEmpresa(g)}
                          style={{
                            background: '#f8fafc',
                            color: '#94a3b8',
                            border: '1px dashed #cbd5e1',
                            padding: '0.35rem 0.75rem',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: '600',
                            cursor: 'pointer'
                          }}
                        >
                          Aguardando Almoço
                        </button>
                      ) : g.apenasGiants ? (
                        <span style={{ fontSize: '0.8rem', color: '#7e22ce', fontWeight: '700' }}>Acesso VIP GIANTS</span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
                          <button
                            onClick={() => navigate(`/lunch?alocarId=${proximoAlocar.id}`)}
                            style={{
                              background: estagio.bgMesa,
                              color: estagio.corMesa,
                              border: '1px solid #cbd5e1',
                              padding: '0.35rem 0.75rem',
                              borderRadius: '6px',
                              fontSize: '0.8rem',
                              fontWeight: '700',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem'
                            }}
                            title="Abrir Salão & Mesas para alocar cadeiras dos sócios confirmados"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>table_restaurant</span>
                            {estagio.rotuloMesa}
                          </button>
                          {estagio.passo === 2 && estagio.minsEspera !== null && (
                            <span style={{
                              fontSize: '0.69rem',
                              fontWeight: '800',
                              color: estagio.minsEspera >= 15 ? '#dc2626' : '#64748b'
                            }}>
                              ⏱️ {estagio.minsEspera < 1 ? 'liberado agora' : `${estagio.minsEspera} min aguardando mesa`}
                            </span>
                          )}
                          {estagio.passo === 3 && estagio.entrevistadorMesa && (
                            <span style={{ fontSize: '0.7rem', color: '#475569', fontWeight: '600' }}>
                              Consultor: {estagio.entrevistadorMesa}
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* 3. Entrevista */}
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      {estagio.devolvidoAjuste ? (
                        <button
                          disabled={usuarioEhFinanceiro || retomandoId === g.idPrincipal}
                          onClick={() => retomarFichaParaAtendimento(g, 'Ajuste solicitado pelo Financeiro')}
                          style={{
                            background: '#dc2626',
                            color: '#ffffff',
                            border: 'none',
                            padding: '0.45rem 0.95rem',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: '800',
                            cursor: usuarioEhFinanceiro ? 'not-allowed' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem'
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>edit_note</span>
                          {retomandoId === g.idPrincipal ? 'Abrindo...' : 'Ajustar Ficha'}
                        </button>
                      ) : estagio.decisaoFutura ? (
                        <button
                          disabled={usuarioEhFinanceiro || retomandoId === g.idPrincipal}
                          onClick={() => retomarFichaParaAtendimento(g, 'Repescagem / Retomada de Decisão Futura')}
                          title="Reabrir ficha de Decisão Futura para nova abordagem comercial"
                          style={{
                            background: '#7e22ce',
                            color: '#ffffff',
                            border: 'none',
                            padding: '0.45rem 0.95rem',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: '800',
                            cursor: usuarioEhFinanceiro ? 'not-allowed' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem'
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>replay</span>
                          {retomandoId === g.idPrincipal ? 'Reabrindo...' : 'Repescar Ficha'}
                        </button>
                      ) : estagio.fechado ? (
                        usuarioEhAdmin ? (
                          <button
                            onClick={() => setGrupoReabrir(g)}
                            title="Administrador: clique para reabrir esta ficha fechada"
                            style={{
                              background: '#fffbeb',
                              color: '#b45309',
                              border: '1.5px solid #f59e0b',
                              padding: '0.45rem 0.95rem',
                              borderRadius: '6px',
                              fontSize: '0.8rem',
                              fontWeight: '800',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem'
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>lock_open</span>
                            Reabrir
                          </button>
                        ) : (
                          <button
                            disabled
                            title="Ficha fechada e bloqueada — somente Administrador pode reabrir"
                            style={{
                              background: '#f1f5f9',
                              color: '#64748b',
                              border: '1px solid #cbd5e1',
                              padding: '0.45rem 0.95rem',
                              borderRadius: '6px',
                              fontSize: '0.8rem',
                              fontWeight: '800',
                              cursor: 'not-allowed',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem'
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>lock</span>
                            Fechado (Bloqueado)
                          </button>
                        )
                      ) : estagio.aguardandoFinanceiro ? (
                        usuarioEhAdmin ? (
                          <button
                            onClick={() => setGrupoReabrir(g)}
                            title="Administrador: clique para reabrir esta ficha"
                            style={{
                              background: '#fffbeb',
                              color: '#b45309',
                              border: '1.5px solid #f59e0b',
                              padding: '0.45rem 0.95rem',
                              borderRadius: '6px',
                              fontSize: '0.8rem',
                              fontWeight: '800',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem'
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>lock_open</span>
                            Reabrir
                          </button>
                        ) : (
                          <button
                            disabled
                            title="Ficha bloqueada aguardando financeiro — somente Administrador pode reabrir"
                            style={{
                              background: '#fef3c7',
                              color: '#92400e',
                              border: '1px solid #fcd34d',
                              padding: '0.45rem 0.9rem',
                              borderRadius: '6px',
                              fontSize: '0.78rem',
                              fontWeight: '700',
                              cursor: 'not-allowed',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem'
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>lock</span>
                            Aguardando Financeiro
                          </button>
                        )
                      ) : g.apenasGiants ? (
                        <button
                          disabled
                          style={{
                            background: '#faf5ff',
                            color: '#7e22ce',
                            border: '1px solid #e9d5ff',
                            padding: '0.45rem 0.9rem',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: '700',
                            cursor: 'not-allowed',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem'
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>workspace_premium</span>
                          Isento (GIANTS)
                        </button>
                      ) : estagio.podeEntrevista ? (
                        <button
                          onClick={() => navigate(`/interviews/${g.idPrincipal}/edit`)}
                          style={{
                            background: '#16a34a',
                            color: '#fff',
                            border: 'none',
                            padding: '0.45rem 0.9rem',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: '700',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem'
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>check_circle</span>
                          Abrir Ficha CNPJ
                        </button>
                      ) : estagio.passo === 2 ? (
                        <button
                          onClick={() => navigate(`/lunch?alocarId=${proximoAlocar.id}`)}
                          style={{
                            background: '#fff7ed',
                            color: '#c2410c',
                            border: '1px solid #fdba74',
                            padding: '0.45rem 0.9rem',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: '700',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem'
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>lock</span>
                          Aguardando Mesa
                        </button>
                      ) : (
                        <button
                          onClick={() => !usuarioEhFinanceiro && abrirModalEmpresa(g)}
                          style={{
                            background: '#f1f5f9',
                            color: '#64748b',
                            border: '1px solid #cbd5e1',
                            padding: '0.45rem 0.9rem',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: '700',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem'
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: '#eab308' }}>lock</span>
                          Validar Almoço
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Paginação */}
        {!carregando && totalPaginas > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
              Mostrando {indiceInicial + 1} a {Math.min(indiceInicial + itensPorPagina, empresasFiltradas.length)} de {empresasFiltradas.length} empresas
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                disabled={pagina === 1}
                onClick={() => setPagina((p) => Math.max(p - 1, 1))}
                style={{ padding: '0.4rem 0.8rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: pagina === 1 ? 'not-allowed' : 'pointer', opacity: pagina === 1 ? 0.5 : 1, fontSize: '0.85rem' }}
              >
                Anterior
              </button>
              <span style={{ display: 'flex', alignItems: 'center', padding: '0 0.5rem', fontSize: '0.85rem', fontWeight: '600', color: '#334155' }}>
                Página {pagina} de {totalPaginas}
              </span>
              <button
                disabled={pagina === totalPaginas}
                onClick={() => setPagina((p) => Math.min(p + 1, totalPaginas))}
                style={{ padding: '0.4rem 0.8rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: pagina === totalPaginas ? 'not-allowed' : 'pointer', opacity: pagina === totalPaginas ? 0.5 : 1, fontSize: '0.85rem' }}
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL CONSOLIDADO DA EMPRESA: SÓCIOS NÃO-GIANTS + PAGAMENTO + CHECKLIST DE ALMOÇO */}
      {modalEmpresaAberto && grupoAlvo && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '580px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a', fontWeight: '800' }}>{grupoAlvo.empresa}</h3>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  {grupoAlvo.cnpj ? `CNPJ: ${grupoAlvo.cnpj} • ` : ''}
                  {grupoAlvo.sociosNaoGiants.length} {grupoAlvo.sociosNaoGiants.length === 1 ? 'sócio elegível na turma' : 'sócios elegíveis na turma'}
                </span>
              </div>
              <button onClick={() => setModalEmpresaAberto(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={salvarModalEmpresa} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* 1. Modalidade de Liberação do Almoço */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#334155', marginBottom: '0.6rem' }}>
                  1. Status do Almoço da Empresa:
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: '8px', border: tipoAlmoco === 'pago' ? '2px solid #16a34a' : '1px solid #e2e8f0', background: tipoAlmoco === 'pago' ? '#f0fdf4' : '#fff', cursor: 'pointer' }}>
                    <input type="radio" name="tipoAlmoco" value="pago" checked={tipoAlmoco === 'pago'} onChange={() => setTipoAlmoco('pago')} />
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '0.9rem', color: '#16a34a' }}>● Pago (R$ 1.000,00 por CNPJ)</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Taxa única cobrada da empresa; cobre todos os sócios marcados abaixo</div>
                    </div>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: '8px', border: tipoAlmoco === 'cortesia' ? '2px solid #0284c7' : '1px solid #e2e8f0', background: tipoAlmoco === 'cortesia' ? '#f0f9ff' : '#fff', cursor: 'pointer' }}>
                    <input type="radio" name="tipoAlmoco" value="cortesia" checked={tipoAlmoco === 'cortesia'} onChange={() => setTipoAlmoco('cortesia')} />
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '0.9rem', color: '#0284c7' }}>● Cortesia Autorizada</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Isenção autorizada pela diretoria (debita os R$ 1.000,00 de cobrança/cashback e mantém o almoço garantido)</div>
                    </div>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: '8px', border: tipoAlmoco === 'sem_almoco' ? '2px solid #7c3aed' : '1px solid #e2e8f0', background: tipoAlmoco === 'sem_almoco' ? '#f5f3ff' : '#fff', cursor: 'pointer' }}>
                    <input type="radio" name="tipoAlmoco" value="sem_almoco" checked={tipoAlmoco === 'sem_almoco'} onChange={() => setTipoAlmoco('sem_almoco')} />
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '0.9rem', color: '#7c3aed' }}>🤝 Atendimento Comercial (Sem Almoço)</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Libera mesa/entrevista para fechamento GIANTS ou PAC sem almoço pago, sem cortesia de refeição e sem cashback de R$ 1.000</div>
                    </div>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: '8px', border: tipoAlmoco === 'pendente' ? '2px solid #d97706' : '1px solid #e2e8f0', background: tipoAlmoco === 'pendente' ? '#fffbeb' : '#fff', cursor: 'pointer' }}>
                    <input type="radio" name="tipoAlmoco" value="pendente" checked={tipoAlmoco === 'pendente'} onChange={() => setTipoAlmoco('pendente')} />
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '0.9rem', color: '#b45309' }}>⏳ Pendente / Não Vai ao Almoço</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Mantém a empresa aguardando confirmação</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Comprovante Cartão quando Pago */}
              {tipoAlmoco === 'pago' && (
                <div style={{ background: '#f8fafc', padding: '0.9rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>
                    CV / NSU / Comprovante Cartão (Opcional):
                  </label>
                  <input
                    type="text"
                    value={cvCartao}
                    onChange={(e) => setCvCartao(e.target.value)}
                    placeholder="Ex: CV-849201"
                    style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', boxSizing: 'border-box' }}
                  />
                </div>
              )}

              {/* 2. Checklist de Sócios (não-GIANTS) que vão participar do Almoço */}
              {(tipoAlmoco === 'pago' || tipoAlmoco === 'cortesia' || tipoAlmoco === 'sem_almoco') && grupoAlvo.sociosNaoGiants.length > 0 && (
                <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: '10px', padding: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#166534' }}>
                      2. Checklist — Quem vai participar do Almoço?
                    </span>
                    <span style={{ fontSize: '0.75rem', fontWeight: '700', background: '#16a34a', color: '#fff', padding: '0.15rem 0.55rem', borderRadius: '999px' }}>
                      {sociosSelecionadosAlmoco.length} de {grupoAlvo.sociosNaoGiants.length} marcados
                    </span>
                  </div>
                  <p style={{ fontSize: '0.76rem', color: '#15803d', margin: '0 0 0.75rem 0' }}>
                    Apenas os sócios marcados abaixo terão acesso liberado para ocupar cadeiras no Salão & Mesas (exibe apenas sócios da turma que não são GIANTS).
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {grupoAlvo.sociosNaoGiants.map((socio) => {
                      const marcado = sociosSelecionadosAlmoco.includes(socio.id);
                      return (
                        <label
                          key={socio.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '0.65rem 0.85rem',
                            borderRadius: '8px',
                            background: '#fff',
                            border: marcado ? '1.5px solid #16a34a' : '1px solid #cbd5e1',
                            cursor: 'pointer'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                            <input
                              type="checkbox"
                              checked={marcado}
                              onChange={() => alternarSocioChecklist(socio.id)}
                              style={{ width: '17px', height: '17px', accentColor: '#16a34a', cursor: 'pointer' }}
                            />
                            <div>
                              <div style={{ fontWeight: '700', fontSize: '0.88rem', color: '#0f172a' }}>{socio.nomeExibicao}</div>
                              <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                                Ref #{socio.id} {socio.cargo ? `• ${socio.cargo}` : ''}
                                {socio.mesa_alocada ? ` • Mesa ${socio.mesa_alocada}` : ''}
                              </div>
                            </div>
                          </div>

                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: '700',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '5px',
                              background: marcado ? '#dcfce7' : '#f1f5f9',
                              color: marcado ? '#166534' : '#64748b'
                            }}
                          >
                            {marcado ? 'Vai ao Almoço' : 'Não participa'}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Aviso informativo caso a empresa também possua sócios GIANTS na turma */}
              {grupoAlvo.sociosGiants.length > 0 && (
                <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '8px', padding: '0.7rem 0.9rem', fontSize: '0.78rem', color: '#7e22ce' }}>
                  <strong>Sócios GIANTS desta empresa (já possuem acesso VIP próprio):</strong>{' '}
                  {grupoAlvo.sociosGiants.map((s) => s.nomeExibicao).join(', ')}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.25rem' }}>
                <button
                  type="button"
                  onClick={() => setModalEmpresaAberto(false)}
                  style={{ padding: '0.6rem 1.1rem', background: '#f1f5f9', border: 'none', borderRadius: '8px', color: '#475569', fontWeight: '600', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoAlmoco}
                  style={{ padding: '0.6rem 1.35rem', background: '#0284c7', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: '700', cursor: 'pointer', opacity: salvandoAlmoco ? 0.7 : 1 }}
                >
                  {salvandoAlmoco ? 'Salvando...' : 'Confirmar Almoço & Sócios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* MODAL DE CONFIRMAÇÃO PARA REABRIR FICHA APROVADA */}
      {grupoReabrir && (
        <div
          onClick={() => !reabrindoFicha && setGrupoReabrir(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '480px', overflow: 'hidden', boxShadow: '0 20px 35px rgba(15, 23, 42, 0.25)', border: '1px solid #e2e8f0' }}
          >
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fffbeb' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-outlined">lock_open</span>
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>Reabrir Ficha da Empresa?</h3>
                  <span style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: '600' }}>Ficha #{grupoReabrir.idPrincipal} • {grupoReabrir.empresa}</span>
                </div>
              </div>
              <button
                type="button"
                disabled={reabrindoFicha}
                onClick={() => setGrupoReabrir(null)}
                style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div style={{ padding: '1.35rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.84rem', color: '#334155', lineHeight: '1.5' }}>
              <p style={{ margin: 0 }}>
                Esta ficha já foi <strong>fechada e aprovada pelo Financeiro</strong>. Ao reabrir:
              </p>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.8rem 0.95rem', fontSize: '0.8rem' }}>
                <div>• Todos os campos comerciais e sócios voltarão a ficar <strong>liberados para edição</strong>.</div>
                <div style={{ marginTop: '0.25rem' }}>• Após concluir as alterações, será necessário clicar em <strong>Finalizar Ficha da Empresa</strong> novamente para reenviar ao Financeiro.</div>
              </div>
            </div>

            <div style={{ padding: '0.95rem 1.5rem', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
              <button
                type="button"
                disabled={reabrindoFicha}
                onClick={() => setGrupoReabrir(null)}
                style={{ padding: '0.55rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: '700', fontSize: '0.82rem', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={reabrindoFicha}
                onClick={executarReaberturaFicha}
                style={{ padding: '0.55rem 1.2rem', borderRadius: '8px', border: 'none', background: '#d97706', color: '#fff', fontWeight: '800', fontSize: '0.82rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>lock_open</span>
                {reabrindoFicha ? 'Reabrindo...' : 'Sim, Reabrir Ficha'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
