import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';

export default function Lunch() {
  const [turmas, setTurmas] = useState([]);
  const [turmaSelecionada, setTurmaSelecionada] = useState(1);
  const [mesas, setMesas] = useState([]);
  const [clientesBase, setClientesBase] = useState([]);
  const [entrevistadores, setEntrevistadores] = useState([]);
  const [cortesiasLocais, setCortesiasLocais] = useState({}); // { [clienteId]: true }
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  // Filtros da barra lateral
  const [filtroParticipantes, setFiltroParticipantes] = useState('pendentes'); // 'pendentes' | 'sentados' | 'todos'
  const [termoBuscaLateral, setTermoBuscaLateral] = useState('');

  // SeleÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o para alocaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o
  const [clienteSelecionadoAlocacao, setClienteSelecionadoAlocacao] = useState(null);

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

      const [aux, clientesDados] = await Promise.all([
        api.get('/auxiliares'),
        api.get('/clientes?turmaId=1')
      ]);

      setTurmas(aux.turmas || []);
      setEntrevistadores(aux.entrevistadores || []);

      const listaClientes = Array.isArray(clientesDados) ? clientesDados : clientesDados.clientes || [];
      setClientesBase(listaClientes);

      const tId = aux.turmas?.[0]?.id || 1;
      setTurmaSelecionada(tId);

      const mesasFormatadas = (aux.mesas || []).map(m => {
        const ocupantesLista = [];
        (m.ocupantes_detalhes || []).forEach((det, idx) => {
          let nome = 'Participante';
          let nomeCracha = '';
          let entrevistaId = idx + 1;
          let aplicacaoId = null;
          let tipoParticipante = 'cliente';

          if (typeof det === 'string') {
            const mNome = det.match(/nome=([^;]+)/);
            const mCracha = det.match(/nome_cracha=([^;]+)/);
            const mId = det.match(/entrevista_id=([^;]+)/);
            const mAppId = det.match(/aplicacao_id=([^;]+)/);
            if (mNome) nome = mNome[1].trim();
            if (mCracha && mCracha[1].trim()) nomeCracha = mCracha[1].trim();
            if (mId) entrevistaId = mId[1].trim();
            if (mAppId) aplicacaoId = mAppId[1].trim();
          } else if (typeof det === 'object') {
            nome = det.nome || det.cliente_nome || nome;
            nomeCracha = det.nome_cracha || '';
            entrevistaId = det.entrevista_id || det.id || entrevistaId;
            aplicacaoId = det.aplicacao_id || det.cliente_id || null;
            tipoParticipante = det.tipo || 'cliente';
          }

          ocupantesLista.push({
            id: entrevistaId,
            aplicacaoId: aplicacaoId || entrevistaId,
            nome,
            nomeCracha: nomeCracha || nome.split(' ')[0],
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
          entrevistadoresEscalados = (aux.entrevistadores || []).filter(e => entrevistadoresIds.includes(e.id));
        }

        let entrevistadorNome = entrevistadoresEscalados.map(e => e.nome).join(', ') || null;
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
      setErro(err.message || 'Erro ao carregar salÃƒÆ’Ã‚Â£o.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, []);

  // ConsolidaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o dos Participantes e ClassificaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o das Regras de Almoço
  const idsSentados = new Set();
  mesas.forEach(m => {
    m.ocupantesLista.forEach(o => {
      idsSentados.add(String(o.aplicacaoId));
      idsSentados.add(String(o.id));
    });
  });

  const todosParticipantes = clientesBase.map(c => {
    const sentado = idsSentados.has(String(c.id)) || idsSentados.has(String(c.aplicacao_id));
    let mesaNumero = null;
    let entrevistaId = null;

    if (sentado) {
      for (const m of mesas) {
        const achou = m.ocupantesLista.find(o => String(o.aplicacaoId) === String(c.id) || String(o.id) === String(c.id));
        if (achou) {
          mesaNumero = m.numero;
          entrevistaId = achou.id;
          break;
        }
      }
    }

    // IdentificaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o de Membro Giants
    const isMembroGiants = (c.perfil || '').toLowerCase().includes('giants') || 
                           (c.tipo || '').toLowerCase().includes('giants') ||
                           c.perfil_giants === true;

    // Regra: Almoço Pago por Empresa (se empresa pagou R$ 1000 ou almoco_pago == true)
    const empresaPagou = c.almoco_pago === true || c.almoco_pago === 'sim' || Number(c.valor_almoco) >= 1000;

    // Cortesia Administrativa Concedida
    const temCortesia = cortesiasLocais[c.id] === true || c.cortesia === true;

    // CritÃƒÆ’Ã‚Â©rio Global de LiberaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o para AlmoÃƒÆ’Ã‚Â§ar
    const liberadoAlmoço = isMembroGiants || empresaPagou || temCortesia;

    let motivoLiberacao = 'Bloqueado';
    if (isMembroGiants) motivoLiberacao = 'Membro GIANTS';
    else if (temCortesia) motivoLiberacao = 'Cortesia';
    else if (empresaPagou) motivoLiberacao = 'Almoço Pago (R$ 1.000)';

    return {
      id: c.id,
      entrevistaId: entrevistaId || c.id,
      nome: c.nome || c.nome_completo || 'Participante',
      empresa: c.empresa || c.razao_social || 'Empresa SGA',
      isMembroGiants,
      empresaPagou,
      temCortesia,
      liberadoAlmoço,
      motivoLiberacao,
      sentado,
      mesaNumero
    };
  });

  const participantesFiltrados = todosParticipantes.filter(p => {
    const matchTermo = p.nome.toLowerCase().includes(termoBuscaLateral.toLowerCase()) ||
                       p.empresa.toLowerCase().includes(termoBuscaLateral.toLowerCase());
    if (!matchTermo) return false;

    if (filtroParticipantes === 'pendentes') return !p.sentado;
    if (filtroParticipantes === 'sentados') return p.sentado;
    return true;
  });

    // Marcar Almoço Pago R$ 1.000 para toda a empresa
  const marcarEmpresaAlmoço = async (participante, e) => {
    e.stopPropagation();
    const cv = prompt(`Confirmar pagamento de R$ 1.000,00 de almoÃƒÂ§o para a empresa "${participante.empresa}"?\n\nInforme o cÃƒÂ³digo/comprovante (CV) ou PIX:`, 'PIX-1000');
    if (cv === null) return; // cancelou

    try {
      // Atualiza a empresa como almoÃƒÂ§o pago via API
      await api.patch(`/clientes/${participante.id}`, {
        almoco_pago: true,
        cv_almoco: cv,
        valor_almoco: 1000
      });

      alert(`Almoço confirmado para ${participante.empresa}! Todos os sÃƒÂ³cios e acompanhantes foram liberados.`);
      carregarDados();
    } catch (err) {
      // Fallback otimista local
      setClientesBase(prev => prev.map(c => {
        if (c.empresa === participante.empresa || c.id === participante.id) {
          return { ...c, almoco_pago: true, valor_almoco: 1000 };
        }
        return c;
      }));
      alert(`Almoço confirmado localmente para a empresa ${participante.empresa}!`);
    }
  };

  // Conceder ou Revogar Cortesia
  const alternarCortesia = (clienteId, e) => {
    e.stopPropagation();
    setCortesiasLocais(prev => ({
      ...prev,
      [clienteId]: !prev[clienteId]
    }));
  };

  // Alocar em Assento Livre (valida elegibilidade do almoÃƒÆ’Ã‚Â§o)
  const alocarEmAssentoLivre = async (mesaId) => {
    if (!clienteSelecionadoAlocacao) return;

    const almocoValido = Boolean(clienteSelecionadoAlocacao?.almoco_pago || clienteSelecionadoAlocacao?.cortesia || clienteSelecionadoAlocacao?.cortesia_almoco || clienteSelecionadoAlocacao?.almoco_liberado);
    if (!almocoValido) {
      alert(`O participante ${clienteSelecionadoAlocacao?.nome_cracha || clienteSelecionadoAlocacao?.nome_completo || clienteSelecionadoAlocacao?.nome || "Participante"} nÃƒÆ’Ã‚Â£o possui almoÃƒÆ’Ã‚Â§o liberado.\nConceda uma cortesia ou confirme o pagamento de R$ 1.000,00 da empresa.`);
      return;
    }

    try {
      await api.post('/entrevistas/agendar', {
        aplicacaoId: Number(clienteSelecionadoAlocacao.id),
        mesaId: Number(mesaId)
      });
      setClienteSelecionadoAlocacao(null);
      carregarDados();
    } catch (err) {
      alert('Erro ao alocar assento: ' + err.message);
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
    const proximoNum = mesas.length > 0 ? Math.max(...mesas.map(m => Number(m.numero) || 0)) + 1 : 1;
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
      setMesas(prev => prev.map(m => m.id === mesa.id ? { ...m, capacidade_total: novaCap } : m));
    } catch (e) {
      setMesas(prev => prev.map(m => m.id === mesa.id ? { ...m, capacidade_total: novaCap } : m));
    }
  };

  
  const alternarEntrevistadorMesa = async (mesaId, entrevistadorId) => {
    const mesa = mesas.find(m => m.id === mesaId);
    if (!mesa) return;
    const atuais = mesa.entrevistadores_ids || [];
    const jaTem = atuais.includes(entrevistadorId);
    const novosIds = jaTem ? atuais.filter(id => id !== entrevistadorId) : [...atuais, entrevistadorId];

    try {
      await api.patch(`/mesas/${mesaId}/entrevistadores`, {
        entrevistadores_ids: novosIds
      });

      const novosEscalados = entrevistadores.filter(e => novosIds.includes(e.id));
      const nomesStr = novosEscalados.map(e => e.nome).join(', ') || null;

      setMesas(prev => prev.map(m => {
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
      }));

      setModalMesaAberta(prev => prev && prev.id === mesaId ? {
        ...prev,
        entrevistadores_ids: novosIds,
        entrevistadores_escalados: novosEscalados,
        tem_entrevistador: novosIds.length > 0,
        entrevistadorNome: nomesStr
      } : prev);
    } catch (err) {
      alert('Erro ao atualizar entrevistadores da mesa: ' + err.message);
    }
  };

  const selecionarEntrevistadorParaMesa = alternarEntrevistadorMesa;

  const totalMesas = mesas.length;
  let totalCapacidade = 0;
  let totalOcupados = 0;

  mesas.forEach(m => {
    totalCapacidade += Number(m.capacidade_total || 5);
    const entrevistadorOcupa = m.tem_entrevistador ? 1 : 0;
    totalOcupados += (m.ocupantesLista.length + entrevistadorOcupa);
  });
  const lugaresLivres = Math.max(0, totalCapacidade - totalOcupados);

  const todasAsPessoasMesa = [];
  mesas.forEach(m => {
    if (m.tem_entrevistador) {
      todasAsPessoasMesa.push({
        id: `ent-${m.id}`,
        nome: `${m.entrevistadorNome || 'Entrevistador'} (Mesa ${m.numero})`,
        tipo: 'entrevistador',
        mesaId: m.id
      });
    }
    m.ocupantesLista.forEach(cli => {
      todasAsPessoasMesa.push({
        id: cli.id,
        nome: `${cli.nomeCracha || cli.nome} (Mesa ${m.numero})`,
        tipo: 'cliente',
        mesaId: m.id
      });
    });
  });

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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '600' }}>Turma:</span>
            <select
              value={turmaSelecionada}
              onChange={(e) => setTurmaSelecionada(Number(e.target.value))}
              style={{ padding: '0.4rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontWeight: '600', color: '#0f172a', fontSize: '0.85rem' }}
            >
              {turmas.map(t => (
                <option key={t.id} value={t.id}>{t.codigo} - {t.nome}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#fff7ed', border: '1px solid #fed7aa', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ea580c' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>wb_sunny</span>
        </div>
      </div>

      {/* Banner de Alocação Ativa */}
      {clienteSelecionadoAlocacao && (
        <div style={{ background: '#ff5722', color: '#fff', padding: '0.65rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, boxShadow: '0 2px 8px rgba(255, 87, 34, 0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.9rem', fontWeight: '700' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>ads_click</span>
            <span>
              Alocação: <u>{clienteSelecionadoAlocacao?.nome_cracha || clienteSelecionadoAlocacao?.nome_completo || clienteSelecionadoAlocacao?.nome || "Participante"}</u> ({clienteSelecionadoAlocacao.empresa}) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â <strong>Clique em um assento livre (+ Livre) de qualquer mesa no salÃƒÆ’Ã‚Â£o</strong>
            </span>
          </div>
          <button
            onClick={() => setClienteSelecionadoAlocacao(null)}
            style={{ background: '#fff', color: '#ff5722', border: 'none', padding: '0.35rem 0.85rem', borderRadius: '6px', fontWeight: '800', cursor: 'pointer', fontSize: '0.8rem' }}
          >
            Cancelar
          </button>
        </div>
      )}

      {/* ÃƒÆ’Ã‚Ârea Central: Sidebar Lateral Esquerda + Canvas do SalÃƒÆ’Ã‚Â£o */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        
        {/* Painel Esquerdo: Estrutura & Participantes */}
        <div style={{ width: '330px', minWidth: '330px', background: '#fff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', padding: '1.25rem', boxSizing: 'border-box', gap: '1.25rem', flexShrink: 0, overflowY: 'hidden' }}>
          
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
          </div>

          {/* SeÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o Participantes com Abas e Regras de Almoço */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: '#ea580c', flexShrink: 0 }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>group</span>
              <span style={{ fontSize: '0.9rem', fontWeight: '800', color: '#0f172a' }}>Participantes</span>
            </div>

            {/* Abas */}
            <div style={{ display: 'flex', gap: '0.25rem', background: '#f1f5f9', padding: '0.2rem', borderRadius: '8px', marginBottom: '0.75rem', flexShrink: 0 }}>
              {[
                { id: 'pendentes', label: 'Pendentes' },
                { id: 'sentados', label: 'Sentados' },
                { id: 'todos', label: 'Todos' }
              ].map(aba => (
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
                placeholder="Procurar participante ou mesa..."
                style={{ width: '100%', padding: '0.45rem 0.5rem 0.45rem 2rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.8rem', boxSizing: 'border-box' }}
              />
            </div>

            {/* Lista com ValidaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o de Almoço */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingRight: '0.25rem' }}>
              {participantesFiltrados.length === 0 ? (
                <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                  Nenhum participante encontrado.
                </div>
              ) : (
                participantesFiltrados.map((part) => {
                  const estaSelecionado = clienteSelecionadoAlocacao?.id === part.id;

                  return (
                    <div
                      key={part.id}
                      onClick={() => {
                        if (part.sentado) {
                          const mesa = mesas.find(m => m.numero === part.mesaNumero);
                          if (mesa) focarPessoaEMesa(part.entrevistaId, mesa.id);
                          return;
                        }

                        if (!part.liberadoAlmoço) {
                          alert(`Almoço Bloqueado para ${part.nome}.\nCritÃƒÆ’Ã‚Â©rio: R$ 1.000 pago por empresa, Cortesia ou Membro GIANTS.`);
                          return;
                        }

                        setClienteSelecionadoAlocacao(clienteSelecionadoAlocacao?.id === part.id ? null : part);
                      }}
                      style={{
                        background: estaSelecionado ? '#fff7ed' : '#f8fafc',
                        border: '2px solid',
                        borderColor: estaSelecionado ? '#ff5722' : '#e2e8f0',
                        borderRadius: '10px',
                        padding: '0.75rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.4rem',
                        cursor: part.sentado || part.liberadoAlmoço ? 'pointer' : 'default',
                        transition: 'all 0.15s ease',
                        boxShadow: estaSelecionado ? '0 0 10px rgba(255,87,34,0.3)' : 'none',
                        opacity: !part.liberadoAlmoço && !part.sentado ? 0.75 : 1
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ fontWeight: '700', fontSize: '0.85rem', color: estaSelecionado ? '#ea580c' : '#0f172a', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {part.nome}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {part.empresa}
                          </span>
                        </div>

                        {part.sentado ? (
                          <span
                            title="Clique para localizar no salÃƒÆ’Ã‚Â£o"
                            style={{
                              background: '#fff7ed',
                              color: '#ea580c',
                              border: '1px solid #fed7aa',
                              padding: '0.15rem 0.45rem',
                              borderRadius: '4px',
                              fontSize: '0.7rem',
                              fontWeight: '700',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.2rem'
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '0.8rem' }}>pin_drop</span>
                            Mesa {part.mesaNumero}
                          </span>
                        ) : (
                          <span style={{
                            background: estaSelecionado ? '#ff5722' : '#f1f5f9',
                            color: estaSelecionado ? '#fff' : '#64748b',
                            padding: '0.15rem 0.45rem',
                            borderRadius: '4px',
                            fontSize: '0.7rem',
                            fontWeight: '700'
                          }}>
                            {estaSelecionado ? 'Selecionado' : 'Sem mesa'}
                          </span>
                        )}
                      </div>

                      {/* Selos de ValidaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o do Almoço e BotÃƒÆ’Ã‚Â£o de Cortesia */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.2rem', paddingTop: '0.35rem', borderTop: '1px solid #f1f5f9' }}>
                        <span style={{
                          fontSize: '0.68rem',
                          fontWeight: '800',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '4px',
                          background: part.isMembroGiants ? '#fef3c7' : part.temCortesia ? '#e0f2fe' : part.empresaPagou ? '#dcfce7' : '#fee2e2',
                          color: part.isMembroGiants ? '#b45309' : part.temCortesia ? '#0284c7' : part.empresaPagou ? '#16a34a' : '#ef4444',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.2rem'
                        }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '0.8rem' }}>
                            {part.isMembroGiants ? 'stars' : part.temCortesia ? 'card_giftcard' : part.empresaPagou ? 'paid' : 'block'}
                          </span>
                          {part.motivoLiberacao}
                        </span>

                        {/* Ação Rápida de Cortesia */}
                        {!part.sentado && (
                          <button
                            onClick={(e) => alternarCortesia(part.id, e)}
                            title={part.temCortesia ? 'Remover Cortesia' : 'Conceder Almoço Cortesia'}
                            style={{
                              background: part.temCortesia ? '#fee2e2' : '#f8fafc',
                              color: part.temCortesia ? '#ef4444' : '#475569',
                              border: '1px solid #cbd5e1',
                              padding: '0.15rem 0.45rem',
                              borderRadius: '4px',
                              fontSize: '0.68rem',
                              fontWeight: '700',
                              cursor: 'pointer'
                            }}
                          >
                            {part.temCortesia ? 'Revogar Cortesia' : '+ Cortesia'}
                          </button>
                        )}

                        {!part.sentado && !part.empresaPagou && !part.membro_giants && !part.isMembroGiants && !part.isMembroGiants && (
                          <button
                            onClick={(e) => marcarEmpresaAlmoço(part, e)}
                            title="Registrar pagamento de R$ 1.000 para toda a empresa"
                            style={{
                              background: '#ecfdf5',
                              color: '#059669',
                              border: '1px solid #a7f3d0',
                              padding: '0.15rem 0.45rem',
                              borderRadius: '4px',
                              fontSize: '0.68rem',
                              fontWeight: '700',
                              cursor: 'pointer'
                            }}
                          >
                            + R$ 1.000 Pago
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* SalÃƒÆ’Ã‚Â£o de Mesas com Grid Pontilhado */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
          
          {/* Barra Superior do SalÃƒÆ’Ã‚Â£o */}
          <div style={{ padding: '0.85rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, background: '#fff', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: '0.95rem', fontWeight: '800', color: '#0f172a' }}>
              {totalMesas} Mesas • <span style={{ color: '#059669' }}>{lugaresLivres} Lugares Livres</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {/* Dropdown de Busca Direta */}
              <div style={{ position: 'relative', minWidth: '270px' }}>
                <select
                  value={destaquePessoaId || ''}
                  onChange={(e) => {
                    const idSelecionado = e.target.value;
                    if (!idSelecionado) return;
                    const item = todasAsPessoasMesa.find(p => String(p.id) === String(idSelecionado));
                    if (item) {
                      focarPessoaEMesa(item.id, item.mesaId);
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '0.5rem 1rem',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    background: '#fff',
                    fontSize: '0.85rem',
                    fontWeight: '600',
                    color: '#334155',
                    cursor: 'pointer',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                  }}
                >
<option value="">🔍 Localizar quem está na mesa...</option>
                  {todasAsPessoasMesa.map((p, idx) => (
                    <option key={idx} value={p.id}>
                      {p.tipo === 'entrevistador' ? 'ÃƒÂ°Ã…Â¸Ã…Â½Ã‚Â¤ ' : 'ÃƒÂ°Ã…Â¸Ã¢â‚¬ËœÃ‚Â¤ '} {p.nome}
                    </option>
                  ))}
                </select>
              </div>

              {/* Controles de Zoom */}
              <div style={{ display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '10px', overflow: 'hidden' }}>
                <button
                  onClick={() => setZoom(z => Math.max(50, z - 10))}
                  style={{ border: 'none', background: 'transparent', padding: '0.45rem 0.75rem', cursor: 'pointer', color: '#475569', fontWeight: '800' }}
                >
                  -
                </button>
                <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#334155', padding: '0 0.5rem' }}>{zoom}%</span>
                <button
                  onClick={() => setZoom(z => Math.min(160, z + 10))}
                  style={{ border: 'none', background: 'transparent', padding: '0.45rem 0.75rem', cursor: 'pointer', color: '#475569', fontWeight: '800' }}
                >
                  +
                </button>
                <button
                  onClick={() => { setZoom(100); setMesaFocadaId(null); setDestaquePessoaId(null); }}
                  style={{ borderLeft: '1px solid #cbd5e1', borderRight: 'none', borderTop: 'none', borderBottom: 'none', background: 'transparent', padding: '0.45rem 0.75rem', cursor: 'pointer', color: '#ea580c', fontWeight: '700', fontSize: '0.8rem' }}
                >
                  Reset
                </button>
              </div>
            </div>
          </div>

          {/* Canvas do SalÃƒÆ’Ã‚Â£o */}
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
                    ...mesa.ocupantesLista.map(c => ({ tipo: 'cliente', ...c })),
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
                        const angulo = anguloInicial + (idx * passo);

                        const x = Math.sin(angulo) * raio;
                        const y = Math.cos(angulo) * raio;

                        const destacado = String(destaquePessoaId) === String(assento.id);

                        if (assento.tipo === 'cliente') {
                          const isGiants = assento.tipoParticipante === 'giants';

                          return (
                            <div
                              key={assento.id}
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
                                  onClick={(e) => { e.stopPropagation(); removerParticipante(assento.id); }}
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
                        const estaAlocação = !!clienteSelecionadoAlocacao;

                        return (
                          <div
                            key={assento.id}
                            onClick={() => {
                              if (estaAlocação) {
                                alocarEmAssentoLivre(assento.mesaId);
                              }
                            }}
                            title={estaAlocação ? `Clique para sentar ${clienteSelecionadoAlocacao?.nome_cracha || clienteSelecionadoAlocacao?.nome_completo || clienteSelecionadoAlocacao?.nome || "Participante"} aqui` : 'Assento livre'}
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
                              className={estaAlocação ? 'assento-livre-alocavel' : ''}
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
                                {estaAlocação ? 'how_to_reg' : 'add'}
                              </span>
                            </div>
                            <span style={{ fontSize: '0.65rem', fontWeight: '700', color: estaAlocação ? '#059669' : '#94a3b8', marginTop: '0.2rem' }}>
                              {estaAlocação ? 'Ocupar' : 'Livre'}
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
                .filter(e => (e.nome || '').toLowerCase().includes(buscaEntrevistadorModal.toLowerCase()) || (e.email || '').toLowerCase().includes(buscaEntrevistadorModal.toLowerCase()))
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
                        <div style={{
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
                        }}>
                          {ent.nome.charAt(0)}
                        </div>
                        <div>
                          <div style={{ fontWeight: '700', fontSize: '0.85rem', color: '#0f172a' }}>{ent.nome}</div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{ent.email}</div>
                        </div>
                      </div>

                      <div style={{
                        padding: '0.25rem 0.6rem',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        background: jaSelecionado ? '#0284c7' : '#f1f5f9',
                        color: jaSelecionado ? '#fff' : '#64748b'
                      }}>
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
