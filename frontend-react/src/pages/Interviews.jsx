import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../services/api';
import { useTurma } from '../context/TurmaContext';

const normalizarChaveEmpresa = (empresa, cnpj, fallbackId, extra = {}) => {
  const isGiant = Boolean(extra?.membro_giants) || String(extra?.origem || '').toUpperCase().includes('GIAN');
  if (isGiant) {
    return `giants:id:${fallbackId}`;
  }
  const cnpjDigits = String(cnpj || '').replace(/\D/g, '');
  if (cnpjDigits.length === 14) return `cnpj:${cnpjDigits}`;
  const empNorm = String(empresa || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (empNorm && empNorm !== 'empresa sga' && empNorm !== 'sem empresa') {
    return `emp:${empNorm}`;
  }
  return `id:${fallbackId}`;
};

const isAprovadaOuConcluida = (c) => {
  if (!c) return false;
  const stAprov = String(c.status_aprovacao || '').trim().toLowerCase();
  const etapa = String(c.etapa_funil || '').trim().toLowerCase();
  return (
    ['aprovada', 'aprovado', 'aprovada_com_ressalva'].includes(stAprov) ||
    ['fechamento', 'concluido', 'concluida', 'vendido'].includes(etapa)
  );
};

export default function Interviews() {
  const navigate = useNavigate();
  const location = useLocation();
  const [avisoRetornoFicha, setAvisoRetornoFicha] = useState(() => location.state?.fichaFinalizada || null);
  const { turmaSelecionada } = useTurma();
  const [sessoes, setSessoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [abaFiltro, setAbaFiltro] = useState('ATIVAS');
  const [erro, setErro] = useState('');
  const [modalReabrirEmpresa, setModalReabrirEmpresa] = useState(null);
  const [motivoReabrir, setMotivoReabrir] = useState('');
  const [reabrindo, setReabrindo] = useState(false);
  const [retomandoId, setRetomandoId] = useState(null);

  const sessaoOperador = (() => {
    try {
      return JSON.parse(localStorage.getItem('sessao_operador') || 'null');
    } catch (_) {
      return null;
    }
  })();
  const isAdmin = ['ADMIN', 'ADMINISTRADOR', 'SYSTEM'].includes(
    String(sessaoOperador?.usuario?.papel || '').toUpperCase()
  );

  const carregarSessoes = async () => {
    try {
      setCarregando(true);
      setErro('');
      const turmaAtiva = turmaSelecionada || localStorage.getItem('turma_ativa_id') || '1491';
      const [aux, clientes] = await Promise.all([
        api.get(`/auxiliares?turmaId=${turmaAtiva}`),
        api.get(`/clientes?turmaId=${turmaAtiva}`).catch(() => [])
      ]);
      const listaClientes = Array.isArray(clientes) ? clientes : (clientes?.data || []);
      const mesas = aux.mesas || [];
      const gruposPorEmpresa = new Map();

      // 1. Mapeia empresas atualmente alocadas em mesas físicas
      mesas.forEach((m) => {
        (m.ocupantes_detalhes || []).forEach((det, idx) => {
          let nome = 'Participante';
          let nomeCracha = '';
          let entrevistaId = idx + 1;
          let empresa = 'Empresa SGA';
          let statusAlmoco = 'Pendente';

          if (typeof det === 'object' && det !== null) {
            nome = det.nome || det.cliente_nome || nome;
            nomeCracha = det.nome_cracha || '';
            entrevistaId = det.entrevista_id || det.id || entrevistaId;
            statusAlmoco = det.status_almoco || statusAlmoco;
            if (det.empresa) empresa = det.empresa;
          }

          const cliRef = listaClientes.find(
            (c) =>
              String(c.id) === String(entrevistaId) ||
              (c.nome_participante && c.nome_participante.toLowerCase() === nome.toLowerCase())
          );

          const isGiants =
            Boolean(det?.membro_giants) ||
            String(det?.origem || '').toUpperCase().includes('GIAN') ||
            Boolean(cliRef?.membro_giants) ||
            String(cliRef?.origem || '').toUpperCase().includes('GIAN');

          if (isGiants) return;
          if (cliRef?.ficha_fechada) return;

          const cnpjReal = cliRef?.cnpj || cliRef?.cpf_cnpj || '';
          const empresaRealTmp = cliRef?.empresa || empresa;
          const chaveTmp = normalizarChaveEmpresa(empresaRealTmp, cnpjReal, entrevistaId);
          const empresaJaAprovadaMesa = listaClientes.some(
            (s) => normalizarChaveEmpresa(s.empresa, s.cnpj || s.cpf_cnpj, s.id) === chaveTmp && isAprovadaOuConcluida(s)
          );
          if (empresaJaAprovadaMesa) return;
          const empresaReal = cliRef?.empresa || empresa;
          const almocoLiberado = Boolean(cliRef?.almoco_pago || cliRef?.cortesia_almoco) ? 'Pago / Liberado' : statusAlmoco;
          const chave = normalizarChaveEmpresa(empresaReal, cnpjReal, entrevistaId);

          if (!gruposPorEmpresa.has(chave)) {
            const todosSociosTurma = listaClientes
              .filter((c) => !c.membro_giants && normalizarChaveEmpresa(c.empresa, c.cnpj || c.cpf_cnpj, c.id) === chave)
              .map((c) => ({
                id: c.id,
                nome: c.nome_participante || c.nome_cracha || 'Sócio',
                cargo: c.cargo || 'Sócio'
              }));

            gruposPorEmpresa.set(chave, {
              id: entrevistaId,
              mesaNumero: m.numero,
              empresa: empresaReal,
              cnpj: cnpjReal,
              titularNome: nome,
              titularCracha: nomeCracha,
              etapa: cliRef?.etapa_funil || 'em_entrevista',
              fichaFechada: Boolean(cliRef?.ficha_fechada),
              statusAprovacao: cliRef?.status_aprovacao || '',
              statusAlmoco: almocoLiberado,
              sociosMesa: [{ id: entrevistaId, nome, nomeCracha }],
              todosSociosTurma
            });
          } else {
            const grupo = gruposPorEmpresa.get(chave);
            if (!grupo.sociosMesa.some((s) => String(s.id) === String(entrevistaId))) {
              grupo.sociosMesa.push({ id: entrevistaId, nome, nomeCracha });
            }
          }
        });
      });

      // 2. Inclui empresas cujas fichas foram encerradas (mesa já liberada, aguardando financeiro)
      listaClientes.forEach((c) => {
        if (c.membro_giants) return;
        if (isAprovadaOuConcluida(c)) return;
        const etapaNorm = String(c.etapa_funil || '').trim().toLowerCase();
        const isAjuste = String(c.status_aprovacao || '').toLowerCase() === 'ajuste_solicitado';
        const fechada =
          isAjuste ||
          Boolean(c.ficha_fechada) ||
          ['aguardando_aprovacao', 'decisao_futura', 'nao_fechou', 'reprovado', 'reprovada'].includes(etapaNorm);
        if (!fechada) return;

        const cnpjReal = c.cnpj || c.cpf_cnpj || '';
        const empresaReal = c.empresa || c.nome_participante || 'Empresa SGA';
        const chave = normalizarChaveEmpresa(empresaReal, cnpjReal, c.id);

        const empresaJaAprovada = listaClientes.some(
          (s) => normalizarChaveEmpresa(s.empresa, s.cnpj || s.cpf_cnpj, s.id) === chave && isAprovadaOuConcluida(s)
        );
        if (empresaJaAprovada) return;

        if (!gruposPorEmpresa.has(chave)) {
          const todosSociosTurma = listaClientes
            .filter((s) => !s.membro_giants && normalizarChaveEmpresa(s.empresa, s.cnpj || s.cpf_cnpj, s.id) === chave)
            .map((s) => ({
              id: s.id,
              nome: s.nome_participante || s.nome_cracha || 'Sócio',
              cargo: s.cargo || 'Sócio'
            }));

          const titularRef = todosSociosTurma.find((s) => s.cargo === 'Sócio Titular') || todosSociosTurma[0] || { id: c.id, nome: c.nome_participante };

          gruposPorEmpresa.set(chave, {
            id: titularRef.id,
            mesaNumero: null,
            empresa: empresaReal,
            cnpj: cnpjReal,
            titularNome: titularRef.nome,
            titularCracha: c.nome_cracha || '',
            etapa: c.etapa_funil || 'aguardando_aprovacao',
            fichaFechada: String(c.status_aprovacao || '').toLowerCase() !== 'ajuste_solicitado' && Boolean(c.ficha_fechada),
            statusAprovacao: c.status_aprovacao || 'pendente',
            statusAlmoco: Boolean(c.almoco_pago || c.cortesia_almoco) ? 'Pago / Liberado' : 'Pendente',
            sociosMesa: [],
            todosSociosTurma
          });
        }
      });

      setSessoes(Array.from(gruposPorEmpresa.values()));
    } catch (err) {
      setErro(err.message || 'Erro ao carregar sessões de entrevistas.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarSessoes();
  }, [turmaSelecionada]);

  const abrirModalReabertura = (s) => {
    setMotivoReabrir('');
    setModalReabrirEmpresa(s);
  };

  const confirmarReaberturaEmpresa = async () => {
    if (!modalReabrirEmpresa) return;
    try {
      setReabrindo(true);
      await api.post(`/entrevistas/${modalReabrirEmpresa.id}/reabrir`, {
        motivo: motivoReabrir.trim() || 'Ajuste comercial solicitado pelo Administrador'
      });
      setModalReabrirEmpresa(null);
      await carregarSessoes();
    } catch (err) {
      setErro(`Erro ao reabrir ficha: ${err.message}`);
      setModalReabrirEmpresa(null);
    } finally {
      setReabrindo(false);
    }
  };

  const isDecisaoFuturaItem = (s) =>
    String(s?.etapa || '').trim().toLowerCase() === 'decisao_futura';

  const isNaoFechouItem = (s) =>
    ['reprovado', 'reprovada', 'nao_fechou', 'sem_interesse'].includes(
      String(s?.etapa || '').trim().toLowerCase()
    );

  const isAguardandoFinItem = (s) =>
    Boolean(s?.fichaFechada) && !isDecisaoFuturaItem(s) && !isNaoFechouItem(s);

  const retomarDecisaoFutura = async (s) => {
    try {
      setRetomandoId(s.id);
      await api.post(`/entrevistas/${s.id}/reabrir`, {
        motivo: 'Retomada de atendimento (Decisão Futura / Follow-up)'
      });
      navigate(`/interviews/${s.id}/edit`);
    } catch (err) {
      setErro(`Erro ao retomar atendimento: ${err.message}`);
    } finally {
      setRetomandoId(null);
    }
  };

  const contadoresAbas = {
    ATIVAS: sessoes.filter((s) => !s.fichaFechada).length,
    DECISAO_FUTURA: sessoes.filter((s) => isDecisaoFuturaItem(s)).length,
    ENCERRADAS: sessoes.filter((s) => isAguardandoFinItem(s)).length,
    NAO_FECHOU: sessoes.filter((s) => isNaoFechouItem(s)).length,
    TODAS: sessoes.length
  };

  const sessoesFiltradas = sessoes.filter((s) => {
    if (abaFiltro === 'ATIVAS' && s.fichaFechada) return false;
    if (abaFiltro === 'DECISAO_FUTURA' && !isDecisaoFuturaItem(s)) return false;
    if (abaFiltro === 'ENCERRADAS' && !isAguardandoFinItem(s)) return false;
    if (abaFiltro === 'NAO_FECHOU' && !isNaoFechouItem(s)) return false;

    const q = busca.toLowerCase();
    const matchSocio =
      s.sociosMesa.some((soc) => soc.nome.toLowerCase().includes(q)) ||
      s.todosSociosTurma.some((soc) => soc.nome.toLowerCase().includes(q));
    return (
      matchSocio ||
      s.empresa.toLowerCase().includes(q) ||
      String(s.cnpj || '').toLowerCase().includes(q) ||
      String(s.mesaNumero || '').includes(q) ||
      String(s.id).includes(q)
    );
  });

  return (
    <div style={{ padding: '2rem', width: '100%', boxSizing: 'border-box' }}>

      {avisoRetornoFicha && (
        <div
          style={{
            background: '#f0fdf4',
            border: '1px solid #86efac',
            color: '#166534',
            padding: '0.85rem 1.15rem',
            borderRadius: '10px',
            marginBottom: '1.1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            fontSize: '0.88rem',
            fontWeight: 700
          }}
        >
          <span>
            ✓ Ficha finalizada: <strong>{avisoRetornoFicha.empresa}</strong>
            {avisoRetornoFicha.resultado ? ` (${avisoRetornoFicha.resultado})` : ''}
          </span>
          <button
            type="button"
            onClick={() => setAvisoRetornoFicha(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#166534',
              fontWeight: 800,
              cursor: 'pointer',
              fontSize: '0.95rem'
            }}
          >
            ✕
          </button>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
            Entrevistas por Empresa (CNPJ)
          </h1>
          <p style={{ color: '#64748b', margin: '0.25rem 0 0', fontSize: '0.9rem' }}>
            Ao finalizar a entrevista, a mesa é liberada automaticamente e a ficha segue fechada para o Financeiro
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '0.3rem', background: '#f1f5f9', padding: '0.25rem', borderRadius: '10px' }}>
            {[
              { id: 'ATIVAS', label: 'Na Mesa (Em Entrevista)', corAtiva: '#ff5722' },
              { id: 'DECISAO_FUTURA', label: 'Decisão Futura (Follow-up)', corAtiva: '#2563eb' },
              { id: 'ENCERRADAS', label: 'Aguardando Financeiro', corAtiva: '#d97706' },
              { id: 'NAO_FECHOU', label: 'Não Fechou', corAtiva: '#475569' },
              { id: 'TODAS', label: 'Todas', corAtiva: '#0f172a' }
            ].map((tab) => {
              const ativo = abaFiltro === tab.id;
              const qtd = contadoresAbas[tab.id] ?? 0;
              return (
                <button
                  key={tab.id}
                  onClick={() => setAbaFiltro(tab.id)}
                  style={{
                    border: 'none',
                    background: ativo ? tab.corAtiva : 'transparent',
                    color: ativo ? '#fff' : '#64748b',
                    padding: '0.45rem 0.85rem',
                    borderRadius: '8px',
                    fontWeight: '700',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}
                >
                  <span>{tab.label}</span>
                  <span
                    style={{
                      background: ativo ? 'rgba(255,255,255,0.22)' : '#e2e8f0',
                      color: ativo ? '#fff' : '#334155',
                      padding: '0.08rem 0.42rem',
                      borderRadius: '999px',
                      fontSize: '0.7rem',
                      fontWeight: '800'
                    }}
                  >
                    {qtd}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            onClick={carregarSessoes}
            style={{ background: '#fff', border: '1px solid #cbd5e1', padding: '0.5rem 0.9rem', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#334155', fontSize: '0.82rem' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>refresh</span>
            Atualizar
          </button>
        </div>
      </div>

      {erro && (
        <div style={{ background: '#fef2f2', color: '#ef4444', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #fecaca' }}>
          {erro}
        </div>
      )}

      {/* Busca */}
      <div style={{ background: '#fff', padding: '1rem 1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
        <div style={{ position: 'relative' }}>
          <span className="material-symbols-outlined" style={{ position: 'absolute', left: '12px', top: '10px', color: '#94a3b8', fontSize: '1.2rem' }}>search</span>
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Pesquisar por empresa, CNPJ, sócio ou número de mesa..."
            style={{ width: '100%', padding: '0.65rem 0.65rem 0.65rem 2.5rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      {/* Tabela */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <tr>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.82rem' }}>Ficha CNPJ</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.82rem' }}>Mesa</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.82rem' }}>Empresa / Sócios Vinculados</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.82rem' }}>Status / Etapa</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.82rem' }}>Almoço</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.82rem', textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr><td colSpan="6" style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>Carregando empresas...</td></tr>
            ) : sessoesFiltradas.length === 0 ? (
              <tr><td colSpan="6" style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>Nenhuma empresa encontrada neste filtro.</td></tr>
            ) : (
              sessoesFiltradas.map((s) => {
                const outrosSocios = (s.todosSociosTurma.length > 0 ? s.todosSociosTurma : s.sociosMesa)
                  .filter((soc) => String(soc.id) !== String(s.id));
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '1rem' }}>
                      <span
                        onClick={() => navigate(`/interviews/${s.id}/edit`)}
                        style={{ fontWeight: '800', color: '#ff5722', cursor: 'pointer' }}
                      >
                        #{s.id}
                      </span>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      {s.mesaNumero ? (
                        <span style={{ background: '#fff7ed', color: '#ea580c', border: '1px solid #fed7aa', padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700' }}>
                          Mesa {s.mesaNumero}
                        </span>
                      ) : (
                        <span style={{ background: '#f1f5f9', color: '#64748b', padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.73rem', fontWeight: '700' }}>
                          Mesa Liberada
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span
                          onClick={() => navigate(`/interviews/${s.id}/edit`)}
                          style={{ fontWeight: '800', color: '#0f172a', fontSize: '0.92rem', cursor: 'pointer' }}
                        >
                          {s.empresa}
                        </span>
                        {s.cnpj && (
                          <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', background: '#f1f5f9', color: '#475569', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                            CNPJ: {s.cnpj}
                          </span>
                        )}
                        {outrosSocios.length > 0 && (
                          <span style={{ fontSize: '0.72rem', fontWeight: '700', background: '#e0e7ff', color: '#3730a3', padding: '0.15rem 0.5rem', borderRadius: '999px' }}>
                            +{outrosSocios.length} {outrosSocios.length === 1 ? 'sócio' : 'sócios'}
                          </span>
                        )}
                      </div>
                      <div style={{ color: '#475569', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                        <strong>Titular:</strong> {s.titularNome}
                        {outrosSocios.length > 0 && (
                          <span style={{ color: '#64748b' }}>
                            {' '}• <strong>Sócios na turma:</strong> {outrosSocios.map((o) => o.nome).join(', ')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      {isDecisaoFuturaItem(s) ? (
                        <span style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '0.24rem 0.6rem', borderRadius: '6px', fontSize: '0.73rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          ⏳ Decisão Futura (Follow-up)
                        </span>
                      ) : isNaoFechouItem(s) ? (
                        <span style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '0.24rem 0.6rem', borderRadius: '6px', fontSize: '0.73rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          ✕ Não Fechou
                        </span>
                      ) : String(s.statusAprovacao || '').toLowerCase() === 'ajuste_solicitado' ? (
                        <span style={{ background: '#ffedd5', color: '#9a3412', border: '1.5px solid #fdba74', padding: '0.24rem 0.6rem', borderRadius: '6px', fontSize: '0.73rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          ↩ Ajuste Solicitado
                        </span>
                      ) : s.fichaFechada ? (
                        <span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', padding: '0.24rem 0.6rem', borderRadius: '6px', fontSize: '0.73rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          🔒 Aguardando Financeiro
                        </span>
                      ) : (
                        <span style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '0.24rem 0.6rem', borderRadius: '6px', fontSize: '0.73rem', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          ● Em Entrevista
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span
                        style={{
                          background: s.statusAlmoco === 'Pago / Liberado' ? '#dcfce7' : '#fee2e2',
                          color: s.statusAlmoco === 'Pago / Liberado' ? '#166534' : '#ef4444',
                          padding: '0.2rem 0.55rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: '700'
                        }}
                      >
                        {s.statusAlmoco}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.45rem', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
                        {isDecisaoFuturaItem(s) && (
                          <button
                            disabled={retomandoId === s.id}
                            onClick={() => retomarDecisaoFutura(s)}
                            title="Retomar negociação da ficha em Decisão Futura"
                            style={{
                              background: '#2563eb',
                              color: '#fff',
                              border: 'none',
                              padding: '0.42rem 0.78rem',
                              borderRadius: '6px',
                              fontSize: '0.76rem',
                              fontWeight: '700',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.3rem'
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }}>play_arrow</span>
                            {retomandoId === s.id ? 'Retomando...' : 'Retomar Atendimento'}
                          </button>
                        )}

                        {s.fichaFechada && !isDecisaoFuturaItem(s) && isAdmin && (
                          <button
                            onClick={() => abrirModalReabertura(s)}
                            title="Reabrir ficha encerrada (Administrador)"
                            style={{
                              background: '#0f172a',
                              color: '#fff',
                              border: 'none',
                              padding: '0.42rem 0.75rem',
                              borderRadius: '6px',
                              fontSize: '0.76rem',
                              fontWeight: '700',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.3rem'
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }}>lock_open</span>
                            Reabrir
                          </button>
                        )}

                        <button
                          onClick={() => navigate(`/interviews/${s.id}/edit`)}
                          style={{
                            background: s.fichaFechada ? '#475569' : '#ff5722',
                            color: '#fff',
                            border: 'none',
                            padding: '0.45rem 0.85rem',
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                            fontWeight: '700',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem'
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>
                            {s.fichaFechada ? 'visibility' : 'business'}
                          </span>
                          {s.fichaFechada ? 'Ver Ficha Fechada' : 'Ficha da Empresa'}
                        </button>

                        <button
                          onClick={() => window.open(`/interviews/${s.id}/pdf`, '_blank')}
                          style={{
                            background: '#fff',
                            border: '1px solid #cbd5e1',
                            color: '#475569',
                            padding: '0.42rem 0.7rem',
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                            fontWeight: '700',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem'
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>picture_as_pdf</span>
                          PDF
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

      {/* MODAL DE REABERTURA DE FICHA NO PADRÃO DO SISTEMA (ADMIN) */}
      {modalReabrirEmpresa && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <div style={{ background: '#ffffff', borderRadius: '14px', maxWidth: '460px', width: '100%', overflow: 'hidden', boxShadow: '0 20px 45px rgba(15, 23, 42, 0.22)', border: '1px solid #e2e8f0' }}>
            <div style={{ padding: '1.2rem 1.4rem', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#fff7ed', color: '#ff5722', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1.35rem' }}>lock_open</span>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#ff5722' }}>PERMISSÃO ADMINISTRADOR</div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>Reabrir Ficha Encerrada</h3>
              </div>
            </div>
            <div style={{ padding: '1.25rem 1.4rem' }}>
              <p style={{ fontSize: '0.84rem', color: '#475569', margin: '0 0 0.9rem 0' }}>
                Deseja destravar a ficha da empresa <strong>{modalReabrirEmpresa.empresa}</strong> para edição comercial?
              </p>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>
                Motivo da reabertura:
              </label>
              <textarea
                rows={3}
                value={motivoReabrir}
                onChange={(e) => setMotivoReabrir(e.target.value)}
                placeholder="Ex: Ajuste na condição de pagamento ou inclusão de sócio..."
                style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.84rem', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ padding: '0.85rem 1.4rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button
                type="button"
                onClick={() => setModalReabrirEmpresa(null)}
                style={{ background: '#fff', border: '1px solid #cbd5e1', color: '#475569', padding: '0.55rem 1rem', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '0.82rem' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={reabrindo}
                onClick={confirmarReaberturaEmpresa}
                style={{ background: '#ff5722', border: 'none', color: '#fff', padding: '0.55rem 1.15rem', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', fontSize: '0.82rem' }}
              >
                {reabrindo ? 'Reabrindo...' : 'Confirmar Reabertura'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}