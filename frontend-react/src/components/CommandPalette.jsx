import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useTurma } from '../context/TurmaContext';
import { toastSistema } from '../context/ModalContext';

const formatarCnpj = (valor) => {
  const digits = String(valor || '').replace(/\D/g, '');
  if (digits.length === 14) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  return '';
};

export default function CommandPalette({ aberto, aoFechar }) {
  const navigate = useNavigate();
  const { turmaSelecionada, isAdmin } = useTurma();
  const inputRef = useRef(null);

  const [busca, setBusca] = useState('');
  const [indiceSelecionado, setIndiceSelecionado] = useState(0);
  const [clientes, setClientes] = useState([]);
  const [propostas, setPropostas] = useState([]);
  const [carregandoDados, setCarregandoDados] = useState(false);

  const papelUsuario = (() => {
    try {
      const s = JSON.parse(localStorage.getItem('sessao_operador') || '{}');
      return String(s?.usuario?.papel || s?.papel || '').toUpperCase();
    } catch (_) {
      return '';
    }
  })();
  const isFinanceiro = papelUsuario === 'FINANCEIRO';

  useEffect(() => {
    if (!aberto) return;
    setBusca('');
    setIndiceSelecionado(0);
    setTimeout(() => inputRef.current?.focus(), 30);

    const carregar = async () => {
      try {
        setCarregandoDados(true);
        const tId = turmaSelecionada || localStorage.getItem('turma_ativa_id') || '';
        const q = tId ? `?turmaId=${encodeURIComponent(tId)}` : '';
        const [cliRes, propRes] = await Promise.all([
          api.get(`/clientes${q}`).catch(() => []),
          api.get(`/financeiro/propostas${q}`).catch(() => [])
        ]);
        setClientes(Array.isArray(cliRes) ? cliRes : cliRes?.clientes || []);
        setPropostas(Array.isArray(propRes) ? propRes : propRes?.propostas || []);
      } finally {
        setCarregandoDados(false);
      }
    };
    carregar();
  }, [aberto, turmaSelecionada]);

  const copiarTexto = (e, texto, rotulo) => {
    e.stopPropagation();
    if (!texto) return;
    navigator.clipboard?.writeText(texto).then(() => {
      toastSistema(`${rotulo} copiado: ${texto}`, 'sucesso', 2400);
    }).catch(() => {});
  };

  const atalhosNavegacao = useMemo(() => {
    const base = [
      { tipo: 'navegacao', id: 'nav-home', titulo: 'Início (Cockpit Operacional)', subtitulo: 'Visão geral da turma, fila do salão e alertas', icone: 'home', rota: '/home', cor: '#0f172a' },
      { tipo: 'navegacao', id: 'nav-warroom', titulo: 'War Room & Modo TV', subtitulo: 'Placar executivo ao vivo, Caixa vs. Competência', icone: 'monitoring', rota: '/war-room', cor: '#ff5722' },
      { tipo: 'navegacao', id: 'nav-companies', titulo: 'Empresas (Check-in & Almoço)', subtitulo: 'Validar almoço pago, cortesia e presença por CNPJ', icone: 'domain', rota: '/companies', cor: '#ea580c' },
      ...(!isFinanceiro ? [
        { tipo: 'navegacao', id: 'nav-lunch', titulo: 'Salão & Mesas', subtitulo: 'Mapa de mesas, alocação de casais e escalação de consultores', icone: 'restaurant', rota: '/lunch', cor: '#0284c7' },
        { tipo: 'navegacao', id: 'nav-interviews', titulo: 'Entrevistas & Fechamento', subtitulo: 'Fichas comerciais, cashback e emissão de propostas', icone: 'assignment', rota: '/interviews', cor: '#7c3aed' }
      ] : []),
      { tipo: 'navegacao', id: 'nav-approvals', titulo: 'Aprovações (Financeiro & Alçada)', subtitulo: 'Análise de propostas, Serasa e exportação CSV', icone: 'verified', rota: '/approvals', cor: '#059669' },
      ...((isAdmin || isFinanceiro) ? [
        { tipo: 'navegacao', id: 'nav-cashback', titulo: 'Cashback Empresas', subtitulo: 'Consulta de créditos e abatimentos por CNPJ', icone: 'savings', rota: '/cashback', cor: '#15803d' }
      ] : []),
      ...(isAdmin ? [
        { tipo: 'navegacao', id: 'nav-users', titulo: 'Usuários & Acessos', subtitulo: 'Gerenciar operadores, consultores e permissões', icone: 'manage_accounts', rota: '/admin/users', cor: '#475569' },
        { tipo: 'navegacao', id: 'nav-admin-comp', titulo: 'Cadastro Geral (CNPJs)', subtitulo: 'Base cadastral mestre de empresas', icone: 'corporate_fare', rota: '/admin/companies', cor: '#475569' },
        { tipo: 'navegacao', id: 'nav-cohorts', titulo: 'Turmas & Eventos', subtitulo: 'Ativar/encerrar edições e configurar metas', icone: 'event', rota: '/admin/cohorts', cor: '#475569' },
        { tipo: 'navegacao', id: 'nav-rules', titulo: 'Regras Comerciais', subtitulo: 'Tabela de preços, descontos e alçadas', icone: 'rule', rota: '/admin/rules', cor: '#475569' },
        { tipo: 'navegacao', id: 'nav-audit', titulo: 'Trilha de Auditoria', subtitulo: 'Histórico completo de ações críticas no evento', icone: 'history_edu', rota: '/admin/audit', cor: '#475569' }
      ] : [])
    ];
    return base;
  }, [isAdmin, isFinanceiro]);

  const resultados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');

    if (!q) {
      return atalhosNavegacao.slice(0, 7);
    }

    const navMatches = atalhosNavegacao.filter(
      (n) => n.titulo.toLowerCase().includes(q) || n.subtitulo.toLowerCase().includes(q)
    );

    const empMatches = [];
    const chavesVistas = new Set();
    for (const c of clientes) {
      const empNome = String(c.empresa || '').trim();
      const partNome = String(c.nome_participante || c.nome || '').trim();
      const cnpjFmt = formatarCnpj(c.cnpj || c.cpf_cnpj);
      const cnpjDigits = cnpjFmt.replace(/\D/g, '');

      const bateu =
        empNome.toLowerCase().includes(q) ||
        partNome.toLowerCase().includes(q) ||
        (qDigits.length >= 3 && cnpjDigits.includes(qDigits)) ||
        (c.mesa_alocada && `mesa ${c.mesa_alocada}`.includes(q));

      if (!bateu) continue;

      const chave = cnpjDigits.length === 14 ? `cnpj:${cnpjDigits}` : `id:${c.id}`;
      if (chavesVistas.has(chave)) continue;
      chavesVistas.add(chave);

      const isGiant = Boolean(c.membro_giants) || String(c.origem || '').toUpperCase().includes('GIAN');
      empMatches.push({
        tipo: 'empresa',
        id: `emp-${c.id}`,
        titulo: empNome || partNome || `Ficha #${c.id}`,
        subtitulo: [
          partNome && empNome ? partNome : null,
          cnpjFmt ? `CNPJ ${cnpjFmt}` : null,
          c.mesa_alocada ? `Mesa ${c.mesa_alocada}` : null,
          isGiant ? 'Membro GIANTS' : null
        ].filter(Boolean).join(' • '),
        icone: isGiant ? 'workspace_premium' : 'business',
        rota: isFinanceiro ? '/companies' : `/interviews/${c.id}/edit`,
        cor: isGiant ? '#7c3aed' : '#ff5722',
        textoCopiar: cnpjFmt || null,
        rotuloCopiar: 'CNPJ'
      });

      if (empMatches.length >= 6) break;
    }

    const propMatches = propostas
      .filter((p) => {
        const proto = `prop-${String(p.id).padStart(3, '0')}`;
        return (
          proto.includes(q) ||
          String(p.empresa || '').toLowerCase().includes(q) ||
          String(p.produto_nome || '').toLowerCase().includes(q)
        );
      })
      .slice(0, 4)
      .map((p) => {
        const proto = `PROP-${String(p.id).padStart(3, '0')}`;
        return {
          tipo: 'proposta',
          id: `prop-${p.id}`,
          titulo: `${proto} • ${p.empresa || 'Empresa'}`,
          subtitulo: `${p.produto_nome || 'Contrato'} • Status: ${String(p.status_aprovacao || 'pendente').toUpperCase()}`,
          icone: 'receipt_long',
          rota: '/approvals',
          cor: '#059669',
          textoCopiar: proto,
          rotuloCopiar: 'Protocolo'
        };
      });

    return [...empMatches, ...propMatches, ...navMatches].slice(0, 10);
  }, [busca, atalhosNavegacao, clientes, propostas, isFinanceiro]);

  useEffect(() => {
    setIndiceSelecionado(0);
  }, [busca]);

  const executarItem = (item) => {
    if (!item) return;
    aoFechar();
    navigate(item.rota);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      aoFechar();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndiceSelecionado((prev) => (resultados.length > 0 ? (prev + 1) % resultados.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndiceSelecionado((prev) => (resultados.length > 0 ? (prev - 1 + resultados.length) % resultados.length : 0));
    } else if (e.key === 'Enter' && resultados[indiceSelecionado]) {
      e.preventDefault();
      executarItem(resultados[indiceSelecionado]);
    }
  };

  if (!aberto) return null;

  return (
    <div
      onClick={aoFechar}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.58)',
        backdropFilter: 'blur(3px)',
        zIndex: 10040,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '10vh 1rem 1rem'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '620px',
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #cbd5e1',
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.4)',
          overflow: 'hidden',
          animation: 'modalScaleIn 0.16s cubic-bezier(0.2, 0.8, 0.2, 1)'
        }}
      >
        {/* Campo de busca */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.9rem 1.15rem', borderBottom: '1px solid #e2e8f0' }}>
          <span className="material-symbols-outlined" style={{ color: '#ff5722', fontSize: '1.35rem' }}>search</span>
          <input
            ref={inputRef}
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar empresa, CNPJ, participante, mesa, PROP-001 ou tela..."
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontSize: '0.96rem',
              fontWeight: '600',
              color: '#0f172a',
              background: 'transparent',
              boxShadow: 'none'
            }}
          />
          {carregandoDados && (
            <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: '700' }}>Sincronizando...</span>
          )}
          <kbd
            onClick={aoFechar}
            style={{
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              padding: '0.18rem 0.48rem',
              fontSize: '0.7rem',
              fontWeight: '800',
              color: '#64748b',
              cursor: 'pointer'
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Lista de resultados */}
        <div style={{ maxHeight: '380px', overflowY: 'auto', padding: '0.5rem' }}>
          {resultados.length === 0 ? (
            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#64748b', fontSize: '0.86rem' }}>
              Nenhum resultado encontrado para <strong>"{busca}"</strong> nesta turma.
            </div>
          ) : (
            resultados.map((item, idx) => {
              const ativo = idx === indiceSelecionado;
              return (
                <div
                  key={item.id}
                  onMouseEnter={() => setIndiceSelecionado(idx)}
                  onClick={() => executarItem(item)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    padding: '0.68rem 0.85rem',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    background: ativo ? '#fff7ed' : 'transparent',
                    border: ativo ? '1px solid #fed7aa' : '1px solid transparent',
                    transform: 'none',
                    boxShadow: 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '9px',
                        background: ativo ? '#ff5722' : '#f1f5f9',
                        color: ativo ? '#ffffff' : item.cor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '1.15rem' }}>{item.icone}</span>
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: '800', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.titulo}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.subtitulo}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexShrink: 0 }}>
                    {item.textoCopiar && (
                      <button
                        type="button"
                        className="btn-copy-chip"
                        onClick={(e) => copiarTexto(e, item.textoCopiar, item.rotuloCopiar)}
                        title={`Copiar ${item.rotuloCopiar}`}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '0.88rem' }}>content_copy</span>
                        {item.rotuloCopiar}
                      </button>
                    )}
                    <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: ativo ? '#ff5722' : '#cbd5e1' }}>
                      keyboard_return
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Rodapé de atalhos */}
        <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '0.55rem 1.1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: '#64748b' }}>
          <span>↑ ↓ navegar • Enter abrir • Ctrl+K a qualquer momento</span>
          <span style={{ fontWeight: '700', color: '#475569' }}>GIANTS Flow Quick Jump</span>
        </div>
      </div>
    </div>
  );
}
