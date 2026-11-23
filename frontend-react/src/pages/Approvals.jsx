import { toastSistema } from '../context/ModalContext';
﻿import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useTurma } from '../context/TurmaContext';

const fmtBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const obterPapelLogado = () => {
  try {
    const raw = localStorage.getItem('sessao_operador');
    if (!raw) return 'ADMIN';
    const s = JSON.parse(raw);
    return String(s?.usuario?.papel || s?.papel || 'ADMIN').toUpperCase();
  } catch (_) {
    return 'ADMIN';
  }
};

const extrairMotivosAlcada = (prop) => {
  if (Array.isArray(prop.motivos_alcada_json) && prop.motivos_alcada_json.length > 0) {
    return prop.motivos_alcada_json;
  }
  const dp = prop.dados_proposta || {};
  if (Array.isArray(dp.motivosAlcada) && dp.motivosAlcada.length > 0) {
    return dp.motivosAlcada;
  }
  const motivos = [];
  const desc = Number(prop.desconto_concedido ?? dp.desconto ?? prop.proposta_desconto ?? 0);
  if (desc > 0) motivos.push(`Desconto comercial concedido: ${fmtBRL(desc)}`);
  const formaRest = String(dp.formaRestante || prop.proposta_metodo_pagamento || '').toLowerCase();
  if (formaRest.includes('boleto')) motivos.push('Saldo com pagamento via Boleto Bancário');
  if (dp.observacoes) motivos.push(`Condição especial: ${dp.observacoes}`);
  return motivos;
};

const obterStatusComercial = (prop) => {
  const raw = String(prop.aprovacao_comercial_status || '').toUpperCase();
  if (raw === 'PENDENTE' || raw === 'APROVADA' || raw === 'RECUSADA' || raw === 'NAO_EXIGIDA') {
    return raw;
  }
  const motivos = extrairMotivosAlcada(prop);
  return motivos.length > 0 ? 'PENDENTE' : 'NAO_EXIGIDA';
};

