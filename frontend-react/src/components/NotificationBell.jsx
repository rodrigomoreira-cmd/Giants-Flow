import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useTurma } from '../context/TurmaContext';

const obterSessao = () => {
  try {
    const raw = localStorage.getItem('sessao_operador');
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
};

export const formatarEventoAoVivo = (ev) => {
  const acao = String(ev.acao || '').toUpperCase();
  const temAlvo = Boolean(ev.empresa || ev.ficha_id);
  const emp = ev.empresa || (ev.ficha_id ? `Ficha #${ev.ficha_id}` : 'Operação em Lote');
  const det = String(ev.detalhes || '');

  if (acao === 'EMISSAO_PROPOSTA') {
    const aguardaGestor = det.includes('AGUARDA GESTOR COMERCIAL');
    return {
      titulo: aguardaGestor
        ? `Liberação Comercial Pendente: ${emp}`
        : `Proposta Emitida: ${emp}`,
      descricao: det || 'Proposta comercial registrada na mesa.',
      icone: aguardaGestor ? 'gavel' : 'description',
      cor: aguardaGestor ? '#d97706' : '#2563eb',
      fundo: aguardaGestor ? '#fffbeb' : '#eff6ff',
      badge: aguardaGestor ? 'Aguarda Gestor' : 'Fila Financeiro',
      rota: '/approvals',
      prioridadeAlta: true,
      somenteGestor: aguardaGestor
    };
  }

  if (acao === 'APROVACAO_ALCADA_COMERCIAL') {
    return {
      titulo: `Liberação Comercial Aprovada: ${emp}`,
      descricao: det || 'Gestor autorizou a condição e encaminhou ao Financeiro.',
      icone: 'verified',
      cor: '#059669',
      fundo: '#ecfdf5',
      badge: 'Aval Comercial OK',
      rota: '/approvals',
      prioridadeAlta: true,
      somenteGestor: false
    };
  }

  if (acao === 'RECUSA_ALCADA_COMERCIAL') {
    return {
      titulo: `Liberação Comercial Recusada: ${emp}`,
      descricao: det || 'Condição comercial recusada pelo gestor.',
      icone: 'cancel',
      cor: '#dc2626',
      fundo: '#fef2f2',
      badge: 'Recusa Comercial',
      rota: '/approvals',
      prioridadeAlta: true
    };
  }

  if (acao === 'APROVACAO_FINANCEIRA') {
    return {
      titulo: `Venda Aprovada (Financeiro): ${emp}`,
      descricao: det || 'Crédito e pagamento validados.',
      icone: 'check_circle',
      cor: '#16a34a',
      fundo: '#dcfce7',
      badge: 'Venda Aprovada',
      rota: '/approvals',
      prioridadeAlta: true
    };
  }

  if (acao === 'APROVACAO_RESSALVA_FINANCEIRA') {
    return {
      titulo: `Aprovada c/ Ressalva: ${emp}`,
      descricao: det || 'Financeiro aprovou com condição especial.',
      icone: 'warning',
      cor: '#d97706',
      fundo: '#fef3c7',
      badge: 'Com Ressalva',
      rota: '/approvals',
      prioridadeAlta: true
    };
  }

  if (acao === 'DEVOLUCAO_AJUSTE') {
    return {
      titulo: `Ajuste Solicitado: ${emp}`,
      descricao: det || 'Proposta devolvida para ajuste na mesa.',
      icone: 'reply',
      cor: '#d97706',
      fundo: '#fef3c7',
      badge: 'Ajuste na Mesa',
      rota: '/interviews',
      prioridadeAlta: true
    };
  }

  if (acao === 'RECUSA_FINANCEIRA') {
    return {
      titulo: `Recusada pelo Financeiro: ${emp}`,
      descricao: det || 'Proposta negada na análise financeira/Serasa.',
      icone: 'block',
      cor: '#dc2626',
      fundo: '#fef2f2',
      badge: 'Recusada Fin.',
      rota: '/approvals',
      prioridadeAlta: true
    };
  }

  if (acao === 'ALMOCO_PAGO') {
    return {
      titulo: `Almoço Pago Validado: ${emp}`,
      descricao: det || 'Check-in de almoço pago (R$ 1.000) confirmado.',
      icone: 'payments',
      cor: '#15803d',
      fundo: '#dcfce7',
      badge: 'Almoço Pago',
      rota: '/lunch',
      prioridadeAlta: false
    };
  }

  if (acao === 'CORTESIA_ALMOCO') {
    return {
      titulo: `Cortesia de Almoço: ${emp}`,
      descricao: det || 'Cortesia de almoço autorizada.',
      icone: 'redeem',
      cor: '#b45309',
      fundo: '#fef3c7',
      badge: 'Cortesia',
      rota: '/lunch',
      prioridadeAlta: false
    };
  }

  if (acao === 'ATENDIMENTO_SEM_ALMOCO') {
    return {
      titulo: `Atendimento Sem Almoço: ${emp}`,
      descricao: det || 'Liberado para atendimento direto na mesa.',
      icone: 'event_seat',
      cor: '#0369a1',
      fundo: '#e0f2fe',
      badge: 'Sem Almoço',
      rota: '/lunch',
      prioridadeAlta: false
    };
  }

  if (acao === 'CHECKIN_GIANTS') {
    return {
      titulo: `Check-in Membro GIANTS: ${emp}`,
      descricao: det || 'Presença GIANTS confirmada.',
      icone: 'workspace_premium',
      cor: '#7c3aed',
      fundo: '#f5f3ff',
      badge: 'GIANTS',
      rota: '/companies',
      prioridadeAlta: false
    };
  }

  if (acao === 'ALOCACAO_MESA') {
    return {
      titulo: `Alocação em Mesa: ${emp}`,
      descricao: det || 'Participante posicionado na mesa do salão.',
      icone: 'table_restaurant',
      cor: '#0284c7',
      fundo: '#e0f2fe',
      badge: 'Em Mesa',
      rota: '/lunch',
      prioridadeAlta: false
    };
  }

  if (acao === 'DECISAO_FUTURA') {
    return {
      titulo: `Decisão Futura (Follow-up): ${emp}`,
      descricao: det || 'Desfecho registrado para retomada posterior.',
      icone: 'schedule',
      cor: '#6d28d9',
      fundo: '#ede9fe',
      badge: 'Decisão Futura',
      rota: '/interviews',
      prioridadeAlta: false
    };
  }

  if (acao === 'NAO_FECHOU') {
    return {
      titulo: `Encerrado Sem Venda: ${emp}`,
      descricao: det || 'Atendimento concluído sem fechamento.',
      icone: 'do_not_disturb_on',
      cor: '#64748b',
      fundo: '#f1f5f9',
      badge: 'Não Fechou',
      rota: '/interviews',
      prioridadeAlta: false
    };
  }

  if (acao === 'REABERTURA_FICHA' || acao === 'REABERTURA_FICHA_ADMIN') {
    const isAdminReab = acao === 'REABERTURA_FICHA_ADMIN';
    return {
      titulo: `${isAdminReab ? 'Reabertura Administrativa' : 'Ficha Reaberta'}: ${emp}`,
      descricao: det || 'Ficha reaberta para novo atendimento.',
      icone: 'lock_open',
      cor: isAdminReab ? '#dc2626' : '#ea580c',
      fundo: isAdminReab ? '#fef2f2' : '#fff7ed',
      badge: isAdminReab ? 'Reabertura Admin' : 'Reaberta',
      rota: ev.ficha_id ? `/interviews/${ev.ficha_id}/edit` : '/interviews',
      prioridadeAlta: false
    };
  }

  if (acao === 'LIBERACAO_MESAS_GIANTS') {
    return {
      titulo: ev.empresa ? `Liberação Mesas GIANTS: ${ev.empresa}` : 'Liberação em Lote: Mesas GIANTS',
      descricao: det || 'Assentos liberados para entrevistas comerciais.',
      icone: 'logout',
      cor: '#d97706',
      fundo: '#fef3c7',
      badge: 'Pós-Almoço',
      rota: '/lunch',
      prioridadeAlta: false
    };
  }

  if (acao === 'EDICAO_CASHBACK') {
    return {
      titulo: `Cashback Atualizado: ${emp}`,
      descricao: det || 'Saldo de cashback ajustado para a empresa.',
      icone: 'savings',
      cor: '#0369a1',
      fundo: '#e0f2fe',
      badge: 'Cashback',
      rota: '/cashback',
      prioridadeAlta: false
    };
  }

  const acaoFormatada = acao
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());

  return {
    titulo: temAlvo ? `${acaoFormatada}: ${emp}` : acaoFormatada,
    descricao: det || `Registrado por ${ev.usuario_nome || 'Operador'}`,
    icone: 'notifications',
    cor: '#475569',
    fundo: '#f1f5f9',
    badge: 'Movimentação',
    rota: '/war-room',
    prioridadeAlta: false
  };
};

