import { useSearchParams } from 'react-router-dom';
import { useState, useEffect, useRef, useMemo } from 'react';
import { api } from '../services/api';
import { useTurma } from '../context/TurmaContext';

const isMembroGiants = (emp) =>
  Boolean(emp?.membro_giants) || String(emp?.origem || '').toUpperCase().includes('GIAN');

const extrairCpfCliente = (emp) => {
  const cpfCol = String(emp?.cpf || '').replace(/\D/g, '');
  if (cpfCol.length === 11) return cpfCol;
  const docCol = String(emp?.cpf_cnpj || '').replace(/\D/g, '');
  if (docCol.length === 11) return docCol;
  return '';
};

const extrairCnpjEmpresa = (emp) => {
  const cnpjCol = String(emp?.cnpj || '').replace(/\D/g, '');
  if (cnpjCol.length >= 11) return cnpjCol;
  const docCol = String(emp?.cpf_cnpj || '').replace(/\D/g, '');
  if (docCol.length >= 11) return docCol;
  return '';
};

const normalizarChaveEmpresa = (emp) => {
  // Membro GIANTS: vínculo individual por CPF (1 cliente apenas, não agrupa por CNPJ)
  if (isMembroGiants(emp)) {
    const cpfDigits = extrairCpfCliente(emp);
    return cpfDigits ? `giants:cpf:${cpfDigits}` : `giants:id:${emp.id}`;
  }

  // AE e PAC: vínculo agrupado por CNPJ da empresa
  const cnpjDigits = extrairCnpjEmpresa(emp);
  if (cnpjDigits.length >= 11) return `cnpj:${cnpjDigits}`;

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

export default function Lunch() {
  const [searchParams] = useSearchParams();
  const [turmas, setTurmas] = useState([]);
  const { turmaSelecionada } = useTurma();
  const [mesas, setMesas] = useState([]);
  const [clientesBase, setClientesBase] = useState([]);
  const [entrevistadores, setEntrevistadores] = useState([]);
  const [cortesiasLocais, setCortesiasLocais] = useState({});
  const [carregando, setCarregando] = useState(true);
  const [liberandoGiants, setLiberandoGiants] = useState(false);
  const [erro, setErro] = useState('');

  // Filtros da barra lateral
  const [filtroParticipantes, setFiltroParticipantes] = useState('pendentes'); // 'pendentes' | 'sentados' | 'todos'
  const [termoBuscaLateral, setTermoBuscaLateral] = useState('');

  // Grupo de empresa (CNPJ) selecionado para alocação em lote
  const [grupoSelecionadoAlocacao, setGrupoSelecionadoAlocacao] = useState(null);

  // Zoom, Foco e Glow
  const [zoom, setZoom] = useState(100);
  const [mesaFocadaId, setMesaFocadaId] = useState(null);
  const [destaquePessoaId, setDestaquePessoaId] = useState(null);
  const containerSalaoRef = useRef(null);

  // Modal Entrevistador
  const [modalMesaAberta, setModalMesaAberta] = useState(null);
  const [buscaEntrevistadorModal, setBuscaEntrevistadorModal] = useState('');

  const carregarDados = async () => {
    try {
      setCarregando(true);
      setErro('');

      const tIdAtiva = turmaSelecionada || localStorage.getItem('turma_ativa_id') || '1491';
      const [aux, clientesDados] = await Promise.all([
        api.get(`/auxiliares?turmaId=${tIdAtiva}`),
        api.get(`/clientes?turmaId=${tIdAtiva}`)
      ]);

      setTurmas(aux.turmas || []);
      setEntrevistadores(aux.entrevistadores || []);

      const listaClientes = Array.isArray(clientesDados) ? clientesDados : clientesDados.clientes || [];
      setClientesBase(listaClientes);

      const mesasFormatadas = (aux.mesas || []).map((m) => {
        const ocupantesLista = [];
        (m.ocupantes_detalhes || []).forEach((det, idx) => {
          let nome = 'Participante';
          let nomeCracha = '';
          let empresa = '';
          let entrevistaId = idx + 1;
          let aplicacaoId = null;
          let tipoParticipante = 'cliente';

          if (typeof det === 'string') {
            const mNome = det.match(/nome=([^;]+)/);
            const mCracha = det.match(/nome_cracha=([^;]+)/);
            const mId = det.match(/entrevista_id=([^;]+)/);
            const mAppId = det.match(/aplicacao_id=([^;]+)/);
            const mEmp = det.match(/empresa=([^;]+)/);
            if (mNome) nome = mNome[1].trim();
            if (mCracha && mCracha[1].trim()) nomeCracha = mCracha[1].trim();
            if (mId) entrevistaId = mId[1].trim();
            if (mAppId) aplicacaoId = mAppId[1].trim();
            if (mEmp) empresa = mEmp[1].trim();
          } else if (typeof det === 'object' && det !== null) {
            nome = det.nome || det.cliente_nome || nome;
            nomeCracha = det.nome_cracha || '';
            empresa = det.empresa || '';
            entrevistaId = det.entrevista_id || det.id || entrevistaId;
            aplicacaoId = det.aplicacao_id || det.cliente_id || null;
            tipoParticipante = det.membro_giants ? 'giants' : (det.tipo || 'cliente');
          }

          ocupantesLista.push({
            id: entrevistaId,
            aplicacaoId: aplicacaoId || entrevistaId,
            nome,
            nomeCracha: nomeCracha || nome.split(' ')[0],
            empresa,
            tipoParticipante,
            mesaId: m.id,
            mesaNumero: m.numero
          });
        });

        let entrevistadoresEscalados = m.entrevistadores_escalados || [];
        let entrevistadoresIds = m.entrevistadores_ids || [];

        if (entrevistadoresIds.length === 0 && m.entrevistador_id) {
          entrevistadoresIds = [m.entrevistador_id];
        }

        if (entrevistadoresEscalados.length === 0 && entrevistadoresIds.length > 0) {
          entrevistadoresEscalados = (aux.entrevistadores || []).filter((e) => entrevistadoresIds.includes(e.id));
        }

        let entrevistadorNome = entrevistadoresEscalados.map((e) => e.nome).join(', ') || null;
        if (!entrevistadorNome && m.tem_entrevistador) {
          entrevistadorNome = 'Entrevistador';
        }

        return {
          ...m,
          ocupantesLista,
          entrevistadores_ids: entrevistadoresIds,
          entrevistadores_escalados: entrevistadoresEscalados,
          entrevistadorNome,
          tem_entrevistador: entrevistadoresIds.length > 0 || m.tem_entrevistador
        };
      });

      setMesas(mesasFormatadas);
    } catch (err) {
      setErro(err.message || 'Erro ao carregar salão.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    if (turmaSelecionada) {
      setGrupoSelecionadoAlocacao(null);
      setMesaFocadaId(null);
      carregarDados();
    }
  }, [turmaSelecionada]);

  // Mapeamento de assentos já ocupados
  const idsSentados = useMemo(() => {
    const set = new Set();
    mesas.forEach((m) => {
      (m.ocupantesLista || []).forEach((o) => {
        if (o.aplicacaoId) set.add(String(o.aplicacaoId));
        if (o.id) set.add(String(o.id));
      });
    });
    return set;
  }, [mesas]);

  // Membros GIANTS atualmente ocupando assentos nas mesas
  const giantsSentados = useMemo(() => {
    return (clientesBase || []).filter((c) => {
      const isGiant =
        Boolean(c.membro_giants) ||
        String(c.origem || '').toUpperCase().includes('GIAN') ||
        Boolean(c.perfil_giants);
      const temMesa =
        (c.mesa_alocada !== null && c.mesa_alocada !== undefined) ||
        idsSentados.has(String(c.id)) ||
        (c.aplicacao_id && idsSentados.has(String(c.aplicacao_id)));
      return isGiant && temMesa;
    });
  }, [clientesBase, idsSentados]);

  const liberarTodosGiantsDasMesas = async () => {
    if (giantsSentados.length === 0) {
      alert('Não há nenhum membro GIANTS sentado nas mesas neste momento.');
      return;
    }

    const confirmar = window.confirm(
      `Deseja remover todos os ${giantsSentados.length} membro(s) GIANTS das mesas agora (pós-almoço)?\n\n` +
      `Os assentos ficarão imediatamente livres para as entrevistas comerciais da tarde/jantar.`
    );
    if (!confirmar) return;

    try {
      setLiberandoGiants(true);
      const tIdAtiva = turmaSelecionada || localStorage.getItem('turma_ativa_id') || '1491';
      const resp = await api.post('/mesas/liberar-giants', { turmaId: tIdAtiva });
      await carregarDados();
      alert(`${resp?.liberados ?? giantsSentados.length} membro(s) GIANTS liberados das mesas com sucesso!`);
    } catch (err) {
      alert('Erro ao liberar membros GIANTS: ' + (err.message || 'Falha na operação.'));
    } finally {
      setLiberandoGiants(false);
    }
  };

  // 1. Filtra unicamente quem possui direito garantido ao almoço (checklist marcado, cortesia ou GIANTS)
  const todosParticipantes = useMemo(() => {
    const isConfirmadaFinanceiro = (item) => {
      const stAprov = String(item?.status_aprovacao || '').trim().toLowerCase();
      const etapa = String(item?.etapa_funil || '').trim().toLowerCase();
      const fechada = Boolean(item?.ficha_fechada);
      const aprovadaFin = ['aprovada', 'aprovado', 'aprovada_com_ressalva'].includes(stAprov);
      const etapaConcluida = ['concluido', 'concluida', 'fechamento', 'vendido'].includes(etapa);
      return aprovadaFin || (fechada && etapaConcluida) || etapaConcluida;
    };

    const chavesConfirmadasFinanceiro = new Set();
    (clientesBase || []).forEach((item) => {
      if (isConfirmadaFinanceiro(item)) {
        chavesConfirmadasFinanceiro.add(normalizarChaveEmpresa(item));
      }
    });

    return (clientesBase || [])
      .filter((c) => {
        if (chavesConfirmadasFinanceiro.has(normalizarChaveEmpresa(c))) {
          return false;
        }
        const isGiant =
          Boolean(c.membro_giants) ||
          String(c.origem || '').toUpperCase().includes('GIAN') ||
          Boolean(c.perfil_giants) ||
          (c.perfil || '').toLowerCase().includes('giants') ||
          (c.tipo || '').toLowerCase().includes('giants');

        const isCortesia = Boolean(c.cortesia_almoco || c.cortesia || cortesiasLocais[c.id]);
        const isPago = !isGiant && (Number(c.valor_almoco || 0) >= 1000 || Boolean(c.almoco_pago));

        return isGiant || isCortesia || isPago;
      })
      .map((c) => {
        const sentado = idsSentados.has(String(c.id)) || idsSentados.has(String(c.aplicacao_id));
        let mesaNumero = null;
        let mesaId = null;
        let entrevistaId = null;

        if (sentado) {
          for (const m of mesas) {
            const achou = (m.ocupantesLista || []).find(
              (o) => String(o.aplicacaoId) === String(c.id) || String(o.id) === String(c.id)
            );
            if (achou) {
              mesaNumero = m.numero;
              mesaId = m.id;
              entrevistaId = achou.id;
              break;
            }
          }
        }

        const isMembroGiants =
          Boolean(c.membro_giants) ||
          String(c.origem || '').toUpperCase().includes('GIAN') ||
          Boolean(c.perfil_giants) ||
          (c.perfil || '').toLowerCase().includes('giants');

        const temCortesia = Boolean(c.cortesia_almoco || c.cortesia || cortesiasLocais[c.id]);
        const empresaPagou = !isMembroGiants && (Number(c.valor_almoco || 0) >= 1000 || Boolean(c.almoco_pago));

        return {
          ...c,
          id: c.id,
          entrevistaId: entrevistaId || c.id,
          nome: c.nome_participante || c.nome_cracha || c.nome || c.nome_completo || 'Participante',
          empresa: (c.empresa || c.razao_social || 'Empresa SGA').trim(),
          cnpj: c.cnpj || c.cpf_cnpj || '',
          isMembroGiants,
          empresaPagou,
          temCortesia,
          liberadoAlmoco: true,
          motivoLiberacao: isMembroGiants ? 'Membro GIANTS' : temCortesia ? 'Cortesia' : 'Almoço Pago',
          sentado,
          mesaNumero,
          mesaId
        };
      });
  }, [clientesBase, cortesiasLocais, idsSentados, mesas]);

  // 2. Agrupa participantes elegíveis em 1 card único por Empresa (CNPJ)
  const gruposEmpresasSalao = useMemo(() => {
    const mapa = new Map();

    todosParticipantes.forEach((p) => {
      const chave = normalizarChaveEmpresa(p);
      if (!mapa.has(chave)) {
        mapa.set(chave, {
          chave,
          idPrincipal: p.id,
          empresa: p.empresa,
          cnpj: p.cnpj,
          membros: [p]
        });
      } else {
        const g = mapa.get(chave);
        g.membros.push(p);
        if (!g.cnpj && p.cnpj) g.cnpj = p.cnpj;
      }
    });

    return Array.from(mapa.values())
      .map((g) => {
        g.membros.sort((a, b) => {
          const valDiff = Number(b.valor_almoco || 0) - Number(a.valor_almoco || 0);
          if (valDiff !== 0) return valDiff;
          return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
        });

        const pendentesMesa = g.membros.filter((m) => !m.sentado);
        const sentadosMesa = g.membros.filter((m) => m.sentado);
        const isGiants = g.membros.every((m) => m.isMembroGiants);
        const temGiants = g.membros.some((m) => m.isMembroGiants);
        const temCortesia = g.membros.some((m) => m.temCortesia);
        const empresaPagou = g.membros.some((m) => m.empresaPagou);

        return {
          ...g,
          idPrincipal: g.membros[0].id,
          pendentesMesa,
          sentadosMesa,
          todosSentados: pendentesMesa.length === 0 && sentadosMesa.length > 0,
          temPendentes: pendentesMesa.length > 0,
          isGiants,
          temGiants,
          temCortesia,
          empresaPagou,
          motivoLiberacao: isGiants
            ? 'Membro GIANTS'
            : temCortesia
            ? 'Cortesia'
            : temGiants
            ? 'Almoço Pago + GIANTS'
            : 'Almoço Pago'
        };
      })
      .sort((a, b) => {
        // Prioriza grupos com maior número de pessoas aguardando mesa (maior -> menor)
        if (b.pendentesMesa.length !== a.pendentesMesa.length) {
          return b.pendentesMesa.length - a.pendentesMesa.length;
        }
        if (b.membros.length !== a.membros.length) {
          return b.membros.length - a.membros.length;
        }
        return a.empresa.localeCompare(b.empresa, 'pt-BR', { sensitivity: 'base' });
      });
  }, [todosParticipantes]);

  // Integração com tela de Empresas: ativa alocação imediata do grupo CNPJ via ?alocarId=
  useEffect(() => {
    const alocarId = searchParams.get('alocarId');
    if (!alocarId || carregando || gruposEmpresasSalao.length === 0) return;

    const grupoAlvo = gruposEmpresasSalao.find(
      (g) => String(g.idPrincipal) === String(alocarId) || g.membros.some((m) => String(m.id) === String(alocarId))
    );
    if (grupoAlvo && grupoAlvo.pendentesMesa.length > 0) {
      setGrupoSelecionadoAlocacao(grupoAlvo);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [searchParams, carregando, gruposEmpresasSalao]);

  // 3. Filtragem dos cards de empresa na barra lateral
  const empresaJaEncerrouEntrevista = (grupo) =>
    (grupo.membros || []).some(
      (m) =>
        Boolean(m.ficha_fechada) ||
        ['aguardando_aprovacao', 'fechamento', 'concluido', 'reprovado'].includes(
          String(m.etapa_funil || '').trim().toLowerCase()
        ) ||
        ['pendente', 'aprovada', 'aprovado', 'aprovada_com_ressalva', 'recusada'].includes(
          String(m.status_aprovacao || '').trim().toLowerCase()
        )
    );

  const gruposFiltrados = gruposEmpresasSalao.filter((g) => {
    const termo = (termoBuscaLateral || '').toLowerCase().trim();
    const matchTermo =
      !termo ||
      g.empresa.toLowerCase().includes(termo) ||
      String(g.cnpj || '').toLowerCase().includes(termo) ||
      g.membros.some((m) => m.nome.toLowerCase().includes(termo) || `mesa ${m.mesaNumero}`.includes(termo));

    if (!matchTermo) return false;

    if (filtroParticipantes === 'pendentes') return g.temPendentes;
    if (filtroParticipantes === 'sentados') return g.sentadosMesa.length > 0;
    return true;
  });

  // Marcar Almoço Pago R$ 1.000 para a empresa
  const marcarEmpresaAlmoco = async (grupo, e) => {
    e.stopPropagation();
    const cv = prompt(
      `Confirmar pagamento de R$ 1.000,00 de almoço para a empresa "${grupo.empresa}"?\n\nInforme o código/comprovante (CV) ou PIX:`,
      'PIX-1000'
    );
    if (cv === null) return;

    try {
      await api.patch(`/clientes/${grupo.idPrincipal}/almoco`, {
        tipo: 'pago',
        cv_cartao: cv,
        participantes_ids: grupo.membros.map((m) => m.id),
        todos_empresa_ids: grupo.membros.map((m) => m.id)
      });
      carregarDados();
    } catch (err) {
      alert('Erro ao registrar pagamento: ' + err.message);
    }
  };

  // Conceder ou Revogar Cortesia para o grupo da empresa
  const alternarCortesiaGrupo = (grupo, e) => {
    e.stopPropagation();
    setCortesiasLocais((prev) => {
      const novo = { ...prev };
      const ativar = !grupo.temCortesia;
      grupo.membros.forEach((m) => {
        novo[m.id] = ativar;
      });
      return novo;
    });
  };

  // Alocar todos os sócios sem mesa da empresa selecionada nos assentos livres da mesa
  const alocarGrupoEmMesa = async (mesaId) => {
    if (!grupoSelecionadoAlocacao) return;

    const pendentes = grupoSelecionadoAlocacao.pendentesMesa || [];
    if (pendentes.length === 0) {
      setGrupoSelecionadoAlocacao(null);
      return;
    }

    let listaParaSentar = pendentes;
    let mesaVizinhaSugerida = null;
    const mesaAlvo = mesas.find((m) => Number(m.id) === Number(mesaId));

    if (mesaAlvo) {
      const capTotal = Number(mesaAlvo.capacidade_total || 5);
      const ocupados = mesaAlvo.ocupantesLista.length + (mesaAlvo.tem_entrevistador ? 1 : 0);
      const livres = Math.max(0, capTotal - ocupados);

      if (livres === 0) {
        alert(`A Mesa ${mesaAlvo.numero} está lotada (0 lugares livres). Aumente a capacidade (+) ou escolha outra mesa.`);
        return;
      }

      if (livres < pendentes.length) {
        // Divisão equilibrada para ninguém ficar sozinho (ex: 5 pessoas em 4 lugares -> 3 nesta mesa e 2 na próxima)
        let qtdNestaMesa = Math.min(livres, Math.ceil(pendentes.length / 2));
        let sobra = pendentes.length - qtdNestaMesa;

        // Garante que nem o primeiro grupo nem o restante fiquem com apenas 1 pessoa se houver alternativa
        if (sobra === 1 && qtdNestaMesa > 2) {
          qtdNestaMesa -= 1;
          sobra += 1;
        }

        // Procura a mesa livre mais próxima (ao lado pelo número da mesa) que comporte o restante
        const mesasVizinhas = mesas
          .filter((m) => Number(m.id) !== Number(mesaAlvo.id))
          .map((m) => {
            const c = Number(m.capacidade_total || 5);
            const oc = m.ocupantesLista.length + (m.tem_entrevistador ? 1 : 0);
            return { ...m, livres: Math.max(0, c - oc), distancia: Math.abs(Number(m.numero) - Number(mesaAlvo.numero)) };
          })
          .filter((m) => m.livres >= sobra)
          .sort((a, b) => a.distancia - b.distancia || b.livres - a.livres);

        mesaVizinhaSugerida = mesasVizinhas[0] || null;
        const textoVizinha = mesaVizinhaSugerida
          ? ` (sugestão ao lado: Mesa ${mesaVizinhaSugerida.numero} com ${mesaVizinhaSugerida.livres} lugares livres)`
          : '';

        const confirmarDivisao = window.confirm(
          `A empresa "${grupoSelecionadoAlocacao.empresa}" tem ${pendentes.length} pessoas e a Mesa ${mesaAlvo.numero} possui ${livres} ${livres === 1 ? 'lugar' : 'lugares'}.\n\n` +
          `Para que ninguém fique sozinho, faremos a divisão equilibrada:\n` +
          `• ${qtdNestaMesa} ${qtdNestaMesa === 1 ? 'pessoa senta' : 'pessoas sentam'} agora na Mesa ${mesaAlvo.numero}\n` +
          `• ${sobra} ${sobra === 1 ? 'pessoa fica' : 'pessoas ficam'} prontas para a próxima mesa${textoVizinha}\n\n` +
          `Deseja confirmar esta divisão?`
        );
        if (!confirmarDivisao) return;
        listaParaSentar = pendentes.slice(0, qtdNestaMesa);
      }
    }

    try {
      for (const socio of listaParaSentar) {
        await api.post('/entrevistas/agendar', {
          aplicacaoId: Number(socio.id),
          mesaId: Number(mesaId),
          mesaNumero: mesaAlvo ? Number(mesaAlvo.numero) : undefined
        });
      }

      const idsSentadosAgora = new Set(listaParaSentar.map((s) => String(s.id)));
      const restantes = pendentes.filter((s) => !idsSentadosAgora.has(String(s.id)));

      if (restantes.length > 0) {
        // Mantém o grupo selecionado com os sócios restantes e destaca a mesa vizinha no mapa
        setGrupoSelecionadoAlocacao((prev) =>
          prev
            ? {
                ...prev,
                pendentesMesa: restantes
              }
            : null
        );
        if (mesaVizinhaSugerida) {
          setMesaFocadaId(mesaVizinhaSugerida.id);
          setTimeout(() => {
            const elVizinha = document.getElementById(`mesa-box-${mesaVizinhaSugerida.id}`);
            if (elVizinha) {
              elVizinha.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            }
          }, 150);
          setTimeout(() => setMesaFocadaId(null), 5000);
        }
      } else {
        setGrupoSelecionadoAlocacao(null);
      }

      carregarDados();
    } catch (err) {
      alert('Erro ao alocar empresa na mesa: ' + err.message);
      carregarDados();
    }
  };

  const focarPessoaEMesa = (pessoaId, mesaAlvoId) => {
    setDestaquePessoaId(pessoaId);
    setMesaFocadaId(mesaAlvoId);
    setZoom(125);

    setTimeout(() => {
      const elMesa = document.getElementById(`mesa-box-${mesaAlvoId}`);
      if (elMesa) {
        elMesa.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      }
    }, 100);

    setTimeout(() => {
      setMesaFocadaId(null);
    }, 4500);
  };

  const removerParticipante = async (entrevistaId) => {
    if (!confirm('Deseja retirar o participante desta cadeira?')) return;
    try {
      await api.delete(`/mesas/cadeiras/${entrevistaId}`);
      carregarDados();
    } catch (err) {
      alert('Erro ao remover assento: ' + err.message);
    }
  };

  const adicionarMesa = async () => {
    const proximoNum = mesas.length > 0 ? Math.max(...mesas.map((m) => Number(m.numero) || 0)) + 1 : 1;
    try {
      await api.post('/mesas', {
        numero: proximoNum,
        capacidade_total: 5,
        formato: 'redonda'
      });
      carregarDados();
    } catch (err) {
      alert('Erro ao adicionar mesa: ' + err.message);
    }
  };

  const alterarCapacidade = async (mesa, delta) => {
    const novaCap = Math.max(2, Math.min(12, Number(mesa.capacidade_total) + delta));
    try {
      await api.patch(`/mesas/${mesa.id}`, { capacidade_total: novaCap });
      setMesas((prev) => prev.map((m) => (m.id === mesa.id ? { ...m, capacidade_total: novaCap } : m)));
    } catch (e) {
      setMesas((prev) => prev.map((m) => (m.id === mesa.id ? { ...m, capacidade_total: novaCap } : m)));
    }
  };

  const alternarEntrevistadorMesa = async (mesaId, entrevistadorId) => {
    const mesa = mesas.find((m) => m.id === mesaId);
    if (!mesa) return;
    const atuais = mesa.entrevistadores_ids || [];
    const jaTem = atuais.includes(entrevistadorId);
    const novosIds = jaTem ? atuais.filter((id) => id !== entrevistadorId) : [...atuais, entrevistadorId];

    try {
      await api.patch(`/mesas/${mesaId}/entrevistadores`, {
        entrevistadores_ids: novosIds
      });

      const novosEscalados = entrevistadores.filter((e) => novosIds.includes(e.id));
      const nomesStr = novosEscalados.map((e) => e.nome).join(', ') || null;

      setMesas((prev) =>
        prev.map((m) => {
          if (m.id === mesaId) {
            return {
              ...m,
              entrevistadores_ids: novosIds,
              entrevistadores_escalados: novosEscalados,
              tem_entrevistador: novosIds.length > 0,
              entrevistadorNome: nomesStr
            };
          }
          return m;
        })
      );

      setModalMesaAberta((prev) =>
        prev && prev.id === mesaId
          ? {
              ...prev,
              entrevistadores_ids: novosIds,
              entrevistadores_escalados: novosEscalados,
              tem_entrevistador: novosIds.length > 0,
              entrevistadorNome: nomesStr
            }
          : prev
      );
    } catch (err) {
      alert('Erro ao atualizar entrevistadores da mesa: ' + err.message);
    }
  };

  const totalMesas = mesas.length;
  let totalCapacidade = 0;
  let totalOcupados = 0;

  mesas.forEach((m) => {
    totalCapacidade += Number(m.capacidade_total || 5);
    const entrevistadorOcupa = m.tem_entrevistador ? 1 : 0;
    totalOcupados += m.ocupantesLista.length + entrevistadorOcupa;
  });
  const lugaresLivres = Math.max(0, totalCapacidade - totalOcupados);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', background: '#f8fafc', overflow: 'hidden' }}>
      <style>{`
        @keyframes pulseGlow {
          0% { box-shadow: 0 0 0 0 rgba(255, 87, 34, 0.7), 0 0 25px rgba(255, 87, 34, 0.5); transform: scale(1.08); }
          50% { box-shadow: 0 0 0 25px rgba(255, 87, 34, 0), 0 0 45px rgba(255, 87, 34, 0.8); transform: scale(1.12); }
          100% { box-shadow: 0 0 0 0 rgba(255, 87, 34, 0), 0 0 25px rgba(255, 87, 34, 0.5); transform: scale(1.08); }
        }
        .mesa-glow-ativa {
          animation: pulseGlow 1.4s infinite !important;
          border-color: #ff5722 !important;
          z-index: 50 !important;
        }
        @keyframes pulseLivre {
          0% { transform: scale(1); border-color: #059669; }
          50% { transform: scale(1.18); border-color: #10b981; box-shadow: 0 0 12px rgba(16, 185, 129, 0.6); }
          100% { transform: scale(1); border-color: #059669; }
        }
        .assento-livre-alocavel {
          animation: pulseLivre 1.2s infinite !important;
          border-color: #059669 !important;
          background: #ecfdf5 !important;
          color: #059669 !important;
          cursor: pointer !important;
        }
      `}</style>

      {/* Barra de Topo */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0.85rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
            Salão de Mesas & Entrevistas
          </h1>
          <span style={{ background: '#fff7ed', color: '#ea580c', border: '1px solid #fed7aa', padding: '0.25rem 0.65rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: '700' }}>
            Agrupado por Empresa (CNPJ)
          </span>
        </div>

        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#fff7ed', border: '1px solid #fed7aa', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ea580c' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>wb_sunny</span>
        </div>
      </div>

      {/* Banner de Alocação Ativa por Empresa */}
      {grupoSelecionadoAlocacao && (
        <div style={{ background: '#ff5722', color: '#fff', padding: '0.65rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, boxShadow: '0 2px 8px rgba(255, 87, 34, 0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.9rem', fontWeight: '700' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>ads_click</span>
            <span>
              Alocando Empresa: <u>{grupoSelecionadoAlocacao.empresa}</u> ({grupoSelecionadoAlocacao.pendentesMesa.length}{' '}
              {grupoSelecionadoAlocacao.pendentesMesa.length === 1 ? 'sócio' : 'sócios'}:{' '}
              {grupoSelecionadoAlocacao.pendentesMesa.map((s) => s.nome.split(' ')[0]).join(', ')}) — Clique em um assento livre de qualquer mesa
            </span>
          </div>
          <button
            onClick={() => setGrupoSelecionadoAlocacao(null)}
            style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', borderRadius: '6px', padding: '0.25rem 0.7rem', fontWeight: '700', fontSize: '0.78rem', cursor: 'pointer' }}
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Área Central: Sidebar Lateral Esquerda + Canvas do Salão */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Painel Esquerdo: Estrutura & Cards Consolidados por Empresa (CNPJ) */}
        <div style={{ width: '350px', minWidth: '350px', background: '#fff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', padding: '1.25rem', boxSizing: 'border-box', gap: '1.25rem', flexShrink: 0, overflowY: 'hidden' }}>
          {/* Estrutura do Salão */}
          <div style={{ flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: '#ea580c' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>table_restaurant</span>
              <span style={{ fontSize: '0.9rem', fontWeight: '800', color: '#0f172a' }}>Estrutura do Salão</span>
            </div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#475569', fontWeight: '600', marginBottom: '0.35rem' }}>
              Orientação do Palco
            </label>
            <select style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '0.85rem', marginBottom: '0.85rem', color: '#1e293b' }}>
              <option>Frente (Topo Central)</option>
            </select>

            <button
              onClick={adicionarMesa}
              style={{
                width: '100%',
                background: '#ff5722',
                color: '#fff',
                border: 'none',
                padding: '0.7rem',
                borderRadius: '10px',
                fontWeight: '700',
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                boxShadow: '0 2px 6px rgba(255,87,34,0.3)'
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1.15rem' }}>add_circle</span>
              Adicionar Mesa Redonda
            </button>

          <button
            type="button"
            disabled={liberandoGiants || giantsSentados.length === 0}
            onClick={liberarTodosGiantsDasMesas}
            title="Remove de uma só vez todos os membros GIANTS das mesas após o almoço"
            style={{
              width: '100%',
              marginTop: '0.55rem',
              padding: '0.62rem 0.9rem',
              borderRadius: '10px',
              border: giantsSentados.length > 0 ? '1.5px solid #f59e0b' : '1px solid #cbd5e1',
              background: giantsSentados.length > 0 ? '#fef3c7' : '#f8fafc',
              color: giantsSentados.length > 0 ? '#92400e' : '#94a3b8',
              fontWeight: '800',
              fontSize: '0.82rem',
              cursor: liberandoGiants || giantsSentados.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.05rem' }}>logout</span>
            {liberandoGiants
              ? 'Liberando GIANTS...'
              : `Liberar GIANTS das Mesas (${giantsSentados.length})`}
          </button>
          </div>

          {/* Seção Empresas (CNPJ) com Abas */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ea580c' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>business</span>
                <span style={{ fontSize: '0.9rem', fontWeight: '800', color: '#0f172a' }}>Empresas Elegíveis</span>
              </div>
              <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#64748b' }}>
                {gruposFiltrados.length} {gruposFiltrados.length === 1 ? 'CNPJ' : 'CNPJs'}
              </span>
            </div>

            {/* Abas */}
            <div style={{ display: 'flex', gap: '0.25rem', background: '#f1f5f9', padding: '0.2rem', borderRadius: '8px', marginBottom: '0.75rem', flexShrink: 0 }}>
              {[
                { id: 'pendentes', label: 'Sem Mesa' },
                { id: 'sentados', label: 'Sentadas' },
                { id: 'todos', label: 'Todas' }
              ].map((aba) => (
                <button
                  key={aba.id}
                  onClick={() => setFiltroParticipantes(aba.id)}
                  style={{
                    flex: 1,
                    border: 'none',
                    background: filtroParticipantes === aba.id ? '#fff' : 'transparent',
                    color: filtroParticipantes === aba.id ? '#ea580c' : '#64748b',
                    fontWeight: '700',
                    fontSize: '0.75rem',
                    padding: '0.4rem 0',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    boxShadow: filtroParticipantes === aba.id ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                  }}
                >
                  {aba.label}
                </button>
              ))}
            </div>

            {/* Busca */}
            <div style={{ position: 'relative', marginBottom: '0.75rem', flexShrink: 0 }}>
              <span className="material-symbols-outlined" style={{ position: 'absolute', left: '8px', top: '8px', fontSize: '1rem', color: '#94a3b8' }}>search</span>
              <input
                type="text"
                value={termoBuscaLateral}
                onChange={(e) => setTermoBuscaLateral(e.target.value)}
                placeholder="Buscar empresa, CNPJ, sócio ou mesa..."
                style={{ width: '100%', padding: '0.45rem 0.5rem 0.45rem 2rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.8rem', boxSizing: 'border-box' }}
              />
            </div>

            {/* Lista de Cards Únicos por Empresa (CNPJ) */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.6rem', paddingRight: '0.25rem' }}>
              {gruposFiltrados.length === 0 ? (
                <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                  Nenhuma empresa encontrada neste filtro.
                </div>
              ) : (
                gruposFiltrados.map((grupo) => {
                  const estaSelecionado = grupoSelecionadoAlocacao?.chave === grupo.chave;
                  const mesasOcupadasGrupo = [...new Set(grupo.sentadosMesa.map((m) => m.mesaNumero))];

                  return (
                    <div
                      key={grupo.chave}
                      onClick={() => {
                        if (grupo.temPendentes) {
                          setGrupoSelecionadoAlocacao(estaSelecionado ? null : grupo);
                        } else if (grupo.sentadosMesa.length > 0) {
                          const primeiroSentado = grupo.sentadosMesa[0];
                          if (primeiroSentado.mesaId) {
                            focarPessoaEMesa(primeiroSentado.entrevistaId, primeiroSentado.mesaId);
                          }
                        }
                      }}
                      style={{
                        background: estaSelecionado
                          ? grupo.isGiants
                            ? '#f5f3ff'
                            : '#fff7ed'
                          : grupo.isGiants
                          ? '#faf5ff'
                          : '#f8fafc',
                        border: '2px solid',
                        borderColor: estaSelecionado
                          ? grupo.isGiants
                            ? '#7c3aed'
                            : '#ff5722'
                          : grupo.isGiants
                          ? '#c084fc'
                          : '#e2e8f0',
                        borderRadius: '10px',
                        padding: '0.75rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.45rem',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        boxShadow: estaSelecionado
                          ? grupo.isGiants
                            ? '0 0 12px rgba(124, 58, 237, 0.4)'
                            : '0 0 10px rgba(255,87,34,0.3)'
                          : 'none'
                      }}
                    >
                      {/* Cabeçalho do Card da Empresa */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.4rem' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                            <span
                              style={{
                                fontWeight: '800',
                                fontSize: '0.86rem',
                                color: estaSelecionado ? (grupo.isGiants ? '#6b21a8' : '#ea580c') : '#0f172a',
                                lineHeight: 1.25
                              }}
                            >
                              {grupo.empresa}
                            </span>
                            {grupo.temGiants && (
                              <span style={{ background: '#7c3aed', color: '#fff', fontSize: '0.6rem', fontWeight: '800', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>
                                GIANTS
                              </span>
                            )}
                          </div>
                          {grupo.cnpj && (
                            <span style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: '#64748b', display: 'block', marginTop: '0.1rem' }}>
                              CNPJ: {grupo.cnpj}
                            </span>
                          )}
                        </div>

                        {grupo.temPendentes ? (
                          <span
                            style={{
                              background: estaSelecionado ? '#ff5722' : '#fff7ed',
                              color: estaSelecionado ? '#fff' : '#c2410c',
                              border: '1px solid #fdba74',
                              padding: '0.15rem 0.45rem',
                              borderRadius: '5px',
                              fontSize: '0.68rem',
                              fontWeight: '800',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {estaSelecionado
                              ? 'Selecionada'
                              : `${grupo.pendentesMesa.length} ${grupo.pendentesMesa.length === 1 ? 'lugar' : 'lugares'}`}
                          </span>
                        ) : (
                          <span
                            title="Clique para localizar no salão"
                            style={{
                              background: '#dcfce7',
                              color: '#166534',
                              border: '1px solid #86efac',
                              padding: '0.15rem 0.45rem',
                              borderRadius: '5px',
                              fontSize: '0.68rem',
                              fontWeight: '800',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.15rem',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '0.78rem' }}>pin_drop</span>
                            Mesa {mesasOcupadasGrupo.join(', ')}
                          </span>
                        )}
                      </div>

                      {/* Lista de Sócios da Empresa dentro do Card */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', background: '#fff', padding: '0.45rem 0.55rem', borderRadius: '7px', border: '1px solid #e2e8f0' }}>
                        {grupo.membros.map((socio) => (
                          <div
                            key={socio.id}
                            onClick={(e) => {
                              if (socio.sentado && socio.mesaId) {
                                e.stopPropagation();
                                focarPessoaEMesa(socio.entrevistaId, socio.mesaId);
                              }
                            }}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              fontSize: '0.75rem',
                              color: '#334155',
                              gap: '0.35rem'
                            }}
                          >
                            <span style={{ fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              • {socio.nome}
                            </span>
                            {socio.sentado ? (
                              <span style={{ fontSize: '0.66rem', fontWeight: '700', color: '#ea580c', background: '#fff7ed', padding: '0.05rem 0.35rem', borderRadius: '4px', flexShrink: 0 }}>
                                Mesa {socio.mesaNumero}
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.66rem', fontWeight: '700', color: '#059669', background: '#ecfdf5', padding: '0.05rem 0.35rem', borderRadius: '4px', flexShrink: 0 }}>
                                Aguardando
                              </span>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Rodapé com Status do Almoço e Ações */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.25rem', borderTop: '1px solid #f1f5f9', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: '800',
                            padding: '0.15rem 0.45rem',
                            borderRadius: '4px',
                            background: grupo.isGiants ? '#fef3c7' : grupo.temCortesia ? '#e0f2fe' : '#dcfce7',
                            color: grupo.isGiants ? '#b45309' : grupo.temCortesia ? '#0284c7' : '#16a34a',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.2rem'
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '0.8rem' }}>
                            {grupo.isGiants ? 'stars' : grupo.temCortesia ? 'card_giftcard' : 'paid'}
                          </span>
                          {grupo.motivoLiberacao}
                        </span>

                        <div style={{ display: 'flex', gap: '0.3rem' }}>
                          {grupo.temPendentes && !grupo.isGiants && (
                            <button
                              onClick={(e) => alternarCortesiaGrupo(grupo, e)}
                              style={{
                                background: grupo.temCortesia ? '#fee2e2' : '#f8fafc',
                                color: grupo.temCortesia ? '#ef4444' : '#475569',
                                border: '1px solid #cbd5e1',
                                padding: '0.15rem 0.45rem',
                                borderRadius: '4px',
                                fontSize: '0.66rem',
                                fontWeight: '700',
                                cursor: 'pointer'
                              }}
                            >
                              {grupo.temCortesia ? 'Revogar' : '+ Cortesia'}
                            </button>
                          )}

                          {grupo.temPendentes && !grupo.empresaPagou && !grupo.isGiants && (
                            <button
                              onClick={(e) => marcarEmpresaAlmoco(grupo, e)}
                              style={{
                                background: '#ecfdf5',
                                color: '#059669',
                                border: '1px solid #a7f3d0',
                                padding: '0.15rem 0.45rem',
                                borderRadius: '4px',
                                fontSize: '0.66rem',
                                fontWeight: '700',
                                cursor: 'pointer'
                              }}
                            >
                              + R$ 1.000
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Salão de Mesas com Grid Pontilhado */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
          {/* Barra Superior do Salão */}
          <div style={{ padding: '0.85rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, background: '#fff', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: '0.95rem', fontWeight: '800', color: '#0f172a' }}>
              {totalMesas} Mesas • <span style={{ color: '#059669' }}>{lugaresLivres} Lugares Livres</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '10px', overflow: 'hidden' }}>
                <button
                  onClick={() => setZoom((z) => Math.max(50, z - 10))}
                  style={{ border: 'none', background: 'transparent', padding: '0.45rem 0.75rem', cursor: 'pointer', color: '#475569', fontWeight: '800' }}
                >
                  -
                </button>
                <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#334155', padding: '0 0.5rem' }}>{zoom}%</span>
                <button
                  onClick={() => setZoom((z) => Math.min(160, z + 10))}
                  style={{ border: 'none', background: 'transparent', padding: '0.45rem 0.75rem', cursor: 'pointer', color: '#475569', fontWeight: '800' }}
                >
                  +
                </button>
                <button
                  onClick={() => {
                    setZoom(100);
                    setMesaFocadaId(null);
                    setDestaquePessoaId(null);
                  }}
                  style={{ borderLeft: '1px solid #cbd5e1', borderRight: 'none', borderTop: 'none', borderBottom: 'none', background: 'transparent', padding: '0.45rem 0.75rem', cursor: 'pointer', color: '#ea580c', fontWeight: '700', fontSize: '0.8rem' }}
                >
                  Reset
                </button>
              </div>
            </div>
          </div>

          {/* Canvas do Salão */}
          <div
            ref={containerSalaoRef}
            style={{
              flex: 1,
              overflow: 'auto',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '2.5rem 2rem',
              backgroundImage: 'radial-gradient(#cbd5e1 1.2px, transparent 1.2px)',
              backgroundSize: '24px 24px',
              backgroundColor: '#f8fafc'
            }}
          >
            <div style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center', transition: 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
              {/* PALCO / TELÃO */}
              <div
                style={{
                  background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
                  color: '#fff',
                  border: '2px solid #ea580c',
                  borderRadius: '16px',
                  padding: '1rem 3.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  boxShadow: '0 8px 20px rgba(0,0,0,0.15)',
                  marginBottom: '4.5rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '800', fontSize: '1.05rem', letterSpacing: '0.05em' }}>
                  <span className="material-symbols-outlined" style={{ color: '#ea580c', fontSize: '1.25rem' }}>desktop_windows</span>
                  PALCO / TELÃO
                </div>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.2rem' }}>Área Central de Apresentação</span>
              </div>

              {/* Mesas */}
              <div style={{ display: 'flex', gap: '5.5rem', justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center', padding: '1rem' }}>
                {mesas.map((mesa) => {
                  const capTotal = Number(mesa.capacidade_total || 5);
                  const entrevistadorOcupa = mesa.tem_entrevistador ? 1 : 0;
                  const totalOcupadosMesa = mesa.ocupantesLista.length + entrevistadorOcupa;
                  const assentosLivresQtd = Math.max(0, capTotal - totalOcupadosMesa);

                  const isMesaFocada = mesaFocadaId === mesa.id;

                  const assentosAoRedor = [
                    ...mesa.ocupantesLista.map((c) => ({ tipo: 'cliente', ...c })),
                    ...Array.from({ length: assentosLivresQtd }).map((_, i) => ({ tipo: 'livre', id: `livre-${mesa.id}-${i}`, mesaId: mesa.id }))
                  ];

                  const totalSlots = assentosAoRedor.length;
                  const raio = 90;

                  return (
                    <div
                      key={mesa.id}
                      id={`mesa-box-${mesa.id}`}
                      style={{
                        position: 'relative',
                        width: '220px',
                        height: '220px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'transform 0.3s ease'
                      }}
                    >
                      {/* Entrevistador */}
                      <div
                        title="Clique para selecionar ou alterar o entrevistador"
                        style={{
                          position: 'absolute',
                          top: '-42px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          zIndex: 10,
                          cursor: 'pointer'
                        }}
                        onClick={() => setModalMesaAberta(mesa)}
                      >
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: mesa.tem_entrevistador ? '#0f172a' : '#cbd5e1',
                            border: destaquePessoaId === `ent-${mesa.id}` ? '3px solid #ff5722' : '2px solid #fff',
                            boxShadow: destaquePessoaId === `ent-${mesa.id}` ? '0 0 14px #ff5722' : '0 2px 6px rgba(0,0,0,0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>mic</span>
                        </div>
                        <span style={{ fontSize: '0.7rem', fontWeight: '700', color: mesa.tem_entrevistador ? '#0f172a' : '#94a3b8', marginTop: '0.2rem', maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {mesa.entrevistadorNome ? mesa.entrevistadorNome.split(' ')[0] : `Mesa ${mesa.numero}`}
                        </span>
                      </div>

                      {/* Mesa Redonda Central com Efeito Glow */}
                      <div
                        className={isMesaFocada ? 'mesa-glow-ativa' : ''}
                        style={{
                          width: '124px',
                          height: '124px',
                          borderRadius: '50%',
                          background: '#fff',
                          border: isMesaFocada ? '3px solid #ff5722' : '2px solid #e2e8f0',
                          boxShadow: isMesaFocada ? '0 0 25px rgba(255, 87, 34, 0.7)' : '0 4px 14px rgba(0,0,0,0.05)',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 5,
                          transition: 'all 0.3s ease'
                        }}
                      >
                        <span style={{ fontSize: '0.95rem', fontWeight: '800', color: '#0f172a' }}>
                          Mesa {mesa.numero}
                        </span>
                        <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', marginBottom: '0.35rem' }}>
                          {totalOcupadosMesa}/{capTotal}
                        </span>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <button
                            onClick={() => alterarCapacidade(mesa, -1)}
                            title="Diminuir lugares"
                            style={{ width: '22px', height: '22px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: '#64748b', fontWeight: 'bold' }}
                          >
                            -
                          </button>
                          <button
                            onClick={() => alterarCapacidade(mesa, 1)}
                            title="Aumentar lugares"
                            style={{ width: '22px', height: '22px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: '#64748b', fontWeight: 'bold' }}
                          >
                            +
                          </button>
                          <button
                            onClick={() => setModalMesaAberta(mesa)}
                            title="Selecionar entrevistador da lista"
                            style={{ width: '22px', height: '22px', borderRadius: '4px', border: '1px solid #cbd5e1', background: mesa.tem_entrevistador ? '#fff7ed' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ea580c' }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '0.85rem' }}>mic</span>
                          </button>
                          <button
                            onClick={async () => {
                              if (confirm(`Deseja remover a Mesa ${mesa.numero}?`)) {
                                try {
                                  await api.delete(`/mesas/${mesa.id}`);
                                  carregarDados();
                                } catch (e) {
                                  alert('Erro ao excluir mesa: ' + e.message);
                                }
                              }
                            }}
                            title="Excluir mesa"
                            style={{ width: '22px', height: '22px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '0.85rem' }}>delete</span>
                          </button>
                        </div>
                      </div>

                      {/* Assentos ao Redor */}
                      {assentosAoRedor.map((assento, idx) => {
                        const anguloInicial = Math.PI * 0.25;
                        const anguloFinal = Math.PI * 1.75;
                        const passo = totalSlots > 1 ? (anguloFinal - anguloInicial) / (totalSlots - 1) : 0;
                        const angulo = anguloInicial + idx * passo;

                        const x = Math.sin(angulo) * raio;
                        const y = Math.cos(angulo) * raio;

                        const destacado = String(destaquePessoaId) === String(assento.id);

                        if (assento.tipo === 'cliente') {
                          const isGiants = assento.tipoParticipante === 'giants';

                          return (
                            <div
                              key={assento.id}
                              title={`${assento.nome}${assento.empresa ? ` (${assento.empresa})` : ''}`}
                              style={{
                                position: 'absolute',
                                transform: `translate(${x}px, ${y}px)`,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                zIndex: 8
                              }}
                            >
                              <div style={{ position: 'relative' }}>
                                <div
                                  style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '50%',
                                    background: isGiants ? '#d97706' : '#ff5722',
                                    border: destacado ? '3px solid #0f172a' : '2px solid #fff',
                                    boxShadow: destacado ? '0 0 16px #ff5722' : '0 2px 6px rgba(255,87,34,0.3)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#fff',
                                    transition: 'all 0.2s ease'
                                  }}
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>
                                    {isGiants ? 'stars' : 'person'}
                                  </span>
                                </div>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removerParticipante(assento.id);
                                  }}
                                  title="Retirar participante da mesa"
                                  style={{
                                    position: 'absolute',
                                    top: '-4px',
                                    right: '-4px',
                                    width: '14px',
                                    height: '14px',
                                    borderRadius: '50%',
                                    background: '#ef4444',
                                    color: '#fff',
                                    border: '1px solid #fff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    fontSize: '0.6rem',
                                    padding: 0
                                  }}
                                >
                                  ✕
                                </button>
                              </div>

                              <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#334155', marginTop: '0.2rem', whiteSpace: 'nowrap' }}>
                                {assento.nomeCracha}
                              </span>
                            </div>
                          );
                        }

                        // Assento Livre
                        const estaAlocacao = !!grupoSelecionadoAlocacao;

                        return (
                          <div
                            key={assento.id}
                            onClick={() => {
                              if (estaAlocacao) {
                                alocarGrupoEmMesa(assento.mesaId);
                              }
                            }}
                            title={
                              estaAlocacao
                                ? `Clique para sentar ${grupoSelecionadoAlocacao.empresa} (${grupoSelecionadoAlocacao.pendentesMesa.length} sócio(s)) aqui`
                                : 'Assento livre'
                            }
                            style={{
                              position: 'absolute',
                              transform: `translate(${x}px, ${y}px)`,
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              zIndex: 6
                            }}
                          >
                            <div
                              className={estaAlocacao ? 'assento-livre-alocavel' : ''}
                              style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                border: '2px dashed #94a3b8',
                                background: '#f8fafc',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#94a3b8',
                                transition: 'all 0.2s ease'
                              }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>
                                {estaAlocacao ? 'how_to_reg' : 'add'}
                              </span>
                            </div>
                            <span style={{ fontSize: '0.65rem', fontWeight: '700', color: estaAlocacao ? '#059669' : '#94a3b8', marginTop: '0.2rem' }}>
                              {estaAlocacao ? 'Sentar CNPJ' : 'Livre'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Entrevistador */}
      {modalMesaAberta && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem'
          }}
          onClick={() => setModalMesaAberta(null)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '460px',
              padding: '1.5rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#0f172a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>mic</span>
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: '#0f172a' }}>
                    Entrevistadores da Mesa #{modalMesaAberta.numero}
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Clique para escalar 1 ou mais entrevistadores
                  </span>
                </div>
              </div>
              <button
                onClick={() => setModalMesaAberta(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1.4rem', padding: '0.2rem' }}
              >
                ✕
              </button>
            </div>

            <div style={{ position: 'relative' }}>
              <span className="material-symbols-outlined" style={{ position: 'absolute', left: '10px', top: '10px', fontSize: '1.1rem', color: '#94a3b8' }}>search</span>
              <input
                type="text"
                value={buscaEntrevistadorModal}
                onChange={(e) => setBuscaEntrevistadorModal(e.target.value)}
                placeholder="Pesquisar entrevistador..."
                style={{ width: '100%', padding: '0.6rem 0.6rem 0.6rem 2.2rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {entrevistadores
                .filter(
                  (e) =>
                    (e.nome || '').toLowerCase().includes(buscaEntrevistadorModal.toLowerCase()) ||
                    (e.email || '').toLowerCase().includes(buscaEntrevistadorModal.toLowerCase())
                )
                .map((ent) => {
                  const idsMesa = modalMesaAberta.entrevistadores_ids || (modalMesaAberta.entrevistador_id ? [modalMesaAberta.entrevistador_id] : []);
                  const jaSelecionado = idsMesa.includes(ent.id);

                  return (
                    <div
                      key={ent.id}
                      onClick={() => alternarEntrevistadorMesa(modalMesaAberta.id, ent.id)}
                      style={{
                        padding: '0.65rem 0.9rem',
                        borderRadius: '10px',
                        border: '1.5px solid',
                        borderColor: jaSelecionado ? '#0284c7' : '#e2e8f0',
                        background: jaSelecionado ? '#f0f9ff' : '#fff',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: jaSelecionado ? '#0284c7' : '#f1f5f9',
                            color: jaSelecionado ? '#fff' : '#475569',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: '700',
                            fontSize: '0.85rem'
                          }}
                        >
                          {ent.nome.charAt(0)}
                        </div>
                        <div>
                          <div style={{ fontWeight: '700', fontSize: '0.85rem', color: '#0f172a' }}>{ent.nome}</div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{ent.email}</div>
                        </div>
                      </div>

                      <div
                        style={{
                          padding: '0.25rem 0.6rem',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: '700',
                          background: jaSelecionado ? '#0284c7' : '#f1f5f9',
                          color: jaSelecionado ? '#fff' : '#64748b'
                        }}
                      >
                        {jaSelecionado ? '✓ Escalado' : '+ Escalar'}
                      </div>
                    </div>
                  );
                })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
              <button
                onClick={() => setModalMesaAberta(null)}
                style={{
                  background: '#ff5722',
                  color: '#fff',
                  border: 'none',
                  padding: '0.65rem 1.4rem',
                  borderRadius: '8px',
                  fontWeight: '700',
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Concluir Escala
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}