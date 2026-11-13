import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useTurma } from '../context/TurmaContext';

const ROTAS_SISTEMA = {
  "companies": "/companies",
  "lunch": "/lunch",
  "interviews": "/interviews",
  "interviewEdit": "/interviews/:id/edit",
  "approvals": "/approvals",
  "warRoom": "/war-room",
  "cohorts": "/admin/cohorts"
};

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

const isCadastradoGiants = (p) =>
  Boolean(p.membro_giants) || String(p.origem || '').trim().toUpperCase() === 'GIANTS';

export default function Home() {
  const navigate = useNavigate();
  const { turmaSelecionada, turmaAtual, turmaEncerrada, isAdmin } = useTurma();

  const [clientes, setClientes] = useState([]);
  const [mesas, setMesas] = useState([]);
  const [propostas, setPropostas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [buscaRapida, setBuscaRapida] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [atualizadoEm, setAtualizadoEm] = useState(null);

  const carregarCockpit = useCallback(async (silencioso = false) => {
    try {
      if (!silencioso) setCarregando(true);
      setErro('');
      const tId = turmaSelecionada || localStorage.getItem('turma_ativa_id') || '1491';

      const [cliRes, auxRes, propRes] = await Promise.all([
        api.get(`/clientes?turmaId=${tId}`),
        api.get(`/auxiliares?turmaId=${tId}`).catch(() => ({ mesas: [] })),
        api.get(`/financeiro/propostas?turmaId=${tId}`).catch(() => [])
      ]);

      setClientes(Array.isArray(cliRes) ? cliRes : cliRes?.clientes || []);
      setMesas(Array.isArray(auxRes?.mesas) ? auxRes.mesas : []);
      setPropostas(Array.isArray(propRes) ? propRes : propRes?.propostas || []);
      setAtualizadoEm(new Date());
    } catch (err) {
      setErro(err.message || 'Erro ao carregar indicadores operacionais.');
    } finally {
      if (!silencioso) setCarregando(false);
    }
  }, [turmaSelecionada]);

  useEffect(() => {
    if (turmaSelecionada) {
      carregarCockpit(false);
    }
  }, [turmaSelecionada, carregarCockpit]);

  useEffect(() => {
    if (!autoRefresh || !turmaSelecionada) return;
    const timer = setInterval(() => carregarCockpit(true), 15000);
    return () => clearInterval(timer);
  }, [autoRefresh, turmaSelecionada, carregarCockpit]);

  const abrirFichaEmpresa = (idFicha) => {
    if (ROTAS_SISTEMA.interviewEdit && ROTAS_SISTEMA.interviewEdit.includes(':id')) {
      navigate(ROTAS_SISTEMA.interviewEdit.replace(':id', String(idFicha)));
    } else {
      navigate(ROTAS_SISTEMA.companies);
    }
  };

  // Consolidação operacional por Empresa (CNPJ) da turma selecionada
  const resumoSalao = useMemo(() => {
    const gruposMap = new Map();
    let giantsPresentes = 0;

    for (const c of clientes) {
      if (isCadastradoGiants(c)) {
        giantsPresentes += 1;
        continue;
      }

      const chave = normalizarChaveEmpresa(c);
      if (!gruposMap.has(chave)) {
        gruposMap.set(chave, {
          chave,
          idPrincipal: c.id,
          empresa: c.empresa || 'Empresa sem nome',
          cnpj: c.cnpj || c.cpf_cnpj || '',
          titular: c.nome_participante || c.nome || 'Participante',
          membros: [],
          almocoPago: false,
          cortesia: false,
          mesaAlocada: null,
          fechada: false,
          etapaFunil: c.etapa_funil || 'novo',
          statusAprovacao: c.status_aprovacao || '',
          updatedAt: c.updated_at || null
        });
      }

      const g = gruposMap.get(chave);
      g.membros.push(c);
      if (Boolean(c.almoco_pago) || Number(c.valor_almoco || 0) > 0) g.almocoPago = true;
      if (Boolean(c.cortesia_almoco)) g.cortesia = true;
      if (c.mesa_alocada !== null && c.mesa_alocada !== undefined) g.mesaAlocada = c.mesa_alocada;
      if (
        Boolean(c.ficha_fechada) ||
        ['aguardando_aprovacao', 'fechamento', 'concluido', 'reprovado'].includes(
          String(c.etapa_funil || '').toLowerCase()
        )
      ) {
        g.fechada = true;
      }
      if (c.status_aprovacao) g.statusAprovacao = c.status_aprovacao;
      if (c.updated_at && (!g.updatedAt || new Date(c.updated_at) > new Date(g.updatedAt))) {
        g.updatedAt = c.updated_at;
      }
    }

    const empresasElegiveis = Array.from(gruposMap.values());
    const fichasPreenchidas = empresasElegiveis.filter((e) => e.almocoPago || e.cortesia);
    const aguardandoMesa = fichasPreenchidas.filter((e) => !e.fechada && e.mesaAlocada === null);
    const emAtendimentoMesa = empresasElegiveis.filter((e) => !e.fechada && e.mesaAlocada !== null);

    const mesasOcupadas = mesas.filter((m) => Number(m.ocupantes || 0) > 0).length;
    const assentosOcupados = mesas.reduce((acc, m) => acc + Number(m.ocupantes || 0), 0);

    const propPendentes = propostas.filter(
      (p) => !p.status_aprovacao || String(p.status_aprovacao).toLowerCase() === 'pendente'
    );
    const propAlertas = propostas.filter((p) =>
      ['recusada', 'recusado', 'negado', 'aprovada_com_ressalva'].includes(
        String(p.status_aprovacao || '').toLowerCase()
      )
    );

    const ultimasMovimentacoes = [...empresasElegiveis]
      .filter((e) => e.almocoPago || e.cortesia || e.fechada || e.mesaAlocada !== null)
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
      .slice(0, 7);

    return {
      totalAlunosLinhas: clientes.length,
      giantsPresentes,
      totalEmpresasElegiveis: empresasElegiveis.length,
      fichasPreenchidasQtd: fichasPreenchidas.length,
      aguardandoMesa,
      emAtendimentoMesaQtd: emAtendimentoMesa.length,
      mesasTotal: mesas.length,
      mesasOcupadas,
      assentosOcupados,
      propPendentesQtd: propPendentes.length,
      propAlertas,
      empresasElegiveis,
      ultimasMovimentacoes
    };
  }, [clientes, mesas, propostas]);

  // Busca global instantânea por empresa, CNPJ ou participante
  const resultadosBusca = useMemo(() => {
    const q = buscaRapida.trim().toLowerCase();
    if (!q) return [];
    const qDigits = q.replace(/\D/g, '');

    return resumoSalao.empresasElegiveis
      .filter((g) => {
        const matchEmp = String(g.empresa || '').toLowerCase().includes(q);
        const matchCnpj = qDigits.length >= 3 && String(g.cnpj || '').replace(/\D/g, '').includes(qDigits);
        const matchMembro = g.membros.some((m) =>
          String(m.nome_participante || m.nome || '').toLowerCase().includes(q)
        );
        return matchEmp || matchCnpj || matchMembro;
      })
      .slice(0, 8);
  }, [buscaRapida, resumoSalao.empresasElegiveis]);

  const atalhosRapidos = [
    {
      titulo: 'Base de Empresas',
      subtitulo: 'Check-in de almoço (R$ 1.000 / Cortesia) e abertura de fichas',
      icone: 'domain',
      cor: '#ff5722',
      bgIcone: '#fff7ed',
      rota: ROTAS_SISTEMA.companies,
      badge: `${resumoSalao.fichasPreenchidasQtd} fichas liberadas`
    },
    {
      titulo: 'Salão de Lunch',
      subtitulo: 'Alocar casais/sócios nas mesas e acompanhar ocupação ao vivo',
      icone: 'table_restaurant',
      cor: '#0369a1',
      bgIcone: '#f0f9ff',
      rota: ROTAS_SISTEMA.lunch,
      badge: `${resumoSalao.aguardandoMesa.length} aguardando mesa`
    },
    {
      titulo: 'Entrevistas & Fechamento',
      subtitulo: 'Conduzir negociação comercial, cashback e emissão de proposta',
      icone: 'assignment',
      cor: '#7c3aed',
      bgIcone: '#f5f3ff',
      rota: ROTAS_SISTEMA.interviews,
      badge: `${resumoSalao.emAtendimentoMesaQtd} em mesa agora`
    },
    {
      titulo: 'Aprovações (Financeiro)',
      subtitulo: 'Análise de crédito/Serasa, aprovação de contratos e CSV',
      icone: 'verified',
      cor: '#059669',
      bgIcone: '#f0fdf4',
      rota: ROTAS_SISTEMA.approvals,
      badge: `${resumoSalao.propPendentesQtd} pendente(s)`
    },
    {
      titulo: 'War Room Executivo',
      subtitulo: 'Placar Caixa vs. Competência, GIANTS/PAC e Panorama PDF',
      icone: 'monitoring',
      cor: '#0f172a',
      bgIcone: '#f1f5f9',
      rota: ROTAS_SISTEMA.warRoom,
      badge: 'Tempo real'
    }
  ];

  if (isAdmin) {
    atalhosRapidos.push({
      titulo: 'Turmas & Eventos',
      subtitulo: 'Ativar/encerrar edições, configurar metas e mesas do salão',
      icone: 'event_available',
      cor: '#b45309',
      bgIcone: '#fffbeb',
      rota: ROTAS_SISTEMA.cohorts,
      badge: 'Administração'
    });
  }

  return (
    <div style={{ padding: '1.75rem 2rem', width: '100%', boxSizing: 'border-box' }}>
      {/* 1. FAIXA DE STATUS DA TURMA + BUSCA GLOBAL INSTANTÂNEA */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          borderRadius: '16px',
          padding: '1.5rem 1.75rem',
          color: '#ffffff',
          marginBottom: '1.5rem',
          boxShadow: '0 10px 25px rgba(15, 23, 42, 0.14)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.15rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span
                style={{
                  background: turmaEncerrada ? '#475569' : '#ff5722',
                  color: '#ffffff',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '6px',
                  fontSize: '0.72rem',
                  fontWeight: '800',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase'
                }}
              >
                {turmaEncerrada ? 'Turma Encerrada (Consulta)' : '● Operação Ao Vivo'}
              </span>
              {turmaAtual?.codigo && (
                <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#fb923c' }}>
                  {turmaAtual.codigo} • ID #{turmaAtual.id}
                </span>
              )}
              {atualizadoEm && (
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  • Sincronizado às {atualizadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
            </div>

            <h1 style={{ margin: '0.35rem 0 0', fontSize: '1.55rem', fontWeight: '800', color: '#ffffff' }}>
              {turmaAtual?.nome || 'Cockpit Operacional do Evento'}
            </h1>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.84rem', color: '#cbd5e1' }}>
              {resumoSalao.totalAlunosLinhas} participantes inscritos • {resumoSalao.totalEmpresasElegiveis} empresas elegíveis • {resumoSalao.giantsPresentes} membros GIANTS na turma
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <button
              type="button"
              onClick={() => setAutoRefresh((v) => !v)}
              style={{
                background: autoRefresh ? 'rgba(34, 197, 94, 0.16)' : 'rgba(255, 255, 255, 0.08)',
                color: autoRefresh ? '#86efac' : '#cbd5e1',
                border: autoRefresh ? '1px solid rgba(134, 239, 172, 0.4)' : '1px solid rgba(255,255,255,0.15)',
                padding: '0.48rem 0.85rem',
                borderRadius: '8px',
                fontSize: '0.78rem',
                fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              {autoRefresh ? '● Auto-sync 15s' : '○ Pausado'}
            </button>

            <button
              type="button"
              onClick={() => carregarCockpit(false)}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                color: '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                padding: '0.48rem 0.9rem',
                borderRadius: '8px',
                fontSize: '0.78rem',
                fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              Atualizar
            </button>
          </div>
        </div>

        {/* CAMPO DE BUSCA GLOBAL INSTANTÂNEA */}
        <div style={{ position: 'relative' }}>
          <span
            className="material-symbols-outlined"
            style={{ position: 'absolute', left: '14px', top: '12px', color: '#64748b', fontSize: '1.25rem' }}
          >
            search
          </span>
          <input
            type="text"
            value={buscaRapida}
            onChange={(e) => setBuscaRapida(e.target.value)}
            placeholder="Busca rápida na turma: digite o nome da empresa, CNPJ ou nome do participante..."
            style={{
              width: '100%',
              padding: '0.75rem 2.5rem 0.75rem 2.75rem',
              borderRadius: '10px',
              border: 'none',
              background: '#ffffff',
              color: '#0f172a',
              fontSize: '0.92rem',
              fontWeight: '600',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
          {buscaRapida && (
            <button
              type="button"
              onClick={() => setBuscaRapida('')}
              style={{
                position: 'absolute',
                right: '12px',
                top: '10px',
                background: '#f1f5f9',
                border: 'none',
                borderRadius: '6px',
                padding: '0.2rem 0.5rem',
                fontWeight: '800',
                color: '#475569',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>
          )}

          {/* RESULTADOS INSTANTÂNEOS DA BUSCA */}
          {buscaRapida.trim().length > 0 && (
            <div
              style={{
                marginTop: '0.6rem',
                background: '#ffffff',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                color: '#0f172a',
                overflow: 'hidden',
                boxShadow: '0 12px 28px rgba(0, 0, 0, 0.25)'
              }}
            >
              {resultadosBusca.length === 0 ? (
                <div style={{ padding: '0.9rem 1.1rem', fontSize: '0.84rem', color: '#64748b' }}>
                  Nenhuma empresa ou participante encontrado para "{buscaRapida}" nesta turma.
                </div>
              ) : (
                resultadosBusca.map((item) => (
                  <div
                    key={item.chave}
                    style={{
                      padding: '0.75rem 1.1rem',
                      borderBottom: '1px solid #f1f5f9',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '0.75rem',
                      flexWrap: 'wrap'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '800', fontSize: '0.9rem', color: '#0f172a' }}>
                        {item.empresa}{' '}
                        {item.cnpj && (
                          <span style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace', fontWeight: '600' }}>
                            ({item.cnpj})
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.76rem', color: '#475569' }}>
                        {item.membros.map((m) => m.nome_participante || m.nome).join(' • ')}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          padding: '0.2rem 0.55rem',
                          borderRadius: '6px',
                          fontSize: '0.72rem',
                          fontWeight: '800',
                          background: item.almocoPago ? '#dcfce7' : item.cortesia ? '#fef3c7' : '#f1f5f9',
                          color: item.almocoPago ? '#166534' : item.cortesia ? '#92400e' : '#475569'
                        }}
                      >
                        {item.almocoPago ? 'Almoço Pago' : item.cortesia ? 'Cortesia' : 'Almoço Pendente'}
                      </span>

                      {item.mesaAlocada !== null && (
                        <span style={{ padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '800', background: '#e0f2fe', color: '#0369a1' }}>
                          Mesa {item.mesaAlocada}
                        </span>
                      )}

                      {item.fechada && (
                        <span style={{ padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '800', background: '#0f172a', color: '#fb923c' }}>
                          Ficha Encerrada
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => abrirFichaEmpresa(item.idPrincipal)}
                        style={{
                          background: '#ff5722',
                          color: '#ffffff',
                          border: 'none',
                          padding: '0.35rem 0.75rem',
                          borderRadius: '6px',
                          fontSize: '0.76rem',
                          fontWeight: '800',
                          cursor: 'pointer'
                        }}
                      >
                        Abrir Ficha
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {erro && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '0.85rem 1rem', borderRadius: '10px', marginBottom: '1.25rem', fontWeight: '600' }}>
          {erro}
        </div>
      )}

      {/* 2. QUATRO INDICADORES DE FLUXO DO SALÃO */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem', marginBottom: '1.5rem', width: '100%' }}>
        <div
          onClick={() => navigate(ROTAS_SISTEMA.companies)}
          style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1.2rem', cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>
              Fichas Preenchidas (Almoço)
            </span>
            <span className="material-symbols-outlined" style={{ color: '#ff5722', fontSize: '1.3rem' }}>assignment_turned_in</span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: '900', color: '#0f172a', marginTop: '0.3rem' }}>
            {carregando ? '...' : resumoSalao.fichasPreenchidasQtd}
            <span style={{ fontSize: '0.95rem', fontWeight: '700', color: '#64748b' }}>
              {' '}/ {resumoSalao.totalEmpresasElegiveis}
            </span>
          </div>
          <div style={{ fontSize: '0.76rem', color: '#475569', marginTop: '0.2rem' }}>
            Almoço pago ou cortesia (exclui GIANTS)
          </div>
        </div>

        <div
          onClick={() => navigate(ROTAS_SISTEMA.lunch)}
          style={{
            background: resumoSalao.aguardandoMesa.length > 0 ? '#fff7ed' : '#ffffff',
            border: resumoSalao.aguardandoMesa.length > 0 ? '1.5px solid #fdba74' : '1px solid #e2e8f0',
            borderRadius: '14px',
            padding: '1.2rem',
            cursor: 'pointer'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: '800', color: '#c2410c', textTransform: 'uppercase' }}>
              Fila do Salão (Sem Mesa)
            </span>
            <span className="material-symbols-outlined" style={{ color: '#ea580c', fontSize: '1.3rem' }}>hourglass_top</span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: '900', color: '#ff5722', marginTop: '0.3rem' }}>
            {carregando ? '...' : resumoSalao.aguardandoMesa.length}
          </div>
          <div style={{ fontSize: '0.76rem', color: '#9a3412', marginTop: '0.2rem', fontWeight: '600' }}>
            Liberados no almoço aguardando alocação
          </div>
        </div>

        <div
          onClick={() => navigate(ROTAS_SISTEMA.lunch)}
          style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1.2rem', cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: '800', color: '#0369a1', textTransform: 'uppercase' }}>
              Ocupação das Mesas
            </span>
            <span className="material-symbols-outlined" style={{ color: '#0284c7', fontSize: '1.3rem' }}>table_restaurant</span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: '900', color: '#0f172a', marginTop: '0.3rem' }}>
            {carregando ? '...' : resumoSalao.mesasOcupadas}
            <span style={{ fontSize: '0.95rem', fontWeight: '700', color: '#64748b' }}>
              {' '}/ {resumoSalao.mesasTotal} mesas
            </span>
          </div>
          <div style={{ fontSize: '0.76rem', color: '#475569', marginTop: '0.2rem' }}>
            {resumoSalao.assentosOcupados} participante(s) sentado(s) agora
          </div>
        </div>

        <div
          onClick={() => navigate(ROTAS_SISTEMA.approvals)}
          style={{
            background: resumoSalao.propAlertas.length > 0 ? '#fef2f2' : '#ffffff',
            border: resumoSalao.propAlertas.length > 0 ? '1.5px solid #fca5a5' : '1px solid #e2e8f0',
            borderRadius: '14px',
            padding: '1.2rem',
            cursor: 'pointer'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: '800', color: '#047857', textTransform: 'uppercase' }}>
              Fila do Financeiro
            </span>
            <span className="material-symbols-outlined" style={{ color: '#059669', fontSize: '1.3rem' }}>verified</span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: '900', color: '#059669', marginTop: '0.3rem' }}>
            {carregando ? '...' : resumoSalao.propPendentesQtd}
            <span style={{ fontSize: '0.88rem', fontWeight: '700', color: '#64748b' }}> em análise</span>
          </div>
          <div style={{ fontSize: '0.76rem', color: resumoSalao.propAlertas.length > 0 ? '#b91c1c' : '#475569', marginTop: '0.2rem', fontWeight: resumoSalao.propAlertas.length > 0 ? '800' : '500' }}>
            {resumoSalao.propAlertas.length > 0
              ? `⚠ ${resumoSalao.propAlertas.length} proposta(s) recusada/com ressalva`
              : 'Nenhuma pendência crítica de crédito'}
          </div>
        </div>
      </div>

      {/* 3. ATALHOS RÁPIDOS DE 1 CLIQUE */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: '800', color: '#0f172a', margin: '0 0 0.85rem' }}>
          Acesso Rápido por Frente de Operação
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.9rem' }}>
          {atalhosRapidos.map((card) => (
            <button
              key={card.titulo}
              type="button"
              onClick={() => navigate(card.rota)}
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '13px',
                padding: '1.05rem 1.15rem',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '0.65rem',
                boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: card.bgIcone,
                    color: card.cor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '1.3rem' }}>{card.icone}</span>
                </div>
                <span style={{ fontSize: '0.72rem', fontWeight: '800', color: card.cor, background: card.bgIcone, padding: '0.2rem 0.55rem', borderRadius: '6px' }}>
                  {card.badge}
                </span>
              </div>

              <div>
                <div style={{ fontSize: '0.98rem', fontWeight: '800', color: '#0f172a' }}>{card.titulo}</div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.2rem', lineHeight: 1.35 }}>
                  {card.subtitulo}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 4. RADAR DE AÇÃO IMEDIATA (FILA DE MESA + ALERTAS DO FINANCEIRO / ÚLTIMAS MOVIMENTAÇÕES) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem' }}>
        {/* COLUNA ESQUERDA: LIBERADOS NO ALMOÇO AGUARDANDO MESA */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1.3rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: '800', color: '#0f172a' }}>
              Liberados no Almoço Aguardando Mesa ({resumoSalao.aguardandoMesa.length})
            </h3>
            <button
              type="button"
              onClick={() => navigate(ROTAS_SISTEMA.lunch)}
              style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fdba74', padding: '0.32rem 0.7rem', borderRadius: '7px', fontSize: '0.75rem', fontWeight: '800', cursor: 'pointer' }}
            >
              Ir para Salão →
            </button>
          </div>

          {resumoSalao.aguardandoMesa.length === 0 ? (
            <p style={{ fontSize: '0.84rem', color: '#64748b', margin: 0 }}>
              Nenhuma empresa liberada aguardando mesa no momento.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              {resumoSalao.aguardandoMesa.slice(0, 7).map((item) => (
                <div
                  key={item.chave}
                  style={{
                    border: '1px solid #f1f5f9',
                    background: '#f8fafc',
                    borderRadius: '9px',
                    padding: '0.7rem 0.85rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.65rem'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: '800', fontSize: '0.88rem', color: '#0f172a' }}>{item.empresa}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      {item.titular} {item.membros.length > 1 ? `(+ ${item.membros.length - 1} sócio)` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: '800',
                        padding: '0.18rem 0.5rem',
                        borderRadius: '5px',
                        background: item.almocoPago ? '#dcfce7' : '#fef3c7',
                        color: item.almocoPago ? '#166534' : '#92400e'
                      }}
                    >
                      {item.almocoPago ? 'Pago' : 'Cortesia'}
                    </span>
                    <button
                      type="button"
                      onClick={() => navigate(ROTAS_SISTEMA.lunch)}
                      style={{ background: '#0f172a', color: '#fff', border: 'none', padding: '0.32rem 0.65rem', borderRadius: '6px', fontSize: '0.74rem', fontWeight: '700', cursor: 'pointer' }}
                    >
                      Alocar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* COLUNA DIREITA: ALERTAS DO FINANCEIRO & ÚLTIMAS MOVIMENTAÇÕES */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1.3rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: '800', color: '#0f172a' }}>
              Alertas do Financeiro & Últimas Movimentações
            </h3>
            <button
              type="button"
              onClick={() => navigate(ROTAS_SISTEMA.approvals)}
              style={{ background: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1', padding: '0.32rem 0.7rem', borderRadius: '7px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer' }}
            >
              Ver Fila →
            </button>
          </div>

          {resumoSalao.propAlertas.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.85rem' }}>
              {resumoSalao.propAlertas.map((alerta) => {
                const isRecusada = ['recusada', 'recusado', 'negado'].includes(
                  String(alerta.status_aprovacao || '').toLowerCase()
                );
                return (
                  <div
                    key={alerta.id}
                    style={{
                      background: isRecusada ? '#fef2f2' : '#fffbeb',
                      border: isRecusada ? '1px solid #fecaca' : '1px solid #fde68a',
                      borderRadius: '9px',
                      padding: '0.7rem 0.85rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '0.6rem'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: '800', color: isRecusada ? '#b91c1c' : '#b45309', textTransform: 'uppercase' }}>
                        {isRecusada ? '⚠ Crédito Recusado — Abordar Empresa' : '⚠ Aprovado com Ressalva'}
                      </div>
                      <div style={{ fontWeight: '800', fontSize: '0.88rem', color: '#0f172a' }}>{alerta.empresa}</div>
                      {alerta.parecer_financeiro && (
                        <div style={{ fontSize: '0.74rem', color: '#475569' }}>{alerta.parecer_financeiro}</div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => abrirFichaEmpresa(alerta.id)}
                      style={{ background: isRecusada ? '#dc2626' : '#d97706', color: '#fff', border: 'none', padding: '0.35rem 0.7rem', borderRadius: '6px', fontSize: '0.74rem', fontWeight: '800', cursor: 'pointer' }}
                    >
                      Ver Ficha
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {resumoSalao.ultimasMovimentacoes.length === 0 ? (
            <p style={{ fontSize: '0.84rem', color: '#64748b', margin: 0 }}>
              Nenhuma movimentação registrada nesta turma ainda.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {resumoSalao.ultimasMovimentacoes.map((mov) => (
                <div
                  key={mov.chave}
                  style={{
                    border: '1px solid #f1f5f9',
                    borderRadius: '8px',
                    padding: '0.62rem 0.85rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: '800', fontSize: '0.85rem', color: '#0f172a' }}>{mov.empresa}</div>
                    <div style={{ fontSize: '0.73rem', color: '#64748b' }}>{mov.titular}</div>
                  </div>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: '800',
                      padding: '0.2rem 0.55rem',
                      borderRadius: '6px',
                      background: mov.fechada ? '#dcfce7' : mov.mesaAlocada !== null ? '#e0f2fe' : '#fff7ed',
                      color: mov.fechada ? '#166534' : mov.mesaAlocada !== null ? '#0369a1' : '#c2410c'
                    }}
                  >
                    {mov.fechada
                      ? 'Ficha Finalizada'
                      : mov.mesaAlocada !== null
                      ? `Na Mesa ${mov.mesaAlocada}`
                      : 'Almoço Liberado'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