export const tempoRelativo = (iso) => {
  if (!iso) return '';
  const diffSeg = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSeg < 60) return 'agora mesmo';
  const min = Math.floor(diffSeg / 60);
  if (min < 60) return `há ${min} min`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `há ${hrs}h`;
  return new Date(iso).toLocaleDateString('pt-BR');
};

const tocarBeepSuave = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.26);
  } catch (_) {}
};

export default function NotificationBell() {
  const navigate = useNavigate();
  const { turmaSelecionada } = useTurma();
  const sessao = obterSessao();
  const usuarioId = sessao?.usuario?.id || 'anon';
  const papel = String(sessao?.usuario?.papel || sessao?.papel || 'ADMIN').toUpperCase();

  const storageKeyLimpoAte = `notif_limpo_ate_${usuarioId}_${turmaSelecionada || '0'}`;
  const storageKeyDispensados = `notif_dispensados_${usuarioId}_${turmaSelecionada || '0'}`;
  const storageKeySom = `notif_som_ativo_${usuarioId}`;

  const [aberto, setAberto] = useState(false);
  const [verHistorico, setVerHistorico] = useState(false);
  const [eventos, setEventos] = useState([]);
  const [resumo, setResumo] = useState({ pendentes_comercial: 0, pendentes_financeiro: 0 });
  const [limpoAteId, setLimpoAteId] = useState(() => Number(localStorage.getItem(storageKeyLimpoAte) || 0));
  const [idsDispensados, setIdsDispensados] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKeyDispensados);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.map(Number) : [];
    } catch (_) {
      return [];
    }
  });
  const [somAtivo, setSomAtivo] = useState(() => localStorage.getItem(storageKeySom) !== 'false');
  const [toastAtivo, setToastAtivo] = useState(null);

  const maiorIdConhecidoRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    setLimpoAteId(Number(localStorage.getItem(storageKeyLimpoAte) || 0));
    try {
      const raw = localStorage.getItem(storageKeyDispensados);
      const arr = raw ? JSON.parse(raw) : [];
      setIdsDispensados(Array.isArray(arr) ? arr.map(Number) : []);
    } catch (_) {
      setIdsDispensados([]);
    }
    setVerHistorico(false);
    maiorIdConhecidoRef.current = null;
  }, [storageKeyLimpoAte, storageKeyDispensados]);

  const buscarNotificacoes = useCallback(async () => {
    if (!turmaSelecionada) return;
    try {
      const res = await api.get(`/notificacoes?turmaId=${turmaSelecionada}`);
      const lista = Array.isArray(res?.eventos) ? res.eventos : [];
      setEventos(lista);
      if (res?.resumo) setResumo(res.resumo);

      if (lista.length > 0) {
        const maiorAtual = lista.reduce((acc, e) => Math.max(acc, Number(e.id || 0)), 0);
        if (maiorIdConhecidoRef.current === null) {
          maiorIdConhecidoRef.current = maiorAtual;
        } else if (maiorAtual > maiorIdConhecidoRef.current) {
          const novos = lista.filter((e) => Number(e.id) > maiorIdConhecidoRef.current);
          maiorIdConhecidoRef.current = maiorAtual;

          const maisRecente = novos[0];
          if (maisRecente) {
            const info = formatarEventoAoVivo(maisRecente);
            if (['APROVADOR', 'ADMIN'].includes(papel) || (!info.somenteGestor && (papel === 'FINANCEIRO' || info.prioridadeAlta))) {
              setToastAtivo({ id: maisRecente.id, ...info, autor: maisRecente.usuario_nome });
              if (somAtivo && info.prioridadeAlta) tocarBeepSuave();
            }
          }
        }
      }
    } catch (_) {}
  }, [turmaSelecionada, papel, somAtivo]);

  useEffect(() => {
    buscarNotificacoes();
    const timer = setInterval(buscarNotificacoes, 6000);
    return () => clearInterval(timer);
  }, [buscarNotificacoes]);

  useEffect(() => {
    if (!toastAtivo) return;
    const t = setTimeout(() => setToastAtivo(null), 8500);
    return () => clearTimeout(t);
  }, [toastAtivo]);

  useEffect(() => {
    const aoClicarFora = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setAberto(false);
      }
    };
    document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, []);

  const setDispensados = new Set(idsDispensados);
  const eventosNaoLidos = eventos.filter(
    (e) => Number(e.id || 0) > limpoAteId && !setDispensados.has(Number(e.id || 0))
  );
  const naoLidas = eventosNaoLidos.length;
  const listaExibida = verHistorico ? eventos : eventosNaoLidos;

  const dispensarNotificacao = (idEv) => {
    const numId = Number(idEv || 0);
    if (!numId) return;
    setIdsDispensados((prev) => {
      if (prev.includes(numId)) return prev;
      const prox = [...prev, numId].slice(-300);
      localStorage.setItem(storageKeyDispensados, JSON.stringify(prox));
      return prox;
    });
  };

  const marcarTodasComoLidas = () => {
    const maxId = eventos.reduce((acc, e) => Math.max(acc, Number(e.id || 0)), limpoAteId);
    setLimpoAteId(maxId);
    localStorage.setItem(storageKeyLimpoAte, String(maxId));
    setIdsDispensados([]);
    localStorage.removeItem(storageKeyDispensados);
    setVerHistorico(false);
  };

  const alternarSom = () => {
    const novo = !somAtivo;
    setSomAtivo(novo);
    localStorage.setItem(storageKeySom, String(novo));
    if (novo) tocarBeepSuave();
  };

  return (
    <>
      <div ref={dropdownRef} style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setAberto((prev) => !prev)}
          title="Notificações & Movimentações Ao Vivo da Turma"
          style={{
            position: 'relative',
            background: aberto ? '#fff7ed' : '#f8fafc',
            border: aberto ? '1.5px solid #ff5722' : '1px solid #cbd5e1',
            color: aberto ? '#ff5722' : '#334155',
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer'
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '1.25rem' }}>
            {naoLidas > 0 ? 'notifications_active' : 'notifications'}
          </span>
          {naoLidas > 0 && (
            <span
              style={{
                position: 'absolute',
                top: '-5px',
                right: '-5px',
                background: '#ef4444',
                color: '#ffffff',
                fontSize: '0.66rem',
                fontWeight: '900',
                minWidth: '18px',
                height: '18px',
                padding: '0 4px',
                borderRadius: '999px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid #ffffff'
              }}
            >
              {naoLidas > 9 ? '9+' : naoLidas}
            </span>
          )}
        </button>

        {aberto && (
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: '46px',
              width: '420px',
              maxWidth: '92vw',
              background: '#ffffff',
              borderRadius: '14px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 18px 40px rgba(15, 23, 42, 0.18)',
              zIndex: 9999,
              overflow: 'hidden'
            }}
          >
            <div style={{ padding: '0.95rem 1.1rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.55rem', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.88rem', fontWeight: '800', color: '#0f172a' }}>
                  Atividade Ao Vivo da Turma
                </span>
                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={alternarSom}
                    title={somAtivo ? 'Silenciar alertas sonoros' : 'Ativar alertas sonoros'}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      padding: '0.2rem 0.42rem',
                      cursor: 'pointer',
                      color: somAtivo ? '#059669' : '#94a3b8',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }}>
                      {somAtivo ? 'volume_up' : 'volume_off'}
                    </span>
                  </button>
                  {eventos.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setVerHistorico((v) => !v)}
                      style={{
                        background: verHistorico ? '#e2e8f0' : '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        padding: '0.2rem 0.5rem',
                        fontSize: '0.69rem',
                        fontWeight: '700',
                        color: '#334155',
                        cursor: 'pointer'
                      }}
                    >
                      {verHistorico ? 'Só não lidas' : `Histórico (${eventos.length})`}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={naoLidas === 0}
                    onClick={marcarTodasComoLidas}
                    style={{
                      background: naoLidas > 0 ? '#ff5722' : '#ffffff',
                      border: naoLidas > 0 ? '1px solid #ff5722' : '1px solid #cbd5e1',
                      borderRadius: '6px',
                      padding: '0.2rem 0.55rem',
                      fontSize: '0.7rem',
                      fontWeight: '700',
                      color: naoLidas > 0 ? '#ffffff' : '#94a3b8',
                      cursor: naoLidas > 0 ? 'pointer' : 'default'
                    }}
                  >
                    Marcar lidas
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: papel === 'FINANCEIRO' ? '1fr' : '1fr 1fr', gap: '0.5rem' }}>
                {papel !== 'FINANCEIRO' && (
                  <button
                    type="button"
                    onClick={() => { setAberto(false); navigate('/approvals'); }}
                    style={{
                      background: Number(resumo.pendentes_comercial) > 0 ? '#fef3c7' : '#ffffff',
                      border: '1px solid #fde68a',
                      borderRadius: '8px',
                      padding: '0.45rem 0.6rem',
                      textAlign: 'left',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ fontSize: '0.66rem', fontWeight: '800', color: '#92400e', textTransform: 'uppercase' }}>
                      1. Gestor Comercial
                    </div>
                    <div style={{ fontSize: '0.86rem', fontWeight: '900', color: '#78350f' }}>
                      {resumo.pendentes_comercial || 0} pendente(s)
                    </div>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => { setAberto(false); navigate('/approvals'); }}
                  style={{
                    background: Number(resumo.pendentes_financeiro) > 0 ? '#eff6ff' : '#ffffff',
                    border: '1px solid #bfdbfe',
                    borderRadius: '8px',
                    padding: '0.45rem 0.6rem',
                    textAlign: 'left',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ fontSize: '0.66rem', fontWeight: '800', color: '#1e40af', textTransform: 'uppercase' }}>
                    {papel === 'FINANCEIRO' ? 'Fila Financeiro' : '2. Fila Financeiro'}
                  </div>
                  <div style={{ fontSize: '0.86rem', fontWeight: '900', color: '#1e3a8a' }}>
                    {resumo.pendentes_financeiro || 0} pendente(s)
                  </div>
                </button>
              </div>
            </div>

            <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
              {listaExibida.length === 0 ? (
                <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#64748b', fontSize: '0.82rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' }}>
                  <span>
                    {eventos.length === 0
                      ? 'Nenhuma movimentação registrada nesta turma ainda.'
                      : 'Tudo em dia! Nenhuma notificação não lida.'}
                  </span>
                  {eventos.length > 0 && !verHistorico && (
                    <button
                      type="button"
                      onClick={() => setVerHistorico(true)}
                      style={{
                        background: '#f1f5f9',
                        border: '1px solid #cbd5e1',
                        borderRadius: '7px',
                        padding: '0.35rem 0.75rem',
                        fontSize: '0.74rem',
                        fontWeight: '700',
                        color: '#334155',
                        cursor: 'pointer'
                      }}
                    >
                      Ver histórico recente ({eventos.length})
                    </button>
                  )}
                </div>
              ) : (
                listaExibida.map((ev) => {
                  const info = formatarEventoAoVivo(ev);
                  const jaLida = Number(ev.id || 0) <= limpoAteId || setDispensados.has(Number(ev.id || 0));
                  return (
                    <div
                      key={ev.id}
                      onClick={() => {
                        dispensarNotificacao(ev.id);
                        setAberto(false);
                        navigate(papel === 'FINANCEIRO' && (info.rota === '/lunch' || info.rota.startsWith('/interviews')) ? '/companies' : info.rota);
                      }}
                      style={{
                        padding: '0.75rem 1.1rem',
                        borderBottom: '1px solid #f1f5f9',
                        display: 'flex',
                        gap: '0.7rem',
                        cursor: 'pointer',
                        background: jaLida ? '#ffffff' : '#fffaf5',
                        opacity: jaLida ? 0.78 : 1
                      }}
                    >
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          minWidth: '32px',
                          borderRadius: '8px',
                          background: info.fundo,
                          color: info.cor,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginTop: '2px'
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>
                          {info.icone}
                        </span>
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.4rem' }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: '800', color: '#0f172a', lineHeight: 1.3 }}>
                            {info.titulo}
                          </div>
                          {!jaLida && (
                            <span
                              title="Não lida"
                              style={{
                                width: '8px',
                                height: '8px',
                                minWidth: '8px',
                                borderRadius: '999px',
                                background: '#ff5722',
                                marginTop: '4px'
                              }}
                            />
                          )}
                        </div>
                        <div style={{ fontSize: '0.73rem', color: '#475569', marginTop: '0.18rem', lineHeight: 1.35 }}>
                          {info.descricao}
                        </div>
                        <div style={{ fontSize: '0.67rem', color: '#94a3b8', marginTop: '0.25rem', fontWeight: '600' }}>
                          {ev.usuario_nome ? `${ev.usuario_nome} • ` : ''}{tempoRelativo(ev.created_at)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {toastAtivo && (
        <div
          style={{
            position: 'fixed',
            top: '68px',
            right: '24px',
            width: '360px',
            maxWidth: '90vw',
            background: '#0f172a',
            color: '#ffffff',
            borderRadius: '12px',
            padding: '0.95rem 1.1rem',
            boxShadow: '0 18px 40px rgba(15, 23, 42, 0.35)',
            borderLeft: `4px solid ${toastAtivo.cor}`,
            zIndex: 10001,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <span className="material-symbols-outlined" style={{ color: toastAtivo.cor, fontSize: '1.2rem' }}>
                {toastAtivo.icone}
              </span>
              <span style={{ fontSize: '0.82rem', fontWeight: '800' }}>{toastAtivo.titulo}</span>
            </div>
            <button
              type="button"
              onClick={() => setToastAtivo(null)}
              style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>close</span>
            </button>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#cbd5e1', lineHeight: 1.35 }}>
            {toastAtivo.descricao}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.2rem' }}>
            <button
              type="button"
              onClick={() => {
                dispensarNotificacao(toastAtivo.id);
                const rawRota = toastAtivo.rota || '/approvals';
                const rota = papel === 'FINANCEIRO' && (rawRota === '/lunch' || rawRota.startsWith('/interviews')) ? '/companies' : rawRota;
                setToastAtivo(null);
                navigate(rota);
              }}
              style={{
                background: '#ff5722',
                color: '#ffffff',
                border: 'none',
                padding: '0.35rem 0.75rem',
                borderRadius: '6px',
                fontSize: '0.74rem',
                fontWeight: '800',
                cursor: 'pointer'
              }}
            >
              Acompanhar →
            </button>
          </div>
        </div>
      )}
    </>
  );
}
