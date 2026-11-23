import { useState, useEffect, useCallback, useRef } from 'react';

const tocarSomNovaVenda = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notas = [523.25, 659.25, 783.99, 1046.5];
    notas.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.11);
      gain.gain.setValueAtTime(0.14, ctx.currentTime + idx * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.11 + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.11);
      osc.stop(ctx.currentTime + idx * 0.11 + 0.46);
    });
  } catch (_) {}
};
import { api } from '../services/api';
import { useTurma } from '../context/TurmaContext';
import { alertaSistema, confirmarSistema } from '../context/ModalContext';

const fmtBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function NumeroAnimado({ valor, formatador = fmtBRL, duracao = 550 }) {
  const alvo = Number(valor || 0);
  const [exibido, setExibido] = useState(alvo);
  const anteriorRef = useRef(alvo);

  useEffect(() => {
    const inicio = anteriorRef.current;
    if (inicio === alvo) {
      setExibido(alvo);
      return;
    }
    let frameId;
    const t0 = performance.now();
    const animar = (agora) => {
      const progresso = Math.min(1, (agora - t0) / duracao);
      const easeOut = 1 - Math.pow(1 - progresso, 3);
      setExibido(inicio + (alvo - inicio) * easeOut);
      if (progresso < 1) {
        frameId = requestAnimationFrame(animar);
      } else {
        anteriorRef.current = alvo;
        setExibido(alvo);
      }
    };
    frameId = requestAnimationFrame(animar);
    return () => cancelAnimationFrame(frameId);
  }, [alvo, duracao]);

  return <>{formatador(exibido)}</>;
}
const fmtNum = (v) => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const fmtPct = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';

const BADGE_ACAO = {
  CORTESIA_ALMOCO: { label: 'Cortesia Almoço', bg: '#fef3c7', color: '#92400e' },
  EDICAO_CASHBACK: { label: 'Edição Cashback', bg: '#e0f2fe', color: '#0369a1' },
  REABERTURA_FICHA_ADMIN: { label: 'Reabertura Admin', bg: '#fee2e2', color: '#b91c1c' },
  EMISSAO_PROPOSTA: { label: 'Fechamento / Proposta', bg: '#dcfce7', color: '#166534' },
  EXPORTACAO_CSV_FINANCEIRO: { label: 'Exportação CSV', bg: '#f1f5f9', color: '#334155' }
};