const unificarPorEmpresa = (lista) => {
  const mapa = new Map();
  for (const item of lista) {
    const isGiant = Boolean(item.membro_giants) || String(item.origem || '').toUpperCase().includes('GIAN');
    const cnpjRaw = String(item.cnpj || item.dados_proposta?.cnpj || '').replace(/\D/g, '');
    const docRaw = String(item.cpf_cnpj || '').replace(/\D/g, '');
    const cnpjDigits = cnpjRaw.length === 14 ? cnpjRaw : (docRaw.length === 14 ? docRaw : '');
    const empNorm = String(item.empresa || item.cliente_empresa || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const chave = isGiant
      ? `${item.turma_id || 0}:giants:id:${item.id}`
      : cnpjDigits.length === 14
      ? `${item.turma_id || 0}:cnpj:${cnpjDigits}`
      : empNorm && empNorm !== 'empresa sga'
      ? `${item.turma_id || 0}:emp:${empNorm}`
      : `${item.turma_id || 0}:id:${item.id}`;

    const temContrato = Boolean(item.dados_proposta || item.proposta_real_id || Number(item.valor_negociado || 0) > 0);
    if (!mapa.has(chave)) {
      mapa.set(chave, item);
    } else {
      const atual = mapa.get(chave);
      const atualTemContrato = Boolean(atual.dados_proposta || atual.proposta_real_id || Number(atual.valor_negociado || 0) > 0);
      if (temContrato && !atualTemContrato) {
        mapa.set(chave, item);
      }
    }
  }
  return Array.from(mapa.values());
};

export default function Approvals() {
  const { turmaSelecionada } = useTurma();
  const papelUsuario = obterPapelLogado();
  const isAdmin = papelUsuario === 'ADMIN';
  const isGestorComercial = papelUsuario === 'APROVADOR' || isAdmin;
  const isFinanceiro = papelUsuario === 'FINANCEIRO' || isAdmin;

  const filtroInicial =
    papelUsuario === 'APROVADOR'
      ? 'ALCADA_COMERCIAL'
      : papelUsuario === 'FINANCEIRO'
      ? 'FILA_FINANCEIRO'
      : 'PENDENTE';

  const [propostas, setPropostas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState(() => (new URLSearchParams(window.location.search).get('busca') ? 'TODOS' : (filtroInicial)));
  const [busca, setBusca] = useState(() => new URLSearchParams(window.location.search).get('busca') || '');

  // Estado do Modal de Análise & Deliberação
  const [propSelecionada, setPropSelecionada] = useState(null);
  const [erroModal, setErroModal] = useState('');
  const [modalFeedback, setModalFeedback] = useState(null);

  // Etapa 1: Parecer Comercial (Gestor)
  const [parecerComercial, setParecerComercial] = useState('');
  const [salvandoComercial, setSalvandoComercial] = useState(false);

  // Etapa 2: Análise Financeira & Serasa
  const [analiseCreditoStatus, setAnaliseCreditoStatus] = useState('APROVADO');
  const [statusSerasaCodigo, setStatusSerasaCodigo] = useState('sem_restricao');
  const [statusSerasaTexto, setStatusSerasaTexto] = useState('');
  const [scoreSerasa, setScoreSerasa] = useState('');
  const [condicaoEspecial, setCondicaoEspecial] = useState('');
  const [parecerFinanceiro, setParecerFinanceiro] = useState('');
  const [salvandoAnalise, setSalvandoAnalise] = useState(false);
  const [modoDevolucao, setModoDevolucao] = useState(false);
  const [pagamentosConferidos, setPagamentosConferidos] = useState({});
  const [, setTickSla] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTickSla((t) => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);
  const [motivoDevolucao, setMotivoDevolucao] = useState('');
  const [devolvendo, setDevolvendo] = useState(false);
  const [comprovanteModal, setComprovanteModal] = useState(null);
  const [carregandoComprovante, setCarregandoComprovante] = useState(false);

  const carregarAprovacoes = async () => {
    try {
      setCarregando(true);
      setErro('');
      const tIdAtiva = turmaSelecionada || localStorage.getItem('turma_ativa_id') || '1491';
      const dados = await api.get(`/financeiro/propostas?turmaId=${tIdAtiva}`);
      const lista = Array.isArray(dados) ? dados : dados.propostas || [];
      const apenasComProposta = lista.filter((item) => {
        const et = String(item.etapa_funil || '').toLowerCase();
        const temProposta = Boolean(item.dados_proposta || item.proposta_real_id || Number(item.valor_negociado || 0) > 0);
        if (['decisao_futura', 'nao_fechou'].includes(et) && !temProposta) return false;
        if (et === 'reprovado' && !temProposta) return false;
        return true;
      });
      setPropostas(unificarPorEmpresa(apenasComProposta));
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarAprovacoes();
  }, [turmaSelecionada]);

  const abrirModalAnalise = (prop) => {
    const temRestricaoPrev =
      String(prop.analise_credito_status || prop.af_decisao_financeiro || '').toUpperCase() === 'NEGADO' ||
      String(prop.status_serasa_codigo || prop.af_status_serasa || '').includes('restricao');

    setErroModal('');
    setModoDevolucao(false);
    setPagamentosConferidos({});
    setMotivoDevolucao('');
    setPropSelecionada(prop);
    setParecerComercial(prop.aprovacao_comercial_parecer || '');
    setAnaliseCreditoStatus(
      prop.analise_credito_status || prop.af_decisao_financeiro || (temRestricaoPrev ? 'NEGADO' : 'APROVADO')
    );
    setStatusSerasaCodigo(
      prop.status_serasa_codigo || prop.af_status_serasa || (temRestricaoPrev ? 'com_restricao' : 'sem_restricao')
    );
    setStatusSerasaTexto(
      prop.status_serasa_texto || prop.af_observacoes_auditoria || ''
    );
    setScoreSerasa(prop.af_score_serasa ? String(prop.af_score_serasa) : '');
    setCondicaoEspecial('');
    setParecerFinanceiro(prop.parecer_financeiro || prop.af_parecer || '');
  };

  // Submissão Etapa 1: Gestor Comercial (APROVADOR / ADMIN)
  const submeterAlcadaComercial = async (decisaoComercial) => {
    if (!propSelecionada) return;
    setErroModal('');

    if (decisaoComercial === 'recusado' && !parecerComercial.trim()) {
      setErroModal('Informe a justificativa comercial antes de recusar a condição negociada.');
      return;
    }

    try {
      setSalvandoComercial(true);
      await api.post('/comercial/analisar', {
        fichaId: propSelecionada.id,
        proposta_id: propSelecionada.id,
        decisao: decisaoComercial,
        parecer: parecerComercial
      });

      const empresaNome = propSelecionada.empresa || propSelecionada.nome_participante;
      const protocolo = `PROP-${String(propSelecionada.id).padStart(3, '0')}`;
      setPropSelecionada(null);
      await carregarAprovacoes();

      setModalFeedback({
        tipo: decisaoComercial === 'recusado' ? 'recusado' : 'aprovado',
        protocolo,
        empresa: empresaNome,
        titulo:
          decisaoComercial === 'recusado'
            ? 'Alçada Comercial Recusada'
            : 'Alçada Comercial Aprovada — Encaminhada ao Financeiro',
        credito: decisaoComercial === 'recusado' ? 'RECUSADO PELO GESTOR' : 'AGUARDANDO VALIDAÇÃO FINANCEIRA',
        serasa: parecerComercial || (decisaoComercial === 'aprovado' ? 'Condição comercial autorizada pelo gestor.' : '')
      });
    } catch (err) {
      setErroModal(`Erro ao registrar aval comercial: ${err.message}`);
    } finally {
      setSalvandoComercial(false);
    }
  };


  const abrirComprovanteProposta = async (prop, indice = null, labelForma = '') => {
    try {
      setCarregandoComprovante(true);
      const qs = indice !== null && indice !== undefined ? `?indice=${indice}` : '';
      const comp = await api.get(`/financeiro/propostas/${prop.id}/comprovante${qs}`);
      setComprovanteModal({
        empresa: `${prop.empresa || prop.nome_participante}${labelForma ? ' — ' + labelForma : ''}`,
        protocolo: `PROP-${String(prop.id).padStart(3, '0')}`,
        ...comp
      });
    } catch (err) {
      setErroModal(err.message || 'Não foi possível carregar o comprovante anexado.');
    } finally {
      setCarregandoComprovante(false);
    }
  };

  const submeterDevolucaoAjuste = async () => {
    if (!propSelecionada) return;
    if (!motivoDevolucao.trim()) {
      setErroModal('Informe o motivo / orientação de ajuste para devolver à mesa.');
      return;
    }
    try {
      setDevolvendo(true);
      setErroModal('');
      await api.post('/financeiro/devolver', {
        fichaId: propSelecionada.id,
        motivo: motivoDevolucao.trim()
      });
      const empresaNome = propSelecionada.empresa || propSelecionada.nome_participante;
      const protocolo = `PROP-${String(propSelecionada.id).padStart(3, '0')}`;
      setPropSelecionada(null);
      setModoDevolucao(false);
      await carregarAprovacoes();
      setModalFeedback({
        tipo: 'ressalva',
        protocolo,
        empresa: empresaNome,
        titulo: 'Proposta Devolvida para Ajuste na Mesa',
        credito: 'AJUSTE SOLICITADO',
        serasa: motivoDevolucao.trim()
      });
    } catch (err) {
      setErroModal(`Erro ao devolver proposta: ${err.message}`);
    } finally {
      setDevolvendo(false);
    }
  };

  // Submissão Etapa 2: Financeiro & Serasa (FINANCEIRO / ADMIN)
  const submeterDeliberacaoFinanceira = async (decisaoFinal) => {
    if (!propSelecionada) return;
    setErroModal('');

    if (decisaoFinal === 'recusado' && !parecerFinanceiro.trim() && !statusSerasaTexto.trim()) {
      setErroModal('Informe o parecer financeiro ou o detalhamento da restrição Serasa antes de recusar a proposta.');
      return;
    }

    if (decisaoFinal === 'aprovado_com_ressalva' && !condicaoEspecial.trim() && !parecerFinanceiro.trim()) {
      setErroModal('Informe a condição especial / garantia exigida para aprovar com ressalva.');
      return;
    }

    try {
      setSalvandoAnalise(true);
      await api.post('/financeiro/analisar', {
        fichaId: propSelecionada.id,
        proposta_id: propSelecionada.id,
        decisao: decisaoFinal,
        analise_credito_status: analiseCreditoStatus,
        status_serasa_codigo: statusSerasaCodigo,
        status_serasa_texto: statusSerasaTexto,
        score_serasa: scoreSerasa ? Number(scoreSerasa) : null,
        condicao_especial: condicaoEspecial,
        parecer: parecerFinanceiro
      });

      const empresaNome = propSelecionada.empresa || propSelecionada.nome_participante;
      const protocolo = `PROP-${String(propSelecionada.id).padStart(3, '0')}`;
      setPropSelecionada(null);
      await carregarAprovacoes();

      setModalFeedback({
        tipo: decisaoFinal === 'recusado' ? 'recusado' : decisaoFinal === 'aprovado_com_ressalva' ? 'ressalva' : 'aprovado',
        protocolo,
        empresa: empresaNome,
        titulo:
          decisaoFinal === 'recusado'
            ? 'Proposta Recusada pelo Financeiro'
            : decisaoFinal === 'aprovado_com_ressalva'
            ? 'Proposta Aprovada com Ressalva'
            : 'Proposta Aprovada e Concluída',
        credito: analiseCreditoStatus,
        serasa: statusSerasaTexto || 'Sem restrições apontadas'
      });
    } catch (err) {
      setErroModal(`Erro ao registrar deliberação financeira: ${err.message}`);
    } finally {
      setSalvandoAnalise(false);
    }
  };

  const propostasVisiveis = isGestorComercial
    ? propostas
    : propostas.filter((p) => obterStatusComercial(p) !== 'PENDENTE');

  const propostasFiltradas = propostasVisiveis.filter((p) => {
    if (filtro === 'TODOS') return true;
    const st = String(p.status_aprovacao || 'PENDENTE').toUpperCase();
    const isPendenteGeral = st === 'PENDENTE' || st === 'ENVIADO_FINANCEIRO';
    const stComercial = obterStatusComercial(p);

    if (filtro === 'ALCADA_COMERCIAL') {
      return isPendenteGeral && stComercial === 'PENDENTE';
    }
    if (filtro === 'FILA_FINANCEIRO') {
      return isPendenteGeral && stComercial !== 'PENDENTE';
    }
    if (filtro === 'PENDENTE') return isPendenteGeral;
    if (filtro === 'APROVADO') return st === 'APROVADA' || st === 'APROVADO';
    if (filtro === 'RESSALVA') return st === 'APROVADA_COM_RESSALVA';
    if (filtro === 'AJUSTE') return st === 'AJUSTE_SOLICITADO';
    if (filtro === 'RECUSADO') return st === 'RECUSADA' || st === 'RECUSADO';
    if (st !== filtro) return false;
    return true;
  }).filter((p) => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return true;

    const termoDigits = termo.replace(/\D/g, '');
    const dp = p.dados_proposta || {};
    const empresa = String(p.empresa || p.cliente_empresa || '').toLowerCase();
    const titular = String(p.nome_participante || p.cliente_nome || '').toLowerCase();
    const produto = String(p.produto_nome || dp.produtoNome || dp.categoriaProduto || '').toLowerCase();
    const propRef = `prop-${String(p.id).padStart(3, '0')}`;
    const idStr = String(p.id || '');
    const sociosStr = Array.isArray(p.socios_empresa)
      ? p.socios_empresa.map((s) => String(s.nome || '')).join(' ').toLowerCase()
      : '';

    const docRaw = String(p.cnpj || p.cpf_cnpj || dp.cnpj || '');
    const docDigits = docRaw.replace(/\D/g, '');

    const matchTexto =
      empresa.includes(termo) ||
      titular.includes(termo) ||
      sociosStr.includes(termo) ||
      produto.includes(termo) ||
      propRef.includes(termo) ||
      idStr === termo;

    const matchDoc =
      termoDigits.length >= 2 &&
      (docDigits.includes(termoDigits) || idStr.includes(termoDigits));

    return matchTexto || matchDoc;
  });

  const qtdAlcadaComercial = propostasVisiveis.filter((p) => {
    const st = String(p.status_aprovacao || 'PENDENTE').toUpperCase();
    return (st === 'PENDENTE' || st === 'ENVIADO_FINANCEIRO') && obterStatusComercial(p) === 'PENDENTE';
  }).length;

  const qtdFilaFinanceiro = propostasVisiveis.filter((p) => {
    const st = String(p.status_aprovacao || 'PENDENTE').toUpperCase();
    return (st === 'PENDENTE' || st === 'ENVIADO_FINANCEIRO') && obterStatusComercial(p) !== 'PENDENTE';
  }).length;

  const obterTempoEsperaFila = (prop) => {
    const st = String(prop.status_aprovacao || 'PENDENTE').toUpperCase();
    if (!['PENDENTE', 'ENVIADO_FINANCEIRO'].includes(st)) return null;
    const rawDate = prop.proposta_criada_em || prop.enviado_financeiro_em || prop.updated_at || prop.created_at;
    if (!rawDate) return null;
    const ts = new Date(rawDate).getTime();
    if (Number.isNaN(ts)) return null;
    const mins = Math.max(0, Math.floor((Date.now() - ts) / 60000));
    const texto = mins < 1 ? 'agora mesmo' : mins < 60 ? `${mins} min na fila` : `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')} na fila`;
    return { mins, texto, atrasado: mins >= 10 };
  };

  const renderBadgeStatus = (prop) => {
    const st = String(prop.status_aprovacao || 'PENDENTE').toUpperCase();
    const stCom = obterStatusComercial(prop);
    const motivos = extrairMotivosAlcada(prop);
    const credito = String(prop.analise_credito_status || prop.af_decisao_financeiro || '').toUpperCase();
    const serasaTxt = prop.status_serasa_texto || prop.af_observacoes_auditoria || '';
    const sla = obterTempoEsperaFila(prop);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        {/* Etapa 1: Liberação Comercial */}
        {stCom === 'PENDENTE' ? (
          <span style={{ display: 'inline-block', width: 'fit-content', background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', padding: '0.18rem 0.55rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: '800' }}>
            1. Aguardando Gestor Comercial
          </span>
        ) : stCom === 'APROVADA' ? (
          <span style={{ display: 'inline-block', width: 'fit-content', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '0.15rem 0.5rem', borderRadius: '999px', fontSize: '0.68rem', fontWeight: '800' }}>
            ✔ 1. Liberado pelo Comercial{prop.aprovacao_comercial_por_nome ? ` (${prop.aprovacao_comercial_por_nome.split(' ')[0]})` : ''}
          </span>
        ) : stCom === 'RECUSADA' ? (
          <span style={{ display: 'inline-block', width: 'fit-content', background: '#fee2e2', color: '#991b1b', padding: '0.18rem 0.55rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: '800' }}>
            ✖ Recusado pelo Comercial
          </span>
        ) : (
          <span style={{ display: 'inline-block', width: 'fit-content', background: '#f1f5f9', color: '#475569', padding: '0.15rem 0.5rem', borderRadius: '999px', fontSize: '0.68rem', fontWeight: '700' }}>
            1. Condição Padrão (Sem Exceção)
          </span>
        )}

        {/* Etapa 2: Status Financeiro */}
        {st === 'APROVADA' || st === 'APROVADO' ? (
          <span style={{ display: 'inline-block', width: 'fit-content', background: '#dcfce7', color: '#166534', padding: '0.18rem 0.55rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: '800' }}>
            ✔ 2. Aprovada pelo Financeiro
          </span>
        ) : st === 'AJUSTE_SOLICITADO' ? (
          <span style={{ display: 'inline-block', width: 'fit-content', background: '#ffedd5', color: '#9a3412', border: '1px solid #fdba74', padding: '0.18rem 0.55rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: '800' }}>
            ↩ Devolvida p/ Ajuste na Mesa
          </span>
        ) : st === 'APROVADA_COM_RESSALVA' ? (
          <span style={{ display: 'inline-block', width: 'fit-content', background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', padding: '0.18rem 0.55rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: '800' }}>
            ⚠ 2. Aprovada c/ Ressalva
          </span>
        ) : st === 'RECUSADA' || st === 'RECUSADO' ? (
          stCom !== 'RECUSADA' && (
            <span style={{ display: 'inline-block', width: 'fit-content', background: '#fee2e2', color: '#991b1b', padding: '0.18rem 0.55rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: '800' }}>
              ✖ 2. Recusada pelo Financeiro
            </span>
          )
        ) : stCom !== 'PENDENTE' ? (
          <span style={{ display: 'inline-block', width: 'fit-content', background: '#eff6ff', color: '#1d4ed8', padding: '0.18rem 0.55rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: '800' }}>
            ⏳ 2. Aguardando Financeiro / Serasa
          </span>
        ) : null}

        {sla && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            width: 'fit-content',
            fontSize: '0.68rem',
            fontWeight: '800',
            padding: '0.12rem 0.45rem',
            borderRadius: '5px',
            background: sla.atrasado ? '#fef2f2' : '#f8fafc',
            color: sla.atrasado ? '#dc2626' : '#64748b',
            border: sla.atrasado ? '1px solid #fecaca' : '1px solid #e2e8f0'
          }}>
            ⏱️ {sla.texto}
          </span>
        )}

        {motivos.length > 0 && (
          <div style={{ fontSize: '0.7rem', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', padding: '0.25rem 0.5rem', borderRadius: '6px', maxWidth: '280px', lineHeight: 1.35, whiteSpace: 'normal' }}>
            <strong>Exceção:</strong> {motivos.join(' • ')}
          </div>
        )}

        {credito && (
          <span style={{
            fontSize: '0.7rem',
            fontWeight: '800',
            color: credito === 'NEGADO' ? '#dc2626' : '#059669'
          }}>
            Crédito: {credito}
          </span>
        )}
        {serasaTxt && (
          <span style={{ fontSize: '0.7rem', color: '#7f1d1d', background: '#fef2f2', padding: '0.15rem 0.4rem', borderRadius: '4px', maxWidth: '260px', whiteSpace: 'normal', lineHeight: 1.3 }}>
            {serasaTxt}
          </span>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: '2rem', width: '100%', boxSizing: 'border-box' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
              Fila de Aprovações (Comercial & Financeiro)
            </h1>
            <span style={{
              fontSize: '0.72rem',
              fontWeight: '800',
              padding: '0.22rem 0.6rem',
              borderRadius: '999px',
              background: papelUsuario === 'APROVADOR' ? '#fef3c7' : papelUsuario === 'FINANCEIRO' ? '#dcfce7' : '#fff7ed',
              color: papelUsuario === 'APROVADOR' ? '#92400e' : papelUsuario === 'FINANCEIRO' ? '#166534' : '#c2410c',
              border: '1px solid #fed7aa'
            }}>
              Perfil: {papelUsuario}
            </span>
          </div>
          <p style={{ color: '#64748b', margin: '0.25rem 0 0', fontSize: '0.9rem' }}>
            {isGestorComercial
              ? 'Etapa 1: Liberação Comercial do Gestor (descontos, permuta e exceções) • Etapa 2: Crédito/Serasa e liberação Financeira'
              : 'Análise de Crédito/Serasa, conferência de entrada/cashback e liberação financeira de contratos'}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.65rem' }}>
          <a
            href={`${import.meta.env.VITE_API_URL || '/api'}/financeiro/exportar-csv?turmaId=${turmaSelecionada || localStorage.getItem('turma_ativa_id') || '1491'}`}
            target="_blank"
            rel="noreferrer"
            style={{
              background: '#059669',
              color: '#ffffff',
              padding: '0.5rem 0.95rem',
              borderRadius: '8px',
              fontWeight: '800',
              fontSize: '0.8rem',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.05rem' }}>download</span>
            Exportar Planilha (Excel/CSV)
          </a>

          <div style={{ display: 'flex', gap: '0.35rem', background: '#f1f5f9', padding: '0.3rem', borderRadius: '10px', flexWrap: 'wrap' }}>
            {[
              ...(isGestorComercial
                ? [{ id: 'ALCADA_COMERCIAL', label: `1. Gestor Comercial (${qtdAlcadaComercial})` }]
                : []),
              {
                id: 'FILA_FINANCEIRO',
                label: isGestorComercial
                  ? `2. Fila Financeiro (${qtdFilaFinanceiro})`
                  : `Fila Financeiro (${qtdFilaFinanceiro})`
              },
              { id: 'PENDENTE', label: 'Todas Pendentes' },
              { id: 'APROVADO', label: 'Aprovadas' },
              { id: 'RESSALVA', label: 'Com Ressalva' },
              { id: 'AJUSTE', label: 'Devolvidas' },
              { id: 'RECUSADO', label: 'Recusadas' },
              { id: 'TODOS', label: 'Todas' }
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setFiltro(item.id)}
                style={{
                  border: 'none',
                  background: filtro === item.id ? '#ff5722' : 'transparent',
                  color: filtro === item.id ? '#fff' : '#64748b',
                  padding: '0.42rem 0.78rem',
                  borderRadius: '8px',
                  fontWeight: '700',
                  fontSize: '0.76rem',
                  cursor: 'pointer'
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {erro && (
        <div style={{ background: '#fef2f2', color: '#ef4444', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #fecaca' }}>
          {erro}
        </div>
      )}

      {/* Barra de Pesquisa */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '300px', background: '#fff', padding: '0.85rem 1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '0.75rem', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
          <span className="material-symbols-outlined" style={{ color: '#94a3b8' }}>search</span>
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Pesquisar por Razão Social, Nome do Sócio, CNPJ, Produto ou ID..."
            style={{ width: '100%', border: 'none', outline: 'none', fontSize: '0.95rem', color: '#1e293b' }}
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca('')}
              title="Limpar pesquisa"
              style={{ background: '#f1f5f9', border: 'none', borderRadius: '6px', padding: '0.2rem 0.5rem', fontWeight: '800', color: '#475569', cursor: 'pointer', fontSize: '0.8rem' }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Tabela */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <tr>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.82rem' }}>Ref.</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.82rem' }}>Empresa / Proponente</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.82rem' }}>Produto & Sócios</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.82rem' }}>Valores & Cashback</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.82rem' }}>Liberação Comercial & Crédito</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.82rem', textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr><td colSpan="6" style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>Carregando propostas e análises...</td></tr>
            ) : propostasFiltradas.length === 0 ? (
              <tr><td colSpan="6" style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>Nenhuma proposta encontrada neste filtro.</td></tr>
            ) : (
              propostasFiltradas.map((prop) => {
                const dp = prop.dados_proposta || {};
                const valorNeg = Number(prop.valor_negociado ?? dp.valorTotal ?? prop.proposta_valor_total ?? 0);
                const cbTotal = Number(prop.cashback ?? dp.cashback ?? prop.proposta_cashback ?? 0);
                const descTotal = Number(prop.desconto_concedido ?? dp.desconto ?? prop.proposta_desconto ?? 0);
                const saldoContrato = Math.max(0, valorNeg - cbTotal - descTotal);
                const entrada = Number(dp.valorEntrada ?? prop.proposta_valor_entrada ?? 0);
                const permuta = Number(dp.permuta || 0);
                const entradaComp = Number(dp.entradaComplementar || 0);
                const saldoFinal = Math.max(0, saldoContrato - entrada - permuta - entradaComp);
                const parcelas = Number(dp.quantidadeParcelas ?? prop.proposta_parcelas ?? 12);
                const valorParcela = Number(dp.valorParcela ?? prop.proposta_valor_parcela ?? 0);
                const cnpjExibir = [prop.cnpj, prop.cpf_cnpj, dp.cnpj].find((d) => String(d || '').replace(/\D/g, '').length === 14) || '';
                const idPagamento = dp.identificadorPagamento || prop.cv_cartao || '';
                const stCom = obterStatusComercial(prop);

                return (
                  <tr key={prop.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '1rem', fontWeight: '800', color: '#ff5722', fontSize: '0.88rem' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span>PROP-{String(prop.id).padStart(3, '0')}</span>
                        <button
                          type="button"
                          className="btn-copy-chip"
                          title="Copiar protocolo"
                          onClick={(e) => {
                            e.stopPropagation();
                            const proto = `PROP-${String(prop.id).padStart(3, '0')}`;
                            navigator.clipboard?.writeText(proto).then(() => {
                              toastSistema(`Protocolo copiado: ${proto}`, 'sucesso', 2200);
                            }).catch(() => {});
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '0.82rem' }}>content_copy</span>
                        </button>
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '0.9rem' }}>
                        {prop.empresa || prop.cliente_empresa || 'Empresa SGA'}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.35rem' }}>
                        <span>{prop.nome_participante || prop.cliente_nome}</span>
                        {cnpjExibir && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontFamily: 'monospace' }}>
                            • {cnpjExibir}
                            <button
                              type="button"
                              className="btn-copy-chip"
                              title="Copiar CNPJ"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard?.writeText(cnpjExibir).then(() => {
                                  toastSistema(`CNPJ copiado: ${cnpjExibir}`, 'sucesso', 2200);
                                }).catch(() => {});
                              }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: '0.8rem' }}>content_copy</span>
                            </button>
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div>
                        <span style={{
                          display: 'inline-block',
                          padding: '0.18rem 0.5rem',
                          borderRadius: '6px',
                          fontSize: '0.7rem',
                          fontWeight: '800',
                          marginRight: '0.4rem',
                          background: '#ffedd5',
                          color: '#9a3412'
                        }}>
                          {dp.categoriaProduto || 'GIANTS'}
                        </span>
                        <span style={{ fontWeight: '700', color: '#0f172a', fontSize: '0.82rem' }}>
                          {prop.produto_nome || 'GIANTS'}
                        </span>
                      </div>
                      {Array.isArray(dp.sociosDetalhes) && dp.sociosDetalhes.filter((s) => s.entraNoContrato).length > 0 && (
                        <div style={{ fontSize: '0.74rem', color: '#475569', marginTop: '0.25rem' }}>
                          <strong>Sócios ({dp.sociosDetalhes.filter((s) => s.entraNoContrato).length}):</strong>{' '}
                          {dp.sociosDetalhes.filter((s) => s.entraNoContrato).map((s) => s.nome).join(', ')}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontWeight: '900', color: '#ea580c', fontSize: '0.92rem' }}>
                        Saldo Final: {fmtBRL(saldoFinal)}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#334155' }}>
                        Líquido: <strong>{fmtBRL(saldoContrato)}</strong>
                        {descTotal > 0 && <span style={{ color: '#dc2626', fontWeight: '700' }}> • Desc: -{fmtBRL(descTotal)}</span>}
                        {permuta > 0 && <span style={{ color: '#9333ea', fontWeight: '700' }}> • Permuta: -{fmtBRL(permuta)}</span>}
                        {cbTotal > 0 && <span style={{ color: '#047857', fontWeight: '700' }}> • CB: -{fmtBRL(cbTotal)}</span>}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                        (-) Entr. {fmtBRL(entrada)}{entradaComp > 0 ? ` + ${fmtBRL(entradaComp)}` : ''} • {parcelas}x {fmtBRL(valorParcela)}
                      </div>
                      {(() => {
                        const qtdComps = Array.isArray(dp.pagamentosEntrada)
                          ? dp.pagamentosEntrada.filter((p) => p && p.temComprovante).length
                          : prop.tem_comprovante
                          ? 1
                          : 0;
                        if (!idPagamento && qtdComps === 0) return null;
                        return (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center', marginTop: '0.2rem' }}>
                            {idPagamento && (
                              <span style={{ fontSize: '0.71rem', color: '#0369a1', fontWeight: '700' }}>
                                Ref./CV: {idPagamento}
                              </span>
                            )}
                            {qtdComps > 0 && (
                              <span style={{ fontSize: '0.68rem', fontWeight: '800', color: '#047857', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '0.08rem 0.4rem', borderRadius: '5px' }}>
                                📎 {qtdComps} comprovante(s)
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      {renderBadgeStatus(prop)}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <a
                        href={`/proposals/${prop.id}/contract`}
                        target="_blank"
                        rel="noreferrer"
                        title="Gerar Resumo Contratual / Termo de Adesão em PDF"
                        style={{
                          background: '#f1f5f9',
                          color: '#0f172a',
                          border: '1px solid #cbd5e1',
                          padding: '0.48rem 0.7rem',
                          borderRadius: '8px',
                          fontSize: '0.76rem',
                          fontWeight: '700',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.28rem'
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }}>picture_as_pdf</span>
                        Termo PDF
                      </a>
                      <button
                        onClick={() => abrirModalAnalise(prop)}
                        style={{
                          background: stCom === 'PENDENTE' ? '#d97706' : '#ff5722',
                          color: '#fff',
                          border: 'none',
                          padding: '0.5rem 0.95rem',
                          borderRadius: '8px',
                          fontSize: '0.78rem',
                          fontWeight: '700',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem'
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>
                          {stCom === 'PENDENTE' ? 'gavel' : 'policy'}
                        </span>
                        {stCom === 'PENDENTE' ? 'Avaliar Exceção / Ver' : 'Analisar Crédito / Deliberar'}
                      </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL DE DELIBERAÇÃO EM 2 ETAPAS */}
      {propSelecionada && (() => {
        const dp = propSelecionada.dados_proposta || {};
        const valorNeg = Number(propSelecionada.valor_negociado ?? dp.valorTotal ?? propSelecionada.proposta_valor_total ?? 0);
        const cbTotal = Number(propSelecionada.cashback ?? dp.cashback ?? propSelecionada.proposta_cashback ?? 0);
        const descTotal = Number(propSelecionada.desconto_concedido ?? dp.desconto ?? propSelecionada.proposta_desconto ?? 0);
        const saldoContrato = Math.max(0, valorNeg - cbTotal - descTotal);
        const entrada = Number(dp.valorEntrada ?? propSelecionada.proposta_valor_entrada ?? 0);
        const permuta = Number(dp.permuta || 0);
        const entradaComp = Number(dp.entradaComplementar || 0);
        const dataEntradaComp = dp.dataEntradaComplementar || '';
        const saldoFinal = Math.max(0, saldoContrato - entrada - permuta - entradaComp);
        const parcelas = Number(dp.quantidadeParcelas ?? propSelecionada.proposta_parcelas ?? 12);
        const valorParcela = Number(dp.valorParcela ?? propSelecionada.proposta_valor_parcela ?? 0);
        const sociosContrato = Array.isArray(dp.sociosDetalhes)
          ? dp.sociosDetalhes.filter((s) => s.entraNoContrato)
          : [];

        const stCom = obterStatusComercial(propSelecionada);
        const motivosAlcada = extrairMotivosAlcada(propSelecionada);
        const bloqueadoFinanceiroPorComercial = stCom === 'PENDENTE';

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
            <div style={{ background: '#ffffff', borderRadius: '14px', maxWidth: '820px', width: '100%', overflow: 'hidden', boxShadow: '0 20px 45px rgba(15, 23, 42, 0.22)', border: '1px solid #e2e8f0', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
              {/* Cabeçalho */}
              <div style={{ background: '#ffffff', padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#ff5722', background: '#fff7ed', border: '1px solid #fed7aa', padding: '0.18rem 0.55rem', borderRadius: '6px' }}>
                      PROP-{String(propSelecionada.id).padStart(3, '0')}
                    </span>
                    <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#475569', background: '#f1f5f9', padding: '0.18rem 0.55rem', borderRadius: '6px' }}>
                      Liberação em 2 Etapas • Perfil: {papelUsuario}
                    </span>
                  </div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '800', color: '#0f172a' }}>
                    {propSelecionada.empresa || propSelecionada.nome_participante}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setPropSelecionada(null)}
                  style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b', width: '34px', height: '34px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '1.15rem' }}>close</span>
                </button>
              </div>

              {/* Corpo Rolável */}
              <div style={{ padding: '1.35rem 1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.1rem', background: '#f8fafc' }}>
                {/* Resumo da Proposta */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
                  <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.95rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>Empresa & Contrato</div>
                    <div style={{ fontSize: '0.86rem', fontWeight: '700', color: '#0f172a', fontFamily: 'monospace' }}>
                      {[propSelecionada.cnpj, propSelecionada.cpf_cnpj, propSelecionada.dados_proposta?.cnpj].find((d) => String(d || '').replace(/\D/g, '').length === 14) || 'CNPJ não informado'}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#475569' }}>
                      {sociosContrato.length > 0
                        ? `Sócios (${sociosContrato.length}): ${sociosContrato.map((s) => s.nome).join(', ')}`
                        : `Titular: ${propSelecionada.nome_participante}`}
                    </div>
                    <div style={{ marginTop: '0.2rem', paddingTop: '0.35rem', borderTop: '1px dashed #e2e8f0', fontSize: '0.75rem', color: '#334155' }}>
                      <div><strong>Produto:</strong> {propSelecionada.produto_nome || dp.produtoNome || 'GIANTS'}</div>
                      {(propSelecionada.entrevistador_nome || dp.entrevistadorNome || propSelecionada.usuario_nome) && (
                        <div style={{ marginTop: '0.15rem', color: '#64748b' }}>
                          <strong>Mesa / Operador:</strong> {propSelecionada.entrevistador_nome || dp.entrevistadorNome || propSelecionada.usuario_nome}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.95rem' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>Composição Financeira</div>
                    <div style={{ fontSize: '0.8rem', color: '#334155', marginTop: '0.2rem' }}>
                      Negociado: <strong>{fmtBRL(valorNeg)}</strong>
                    </div>
                    {cbTotal > 0 && (
                      <div style={{ fontSize: '0.78rem', color: '#047857', fontWeight: '700' }}>
                        (-) Cashback CNPJ: -{fmtBRL(cbTotal)}
                      </div>
                    )}
                    {descTotal > 0 && (
                      <div style={{ fontSize: '0.78rem', color: '#b91c1c', fontWeight: '700' }}>
                        (-) Desconto: -{fmtBRL(descTotal)}
                      </div>
                    )}
                    <div style={{ fontSize: '0.8rem', color: '#334155' }}>
                      Líquido Contrato: <strong>{fmtBRL(saldoContrato)}</strong>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#0284c7', fontWeight: '700' }}>
                      (-) Entrada 1: -{fmtBRL(entrada)}
                    </div>
                    {entradaComp > 0 && (
                      <div style={{ fontSize: '0.78rem', color: '#0369a1', fontWeight: '700' }}>
                        (-) Entrada 2: -{fmtBRL(entradaComp)} {dataEntradaComp ? `(${dataEntradaComp})` : ''}
                      </div>
                    )}
                    {permuta > 0 && (
                      <div style={{ fontSize: '0.78rem', color: '#9333ea', fontWeight: '700' }}>
                        (-) Permuta: -{fmtBRL(permuta)}
                      </div>
                    )}
                    <div style={{ fontSize: '0.95rem', fontWeight: '900', color: '#ff5722', marginTop: '0.25rem', borderTop: '1px dashed #cbd5e1', paddingTop: '0.25rem' }}>
                      Saldo Final: {fmtBRL(saldoFinal)}
                    </div>
                  </div>

                  <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.95rem' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>Pagamento Acordado</div>
                    <div style={{ fontSize: '0.82rem', color: '#0f172a', fontWeight: '700', marginTop: '0.2rem' }}>
                      Entrada Total: {fmtBRL(entrada)}
                    </div>
                    {Array.isArray(dp.pagamentosEntrada) && dp.pagamentosEntrada.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.35rem' }}>
                        {dp.pagamentosEntrada.map((pg, idxPg) => {
                          const conferido = Boolean(pagamentosConferidos[idxPg]);
                          return (
                            <div
                              key={idxPg}
                              style={{
                                background: conferido ? '#f0fdf4' : '#f8fafc',
                                border: conferido ? '1px solid #86efac' : '1px solid #e2e8f0',
                                borderRadius: '7px',
                                padding: '0.4rem 0.55rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.3rem'
                              }}
                            >
                              <div style={{ fontSize: '0.74rem', color: '#1e293b', lineHeight: 1.3 }}>
                                <strong>{pg.forma}{pg.forma === 'Cartão de Crédito' && Number(pg.parcelasCartao || 1) > 1 ? ` (${pg.parcelasCartao}x maq.)` : ''}</strong>: {fmtBRL(pg.valor)}
                                {pg.identificador && <span style={{ display: 'block', color: '#0369a1', fontWeight: '700', fontSize: '0.71rem' }}>Ref/CV: {pg.identificador}</span>}
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                                {pg.temComprovante ? (
                                  <button
                                    type="button"
                                    disabled={carregandoComprovante}
                                    onClick={() => abrirComprovanteProposta(propSelecionada, idxPg, `${pg.forma} (${fmtBRL(pg.valor)})`)}
                                    style={{
                                      background: '#ecfdf5',
                                      color: '#047857',
                                      border: '1px solid #86efac',
                                      borderRadius: '5px',
                                      padding: '0.18rem 0.5rem',
                                      fontSize: '0.69rem',
                                      fontWeight: '800',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.2rem'
                                    }}
                                  >
                                    <span className="material-symbols-outlined" style={{ fontSize: '0.85rem' }}>receipt_long</span>
                                    Comprovante
                                  </button>
                                ) : (
                                  <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Sem anexo</span>
                                )}
                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.69rem', fontWeight: '800', color: conferido ? '#15803d' : '#475569', cursor: 'pointer' }}>
                                  <input
                                    type="checkbox"
                                    checked={conferido}
                                    onChange={(e) => setPagamentosConferidos((prev) => ({ ...prev, [idxPg]: e.target.checked }))}
                                  />
                                  {conferido ? 'Conferido' : 'Conferir'}
                                </label>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize: '0.75rem', color: '#475569' }}>Forma: {dp.formaEntrada || 'Pix'}</div>
                        {(dp.identificadorPagamento || propSelecionada.cv_cartao) && (
                          <div style={{ fontSize: '0.75rem', color: '#0369a1', background: '#f0f9ff', border: '1px solid #bae6fd', padding: '0.25rem 0.5rem', borderRadius: '6px', marginTop: '0.3rem', fontWeight: '700' }}>
                            CV / Link / Ref.: {dp.identificadorPagamento || propSelecionada.cv_cartao}
                          </div>
                        )}
                      </>
                    )}
                    {propSelecionada.tem_comprovante && !(Array.isArray(dp.pagamentosEntrada) && dp.pagamentosEntrada.some((p) => p.temComprovante)) && (
                      <button
                        type="button"
                        disabled={carregandoComprovante}
                        onClick={() => abrirComprovanteProposta(propSelecionada)}
                        style={{
                          marginTop: '0.4rem',
                          background: '#ecfdf5',
                          color: '#047857',
                          border: '1px solid #86efac',
                          borderRadius: '6px',
                          padding: '0.3rem 0.6rem',
                          fontSize: '0.74rem',
                          fontWeight: '800',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem'
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }}>receipt_long</span>
                        {carregandoComprovante ? 'Abrindo...' : `Ver Comprovante (${propSelecionada.comprovante_nome || 'Anexo'})`}
                      </button>
                    )}
                    <div style={{ fontSize: '0.82rem', color: '#0f172a', fontWeight: '700', marginTop: '0.45rem', paddingTop: '0.35rem', borderTop: '1px dashed #e2e8f0' }}>
                      A Parcelar: {fmtBRL(saldoFinal)}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '0.15rem' }}>
                      Parcelas: {parcelas}x de {fmtBRL(valorParcela)} ({dp.formaRestante || 'Pix'})
                    </div>
                  </div>
                </div>

                {/* ETAPA 1: ALÇADA COMERCIAL (GESTOR / APROVADOR) */}
                <div style={{
                  border: stCom === 'PENDENTE' ? '1.5px solid #f59e0b' : '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '1.15rem',
                  background: stCom === 'PENDENTE' ? '#fffbeb' : '#ffffff'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span className="material-symbols-outlined" style={{ color: '#d97706', fontSize: '1.2rem' }}>gavel</span>
                      Etapa 1 — Liberação Comercial (Gestor)
                    </span>
                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: '800',
                      padding: '0.2rem 0.6rem',
                      borderRadius: '999px',
                      background: stCom === 'PENDENTE' ? '#fef3c7' : stCom === 'APROVADA' ? '#dcfce7' : stCom === 'RECUSADA' ? '#fee2e2' : '#f1f5f9',
                      color: stCom === 'PENDENTE' ? '#92400e' : stCom === 'APROVADA' ? '#166534' : stCom === 'RECUSADA' ? '#991b1b' : '#475569'
                    }}>
                      {stCom === 'PENDENTE'
                        ? 'AGUARDANDO LIBERAÇÃO COMERCIAL'
                        : stCom === 'APROVADA'
                        ? `APROVADA POR ${(propSelecionada.aprovacao_comercial_por_nome || 'GESTOR').toUpperCase()}`
                        : stCom === 'RECUSADA'
                        ? 'RECUSADA PELO GESTOR'
                        : 'DISPENSADA (CONDIÇÃO PADRÃO)'}
                    </span>
                  </div>

                  {motivosAlcada.length > 0 && (
                    <div style={{ background: '#ffffff', border: '1px solid #fde68a', borderRadius: '8px', padding: '0.65rem 0.85rem', marginBottom: '0.75rem' }}>
                      <div style={{ fontSize: '0.74rem', fontWeight: '800', color: '#92400e', marginBottom: '0.3rem' }}>
                        Motivos que exigem autorização do Gestor Comercial:
                      </div>
                      <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.78rem', color: '#78350f', fontWeight: '600' }}>
                        {motivosAlcada.map((m, idx) => (
                          <li key={idx}>{m}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {stCom === 'PENDENTE' ? (
                    isGestorComercial ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#78350f', marginBottom: '0.25rem' }}>
                            Parecer / Justificativa do Gestor Comercial
                          </label>
                          <input
                            type="text"
                            value={parecerComercial}
                            onChange={(e) => setParecerComercial(e.target.value)}
                            placeholder="Ex: Desconto autorizado em função de fechamento à vista / reforço de entrada..."
                            style={{ width: '100%', padding: '0.58rem', borderRadius: '8px', border: '1px solid #fcd34d', background: '#fff', fontSize: '0.82rem', boxSizing: 'border-box' }}
                          />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.55rem', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            disabled={salvandoComercial}
                            onClick={() => submeterAlcadaComercial('recusado')}
                            style={{ background: '#fff', color: '#dc2626', border: '1.5px solid #fca5a5', padding: '0.52rem 0.95rem', borderRadius: '8px', fontWeight: '800', fontSize: '0.78rem', cursor: 'pointer' }}
                          >
                            Recusar Condição Comercial
                          </button>
                          <button
                            type="button"
                            disabled={salvandoComercial}
                            onClick={() => submeterAlcadaComercial('aprovado')}
                            style={{ background: '#d97706', color: '#fff', border: 'none', padding: '0.52rem 1.05rem', borderRadius: '8px', fontWeight: '800', fontSize: '0.78rem', cursor: 'pointer' }}
                          >
                            {salvandoComercial ? 'Registrando...' : '✔ Liberar Condição Comercial (Enviar p/ Financeiro)'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.79rem', color: '#92400e', fontWeight: '700' }}>
                        Aguardando aprovação de um usuário com perfil <strong>APROVADOR (Gestor Comercial)</strong> ou <strong>ADMIN</strong>. O Financeiro só poderá concluir esta ficha após o aval comercial.
                      </div>
                    )
                  ) : (
                    <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                      {propSelecionada.aprovacao_comercial_parecer
                        ? `Parecer do Gestor: "${propSelecionada.aprovacao_comercial_parecer}"`
                        : stCom === 'APROVADA'
                        ? 'Condição comercial validada. Proposta liberada para conferência financeira.'
                        : 'Proposta dentro dos parâmetros comerciais padrão (sem desconto ou exceção de entrada).'}
                    </div>
                  )}
                </div>

                {/* ETAPA 2: ANÁLISE DE CRÉDITO, SERASA & DELIBERAÇÃO FINANCEIRA */}
                <div style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '1.15rem',
                  background: '#ffffff',
                  opacity: bloqueadoFinanceiroPorComercial ? 0.65 : 1
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span className="material-symbols-outlined" style={{ color: '#ff5722', fontSize: '1.2rem' }}>account_balance</span>
                      Etapa 2 — Validação Financeira, Pagamento & Status Serasa (CNPJ)
                    </span>

                    {!bloqueadoFinanceiroPorComercial && isFinanceiro && (
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setAnaliseCreditoStatus('APROVADO');
                            setStatusSerasaCodigo('sem_restricao');
                            setStatusSerasaTexto('APROVADO — SEM RESTRIÇÕES FINANCEIRAS OU PROTESTOS NO CNPJ.');
                          }}
                          style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '0.3rem 0.65rem', borderRadius: '6px', fontSize: '0.73rem', fontWeight: '700', cursor: 'pointer' }}
                        >
                          + Sem Restrição
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAnaliseCreditoStatus('NEGADO');
                            setStatusSerasaCodigo('com_restricao');
                            if (!statusSerasaTexto || statusSerasaTexto.startsWith('APROVADO')) {
                              setStatusSerasaTexto('CLIENTE POSSUI X PENDÊNCIAS FINANCEIRAS (DÍVIDA COM BANCOS) NO VALOR TOTAL DE R$ 0,00 / POSSUI TAMBÉM X PROTESTOS QUE TOTALIZAM R$ 0,00');
                            }
                          }}
                          style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '0.3rem 0.65rem', borderRadius: '6px', fontSize: '0.73rem', fontWeight: '700', cursor: 'pointer' }}
                        >
                          + Modelo Pendências / Protestos
                        </button>
                      </div>
                    )}
                  </div>

                  {bloqueadoFinanceiroPorComercial ? (
                    <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', padding: '0.85rem', fontSize: '0.8rem', color: '#475569' }}>
                      🔒 A análise financeira será liberada assim que a <strong>Etapa 1 (Liberação Comercial)</strong> for aprovada pelo Gestor.
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem', marginBottom: '0.85rem' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>
                            Parecer Análise de Crédito
                          </label>
                          <select
                            disabled={!isFinanceiro}
                            value={analiseCreditoStatus}
                            onChange={(e) => setAnaliseCreditoStatus(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '0.58rem',
                              borderRadius: '8px',
                              border: '1px solid #cbd5e1',
                              fontWeight: '800',
                              fontSize: '0.84rem',
                              color: analiseCreditoStatus === 'NEGADO' ? '#dc2626' : '#059669',
                              background: '#fff'
                            }}
                          >
                            <option value="APROVADO">APROVADO</option>
                            <option value="NEGADO">NEGADO (COM RESTRIÇÃO)</option>
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>
                            Classificação Serasa
                          </label>
                          <select
                            disabled={!isFinanceiro}
                            value={statusSerasaCodigo}
                            onChange={(e) => setStatusSerasaCodigo(e.target.value)}
                            style={{ width: '100%', padding: '0.58rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.84rem', background: '#fff', color: '#0f172a' }}
                          >
                            <option value="sem_restricao">Sem Restrição</option>
                            <option value="score_alto_sem_restricao">Score Alto / Sem Restrição</option>
                            <option value="score_medio_atencao">Score Médio / Atenção</option>
                            <option value="com_restricao">Com Restrição (Pendências / Protestos)</option>
                            <option value="score_baixo_restricao_grave">Score Baixo / Restrição Grave</option>
                            <option value="restricao_impeditiva">Restrição Impeditiva</option>
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>
                            Score Serasa (opcional)
                          </label>
                          <input
                            disabled={!isFinanceiro}
                            type="number"
                            min="0"
                            max="1000"
                            value={scoreSerasa}
                            onChange={(e) => setScoreSerasa(e.target.value)}
                            placeholder="Ex: 740"
                            style={{ width: '100%', padding: '0.58rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.84rem', boxSizing: 'border-box' }}
                          />
                        </div>
                      </div>

                      <div style={{ marginBottom: '0.85rem' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>
                          Detalhamento STATUS SERASA (Pendências, Dívidas Bancárias, Protestos e Valores)
                        </label>
                        <textarea
                          disabled={!isFinanceiro}
                          rows={3}
                          value={statusSerasaTexto}
                          onChange={(e) => setStatusSerasaTexto(e.target.value)}
                          placeholder="Ex: CLIENTE POSSUI 3 PENDÊNCIAS FINANCEIRAS (DÍVIDA COM BANCOS) NO VALOR TOTAL DE 45.502,83..."
                          style={{
                            width: '100%',
                            padding: '0.65rem',
                            borderRadius: '8px',
                            border: analiseCreditoStatus === 'NEGADO' ? '1.5px solid #fca5a5' : '1px solid #cbd5e1',
                            background: analiseCreditoStatus === 'NEGADO' ? '#fef2f2' : '#fff',
                            color: analiseCreditoStatus === 'NEGADO' ? '#991b1b' : '#0f172a',
                            fontSize: '0.82rem',
                            fontWeight: '600',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>

                      {(() => {
                        const mostrarGarantia =
                          analiseCreditoStatus === 'NEGADO' ||
                          !['sem_restricao', 'score_alto_sem_restricao'].includes(statusSerasaCodigo) ||
                          Boolean(String(condicaoEspecial || '').trim());
                        return (
                          <div style={{ display: 'grid', gridTemplateColumns: mostrarGarantia ? 'repeat(auto-fit, minmax(240px, 1fr))' : '1fr', gap: '0.85rem' }}>
                            {mostrarGarantia && (
                              <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#b45309', marginBottom: '0.3rem' }}>
                                  Condição Especial / Garantia (para aprovação com ressalva)
                                </label>
                                <input
                                  disabled={!isFinanceiro}
                                  type="text"
                                  value={condicaoEspecial}
                                  onChange={(e) => setCondicaoEspecial(e.target.value)}
                                  placeholder="Ex: Aprovado mediante entrada via Pix + Cartão de terceiro / Avalista"
                                  style={{ width: '100%', padding: '0.58rem', borderRadius: '8px', border: '1px solid #fcd34d', background: '#fffbeb', fontSize: '0.82rem', boxSizing: 'border-box' }}
                                />
                              </div>
                            )}
                            <div>
                              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>
                                Parecer Geral do Financeiro
                              </label>
                              <input
                                disabled={!isFinanceiro}
                                type="text"
                                value={parecerFinanceiro}
                                onChange={(e) => setParecerFinanceiro(e.target.value)}
                                placeholder="Observação interna para auditoria e comercial..."
                                style={{ width: '100%', padding: '0.58rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                              />
                            </div>
                          </div>
                        );
                      })()}

                      {!isFinanceiro && (
                        <div style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: '#1d4ed8', fontWeight: '700' }}>
                          Visualização apenas leitura: a conclusão financeira pertence ao perfil <strong>FINANCEIRO</strong> ou <strong>ADMIN</strong>.
                        </div>
                      )}
                    </>
                  )}
                </div>

                {modoDevolucao && (
                  <div style={{ background: '#fffbeb', border: '1.5px solid #f59e0b', borderRadius: '10px', padding: '0.9rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#92400e' }}>
                      Devolver Proposta para Ajuste na Mesa (Reabre a ficha para o entrevistador)
                    </div>
                    <input
                      type="text"
                      value={motivoDevolucao}
                      onChange={(e) => setMotivoDevolucao(e.target.value)}
                      placeholder="Ex: Divergência no valor do comprovante Pix / Corrigir CNPJ ou parcelas..."
                      style={{ width: '100%', padding: '0.58rem', borderRadius: '8px', border: '1px solid #fcd34d', background: '#fff', fontSize: '0.82rem', boxSizing: 'border-box' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() => setModoDevolucao(false)}
                        style={{ background: '#fff', border: '1px solid #cbd5e1', color: '#475569', padding: '0.45rem 0.85rem', borderRadius: '7px', fontWeight: '700', fontSize: '0.78rem', cursor: 'pointer' }}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={devolvendo}
                        onClick={submeterDevolucaoAjuste}
                        style={{ background: '#d97706', color: '#fff', border: 'none', padding: '0.45rem 0.95rem', borderRadius: '7px', fontWeight: '800', fontSize: '0.78rem', cursor: 'pointer' }}
                      >
                        {devolvendo ? 'Devolvendo...' : 'Confirmar Devolução para Mesa'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Banner de Erro Interno */}
                {erroModal && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '0.8rem 1rem', color: '#b91c1c', fontSize: '0.82rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '1.15rem', color: '#dc2626' }}>error</span>
                    <span>{erroModal}</span>
                  </div>
                )}
              </div>

              {/* Rodapé de Deliberação Compacto */}
              <div style={{ padding: '0.8rem 1.25rem', background: '#ffffff', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setPropSelecionada(null)}
                    style={{ background: '#fff', border: '1px solid #cbd5e1', color: '#475569', padding: '0.5rem 0.8rem', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '0.78rem' }}
                  >
                    Fechar
                  </button>
                  <a
                    href={`/proposals/${propSelecionada.id}/contract`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ background: '#0f172a', color: '#fff', border: 'none', padding: '0.5rem 0.78rem', borderRadius: '8px', fontWeight: '700', fontSize: '0.78rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }}>picture_as_pdf</span>
                    Termo PDF
                  </a>
                  {(isFinanceiro || isGestorComercial) && (
                    <button
                      type="button"
                      onClick={() => setModoDevolucao((v) => !v)}
                      style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fcd34d', padding: '0.5rem 0.78rem', borderRadius: '8px', fontWeight: '800', fontSize: '0.78rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }}>reply</span>
                      Devolver p/ Ajuste
                    </button>
                  )}
                </div>

                {!bloqueadoFinanceiroPorComercial && isFinanceiro && (
                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      disabled={salvandoAnalise}
                      onClick={() => submeterDeliberacaoFinanceira('recusado')}
                      style={{ background: '#fff', color: '#dc2626', border: '1.5px solid #fca5a5', padding: '0.5rem 0.85rem', borderRadius: '8px', fontWeight: '800', fontSize: '0.78rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.28rem' }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }}>close</span>
                      Recusar
                    </button>

                    <button
                      type="button"
                      disabled={salvandoAnalise}
                      onClick={() => submeterDeliberacaoFinanceira('aprovado_com_ressalva')}
                      style={{ background: '#d97706', color: '#fff', border: 'none', padding: '0.5rem 0.85rem', borderRadius: '8px', fontWeight: '800', fontSize: '0.78rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.28rem' }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }}>warning</span>
                      Aprovar c/ Ressalva
                    </button>

                    <button
                      type="button"
                      disabled={salvandoAnalise}
                      onClick={() => submeterDeliberacaoFinanceira('aprovado')}
                      style={{ background: '#059669', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: '800', fontSize: '0.78rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.28rem' }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }}>check_circle</span>
                      {salvandoAnalise ? 'Gravando...' : 'Aprovar Proposta'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL DE PREVIEW DO COMPROVANTE */}
      {comprovanteModal && (
        <div onClick={() => setComprovanteModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10005, padding: '1rem' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: '14px', maxWidth: '720px', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '0.95rem 1.25rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#059669' }}>{comprovanteModal.protocolo} • COMPROVANTE ANEXADO</span>
                <div style={{ fontWeight: '800', color: '#0f172a', fontSize: '0.98rem' }}>{comprovanteModal.empresa} ({comprovanteModal.nome})</div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <a
                  href={comprovanteModal.dataUrl}
                  download={comprovanteModal.nome || 'comprovante'}
                  style={{ background: '#0284c7', color: '#fff', padding: '0.45rem 0.85rem', borderRadius: '7px', fontSize: '0.78rem', fontWeight: '700', textDecoration: 'none' }}
                >
                  Baixar Arquivo
                </a>
                <button
                  type="button"
                  onClick={() => setComprovanteModal(null)}
                  style={{ background: '#f1f5f9', border: 'none', borderRadius: '7px', padding: '0.45rem 0.75rem', fontWeight: '800', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>
            </div>
            <div style={{ padding: '1rem', overflowY: 'auto', textAlign: 'center', background: '#f8fafc' }}>
              {String(comprovanteModal.tipo || '').includes('pdf') ? (
                <iframe src={comprovanteModal.dataUrl} title="Comprovante PDF" style={{ width: '100%', height: '65vh', border: 'none' }} />
              ) : (
                <img src={comprovanteModal.dataUrl} alt="Comprovante" style={{ maxWidth: '100%', maxHeight: '68vh', borderRadius: '8px', boxShadow: '0 4px 14px rgba(0,0,0,0.12)' }} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO */}
      {modalFeedback && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '1rem' }}>
          <div style={{ background: '#ffffff', borderRadius: '14px', maxWidth: '460px', width: '100%', overflow: 'hidden', boxShadow: '0 20px 45px rgba(15, 23, 42, 0.22)', border: '1px solid #e2e8f0' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: modalFeedback.tipo === 'recusado' ? '#fef2f2' : modalFeedback.tipo === 'ressalva' ? '#fffbeb' : '#ecfdf5',
                color: modalFeedback.tipo === 'recusado' ? '#dc2626' : modalFeedback.tipo === 'ressalva' ? '#d97706' : '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1.45rem' }}>
                  {modalFeedback.tipo === 'recusado' ? 'cancel' : modalFeedback.tipo === 'ressalva' ? 'warning' : 'check_circle'}
                </span>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#ff5722' }}>{modalFeedback.protocolo}</div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>{modalFeedback.titulo}</h3>
              </div>
            </div>

            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.84rem', color: '#334155' }}>
              <div><strong>Empresa:</strong> {modalFeedback.empresa}</div>
              <div><strong>Status:</strong> {modalFeedback.credito}</div>
              {modalFeedback.serasa && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.65rem 0.8rem', fontSize: '0.78rem', color: '#475569' }}>
                  <strong>Detalhamento:</strong> {modalFeedback.serasa}
                </div>
              )}
            </div>

            <div style={{ padding: '0.9rem 1.5rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setModalFeedback(null)}
                style={{ background: '#ff5722', color: '#fff', border: 'none', padding: '0.55rem 1.25rem', borderRadius: '8px', fontWeight: '700', fontSize: '0.82rem', cursor: 'pointer' }}
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
