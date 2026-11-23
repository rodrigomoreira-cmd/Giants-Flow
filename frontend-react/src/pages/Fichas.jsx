import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useTurma } from '../context/TurmaContext';
import { alertaSistema } from '../context/ModalContext';

const DRAFT_STORAGE_KEY = 'rascunho_nova_ficha_v1';

const MOMENTOS_APLICACAO = [
  { id: 'Coffee', label: '☕ Coffee', bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
  { id: 'Almoço', label: '🍽️ Almoço', bg: '#dcfce7', color: '#166534', border: '#86efac' },
  { id: 'Janta', label: '🌙 Janta', bg: '#e0e7ff', color: '#3730a3', border: '#a5b4fc' },
  { id: 'Outro Momento', label: '✨ Outro Momento', bg: '#f1f5f9', color: '#334155', border: '#cbd5e1' },
];

function formatarTelefone(valor) {
  const digits = String(valor || '').replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatarCnpj(valor) {
  const digits = String(valor || '').replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function obterUsuarioLogadoId() {
  try {
    const raw = localStorage.getItem('sessao_operador');
    const sessao = raw ? JSON.parse(raw) : null;
    return sessao?.id ? Number(sessao.id) : '';
  } catch {
    return '';
  }
}

export default function Fichas() {
  const navigate = useNavigate();
  const [fichas, setFichas] = useState([]);
  const [auxiliares, setAuxiliares] = useState(null);
  const { turmaSelecionada: turmaGlobal, mudarTurma } = useTurma();
  const [turmaSelecionada, setTurmaSelecionada] = useState(() => Number(turmaGlobal || localStorage.getItem('turma_ativa_id') || 1491));
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [consultandoCnpj, setConsultandoCnpj] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [crachaEditadoManual, setCrachaEditadoManual] = useState(false);

  // Filtros da tabela inferior
  const [buscaLista, setBuscaLista] = useState('');
  const [filtroEtapa, setFiltroEtapa] = useState('TODAS');
  const [filtroMomento, setFiltroMomento] = useState('TODOS');

  const [form, setForm] = useState(() => {
    try {
      const salvo = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (salvo) return JSON.parse(salvo);
    } catch {}
    return {
      nome_completo: '',
      nome_cracha: '',
      empresa: '',
      cpf_cnpj: '',
      telefone: '',
      email: '',
      origem: 'ORGANICO',
      momento_aplicacao: 'Coffee',
      momento_outro_detalhe: '',
      captador_id: obterUsuarioLogadoId()
    };
  });

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(form));
    } catch {}
  }, [form]);

  const carregarDados = async (turmaId = turmaSelecionada) => {
    try {
      setCarregando(true);
      setErro('');

      const aux = await api.get('/auxiliares');
      setAuxiliares(aux);

      const tId = Number(turmaGlobal || turmaId || aux.turmas?.[0]?.id || 1491);
      setTurmaSelecionada(tId);

      // Ajusta captador padrão se ainda estiver vazio
      setForm((prev) => {
        if (prev.captador_id) return prev;
        const logadoId = obterUsuarioLogadoId();
        const existeNaLista = aux?.captadores?.some((c) => Number(c.id) === logadoId);
        const padrao = existeNaLista ? logadoId : (aux?.captadores?.[0]?.id || '');
        return { ...prev, captador_id: padrao };
      });

      const dados = await api.get(`/clientes?turmaId=${tId}`);
      setFichas(Array.isArray(dados) ? dados : dados.clientes || []);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    const idAlvo = Number(turmaGlobal || localStorage.getItem('turma_ativa_id') || 1491);
    setTurmaSelecionada(idAlvo);
    carregarDados(idAlvo);
  }, [turmaGlobal]);

  const lidarComTrocaTurma = (e) => {
    const novoId = Number(e.target.value);
    setTurmaSelecionada(novoId);
    mudarTurma(novoId);
    carregarDados(novoId);
  };

  const aoAlterarNomeCompleto = (valor) => {
    const primeiroNome = valor.trim().split(/\s+/)[0] || '';
    setForm((prev) => ({
      ...prev,
      nome_completo: valor,
      nome_cracha: crachaEditadoManual ? prev.nome_cracha : primeiroNome
    }));
  };

  const buscarDadosCnpj = async (cnpjDigitado) => {
    const digits = String(cnpjDigitado || '').replace(/\D/g, '');
    if (digits.length !== 14) return;
    try {
      setConsultandoCnpj(true);
      const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
      if (!resp.ok) return;
      const data = await resp.json();
      const nomeEmpresa = data.nome_fantasia?.trim() || data.razao_social?.trim();
      if (nomeEmpresa) {
        setForm((prev) => ({
          ...prev,
          empresa: prev.empresa.trim() ? prev.empresa : nomeEmpresa
        }));
      }
    } catch {
      // Silencioso em caso de indisponibilidade externa
    } finally {
      setConsultandoCnpj(false);
    }
  };

  const aoAlterarCnpj = (valor) => {
    const formatado = formatarCnpj(valor);
    setForm((prev) => ({ ...prev, cpf_cnpj: formatado }));
    if (formatado.replace(/\D/g, '').length === 14) {
      buscarDadosCnpj(formatado);
    }
  };

  // Detecta possível duplicidade em tempo real na turma atual
  const possivelDuplicado = useMemo(() => {
    const telDigits = form.telefone.replace(/\D/g, '');
    const cnpjDigits = form.cpf_cnpj.replace(/\D/g, '');
    if (telDigits.length < 8 && cnpjDigits.length < 14) return null;

    return fichas.find((f) => {
      const fTel = String(f.telefone || f.whatsapp || '').replace(/\D/g, '');
      const fCnpj = String(f.cnpj || f.cpf_cnpj || '').replace(/\D/g, '');
      if (telDigits.length >= 8 && fTel && fTel === telDigits) return true;
      if (cnpjDigits.length === 14 && fCnpj && fCnpj === cnpjDigits) return true;
      return false;
    }) || null;
  }, [form.telefone, form.cpf_cnpj, fichas]);

  const limparRascunho = () => {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    setCrachaEditadoManual(false);
    setForm((prev) => ({
      nome_completo: '',
      nome_cracha: '',
      empresa: '',
      cpf_cnpj: '',
      telefone: '',
      email: '',
      origem: 'ORGANICO',
      momento_aplicacao: prev.momento_aplicacao || 'Coffee',
      momento_outro_detalhe: '',
      captador_id: prev.captador_id
    }));
  };

  const submeterFicha = async (e) => {
    e.preventDefault();
    if (!form.nome_completo.trim() || !form.telefone.trim()) {
      alertaSistema('Nome e Telefone/WhatsApp são obrigatórios.');
      return;
    }

    try {
      setSalvando(true);
      setSucesso('');
      const momentoFinal =
        form.momento_aplicacao === 'Outro Momento' && form.momento_outro_detalhe?.trim()
          ? `Outro: ${form.momento_outro_detalhe.trim()}`
          : form.momento_aplicacao || null;

      const criada = await api.post('/clientes', {
        ...form,
        momento_aplicacao: momentoFinal,
        turma_id: turmaSelecionada,
        captador_id: form.captador_id ? Number(form.captador_id) : null
      });

      limparRascunho();
      setSucesso(`Ficha #${criada?.id || ''} de "${criada?.nome_participante || form.nome_completo}" registrada com sucesso.`);

      const dados = await api.get(`/clientes?turmaId=${turmaSelecionada}`);
      setFichas(Array.isArray(dados) ? dados : dados.clientes || []);
    } catch (err) {
      alertaSistema(`Erro ao cadastrar ficha: ${err.message}`);
    } finally {
      setSalvando(false);
    }
  };

  const obterEtapaReal = (f) => f.status || f.etapa_atual || f.etapa || 'AGUARDANDO_TRIAGEM';

  const renderBadgeEtapa = (etapa) => {
    const mapa = {
      AGUARDANDO_TRIAGEM: { bg: '#eff6ff', color: '#2563eb', label: 'Aguardando Triagem' },
      EM_ATENDIMENTO: { bg: '#fef3c7', color: '#b45309', label: 'Em Mesa' },
      AGUARDANDO_APROVACAO: { bg: '#ffedd5', color: '#c2410c', label: 'Aguardando Aprovação' },
      FECHADO: { bg: '#dcfce7', color: '#15803d', label: 'Fechado / Vendido' },
      CONCLUIDO: { bg: '#dcfce7', color: '#15803d', label: 'Concluído' }
    };
    const cfg = mapa[etapa] || { bg: '#f1f5f9', color: '#334155', label: etapa };
    return (
      <span style={{ background: cfg.bg, color: cfg.color, padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700' }}>
        {cfg.label}
      </span>
    );
  };

  const fichasFiltradas = useMemo(() => {
    const termo = buscaLista.trim().toLowerCase();
    return fichas.filter((f) => {
      const etapa = obterEtapaReal(f);
      if (filtroEtapa === 'TRIAGEM' && etapa !== 'AGUARDANDO_TRIAGEM') return false;
      if (filtroEtapa === 'MESA' && etapa !== 'EM_ATENDIMENTO') return false;
      if (filtroEtapa === 'ALMOCO' && !(f.almoco_pago || f.cortesia_almoco || f.membro_giants)) return false;
      if (filtroEtapa === 'FECHADO' && etapa !== 'FECHADO' && etapa !== 'CONCLUIDO') return false;
      if (filtroMomento !== 'TODOS') {
        const mom = String(f.momento_aplicacao || '').toLowerCase();
        if (filtroMomento === 'OUTRO') {
          if (!mom.startsWith('outro')) return false;
        } else if (!mom.includes(filtroMomento.toLowerCase())) {
          return false;
        }
      }

      if (!termo) return true;
      const alvo = [
        f.id,
        f.nome_participante,
        f.nome,
        f.nome_cracha,
        f.empresa,
        f.cnpj,
        f.cpf_cnpj,
        f.telefone
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return alvo.includes(termo);
    });
  }, [fichas, buscaLista, filtroEtapa, filtroMomento]);

  return (
    <div style={{ padding: '2rem', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>Fichas de Aplicação</h1>
          <p style={{ color: '#64748b', margin: '0.25rem 0 0' }}>Cadastro rápido na recepção e triagem de participantes para as mesas</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#475569' }}>Turma:</label>
          <select
            value={turmaSelecionada}
            onChange={lidarComTrocaTurma}
            style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontWeight: '600', color: '#0f172a' }}
          >
            {auxiliares?.turmas?.map((t) => (
              <option key={t.id} value={t.id}>{t.nome || t.codigo}</option>
            ))}
          </select>
          <span style={{ background: '#e0f2fe', color: '#0284c7', padding: '0.45rem 0.8rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: '700' }}>
            {fichas.length} Fichas
          </span>
        </div>
      </div>

      {erro && (
        <div style={{ background: '#fef2f2', color: '#ef4444', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #fecaca' }}>
          {erro}
        </div>
      )}

      {sucesso && (
        <div style={{ background: '#dcfce7', color: '#166534', padding: '0.85rem 1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #bbf7d0', fontWeight: '600', fontSize: '0.9rem' }}>
          {sucesso}
        </div>
      )}

      {/* Formulário de Novo Registro */}
      <div style={{ background: '#fff', padding: '1.75rem', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#1e293b', margin: 0 }}>Novo Registro</h3>
          {(form.nome_completo || form.telefone || form.empresa || form.cpf_cnpj) && (
            <button
              type="button"
              onClick={limparRascunho}
              style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: '0.82rem', fontWeight: '600', cursor: 'pointer', textDecoration: 'underline' }}
            >
              Limpar rascunho
            </button>
          )}
        </div>

        {possivelDuplicado && (
          <div style={{ background: '#fffbeb', border: '1px solid #f59e0b', color: '#92400e', padding: '0.8rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.88rem' }}>
            <strong>Atenção — Possível participante já cadastrado nesta turma:</strong> Ficha <strong>#{possivelDuplicado.id}</strong> ({possivelDuplicado.nome_participante || possivelDuplicado.nome} — {possivelDuplicado.empresa || 'Sem empresa'}). Confira na lista abaixo antes de salvar.
          </div>
        )}

        <form onSubmit={submeterFicha}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>Nome Completo *</label>
              <input
                type="text"
                value={form.nome_completo}
                onChange={(e) => aoAlterarNomeCompleto(e.target.value)}
                required
                placeholder="Ex: Carlos Albuquerque"
                style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>Nome no Crachá</label>
              <input
                type="text"
                value={form.nome_cracha}
                onChange={(e) => {
                  setCrachaEditadoManual(true);
                  setForm({ ...form, nome_cracha: e.target.value });
                }}
                placeholder="Ex: Carlos"
                style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>WhatsApp / Celular *</label>
              <input
                type="text"
                value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: formatarTelefone(e.target.value) })}
                required
                placeholder="(11) 99999-9999"
                style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>
                CNPJ da Empresa {consultandoCnpj && <span style={{ color: '#ff5722', fontSize: '0.75rem' }}>(buscando...)</span>}
              </label>
              <input
                type="text"
                value={form.cpf_cnpj}
                onChange={(e) => aoAlterarCnpj(e.target.value)}
                placeholder="00.000.000/0000-00"
                style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>Empresa / Negócio</label>
              <input
                type="text"
                value={form.empresa}
                onChange={(e) => setForm({ ...form, empresa: e.target.value })}
                placeholder="Ex: Albuquerque Tech"
                style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>E-mail</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="carlos@empresa.com"
                style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>Captador / Responsável</label>
              <select
                value={form.captador_id}
                onChange={(e) => setForm({ ...form, captador_id: e.target.value })}
                style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', boxSizing: 'border-box' }}
              >
                <option value="">Selecione...</option>
                {auxiliares?.captadores?.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Seletor Rápido: Momento da Aplicação */}
          <div style={{ marginBottom: '1.25rem', padding: '1rem', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#1e293b', marginBottom: '0.6rem' }}>
              Momento do Preenchimento da Ficha *
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
              {MOMENTOS_APLICACAO.map((m) => {
                const ativo = (form.momento_aplicacao || 'Coffee') === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setForm({ ...form, momento_aplicacao: m.id })}
                    style={{
                      padding: '0.55rem 1rem',
                      borderRadius: '8px',
                      border: ativo ? '2px solid #ff5722' : `1px solid ${m.border}`,
                      background: ativo ? '#fff7ed' : '#fff',
                      color: ativo ? '#ea580c' : m.color,
                      fontWeight: '700',
                      fontSize: '0.86rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    {m.label}
                  </button>
                );
              })}

              {form.momento_aplicacao === 'Outro Momento' && (
                <input
                  type="text"
                  value={form.momento_outro_detalhe || ''}
                  onChange={(e) => setForm({ ...form, momento_outro_detalhe: e.target.value })}
                  placeholder="Especifique o momento (ex: Intervalo Manhã, Networking, Palco...)"
                  style={{ flex: '1 1 260px', padding: '0.55rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '0.86rem' }}
                />
              )}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              disabled={salvando}
              style={{
                background: salvando ? '#94a3b8' : '#ff5722',
                color: '#fff',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                fontWeight: '700',
                cursor: salvando ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: '0 2px 6px rgba(255,87,34,0.3)'
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>person_add</span>
              {salvando ? 'Salvando Ficha...' : 'Salvar Ficha de Aplicação'}
            </button>
          </div>
        </form>
      </div>

      {/* Barra de Busca e Filtros Rápidos */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem' }}>
        <input
          type="text"
          value={buscaLista}
          onChange={(e) => setBuscaLista(e.target.value)}
          placeholder="Buscar ficha por ID, nome, crachá, empresa, CNPJ ou WhatsApp..."
          style={{ flex: '1 1 280px', padding: '0.6rem 0.9rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
        />
        {[
          { id: 'TODAS', label: `Todas (${fichas.length})` },
          { id: 'TRIAGEM', label: 'Aguardando Triagem' },
          { id: 'ALMOCO', label: 'Almoço Liberado' },
          { id: 'MESA', label: 'Em Mesa' },
          { id: 'FECHADO', label: 'Fechadas' }
        ].map((aba) => (
          <button
            key={aba.id}
            type="button"
            onClick={() => setFiltroEtapa(aba.id)}
            style={{
              padding: '0.5rem 0.85rem',
              borderRadius: '8px',
              border: filtroEtapa === aba.id ? '1px solid #ff5722' : '1px solid #e2e8f0',
              background: filtroEtapa === aba.id ? '#fff7ed' : '#fff',
              color: filtroEtapa === aba.id ? '#ea580c' : '#475569',
              fontWeight: '600',
              fontSize: '0.82rem',
              cursor: 'pointer'
            }}
          >
            {aba.label}
          </button>
        ))}
      </div>

      {/* Filtro Secundário por Momento da Aplicação */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
        <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#64748b', marginRight: '0.25rem' }}>Momento:</span>
        {[
          { id: 'TODOS', label: 'Todos os Momentos' },
          { id: 'Coffee', label: '☕ Coffee' },
          { id: 'Almoço', label: '🍽️ Almoço' },
          { id: 'Janta', label: '🌙 Janta' },
          { id: 'OUTRO', label: '✨ Outro Momento' }
        ].map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setFiltroMomento(m.id)}
            style={{
              padding: '0.35rem 0.7rem',
              borderRadius: '999px',
              border: filtroMomento === m.id ? '1px solid #0f172a' : '1px solid #e2e8f0',
              background: filtroMomento === m.id ? '#0f172a' : '#fff',
              color: filtroMomento === m.id ? '#fff' : '#475569',
              fontWeight: '600',
              fontSize: '0.78rem',
              cursor: 'pointer'
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Tabela de Fichas */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <tr>
              <th style={{ padding: '0.9rem 1rem', color: '#475569', fontSize: '0.82rem' }}>ID</th>
              <th style={{ padding: '0.9rem 1rem', color: '#475569', fontSize: '0.82rem' }}>Nome Completo</th>
              <th style={{ padding: '0.9rem 1rem', color: '#475569', fontSize: '0.82rem' }}>Empresa / CNPJ</th>
              <th style={{ padding: '0.9rem 1rem', color: '#475569', fontSize: '0.82rem' }}>WhatsApp</th>
              <th style={{ padding: '0.9rem 1rem', color: '#475569', fontSize: '0.82rem' }}>Momento</th>
              <th style={{ padding: '0.9rem 1rem', color: '#475569', fontSize: '0.82rem' }}>Almoço</th>
              <th style={{ padding: '0.9rem 1rem', color: '#475569', fontSize: '0.82rem' }}>Etapa Atual</th>
              <th style={{ padding: '0.9rem 1rem', color: '#475569', fontSize: '0.82rem', textAlign: 'right' }}>PDF</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr><td colSpan="8" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Carregando fichas...</td></tr>
            ) : fichasFiltradas.length === 0 ? (
              <tr><td colSpan="8" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Nenhuma ficha encontrada para este filtro.</td></tr>
            ) : (
              fichasFiltradas.map((f) => {
                const fichaId = f.id || f.cliente_id;
                const almocoOk = f.almoco_pago || f.cortesia_almoco || f.membro_giants;
                return (
                  <tr key={fichaId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.9rem 1rem', color: '#ff5722', fontWeight: '700' }}>#{fichaId}</td>
                    <td style={{ padding: '0.9rem 1rem', fontWeight: '600', color: '#1e293b' }}>
                      {f.nome_participante || f.nome || f.nome_completo}
                      {f.nome_cracha && (
                        <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', background: '#f1f5f9', padding: '0.2rem 0.4rem', borderRadius: '4px', color: '#475569' }}>
                          Crachá: {f.nome_cracha}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.9rem 1rem', color: '#475569' }}>
                      <div>{f.empresa || '-'}</div>
                      {(f.cnpj || f.cpf_cnpj) && <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{f.cnpj || f.cpf_cnpj}</div>}
                    </td>
                    <td style={{ padding: '0.9rem 1rem', color: '#475569' }}>{f.telefone || f.whatsapp || '-'}</td>
                    <td style={{ padding: '0.9rem 1rem' }}>
                      {f.momento_aplicacao ? (
                        <span style={{
                          padding: '0.22rem 0.55rem',
                          borderRadius: '6px',
                          fontSize: '0.74rem',
                          fontWeight: '700',
                          background: String(f.momento_aplicacao).toLowerCase().includes('coffee')
                            ? '#fef3c7'
                            : String(f.momento_aplicacao).toLowerCase().includes('almo')
                              ? '#dcfce7'
                              : String(f.momento_aplicacao).toLowerCase().includes('janta')
                                ? '#e0e7ff'
                                : '#f1f5f9',
                          color: String(f.momento_aplicacao).toLowerCase().includes('coffee')
                            ? '#92400e'
                            : String(f.momento_aplicacao).toLowerCase().includes('almo')
                              ? '#166534'
                              : String(f.momento_aplicacao).toLowerCase().includes('janta')
                                ? '#3730a3'
                                : '#334155'
                        }}>
                          {f.momento_aplicacao}
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>-</span>
                      )}
                    </td>
                    <td style={{ padding: '0.9rem 1rem' }}>
                      <span style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '6px',
                        fontSize: '0.74rem',
                        fontWeight: '700',
                        background: almocoOk ? '#dcfce7' : '#f1f5f9',
                        color: almocoOk ? '#15803d' : '#64748b'
                      }}>
                        {f.membro_giants ? 'GIANTS' : f.cortesia_almoco ? 'Cortesia' : f.almoco_pago ? 'Pago' : 'Pendente'}
                      </span>
                    </td>
                    <td style={{ padding: '0.9rem 1rem' }}>{renderBadgeEtapa(obterEtapaReal(f))}</td>
                    <td style={{ padding: '0.9rem 1rem', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => navigate(`/ficha-pdf/${fichaId}`)}
                        title="Abrir ficha para impressão / PDF"
                        style={{
                          padding: '0.35rem 0.65rem',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          background: '#fff',
                          color: '#0f172a',
                          fontWeight: '600',
                          fontSize: '0.78rem',
                          cursor: 'pointer'
                        }}
                      >
                        Ver PDF
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
  );
}