export default function WarRoom() {
  const { turmaSelecionada, turmaAtual, mudarTurma } = useTurma();
  const [turmaId, setTurmaId] = useState(() => turmaSelecionada || localStorage.getItem('turma_ativa_id') || '1491');

  useEffect(() => {
    if (turmaSelecionada && String(turmaSelecionada) !== String(turmaId)) {
      setTurmaId(String(turmaSelecionada));
      setTituloPanoramaCustom('');
      setDataPanoramaCustom('');
    }
  }, [turmaSelecionada]);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [exportandoCsv, setExportandoCsv] = useState(false);

  const [modalPanoramaPdf, setModalPanoramaPdf] = useState(false);
  const [tituloPanoramaCustom, setTituloPanoramaCustom] = useState('');
  const [dataPanoramaCustom, setDataPanoramaCustom] = useState('');

  // Estados do Modo TV (Telão)
  const [modoTv, setModoTv] = useState(() => new URLSearchParams(window.location.search).get('tv') === '1');
  const [slideTv, setSlideTv] = useState(0); // 0 = Placar Executivo & Produtos | 1 = Últimos Fechamentos & Linhas
  const [rotacaoTvAtiva, setRotacaoTvAtiva] = useState(true);
  const [somTvAtivo, setSomTvAtivo] = useState(true);
  const [horaAtualTv, setHoraAtualTv] = useState(() => new Date());
  const [novaVendaDestaque, setNovaVendaDestaque] = useState(null);
  const idsFechamentosConhecidosRef = useRef(null);

  const sairModoTv = useCallback(() => {
    setModoTv(false);
    window.dispatchEvent(new CustomEvent('warroom-tv-mode', { detail: false }));
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  const toggleModoTv = () => {
    const proximo = !modoTv;
    setModoTv(proximo);
    window.dispatchEvent(new CustomEvent('warroom-tv-mode', { detail: proximo }));

    if (proximo) {
      setAutoRefresh(true);
      setSlideTv(0);
      document.documentElement.requestFullscreen().catch(() => {});
    } else if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  };

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('warroom-tv-mode', { detail: modoTv }));
    return () => {
      window.dispatchEvent(new CustomEvent('warroom-tv-mode', { detail: false }));
    };
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && modoTv) {
        setModoTv(false);
        window.dispatchEvent(new CustomEvent('warroom-tv-mode', { detail: false }));
      }
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && modoTv) {
        sairModoTv();
      } else if (modoTv && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        setSlideTv((s) => (s === 0 ? 1 : 0));
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [modoTv, sairModoTv]);

  // Relógio ao vivo no Modo TV
  useEffect(() => {
    if (!modoTv) return;
    const t = setInterval(() => setHoraAtualTv(new Date()), 1000);
    return () => clearInterval(t);
  }, [modoTv]);

  // Rotação automática entre visões do telão a cada 20s
  useEffect(() => {
    if (!modoTv || !rotacaoTvAtiva) return;
    const rot = setInterval(() => {
      setSlideTv((prev) => (prev === 0 ? 1 : 0));
    }, 20000);
    return () => clearInterval(rot);
  }, [modoTv, rotacaoTvAtiva]);

  const carregarResumo = useCallback(async (silencioso = false) => {
    try {
      if (!silencioso) setCarregando(true);
      setErro('');
      const resp = await api.get(`/war-room/resumo?turmaId=${turmaId}`);
      const listaFech = Array.isArray(resp?.ultimosFechamentos) ? resp.ultimosFechamentos : [];
      const idsAtuais = new Set(listaFech.map((f) => String(f.id)));

      if (idsFechamentosConhecidosRef.current !== null && listaFech.length > 0) {
        const recemChegado = listaFech.find((f) => !idsFechamentosConhecidosRef.current.has(String(f.id)));
        if (recemChegado) {
          setNovaVendaDestaque(recemChegado);
          if (modoTv && somTvAtivo) {
            tocarSomNovaVenda();
          }
          setTimeout(() => {
            setNovaVendaDestaque((atual) => (atual?.id === recemChegado.id ? null : atual));
          }, 11000);
        }
      }
      idsFechamentosConhecidosRef.current = idsAtuais;
      setDados(resp);
    } catch (err) {
      setErro(err.message || 'Não foi possível carregar os indicadores do War Room.');
    } finally {
      if (!silencioso) setCarregando(false);
    }
  }, [turmaId]);

  useEffect(() => {
    carregarResumo(false);
  }, [carregarResumo]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      carregarResumo(true);
    }, 12000);
    return () => clearInterval(interval);
  }, [autoRefresh, carregarResumo]);

  const abrirPanoramaPdf = () => {
    const pan = dados?.panoramaExecutivo || {};
    const nomeSalvo = turmaAtual?.nome || localStorage.getItem('turma_ativa_nome') || '';
    if (!tituloPanoramaCustom) {
      setTituloPanoramaCustom(nomeSalvo || pan.tituloEvento || 'Casais Empreendedores');
    }
    if (!dataPanoramaCustom) {
      setDataPanoramaCustom(pan.dataEvento || new Date().toLocaleDateString('pt-BR').replace(/\//g, '.'));
    }
    setModalPanoramaPdf(true);
  };

  const baixarPlanilhaCsv = async () => {
    try {
      setExportandoCsv(true);
      const token =
        localStorage.getItem('token') ||
        localStorage.getItem('auth_token') ||
        (() => {
          try {
            const s = JSON.parse(localStorage.getItem('sessao_operador') || 'null');
            return s?.token || '';
          } catch (_) {
            return '';
          }
        })();

      const baseUrl = import.meta.env.VITE_API_URL || '/api';
      const response = await fetch(`${baseUrl}/financeiro/exportar-csv?turmaId=${turmaId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (!response.ok) {
        throw new Error('Falha ao gerar arquivo CSV no servidor.');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `fechamento-financeiro-turma-${turmaId}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      carregarResumo(true);
    } catch (err) {
      alertaSistema(err.message || 'Erro ao exportar planilha.');
    } finally {
      setExportandoCsv(false);
    }
  };

  const baseTurma = dados?.baseTurma || {};
  const giants = dados?.giants || {};
  const pac = dados?.pac || {};
  const kpis = dados?.kpis || {};
  const statusFin = dados?.statusFinanceiro || {};

  const ticketMedio = Number(kpis.contratosFechados || 0) > 0
    ? Number(kpis.competencia || 0) / Number(kpis.contratosFechados || 1)
    : 0;

  if (modoTv) {
    const ultimosTv = (dados?.ultimosFechamentos || []).slice(0, 6);
    const linhasTv = dados?.porLinha || [];

    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100vh',
          background: 'radial-gradient(circle at 20% 12%, #172033 0%, #0b1120 48%, #060911 100%)',
          color: '#f8fafc',
          zIndex: 99999,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '1.5rem 2.25rem',
          boxSizing: 'border-box',
          overflow: 'hidden',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
        }}
      >
        <style>{`
          @keyframes tvPulseLive {
            0% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.45; transform: scale(1.25); }
            100% { opacity: 1; transform: scale(1); }
          }
          @keyframes tvSlideBanner {
            0% { transform: translateY(-20px); opacity: 0; }
            100% { transform: translateY(0); opacity: 1; }
          }
        `}</style>

        {/* TOPO DO TELÃO */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', borderBottom: '1px solid rgba(148, 163, 184, 0.16)', paddingBottom: '0.95rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#ff5722', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(255, 87, 34, 0.4)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.6rem', color: '#fff' }}>rocket_launch</span>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: '900', color: '#fb923c', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                  GIANTS Flow • War Room
                </span>
                <span style={{ background: 'rgba(255,255,255,0.08)', color: '#cbd5e1', padding: '0.15rem 0.55rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700' }}>
                  {turmaAtual?.codigo ? `[${turmaAtual.codigo}] ` : ''}{turmaAtual?.nome || `Turma #${turmaId}`}
                </span>
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: '900', color: '#ffffff', marginTop: '0.12rem' }}>
                {slideTv === 0 ? 'Placar Executivo & Fechamento ao Vivo' : 'Desempenho por Produto & Últimos Contratos'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {/* Seletor de Visão / Rotação */}
            <div style={{ display: 'flex', background: 'rgba(15, 23, 42, 0.85)', border: '1px solid #334155', borderRadius: '10px', padding: '0.22rem' }}>
              <button
                type="button"
                onClick={() => setSlideTv(0)}
                style={{
                  background: slideTv === 0 ? '#ff5722' : 'transparent',
                  color: slideTv === 0 ? '#fff' : '#94a3b8',
                  border: 'none',
                  borderRadius: '7px',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.76rem',
                  fontWeight: '800',
                  cursor: 'pointer'
                }}
              >
                1. Placar Geral
              </button>
              <button
                type="button"
                onClick={() => setSlideTv(1)}
                style={{
                  background: slideTv === 1 ? '#ff5722' : 'transparent',
                  color: slideTv === 1 ? '#fff' : '#94a3b8',
                  border: 'none',
                  borderRadius: '7px',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.76rem',
                  fontWeight: '800',
                  cursor: 'pointer'
                }}
              >
                2. Fechamentos
              </button>
              <button
                type="button"
                onClick={() => setRotacaoTvAtiva((r) => !r)}
                title={rotacaoTvAtiva ? 'Pausar rotação automática (20s)' : 'Ativar rotação automática (20s)'}
                style={{
                  background: 'transparent',
                  color: rotacaoTvAtiva ? '#38bdf8' : '#64748b',
                  border: 'none',
                  padding: '0.35rem 0.55rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '1.05rem' }}>
                  {rotacaoTvAtiva ? 'autorenew' : 'pause_circle'}
                </span>
              </button>
            </div>

            {/* Botão Som */}
            <button
              type="button"
              onClick={() => {
                const proximo = !somTvAtivo;
                setSomTvAtivo(proximo);
                if (proximo) tocarSomNovaVenda();
              }}
              title={somTvAtivo ? 'Alerta sonoro de venda ativado' : 'Alerta sonoro silenciado'}
              style={{
                background: 'rgba(15, 23, 42, 0.85)',
                border: '1px solid #334155',
                color: somTvAtivo ? '#fb923c' : '#64748b',
                padding: '0.45rem 0.65rem',
                borderRadius: '10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1.15rem' }}>
                {somTvAtivo ? 'volume_up' : 'volume_off'}
              </span>
            </button>

            {/* Indicador AO VIVO + Relógio */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: 'rgba(22, 163, 74, 0.14)', border: '1px solid rgba(74, 222, 128, 0.35)', padding: '0.42rem 0.85rem', borderRadius: '10px' }}>
              <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 10px #22c55e', animation: 'tvPulseLive 1.8s infinite' }} />
              <span style={{ fontSize: '0.76rem', fontWeight: '900', color: '#4ade80', letterSpacing: '0.08em' }}>AO VIVO</span>
              <span style={{ color: '#334155' }}>|</span>
              <span style={{ fontSize: '0.95rem', fontWeight: '900', color: '#f8fafc', fontVariantNumeric: 'tabular-nums' }}>
                {horaAtualTv.toLocaleTimeString('pt-BR')}
              </span>
            </div>

            {/* Sair */}
            <button
              type="button"
              onClick={sairModoTv}
              title="Sair do Modo TV (ESC)"
              style={{
                background: 'rgba(30, 41, 59, 0.9)',
                border: '1px solid #475569',
                color: '#e2e8f0',
                padding: '0.45rem 0.8rem',
                borderRadius: '10px',
                fontSize: '0.76rem',
                fontWeight: '800',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem'
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1.05rem' }}>close_fullscreen</span>
              Sair
            </button>
          </div>
        </div>

        {/* ALERTA CELEBRATIVO DE NOVA VENDA */}
        {novaVendaDestaque && (
          <div
            style={{
              background: 'linear-gradient(90deg, #ea580c 0%, #ff5722 50%, #16a34a 100%)',
              borderRadius: '14px',
              padding: '0.85rem 1.5rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              boxShadow: '0 12px 35px rgba(255, 87, 34, 0.45)',
              animation: 'tvSlideBanner 0.4s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '2rem', color: '#fff' }}>celebration</span>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: '900', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#fef3c7' }}>
                  NOVO CONTRATO FECHADO NA TURMA!
                </div>
                <div style={{ fontSize: '1.35rem', fontWeight: '900', color: '#ffffff' }}>
                  {novaVendaDestaque.empresa} • {novaVendaDestaque.produto}
                </div>
              </div>
            </div>
            <div style={{ fontSize: '1.85rem', fontWeight: '900', color: '#ffffff' }}>
              {fmtBRL(novaVendaDestaque.valorLiquido)}
            </div>
          </div>
        )}

        {/* CORPO PRINCIPAL DO TELÃO */}
        {slideTv === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', gap: '1.15rem', padding: '0.5rem 0' }}>
            {/* HERO: COMPETÊNCIA & CAIXA */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: '1.35rem' }}>
              <div style={{ background: 'linear-gradient(135deg, rgba(255,87,34,0.18) 0%, rgba(15,23,42,0.92) 65%)', border: '1.5px solid rgba(255, 87, 34, 0.55)', borderRadius: '20px', padding: '1.65rem 2rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontSize: '0.92rem', fontWeight: '800', color: '#fb923c', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                  Competência Total (Líquido)
                </div>
                <div style={{ fontSize: '4.1rem', fontWeight: '900', color: '#ffffff', lineHeight: 1.05, marginTop: '0.35rem', letterSpacing: '-0.02em' }}>
                  <NumeroAnimado valor={kpis.competencia} />
                </div>
                <div style={{ fontSize: '1.05rem', color: '#cbd5e1', marginTop: '0.55rem', fontWeight: '600' }}>
                  Faturamento Bruto: <strong style={{ color: '#fff' }}>{fmtBRL(kpis.faturamentoBruto)}</strong> • Ticket Médio: <strong style={{ color: '#fb923c' }}>{fmtBRL(ticketMedio)}</strong>
                </div>
              </div>

              <div style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.18) 0%, rgba(15,23,42,0.92) 65%)', border: '1.5px solid rgba(52, 211, 153, 0.5)', borderRadius: '20px', padding: '1.65rem 2rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontSize: '0.92rem', fontWeight: '800', color: '#4ade80', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                  Caixa Total no Evento
                </div>
                <div style={{ fontSize: '3.8rem', fontWeight: '900', color: '#4ade80', lineHeight: 1.05, marginTop: '0.35rem', letterSpacing: '-0.02em' }}>
                  <NumeroAnimado valor={kpis.caixa} />
                </div>
                <div style={{ fontSize: '1.05rem', color: '#cbd5e1', marginTop: '0.55rem', fontWeight: '600' }}>
                  Entradas: <strong style={{ color: '#fff' }}>{fmtBRL(kpis.entradasImediatas)}</strong> + Almoço: <strong style={{ color: '#4ade80' }}>{fmtBRL(kpis.almocoArrecadado)}</strong>
                </div>
              </div>
            </div>

            {/* 4 KPIs CENTRAIS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.15rem' }}>
              <div style={{ background: 'rgba(15, 23, 42, 0.85)', border: '1px solid #334155', borderRadius: '16px', padding: '1.25rem 1.4rem' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Contratos Fechados</div>
                <div style={{ fontSize: '2.7rem', fontWeight: '900', color: '#ffffff', marginTop: '0.25rem' }}>{kpis.contratosFechados || 0}</div>
                <div style={{ fontSize: '0.82rem', color: '#4ade80', fontWeight: '700' }}>{statusFin.aprovadas || 0} aprovados • {statusFin.pendentes || 0} em análise</div>
              </div>

              <div style={{ background: 'rgba(15, 23, 42, 0.85)', border: '1px solid #334155', borderRadius: '16px', padding: '1.25rem 1.4rem' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Empresas (CNPJ)</div>
                <div style={{ fontSize: '2.7rem', fontWeight: '900', color: '#38bdf8', marginTop: '0.25rem' }}>{fmtNum(baseTurma.totalEmpresasCnpj)}</div>
                <div style={{ fontSize: '0.82rem', color: '#cbd5e1', fontWeight: '600' }}>{fmtNum(baseTurma.totalAlunos)} participantes na turma</div>
              </div>

              <div style={{ background: 'rgba(15, 23, 42, 0.85)', border: '1px solid #334155', borderRadius: '16px', padding: '1.25rem 1.4rem' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Fichas Almoço</div>
                <div style={{ fontSize: '2.7rem', fontWeight: '900', color: '#fb923c', marginTop: '0.25rem' }}>{fmtNum(baseTurma.fichasPreenchidas)}</div>
                <div style={{ fontSize: '0.82rem', color: '#cbd5e1', fontWeight: '600' }}>{kpis.qtdAlmocoPago || 0} pagas • {kpis.qtdCortesias || 0} cortesias</div>
              </div>

              <div style={{ background: 'rgba(15, 23, 42, 0.85)', border: '1px solid #334155', borderRadius: '16px', padding: '1.25rem 1.4rem' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Membros GIANTS</div>
                <div style={{ fontSize: '2.7rem', fontWeight: '900', color: '#c084fc', marginTop: '0.25rem' }}>{fmtNum(giants.membrosPresentesTurma)}</div>
                <div style={{ fontSize: '0.82rem', color: '#cbd5e1', fontWeight: '600' }}>{fmtNum(giants.empresasPresentesTurma)} empresas presentes</div>
              </div>
            </div>

            {/* BLOCOS GIANTS & PAC */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.35rem' }}>
              <div style={{ background: 'rgba(15, 23, 42, 0.88)', border: '1.5px solid rgba(255, 87, 34, 0.45)', borderRadius: '18px', padding: '1.3rem 1.6rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                  <span style={{ fontSize: '1.15rem', fontWeight: '900', color: '#fb923c', letterSpacing: '0.06em' }}>GIANTS • PRODUTO PRINCIPAL</span>
                  <span style={{ fontSize: '1.45rem', fontWeight: '900', color: '#ff5722' }}>{fmtBRL(giants.competencia)}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.85rem', textAlign: 'center' }}>
                  <div style={{ background: 'rgba(9,13,22,0.75)', borderRadius: '12px', padding: '0.8rem' }}>
                    <div style={{ fontSize: '2.1rem', fontWeight: '900', color: '#fff' }}>{fmtNum(giants.totalEmpresasCompraram)}</div>
                    <div style={{ fontSize: '0.78rem', fontWeight: '700', color: '#94a3b8' }}>Empresas</div>
                  </div>
                  <div style={{ background: 'rgba(9,13,22,0.75)', borderRadius: '12px', padding: '0.8rem' }}>
                    <div style={{ fontSize: '2.1rem', fontWeight: '900', color: '#4ade80' }}>{fmtNum(giants.totalPessoasFecharam)}</div>
                    <div style={{ fontSize: '0.78rem', fontWeight: '700', color: '#94a3b8' }}>Pessoas</div>
                  </div>
                  <div style={{ background: 'rgba(9,13,22,0.75)', borderRadius: '12px', padding: '0.8rem' }}>
                    <div style={{ fontSize: '2.1rem', fontWeight: '900', color: '#38bdf8' }}>{fmtNum(giants.empresasComSocio)}</div>
                    <div style={{ fontSize: '0.78rem', fontWeight: '700', color: '#94a3b8' }}>Com Sócio</div>
                  </div>
                </div>
              </div>

              <div style={{ background: 'rgba(15, 23, 42, 0.88)', border: '1.5px solid rgba(56, 189, 248, 0.45)', borderRadius: '18px', padding: '1.3rem 1.6rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                  <span style={{ fontSize: '1.15rem', fontWeight: '900', color: '#38bdf8', letterSpacing: '0.06em' }}>PAC • ACELERAÇÃO PRÉ-GIANTS</span>
                  <span style={{ fontSize: '1.45rem', fontWeight: '900', color: '#38bdf8' }}>{fmtBRL(pac.competencia)}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.85rem', textAlign: 'center' }}>
                  <div style={{ background: 'rgba(9,13,22,0.75)', borderRadius: '12px', padding: '0.8rem' }}>
                    <div style={{ fontSize: '2.1rem', fontWeight: '900', color: '#fff' }}>{fmtNum(pac.totalEmpresasCompraram)}</div>
                    <div style={{ fontSize: '0.78rem', fontWeight: '700', color: '#94a3b8' }}>Empresas</div>
                  </div>
                  <div style={{ background: 'rgba(9,13,22,0.75)', borderRadius: '12px', padding: '0.8rem' }}>
                    <div style={{ fontSize: '2.1rem', fontWeight: '900', color: '#4ade80' }}>{fmtNum(pac.totalPessoasFecharam)}</div>
                    <div style={{ fontSize: '0.78rem', fontWeight: '700', color: '#94a3b8' }}>Pessoas</div>
                  </div>
                  <div style={{ background: 'rgba(9,13,22,0.75)', borderRadius: '12px', padding: '0.8rem' }}>
                    <div style={{ fontSize: '2.1rem', fontWeight: '900', color: '#fb923c' }}>{fmtNum(pac.empresasComSocio)}</div>
                    <div style={{ fontSize: '0.78rem', fontWeight: '700', color: '#94a3b8' }}>Com Sócio</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* SLIDE 2: DESEMPENHO POR LINHA + ÚLTIMOS FECHAMENTOS */
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: '1.5rem', padding: '0.75rem 0', minHeight: 0 }}>
            <div style={{ background: 'rgba(15, 23, 42, 0.88)', border: '1px solid #334155', borderRadius: '18px', padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: '800', color: '#fb923c', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.9rem' }}>
                  Desempenho por Linha de Produto
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '1rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', textAlign: 'left', fontSize: '0.82rem', textTransform: 'uppercase' }}>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Linha</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Empresas</th>
                      <th style={{ padding: '0.75rem 0.5rem' }}>Pessoas</th>
                      <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Competência</th>
                      <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Caixa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhasTv.map((item) => (
                      <tr key={item.linha} style={{ borderBottom: '1px solid rgba(51,65,85,0.5)' }}>
                        <td style={{ padding: '0.95rem 0.5rem', fontWeight: '900', color: '#ffffff', fontSize: '1.1rem' }}>{item.linha}</td>
                        <td style={{ padding: '0.95rem 0.5rem', fontWeight: '800', color: '#38bdf8', fontSize: '1.15rem' }}>{item.empresas ?? item.contratos}</td>
                        <td style={{ padding: '0.95rem 0.5rem', fontWeight: '800', color: '#e2e8f0', fontSize: '1.15rem' }}>{item.pessoas ?? item.contratos}</td>
                        <td style={{ padding: '0.95rem 0.5rem', fontWeight: '900', color: '#fb923c', textAlign: 'right', fontSize: '1.15rem' }}>{fmtBRL(item.liquido)}</td>
                        <td style={{ padding: '0.95rem 0.5rem', fontWeight: '900', color: '#4ade80', textAlign: 'right', fontSize: '1.15rem' }}>{fmtBRL(item.entradas)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ background: 'rgba(9,13,22,0.75)', borderRadius: '14px', padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #1e293b' }}>
                <div>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: '700' }}>COMPETÊNCIA TOTAL</div>
                  <div style={{ fontSize: '1.85rem', fontWeight: '900', color: '#ff5722' }}><NumeroAnimado valor={kpis.competencia} /></div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: '700' }}>CAIXA TOTAL</div>
                  <div style={{ fontSize: '1.85rem', fontWeight: '900', color: '#4ade80' }}><NumeroAnimado valor={kpis.caixa} /></div>
                </div>
              </div>
            </div>

            <div style={{ background: 'rgba(15, 23, 42, 0.88)', border: '1px solid #334155', borderRadius: '18px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', overflow: 'hidden' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: '800', color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                Últimos Fechamentos da Turma
              </div>
              {ultimosTv.length === 0 ? (
                <div style={{ margin: 'auto', color: '#64748b', fontSize: '1.1rem', fontWeight: '700' }}>
                  Aguardando primeiros fechamentos da turma...
                </div>
              ) : (
                ultimosTv.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      background: 'rgba(9, 13, 22, 0.78)',
                      border: '1px solid #334155',
                      borderRadius: '12px',
                      padding: '0.85rem 1.1rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '0.75rem'
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '1.08rem', fontWeight: '900', color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.empresa}
                      </div>
                      <div style={{ fontSize: '0.84rem', color: '#94a3b8', marginTop: '0.15rem' }}>
                        {item.produto} {item.pessoasNoContrato > 1 ? `• ${item.pessoasNoContrato} pessoas` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#4ade80' }}>{fmtBRL(item.valorLiquido)}</div>
                      <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#fb923c', textTransform: 'uppercase' }}>
                        {item.statusAprovacao}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* RODAPÉ DISCRETO */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(148, 163, 184, 0.14)', paddingTop: '0.65rem', fontSize: '0.78rem', color: '#64748b' }}>
          <span>
            {dados?.atualizadoEm
              ? `Última sincronização às ${new Date(dados.atualizadoEm).toLocaleTimeString('pt-BR')} (atualização automática a cada 12s)`
              : 'Sincronizando indicadores...'}
          </span>
          <span>Use ← → para alternar visões • ESC para sair do Modo TV</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '1.75rem 2rem', width: '100%', boxSizing: 'border-box' }}>
      {/* CABEÇALHO EXECUTIVO */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ background: '#0f172a', color: '#fb923c', padding: '0.22rem 0.65rem', borderRadius: '6px', fontSize: '0.74rem', fontWeight: '800', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              War Room • Tempo Real
            </span>
            {dados?.atualizadoEm && (
              <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: '600' }}>
                Atualizado às {new Date(dados.atualizadoEm).toLocaleTimeString('pt-BR')}
              </span>
            )}
          </div>
          <h1 style={{ margin: '0.25rem 0 0', fontSize: '1.75rem', fontWeight: '800', color: '#0f172a' }}>
            Painel Executivo & Fechamento do Evento
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.35rem 0.65rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#475569' }}>Turma:</span>
            <input
              type="text"
              value={turmaId}
              onChange={(e) => {
                const novo = e.target.value.replace(/\D/g, '');
                setTurmaId(novo);
                if (novo) mudarTurma(novo);
              }}
              style={{ width: '64px', border: 'none', fontWeight: '800', color: '#0f172a', fontSize: '0.86rem', outline: 'none' }}
            />
          </div>

          <button
            type="button"
            onClick={() => setAutoRefresh((v) => !v)}
            style={{
              background: autoRefresh ? '#f0fdf4' : '#f8fafc',
              color: autoRefresh ? '#166534' : '#475569',
              border: autoRefresh ? '1px solid #86efac' : '1px solid #cbd5e1',
              padding: '0.55rem 0.9rem',
              borderRadius: '8px',
              fontWeight: '700',
              fontSize: '0.8rem',
              cursor: 'pointer'
            }}
          >
            {autoRefresh ? '● Ao vivo (12s)' : '○ Pausado'}
          </button>

          <button
            type="button"
            onClick={() => carregarResumo(false)}
            style={{ background: '#fff', color: '#0f172a', border: '1px solid #cbd5e1', padding: '0.55rem 0.95rem', borderRadius: '8px', fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer' }}
          >
            Atualizar
          </button>

          <button
            type="button"
            onClick={toggleModoTv}
            title="Abrir painel em tela cheia para TV / Projetor"
            style={{
              background: '#0f172a',
              color: '#ffffff',
              border: '1px solid #334155',
              padding: '0.58rem 1.05rem',
              borderRadius: '8px',
              fontWeight: '800',
              fontSize: '0.82rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.42rem',
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.22)'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.05rem', color: '#fb923c' }}>tv</span>
            Modo TV
          </button>

          <button
            type="button"
            onClick={abrirPanoramaPdf}
            style={{
              background: '#ff5722',
              color: '#ffffff',
              border: 'none',
              padding: '0.58rem 1.1rem',
              borderRadius: '8px',
              fontWeight: '800',
              fontSize: '0.82rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: '0 2px 8px rgba(255, 87, 34, 0.28)'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.05rem' }}>picture_as_pdf</span>
            Exportar Panorama PDF
          </button>

          <button
            type="button"
            disabled={exportandoCsv}
            onClick={baixarPlanilhaCsv}
            style={{
              background: '#059669',
              color: '#ffffff',
              border: 'none',
              padding: '0.58rem 1.1rem',
              borderRadius: '8px',
              fontWeight: '800',
              fontSize: '0.82rem',
              cursor: exportandoCsv ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.05rem' }}>download</span>
            {exportandoCsv ? 'Gerando Excel/CSV...' : 'Exportar Consolidado (Excel/CSV)'}
          </button>
        </div>
      </div>

      {erro && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '0.9rem 1rem', borderRadius: '10px', marginBottom: '1.25rem', fontWeight: '600' }}>
          {erro}
        </div>
      )}

      {carregando && !dados ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b', fontWeight: '700' }}>
          Consolidando indicadores comerciais e financeiros...
        </div>
      ) : (
        <>
          {/* LINHA 1: CAIXA E COMPETÊNCIA + BASE GERAL DA TURMA */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(235px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
            {/* COMPETÊNCIA */}
            <div style={{ background: '#0f172a', color: '#fff', borderRadius: '14px', padding: '1.2rem' }}>
              <div style={{ fontSize: '0.73rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase' }}>
                Competência Total (Líquido)
              </div>
              <div style={{ fontSize: '1.7rem', fontWeight: '900', color: '#ff5722', marginTop: '0.3rem' }}>
                <NumeroAnimado valor={kpis.competencia} />
              </div>
              <div style={{ fontSize: '0.76rem', color: '#cbd5e1', marginTop: '0.25rem' }}>
                Bruto: {fmtBRL(kpis.faturamentoBruto)} • <strong>{kpis.contratosFechados || 0} contratos</strong>
              </div>
            </div>

            {/* CAIXA */}
            <div style={{ background: '#ffffff', border: '1.5px solid #86efac', borderRadius: '14px', padding: '1.2rem' }}>
              <div style={{ fontSize: '0.73rem', fontWeight: '800', color: '#047857', textTransform: 'uppercase' }}>
                Caixa Total no Evento
              </div>
              <div style={{ fontSize: '1.7rem', fontWeight: '900', color: '#059669', marginTop: '0.3rem' }}>
                <NumeroAnimado valor={kpis.caixa} />
              </div>
              <div style={{ fontSize: '0.76rem', color: '#475569', marginTop: '0.25rem' }}>
                Entradas: <strong>{fmtBRL(kpis.entradasImediatas)}</strong> + Almoço: <strong>{fmtBRL(kpis.almocoArrecadado)}</strong>
              </div>
            </div>

            {/* TOTAL DE ALUNOS (LINHAS) */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1.2rem' }}>
              <div style={{ fontSize: '0.73rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>
                Total de Alunos (Linhas)
              </div>
              <div style={{ fontSize: '1.7rem', fontWeight: '900', color: '#0f172a', marginTop: '0.3rem' }}>
                {fmtNum(baseTurma.totalAlunos)}
              </div>
              <div style={{ fontSize: '0.76rem', color: '#475569', marginTop: '0.25rem' }}>
                Total de Empresas (CNPJ): <strong>{fmtNum(baseTurma.totalEmpresasCnpj)}</strong>
              </div>
            </div>

            {/* FICHAS PREENCHIDAS (ALMOÇO PAGO OU CORTESIA, SEM GIANTS) */}
            <div style={{ background: '#ffffff', border: '1px solid #fed7aa', borderRadius: '14px', padding: '1.2rem' }}>
              <div style={{ fontSize: '0.73rem', fontWeight: '800', color: '#c2410c', textTransform: 'uppercase' }}>
                Fichas Preenchidas (Almoço)
              </div>
              <div style={{ fontSize: '1.7rem', fontWeight: '900', color: '#ff5722', marginTop: '0.3rem' }}>
                {fmtNum(baseTurma.fichasPreenchidas)}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '0.25rem' }}>
                Almoço pago ou cortesia (exclui GIANTS)
              </div>
            </div>
          </div>

          {/* LINHA 2: BLOCOS DEDICADOS GIANTS E PAC */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
            {/* CARD GIANTS */}
            <div style={{ background: '#ffffff', border: '1.5px solid #cbd5e1', borderRadius: '14px', padding: '1.35rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <span style={{ background: '#0f172a', color: '#fb923c', padding: '0.2rem 0.55rem', borderRadius: '5px', fontSize: '0.7rem', fontWeight: '800', textTransform: 'uppercase' }}>
                    Produto Principal
                  </span>
                  <h3 style={{ margin: '0.3rem 0 0', fontSize: '1.1rem', fontWeight: '800', color: '#0f172a' }}>
                    Indicadores GIANTS
                  </h3>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#64748b' }}>Competência GIANTS</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: '900', color: '#ff5722' }}>{fmtBRL(giants.competencia)}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.85rem' }}>
                  <div style={{ fontSize: '0.74rem', fontWeight: '700', color: '#475569' }}>Membros GIANTS Presentes na Turma</div>
                  <div style={{ fontSize: '1.55rem', fontWeight: '900', color: '#0f172a', marginTop: '0.2rem' }}>
                    {fmtNum(giants.membrosPresentesTurma)}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                    Cadastrados como GIANTS ({fmtNum(giants.empresasPresentesTurma)} empresas)
                  </div>
                </div>

                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '10px', padding: '0.85rem' }}>
                  <div style={{ fontSize: '0.74rem', fontWeight: '700', color: '#9a3412' }}>Total de Empresas (Compraram GIANTS)</div>
                  <div style={{ fontSize: '1.55rem', fontWeight: '900', color: '#ff5722', marginTop: '0.2rem' }}>
                    {fmtNum(giants.totalEmpresasCompraram)}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#c2410c' }}>Contratos GIANTS fechados</div>
                </div>

                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '0.85rem' }}>
                  <div style={{ fontSize: '0.74rem', fontWeight: '700', color: '#166534' }}>Total de Pessoas (Fecharam GIANTS)</div>
                  <div style={{ fontSize: '1.55rem', fontWeight: '900', color: '#059669', marginTop: '0.2rem' }}>
                    {fmtNum(giants.totalPessoasFecharam)}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#15803d' }}>Titulares + sócios no contrato</div>
                </div>

                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.85rem' }}>
                  <div style={{ fontSize: '0.74rem', fontWeight: '700', color: '#475569' }}>Empresas com Sócio (&gt;1 pessoa)</div>
                  <div style={{ fontSize: '1.55rem', fontWeight: '900', color: '#0369a1', marginTop: '0.2rem' }}>
                    {fmtNum(giants.empresasComSocio)}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>GIANTS fechados com sócio adicional</div>
                </div>
              </div>
            </div>

            {/* CARD PAC */}
            <div style={{ background: '#ffffff', border: '1.5px solid #bae6fd', borderRadius: '14px', padding: '1.35rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '0.2rem 0.55rem', borderRadius: '5px', fontSize: '0.7rem', fontWeight: '800', textTransform: 'uppercase' }}>
                    Aceleração Pré-GIANTS
                  </span>
                  <h3 style={{ margin: '0.3rem 0 0', fontSize: '1.1rem', fontWeight: '800', color: '#0f172a' }}>
                    Indicadores PAC
                  </h3>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#64748b' }}>Competência PAC</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: '900', color: '#0369a1' }}>{fmtBRL(pac.competencia)}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', margin: 'auto 0' }}>
                <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px', padding: '0.95rem 0.8rem' }}>
                  <div style={{ fontSize: '0.74rem', fontWeight: '700', color: '#0369a1' }}>Total de Empresas</div>
                  <div style={{ fontSize: '1.65rem', fontWeight: '900', color: '#0284c7', marginTop: '0.25rem' }}>
                    {fmtNum(pac.totalEmpresasCompraram)}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#0369a1' }}>Empresas que fecharam PAC</div>
                </div>

                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '0.95rem 0.8rem' }}>
                  <div style={{ fontSize: '0.74rem', fontWeight: '700', color: '#166534' }}>Total de Pessoas</div>
                  <div style={{ fontSize: '1.65rem', fontWeight: '900', color: '#059669', marginTop: '0.25rem' }}>
                    {fmtNum(pac.totalPessoasFecharam)}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#15803d' }}>Pessoas que fecharam PAC</div>
                </div>

                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.95rem 0.8rem' }}>
                  <div style={{ fontSize: '0.74rem', fontWeight: '700', color: '#475569' }}>Empresas com Sócio</div>
                  <div style={{ fontSize: '1.65rem', fontWeight: '900', color: '#0f172a', marginTop: '0.25rem' }}>
                    {fmtNum(pac.empresasComSocio)}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>PAC com &gt;1 pessoa</div>
                </div>
              </div>

              <div style={{ marginTop: '0.9rem', paddingTop: '0.65rem', borderTop: '1px dashed #cbd5e1', display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#475569' }}>
                <span>Entradas PAC (Caixa): <strong>{fmtBRL(pac.caixaEntradas)}</strong></span>
                <span>Entradas GIANTS (Caixa): <strong>{fmtBRL(giants.caixaEntradas)}</strong></span>
              </div>
            </div>
          </div>

          {/* PLACAR POR LINHA DE PRODUTO + STATUS FINANCEIRO */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
            <div style={{ gridColumn: 'span 2', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1.35rem', overflowX: 'auto' }}>
              <h3 style={{ margin: '0 0 1rem', fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>
                Desempenho Consolidado por Linha de Produto
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}>
                    <th style={{ padding: '0.65rem' }}>Linha</th>
                    <th style={{ padding: '0.65rem' }}>Empresas</th>
                    <th style={{ padding: '0.65rem' }}>Pessoas</th>
                    <th style={{ padding: '0.65rem' }}>Com Sócio</th>
                    <th style={{ padding: '0.65rem' }}>Bruto</th>
                    <th style={{ padding: '0.65rem' }}>Cashback</th>
                    <th style={{ padding: '0.65rem' }}>Competência (Líq.)</th>
                    <th style={{ padding: '0.65rem' }}>Caixa (Entradas)</th>
                  </tr>
                </thead>
                <tbody>
                  {(dados?.porLinha || []).map((item) => (
                    <tr key={item.linha} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.7rem 0.65rem', fontWeight: '800', color: '#0f172a' }}>{item.linha}</td>
                      <td style={{ padding: '0.7rem 0.65rem', fontWeight: '700' }}>{item.empresas ?? item.contratos}</td>
                      <td style={{ padding: '0.7rem 0.65rem', fontWeight: '700' }}>{item.pessoas ?? item.contratos}</td>
                      <td style={{ padding: '0.7rem 0.65rem' }}>{item.empresasComSocio ?? 0}</td>
                      <td style={{ padding: '0.7rem 0.65rem' }}>{fmtBRL(item.bruto)}</td>
                      <td style={{ padding: '0.7rem 0.65rem', color: '#047857' }}>- {fmtBRL(item.cashback)}</td>
                      <td style={{ padding: '0.7rem 0.65rem', fontWeight: '800', color: '#ea580c' }}>{fmtBRL(item.liquido)}</td>
                      <td style={{ padding: '0.7rem 0.65rem', fontWeight: '700', color: '#059669' }}>{fmtBRL(item.entradas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1.35rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>
                Entradas & Status Financeiro
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', textAlign: 'center' }}>
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '0.6rem' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#166534' }}>{statusFin.aprovadas || 0}</div>
                  <div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#15803d' }}>Aprovadas</div>
                </div>
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '0.6rem' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#b45309' }}>{statusFin.pendentes || 0}</div>
                  <div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#92400e' }}>Em Análise</div>
                </div>
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.6rem' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#b91c1c' }}>{statusFin.recusadas || 0}</div>
                  <div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#991b1b' }}>Recusadas</div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                <div style={{ fontSize: '0.76rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>
                  Entradas por Forma de Pagamento
                </div>
                {(dados?.formasEntrada || []).length === 0 ? (
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Nenhuma entrada registrada ainda.</span>
                ) : (
                  (dados?.formasEntrada || []).map((f) => (
                    <div key={f.forma} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', background: '#f8fafc', padding: '0.45rem 0.65rem', borderRadius: '6px' }}>
                      <span style={{ fontWeight: '600', color: '#334155' }}>{f.forma}</span>
                      <strong style={{ color: '#0f172a' }}>{fmtBRL(f.valor)}</strong>
                    </div>
                  ))
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', background: '#fff7ed', padding: '0.45rem 0.65rem', borderRadius: '6px', color: '#9a3412' }}>
                  <span>Almoços Pagos ({kpis.qtdAlmocoPago || 0}) • Cortesias ({kpis.qtdCortesias || 0})</span>
                  <strong>{fmtBRL(kpis.almocoArrecadado)}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* ÚLTIMOS FECHAMENTOS + TRILHA DE AUDITORIA */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem' }}>
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1.35rem' }}>
              <h3 style={{ margin: '0 0 0.9rem', fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>
                Últimos Fechamentos da Turma
              </h3>
              {(dados?.ultimosFechamentos || []).length === 0 ? (
                <p style={{ fontSize: '0.84rem', color: '#64748b' }}>Nenhum contrato fechado nesta turma até o momento.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '420px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                  {(dados?.ultimosFechamentos || []).map((item) => (
                    <div key={item.id} style={{ border: '1px solid #e2e8f0', borderRadius: '9px', padding: '0.75rem 0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontWeight: '800', color: '#0f172a', fontSize: '0.9rem' }}>
                          {item.empresa}{' '}
                          {item.pessoasNoContrato > 1 && (
                            <span style={{ fontSize: '0.72rem', background: '#e0f2fe', color: '#0369a1', padding: '0.1rem 0.45rem', borderRadius: '4px', marginLeft: '0.35rem' }}>
                              {item.pessoasNoContrato} pessoas
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
                          {item.produto} • Entr. {fmtBRL(item.entrada1)} ({item.formaEntrada})
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: '900', color: '#059669', fontSize: '0.95rem' }}>{fmtBRL(item.valorLiquido)}</div>
                        <span style={{ fontSize: '0.7rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748b' }}>
                          {item.statusAprovacao}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1.35rem' }}>
              <h3 style={{ margin: '0 0 0.9rem', fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>
                Trilha de Auditoria (Cortesias, Cashback & Reaberturas)
              </h3>
              {(dados?.auditoria || []).length === 0 ? (
                <p style={{ fontSize: '0.84rem', color: '#64748b' }}>
                  Nenhuma ação crítica registrada ainda.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', maxHeight: '420px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                  {(dados?.auditoria || []).map((log) => {
                    const badge = BADGE_ACAO[log.acao] || { label: log.acao, bg: '#f1f5f9', color: '#334155' };
                    return (
                      <div key={log.id} style={{ border: '1px solid #f1f5f9', background: '#f8fafc', borderRadius: '8px', padding: '0.65rem 0.85rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                          <span style={{ background: badge.bg, color: badge.color, padding: '0.15rem 0.5rem', borderRadius: '5px', fontSize: '0.7rem', fontWeight: '800' }}>
                            {badge.label}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                            {new Date(log.created_at).toLocaleString('pt-BR')} • <strong>{log.usuario_nome || 'Operador'}</strong>
                          </span>
                        </div>
                        {log.empresa && (
                          <div style={{ fontSize: '0.8rem', fontWeight: '800', color: '#0f172a' }}>
                            {log.empresa} {log.cnpj ? `(${log.cnpj})` : ''}
                          </div>
                        )}
                        {log.detalhes && (
                          <div style={{ fontSize: '0.76rem', color: '#475569', marginTop: '0.15rem' }}>{log.detalhes}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* MODAL PANORAMA EXECUTIVO PDF (IDENTIDADE DARK SLATE #0F172A + LARANJA #FF5722 DO SISTEMA) */}
      {modalPanoramaPdf && (() => {
        const pan = dados?.panoramaExecutivo || {};
        const totAlunos = pan.totalAlunos ?? (baseTurma.totalAlunos || 0);
        const totEmpresas = pan.totalEmpresasCnpj ?? (baseTurma.totalEmpresasCnpj || 0);
        const fichasPreench = pan.fichasPreenchidas ?? (baseTurma.fichasPreenchidas || 0);
        const giantsMembrosPres = pan.giantsMembrosPresentes ?? (giants.membrosPresentesTurma || 0);

        const gEmpresas = pan.giantsEmpresas ?? (giants.totalEmpresasCompraram || 0);
        const gPessoas = pan.giantsPessoas ?? (giants.totalPessoasFecharam || 0);
        const gComSocio = pan.giantsEmpresasComSocio ?? (giants.empresasComSocio || 0);
        const gComp = pan.giantsCompetencia ?? (giants.competencia || 0);

        const pEmpresas = pan.pacEmpresas ?? (pac.totalEmpresasCompraram || 0);
        const pPessoas = pan.pacPessoas ?? (pac.totalPessoasFecharam || 0);
        const pComSocio = pan.pacEmpresasComSocio ?? (pac.empresasComSocio || 0);
        const pComp = pan.pacCompetencia ?? (pac.competencia || 0);

        const caixaVal = pan.caixa ?? (kpis.caixa || 0);
        const compVal = pan.competencia ?? (kpis.competencia || 0);

        return (
          <div
            onClick={() => setModalPanoramaPdf(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(2, 6, 23, 0.85)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10000,
              padding: '1rem',
              overflowY: 'auto'
            }}
          >
            <style>{
              '@media print {' +
              '  @page { size: A4 landscape; margin: 0; }' +
              '  html, body { margin: 0 !important; padding: 0 !important; background: #090d16 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }' +
              '  body * { visibility: hidden; }' +
              '  #panorama-executivo-sheet, #panorama-executivo-sheet * { visibility: visible; }' +
              '  #panorama-executivo-sheet {' +
              '    position: fixed !important;' +
              '    inset: 0 !important;' +
              '    width: 100vw !important;' +
              '    height: 100vh !important;' +
              '    max-width: none !important;' +
              '    border-radius: 0 !important;' +
              '    box-shadow: none !important;' +
              '    margin: 0 !important;' +
              '    padding: 20px 26px !important;' +
              '    box-sizing: border-box !important;' +
              '  }' +
              '  .no-print-panorama { display: none !important; }' +
              '}'
            }</style>

            {/* Barra de controle superior (não sai no PDF) */}
            <div
              className="no-print-panorama"
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: '1080px',
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '12px',
                padding: '0.75rem 1.1rem',
                marginBottom: '0.75rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.75rem',
                flexWrap: 'wrap',
                color: '#f8fafc'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#fb923c' }}>Evento:</span>
                <input
                  type="text"
                  value={tituloPanoramaCustom}
                  onChange={(e) => setTituloPanoramaCustom(e.target.value)}
                  style={{ background: '#0f172a', border: '1px solid #475569', color: '#fff', padding: '0.35rem 0.65rem', borderRadius: '6px', fontSize: '0.82rem', fontWeight: '700', width: '250px' }}
                />
                <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#fb923c' }}>Data:</span>
                <input
                  type="text"
                  value={dataPanoramaCustom}
                  onChange={(e) => setDataPanoramaCustom(e.target.value)}
                  style={{ background: '#0f172a', border: '1px solid #475569', color: '#fff', padding: '0.35rem 0.65rem', borderRadius: '6px', fontSize: '0.82rem', fontWeight: '700', width: '115px' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <button
                  type="button"
                  onClick={() => window.print()}
                  style={{
                    background: '#ff5722',
                    color: '#ffffff',
                    border: 'none',
                    padding: '0.55rem 1.15rem',
                    borderRadius: '8px',
                    fontWeight: '800',
                    fontSize: '0.84rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '1.05rem' }}>print</span>
                  Salvar PDF / Imprimir
                </button>
                <button
                  type="button"
                  onClick={() => setModalPanoramaPdf(false)}
                  style={{ background: '#334155', color: '#e2e8f0', border: 'none', padding: '0.55rem 0.9rem', borderRadius: '8px', fontWeight: '700', fontSize: '0.82rem', cursor: 'pointer' }}
                >
                  Fechar
                </button>
              </div>
            </div>

            {/* FOLHA DO PANORAMA EXECUTIVO */}
            <div
              id="panorama-executivo-sheet"
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: '1080px',
                background: 'radial-gradient(circle at 18% 15%, #1e293b 0%, #0f172a 48%, #090d16 100%)',
                borderRadius: '16px',
                border: '1.5px solid rgba(255, 87, 34, 0.55)',
                boxShadow: '0 25px 60px rgba(0, 0, 0, 0.65)',
                padding: '1.65rem 2rem',
                color: '#ffffff',
                fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '1rem'
              }}
            >
              {/* Barras decorativas no canto superior direito */}
              <div style={{ position: 'absolute', top: '12px', right: '24px', display: 'flex', alignItems: 'flex-end', gap: '6px', opacity: 0.22, pointerEvents: 'none' }}>
                {[26, 38, 52, 68, 84, 102].map((h, i) => (
                  <div key={i} style={{ width: '10px', height: h + 'px', background: 'linear-gradient(180deg, #ff5722 0%, transparent 100%)', borderRadius: '3px 3px 0 0' }} />
                ))}
              </div>

              {/* 1. CABEÇALHO DO PANORAMA */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', position: 'relative', zIndex: 1 }}>
                <div>
                  <div style={{ fontSize: '2rem', fontWeight: '900', lineHeight: '1.08', letterSpacing: '-0.02em' }}>
                    <span style={{ color: '#ffffff' }}>{tituloPanoramaCustom || 'Casais Empreendedores'} </span>
                    <span style={{ color: '#ff5722' }}>{dataPanoramaCustom}</span>
                  </div>
                  <div style={{ fontSize: '0.88rem', fontWeight: '600', letterSpacing: '0.38em', color: '#e2e8f0', marginTop: '0.3rem', textTransform: 'uppercase' }}>
                    PANORAMA EXECUTIVO
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.55rem' }}>
                    <div style={{ height: '1px', width: '75px', background: 'linear-gradient(90deg, transparent, rgba(255,87,34,0.75))' }} />
                    <span style={{ fontSize: '0.62rem', fontWeight: '700', letterSpacing: '0.2em', color: '#cbd5e1', textTransform: 'uppercase' }}>
                      RESULTADOS DE HOJE. PRÓXIMOS PASSOS DE AMANHÃ.
                    </span>
                    <div style={{ height: '1px', width: '75px', background: 'linear-gradient(90deg, rgba(255,87,34,0.75), transparent)' }} />
                  </div>
                </div>

                <div style={{ borderLeft: '2.5px solid #ff5722', paddingLeft: '0.65rem', fontSize: '0.6rem', fontWeight: '800', letterSpacing: '0.14em', color: '#cbd5e1', lineHeight: '1.45', textTransform: 'uppercase', marginTop: '0.2rem' }}>
                  <div>JUNTOS</div>
                  <div>IDEIAS</div>
                  <div>NEGÓCIOS</div>
                  <div>CONQUISTAS</div>
                </div>
              </div>

              {/* 2. BLOCO SUPERIOR: PRESENÇA & BASE (ESQUERDA) + RESULTADOS CAIXA/COMPETÊNCIA (DIREITA) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.08fr 0.92fr', gap: '1.1rem', position: 'relative', zIndex: 1 }}>
                {/* CARD ESQUERDO: PRESENÇA */}
                <div style={{
                  background: 'linear-gradient(180deg, rgba(255,87,34,0.14) 0%, rgba(15,23,42,0.9) 38%)',
                  border: '1.5px solid rgba(255, 87, 34, 0.55)',
                  borderRadius: '14px',
                  padding: '1.05rem 1.3rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.7rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '1.9rem', color: '#ff5722' }}>groups</span>
                      <span style={{ fontSize: '1.4rem', fontWeight: '900', letterSpacing: '0.03em' }}>PRESENÇA</span>
                    </div>
                    <div style={{ borderLeft: '2px solid #ff5722', paddingLeft: '0.55rem', fontSize: '0.56rem', fontWeight: '700', letterSpacing: '0.1em', color: '#cbd5e1', lineHeight: '1.35', textTransform: 'uppercase' }}>
                      <div>PESSOAS</div>
                      <div>QUE CONSTROEM</div>
                      <div>OPORTUNIDADES</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '1.4rem', color: '#e2e8f0' }}>group</span>
                        <div>
                          <div style={{ fontSize: '0.84rem', fontWeight: '700', color: '#f8fafc' }}>Total de Alunos</div>
                          <div style={{ fontSize: '0.66rem', color: '#94a3b8' }}>(quantidade de linhas na turma):</div>
                        </div>
                      </div>
                      <span style={{ fontSize: '1.7rem', fontWeight: '900', color: '#ff5722', lineHeight: 1 }}>
                        {fmtNum(totAlunos)}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '1.4rem', color: '#e2e8f0' }}>apartment</span>
                        <div>
                          <div style={{ fontSize: '0.84rem', fontWeight: '700', color: '#f8fafc' }}>Total de Empresas (CNPJ)</div>
                          <div style={{ fontSize: '0.66rem', color: '#94a3b8' }}>(CNPJs distintos na turma):</div>
                        </div>
                      </div>
                      <span style={{ fontSize: '1.7rem', fontWeight: '900', color: '#ff5722', lineHeight: 1 }}>
                        {fmtNum(totEmpresas)}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '1.4rem', color: '#e2e8f0' }}>assignment_turned_in</span>
                        <div>
                          <div style={{ fontSize: '0.84rem', fontWeight: '700', color: '#f8fafc' }}>Fichas Preenchidas</div>
                          <div style={{ fontSize: '0.66rem', color: '#94a3b8' }}>(almoço pago ou cortesia — exceto GIANTS):</div>
                        </div>
                      </div>
                      <span style={{ fontSize: '1.7rem', fontWeight: '900', color: '#ff5722', lineHeight: 1 }}>
                        {fmtNum(fichasPreench)}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '1.4rem', color: '#fb923c' }}>workspace_premium</span>
                        <div>
                          <div style={{ fontSize: '0.84rem', fontWeight: '700', color: '#f8fafc' }}>Membros GIANTS Presentes</div>
                          <div style={{ fontSize: '0.66rem', color: '#94a3b8' }}>(já cadastrados como GIANTS na turma):</div>
                        </div>
                      </div>
                      <span style={{ fontSize: '1.7rem', fontWeight: '900', color: '#fb923c', lineHeight: 1 }}>
                        {fmtNum(giantsMembrosPres)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* CARD DIREITO: RESULTADOS (CAIXA & COMPETÊNCIA) */}
                <div style={{
                  background: 'linear-gradient(180deg, rgba(255,87,34,0.14) 0%, rgba(15,23,42,0.9) 38%)',
                  border: '1.5px solid rgba(255, 87, 34, 0.55)',
                  borderRadius: '14px',
                  padding: '1.05rem 1.3rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.7rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '1.9rem', color: '#ff5722' }}>bar_chart</span>
                      <span style={{ fontSize: '1.4rem', fontWeight: '900', letterSpacing: '0.03em' }}>RESULTADOS</span>
                    </div>
                    <div style={{ borderLeft: '2px solid #ff5722', paddingLeft: '0.55rem', fontSize: '0.56rem', fontWeight: '700', letterSpacing: '0.1em', color: '#cbd5e1', lineHeight: '1.35', textTransform: 'uppercase' }}>
                      <div>NÚMEROS</div>
                      <div>QUE IMPULSIONAM</div>
                      <div>NOVAS HISTÓRIAS</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem', margin: 'auto 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '1.7rem', color: '#e2e8f0' }}>payments</span>
                        <div>
                          <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#f8fafc' }}>Caixa:</div>
                          <div style={{ fontSize: '0.66rem', color: '#94a3b8' }}>Entradas + Almoços</div>
                        </div>
                      </div>
                      <span style={{ fontSize: '1.9rem', fontWeight: '900', color: '#ff5722', letterSpacing: '-0.02em' }}>
                        {fmtBRL(caixaVal)}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '1.7rem', color: '#e2e8f0' }}>track_changes</span>
                        <div>
                          <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#f8fafc' }}>Competência:</div>
                          <div style={{ fontSize: '0.66rem', color: '#94a3b8' }}>Contratos Líquidos</div>
                        </div>
                      </div>
                      <span style={{ fontSize: '1.9rem', fontWeight: '900', color: '#ff5722', letterSpacing: '-0.02em' }}>
                        {fmtBRL(compVal)}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.65rem' }}>
                    <div style={{ borderLeft: '2px solid #ff5722', paddingLeft: '0.55rem', fontSize: '0.56rem', fontWeight: '700', letterSpacing: '0.12em', color: '#cbd5e1', lineHeight: '1.35', textTransform: 'uppercase' }}>
                      <div>PLANEJAMENTO</div>
                      <div>EXECUÇÃO</div>
                      <div>CRESCIMENTO</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. FAIXA CENTRAL: INDICADORES GIANTS & PAC */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: '1.1rem', position: 'relative', zIndex: 1 }}>
                {/* SUB-BLOCO GIANTS */}
                <div style={{
                  background: 'linear-gradient(180deg, rgba(255,87,34,0.14) 0%, rgba(15,23,42,0.92) 35%)',
                  border: '1.5px solid rgba(255, 87, 34, 0.55)',
                  borderRadius: '14px',
                  padding: '0.95rem 1.2rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.7rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '1.5rem', color: '#ff5722' }}>trending_up</span>
                      <span style={{ fontSize: '1.15rem', fontWeight: '900' }}>GIANTS</span>
                    </div>
                    <span style={{ fontSize: '0.82rem', fontWeight: '800', color: '#fb923c' }}>
                      Competência: {fmtBRL(gComp)}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.55rem' }}>
                    <div style={{ background: 'rgba(9, 13, 22, 0.78)', border: '1px solid rgba(255, 87, 34, 0.42)', borderRadius: '10px', padding: '0.65rem 0.45rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.66rem', fontWeight: '700', color: '#cbd5e1', minHeight: '28px' }}>Membros GIANTS na Turma</div>
                      <div style={{ fontSize: '1.55rem', fontWeight: '900', color: '#fb923c', marginTop: '0.2rem' }}>{fmtNum(giantsMembrosPres)}</div>
                    </div>
                    <div style={{ background: 'rgba(9, 13, 22, 0.78)', border: '1px solid rgba(255, 87, 34, 0.42)', borderRadius: '10px', padding: '0.65rem 0.45rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.66rem', fontWeight: '700', color: '#cbd5e1', minHeight: '28px' }}>Total de Empresas</div>
                      <div style={{ fontSize: '1.55rem', fontWeight: '900', color: '#ff5722', marginTop: '0.2rem' }}>{fmtNum(gEmpresas)}</div>
                    </div>
                    <div style={{ background: 'rgba(9, 13, 22, 0.78)', border: '1px solid rgba(255, 87, 34, 0.42)', borderRadius: '10px', padding: '0.65rem 0.45rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.66rem', fontWeight: '700', color: '#cbd5e1', minHeight: '28px' }}>Total de Pessoas</div>
                      <div style={{ fontSize: '1.55rem', fontWeight: '900', color: '#ff5722', marginTop: '0.2rem' }}>{fmtNum(gPessoas)}</div>
                    </div>
                    <div style={{ background: 'rgba(9, 13, 22, 0.78)', border: '1px solid rgba(255, 87, 34, 0.42)', borderRadius: '10px', padding: '0.65rem 0.45rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.66rem', fontWeight: '700', color: '#cbd5e1', minHeight: '28px' }}>Empresas com Sócio</div>
                      <div style={{ fontSize: '1.55rem', fontWeight: '900', color: '#ff5722', marginTop: '0.2rem' }}>{fmtNum(gComSocio)}</div>
                    </div>
                  </div>
                </div>

                {/* SUB-BLOCO PAC */}
                <div style={{
                  background: 'linear-gradient(180deg, rgba(255,87,34,0.14) 0%, rgba(15,23,42,0.92) 35%)',
                  border: '1.5px solid rgba(255, 87, 34, 0.55)',
                  borderRadius: '14px',
                  padding: '0.95rem 1.2rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.7rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '1.5rem', color: '#ff5722' }}>rocket_launch</span>
                      <span style={{ fontSize: '1.15rem', fontWeight: '900' }}>PAC</span>
                    </div>
                    <span style={{ fontSize: '0.82rem', fontWeight: '800', color: '#fb923c' }}>
                      Competência: {fmtBRL(pComp)}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.55rem' }}>
                    <div style={{ background: 'rgba(9, 13, 22, 0.78)', border: '1px solid rgba(255, 87, 34, 0.42)', borderRadius: '10px', padding: '0.65rem 0.45rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.66rem', fontWeight: '700', color: '#cbd5e1', minHeight: '28px' }}>Total de Empresas</div>
                      <div style={{ fontSize: '1.55rem', fontWeight: '900', color: '#ff5722', marginTop: '0.2rem' }}>{fmtNum(pEmpresas)}</div>
                    </div>
                    <div style={{ background: 'rgba(9, 13, 22, 0.78)', border: '1px solid rgba(255, 87, 34, 0.42)', borderRadius: '10px', padding: '0.65rem 0.45rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.66rem', fontWeight: '700', color: '#cbd5e1', minHeight: '28px' }}>Total de Pessoas</div>
                      <div style={{ fontSize: '1.55rem', fontWeight: '900', color: '#ff5722', marginTop: '0.2rem' }}>{fmtNum(pPessoas)}</div>
                    </div>
                    <div style={{ background: 'rgba(9, 13, 22, 0.78)', border: '1px solid rgba(255, 87, 34, 0.42)', borderRadius: '10px', padding: '0.65rem 0.45rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.66rem', fontWeight: '700', color: '#cbd5e1', minHeight: '28px' }}>Empresas com Sócio</div>
                      <div style={{ fontSize: '1.55rem', fontWeight: '900', color: '#ff5722', marginTop: '0.2rem' }}>{fmtNum(pComSocio)}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. FAIXA INFERIOR: COMPETÊNCIA TOTAL + CAIXA */}
              <div style={{
                background: 'linear-gradient(90deg, rgba(255,87,34,0.16) 0%, rgba(15,23,42,0.94) 50%, rgba(255,87,34,0.14) 100%)',
                border: '1.5px solid rgba(255, 87, 34, 0.55)',
                borderRadius: '14px',
                padding: '0.85rem 1.5rem',
                display: 'grid',
                gridTemplateColumns: '1.2fr 1fr',
                gap: '1.25rem',
                alignItems: 'center',
                position: 'relative',
                zIndex: 1
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', borderRight: '1px solid rgba(148, 163, 184, 0.25)', paddingRight: '1rem' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '2.1rem', color: '#ff5722' }}>toll</span>
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#e2e8f0' }}>Competência Total:</div>
                    <div style={{ fontSize: '2rem', fontWeight: '900', color: '#ff5722', lineHeight: 1.05, letterSpacing: '-0.02em' }}>
                      {fmtBRL(compVal)}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', paddingLeft: '0.5rem' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '2.1rem', color: '#ff5722' }}>account_balance_wallet</span>
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#e2e8f0' }}>Caixa:</div>
                    <div style={{ fontSize: '1.9rem', fontWeight: '900', color: '#ff5722', lineHeight: 1.05, letterSpacing: '-0.02em' }}>
                      {fmtBRL(caixaVal)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
