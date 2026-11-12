import { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import { useTurma } from '../context/TurmaContext';
import { useNavigate } from 'react-router-dom';

const normalizarChaveEmpresa = (emp) => {
  const cnpjDigits = String(emp.cnpj || emp.cpf_cnpj || '').replace(/\D/g, '');
  if (cnpjDigits.length >= 11) return `cnpj:${cnpjDigits}`;
  const empNorm = String(emp.empresa || emp.razao_social || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (empNorm && empNorm !== 'empresa sga' && empNorm !== 'sem empresa' && empNorm !== 'empresa não informada') {
    return `emp:${empNorm}`;
  }
  return `id:${emp.id}`;
};

export default function Companies() {
  const { turmaSelecionada } = useTurma();
  const [participantes, setParticipantes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [filtroAlmoco, setFiltroAlmoco] = useState('todos'); // 'todos' | 'pagos' | 'giants' | 'cortesia' | 'pendentes'
  const [pagina, setPagina] = useState(1);
  const itensPorPagina = 60;
  const navigate = useNavigate();

  // Modal Unificado da Empresa (Sócios não-GIANTS + Pagamento + Checklist de Participantes no Almoço)
  const [modalEmpresaAberto, setModalEmpresaAberto] = useState(false);
  const [grupoAlvo, setGrupoAlvo] = useState(null);
  const [tipoAlmoco, setTipoAlmoco] = useState('pago');
  const [cvCartao, setCvCartao] = useState('');
  const [sociosSelecionadosAlmoco, setSociosSelecionadosAlmoco] = useState([]);
  const [salvandoAlmoco, setSalvandoAlmoco] = useState(false);

  const carregarDados = async () => {
    try {
      setCarregando(true);
      setErro('');
      const dados = await api.get(`/clientes?turmaId=${turmaSelecionada || localStorage.getItem('turma_ativa_id') || '1491'}`);
      const lista = Array.isArray(dados) ? dados : dados.clientes || [];
      setParticipantes(lista);
    } catch (err) {
      setErro(err.message || 'Erro ao carregar dados de empresas.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    if (turmaSelecionada) carregarDados();
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
          cnpj: p.cnpj || p.cpf_cnpj || '',
          todosMembros: [itemNorm]
        });
      } else {
        const g = mapa.get(chave);
        g.todosMembros.push(itemNorm);
        if (!g.cnpj && (p.cnpj || p.cpf_cnpj)) {
          g.cnpj = p.cnpj || p.cpf_cnpj;
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
        const apenasGiants = sociosNaoGiants.length === 0 && sociosGiants.length > 0;

        const participantesAlmoco = sociosNaoGiants.filter((m) => Boolean(m.almoco_pago || m.cortesia_almoco));
        const alocadosMesa = participantesAlmoco.filter((m) => Boolean(m.mesa_alocada));
        const paganteComCv = sociosNaoGiants.find((m) => m.cv_cartao);

        return {
          ...g,
          idPrincipal: titular.id,
          titular,
          sociosNaoGiants,
          sociosGiants,
          algumPago,
          algumCortesia,
          apenasGiants,
          isPendente: !apenasGiants && !algumPago && !algumCortesia,
          participantesAlmoco,
          alocadosMesa,
          cvCartao: paganteComCv?.cv_cartao || ''
        };
      })
      .sort((a, b) => a.empresa.localeCompare(b.empresa, 'pt-BR', { sensitivity: 'base' }));
  }, [participantes]);

  const empresasFiltradas = gruposEmpresas.filter((g) => {
    const termo = (busca || '').toLowerCase().trim();
    const matchTermo =
      !termo ||
      g.empresa.toLowerCase().includes(termo) ||
      String(g.cnpj || '').toLowerCase().includes(termo) ||
      String(g.idPrincipal).includes(termo) ||
      g.todosMembros.some((m) => m.nomeExibicao.toLowerCase().includes(termo));

    if (!matchTermo) return false;

    if (filtroAlmoco === 'pagos') return g.algumPago;
    if (filtroAlmoco === 'giants') return g.apenasGiants || g.sociosGiants.length > 0;
    if (filtroAlmoco === 'cortesia') return g.algumCortesia;
    if (filtroAlmoco === 'pendentes') return g.isPendente;
    return true;
  });

  const totalPagos = gruposEmpresas.filter((g) => g.algumPago).length;
  const totalGiants = gruposEmpresas.filter((g) => g.apenasGiants || g.sociosGiants.length > 0).length;
  const totalCortesia = gruposEmpresas.filter((g) => g.algumCortesia).length;
  const totalPendentes = gruposEmpresas.filter((g) => g.isPendente).length;

  const totalPaginas = Math.ceil(empresasFiltradas.length / itensPorPagina) || 1;
  const indiceInicial = (pagina - 1) * itensPorPagina;
  const empresasExibidas = empresasFiltradas.slice(indiceInicial, indiceInicial + itensPorPagina);

  // Abre o modal consolidado da empresa mostrando os sócios não-GIANTS e o checklist do almoço
  const abrirModalEmpresa = (grupo) => {
    setGrupoAlvo(grupo);

    if (grupo.apenasGiants) {
      setTipoAlmoco('giants');
    } else if (grupo.algumCortesia) {
      setTipoAlmoco('cortesia');
    } else {
      setTipoAlmoco('pago');
    }

    setCvCartao(grupo.cvCartao || '');

    // Pré-seleciona no checklist quem já está marcado para o almoço ou, se ainda pendente, todos os sócios não-GIANTS
    const jaMarcados = grupo.sociosNaoGiants
      .filter((m) => Boolean(m.almoco_pago || m.cortesia_almoco))
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
      alert('Erro ao salvar validação de almoço da empresa: ' + err.message);
    } finally {
      setSalvandoAlmoco(false);
    }
  };

  const obterEstagioGrupo = (g) => {
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

    const qtdNoAlmoco = g.participantesAlmoco.length;
    let rotuloAlmoco = g.algumPago
      ? `● Pago R$ 1.000 (${qtdNoAlmoco} ${qtdNoAlmoco === 1 ? 'sócio' : 'sócios'})`
      : `● Cortesia (${qtdNoAlmoco} ${qtdNoAlmoco === 1 ? 'sócio' : 'sócios'})`;

    if (g.algumPago && g.cvCartao) {
      rotuloAlmoco = `● Pago ${g.cvCartao} (${qtdNoAlmoco} ${qtdNoAlmoco === 1 ? 'sócio' : 'sócios'})`;
    }

    const bgAlmoco = g.algumPago ? '#dcfce7' : '#e0f2fe';
    const corAlmoco = g.algumPago ? '#15803d' : '#0369a1';

    if (g.alocadosMesa.length === 0) {
      return {
        passo: 2,
        rotuloAlmoco,
        bgAlmoco,
        corAlmoco,
        rotuloMesa: `⚠️ Alocar Lunch (${qtdNoAlmoco})`,
        bgMesa: '#fff7ed',
        corMesa: '#c2410c',
        podeEntrevista: false
      };
    }

    const mesasUnicas = [...new Set(g.alocadosMesa.map((m) => `Mesa ${m.mesa_alocada}`))].join(', ');
    return {
      passo: 3,
      rotuloAlmoco,
      bgAlmoco,
      corAlmoco,
      rotuloMesa: `${mesasUnicas} (${g.alocadosMesa.length}/${qtdNoAlmoco})`,
      bgMesa: '#eff6ff',
      corMesa: '#1d4ed8',
      podeEntrevista: true
    };
  };

  return (
    <div style={{ padding: '2rem', width: '100%', boxSizing: 'border-box' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
            Base de Empresas — Fluxo Pré-Entrevista
          </h1>
          <p style={{ color: '#64748b', margin: '0.25rem 0 0', fontSize: '0.9rem' }}>
            1. Clicar na Empresa e Validar Almoço (Checklist de Sócios) → 2. Alocar na Mesa → 3. Entrevista por CNPJ
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span style={{ background: '#e0f2fe', color: '#0284c7', padding: '0.45rem 0.85rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: '700' }}>
            {empresasFiltradas.length} Empresas (CNPJs)
          </span>
          <button
            onClick={() => navigate('/lunch')}
            style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#0284c7' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>restaurant</span>
            Ver Salão de Lunch
          </button>
          <button
            onClick={carregarDados}
            style={{ background: '#fff', border: '1px solid #cbd5e1', padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#334155' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>refresh</span>
            Atualizar
          </button>
        </div>
      </div>

      {erro && (
        <div style={{ background: '#fef2f2', color: '#ef4444', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #fecaca' }}>
          {erro}
        </div>
      )}

      {/* Barra de Pesquisa e Filtro */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '300px', background: '#fff', padding: '0.85rem 1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '0.75rem', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
          <span className="material-symbols-outlined" style={{ color: '#94a3b8' }}>search</span>
          <input
            type="text"
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setPagina(1); }}
            placeholder="Pesquisar por Razão Social, Nome do Sócio, CNPJ ou ID..."
            style={{ width: '100%', border: 'none', outline: 'none', fontSize: '0.95rem', color: '#1e293b' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <select
            id="selectFiltroAlmoco"
            value={filtroAlmoco}
            onChange={(e) => { setFiltroAlmoco(e.target.value); setPagina(1); }}
            style={{
              padding: '0.85rem 1.25rem',
              borderRadius: '12px',
              border: '1px solid #cbd5e1',
              background: '#fff',
              fontSize: '0.9rem',
              fontWeight: '700',
              color: '#0f172a',
              cursor: 'pointer',
              outline: 'none',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              minWidth: '250px'
            }}
          >
            <option value="todos">📋 Todas as Empresas ({gruposEmpresas.length})</option>
            <option value="pagos">💰 Almoço Pago ({totalPagos})</option>
            <option value="giants">⚡ Com Membro GIANTS ({totalGiants})</option>
            <option value="cortesia">🎁 Cortesia ({totalCortesia})</option>
            <option value="pendentes">⏳ Pendente ({totalPendentes})</option>
          </select>
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
                        onClick={() => abrirModalEmpresa(g)}
                        title="Clique para abrir os sócios da empresa e configurar o almoço"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', cursor: 'pointer' }}
                      >
                        <span style={{ fontWeight: '800', color: '#0f172a', fontSize: '0.92rem' }}>
                          {g.empresa}
                            {Number(g.cashbackTotalCnpj || 0) > 0 && (
                              <span
                                title={g.historicoUpgradeCnpj ? `Inclui upgrade 90%: ${g.historicoUpgradeCnpj}` : 'Crédito de Almoço Pago'}
                                style={{
                                  background: '#ecfdf5',
                                  color: '#047857',
                                  border: '1px solid #6ee7b7',
                                  padding: '0.15rem 0.5rem',
                                  borderRadius: '6px',
                                  fontSize: '0.72rem',
                                  fontWeight: '800',
                                  marginLeft: '0.45rem',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.2rem'
                                }}
                              >
                                Cashback: {Number(g.cashbackTotalCnpj).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </span>
                            )}
                        </span>
                        {g.sociosNaoGiants.length > 1 && (
                          <span style={{ fontSize: '0.72rem', fontWeight: '700', background: '#e0e7ff', color: '#3730a3', padding: '0.15rem 0.5rem', borderRadius: '999px' }}>
                            {g.sociosNaoGiants.length} sócios elegíveis
                          </span>
                        )}
                        {g.sociosGiants.length > 0 && (
                          <span style={{ fontSize: '0.72rem', fontWeight: '700', background: '#f3e8ff', color: '#7e22ce', padding: '0.15rem 0.5rem', borderRadius: '999px' }}>
                            {g.sociosGiants.length} GIANTS
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem' }}>
                        {g.sociosNaoGiants.length > 0 ? (
                          <span>
                            <strong>Sócios:</strong>{' '}
                            {g.sociosNaoGiants.map((s, i) => {
                              const vaiAlmoco = Boolean(s.almoco_pago || s.cortesia_almoco);
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
                    </td>

                    <td style={{ padding: '1rem', color: '#64748b', fontSize: '0.85rem', fontFamily: 'monospace' }}>
                      {g.cnpj || '-'}
                    </td>

                    {/* 1. Almoço */}
                    <td style={{ padding: '1rem' }}>
                      <button
                        onClick={() => abrirModalEmpresa(g)}
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
                        <span className="material-symbols-outlined" style={{ fontSize: '0.85rem' }}>edit</span>
                      </button>
                    </td>

                    {/* 2. Mesa Lunch */}
                    <td style={{ padding: '1rem' }}>
                      {estagio.passo === 1 ? (
                        <button
                          onClick={() => abrirModalEmpresa(g)}
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
                          title="Abrir Salão de Lunch para alocar cadeiras dos sócios confirmados"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>table_restaurant</span>
                          {estagio.rotuloMesa}
                        </button>
                      )}
                    </td>

                    {/* 3. Entrevista */}
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      {g.apenasGiants ? (
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
                          onClick={() => abrirModalEmpresa(g)}
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
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Isenção autorizada pela diretoria comercial</div>
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
              {(tipoAlmoco === 'pago' || tipoAlmoco === 'cortesia') && grupoAlvo.sociosNaoGiants.length > 0 && (
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
                    Apenas os sócios marcados abaixo terão acesso liberado para ocupar cadeiras no Salão de Lunch (exibe apenas sócios da turma que não são GIANTS).
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
    </div>
  );
}