import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { Link, useLocation } from 'react-router-dom';
import { useMenu } from '../context/MenuContext';
import { useTurma } from '../context/TurmaContext';

const formatarNomeCurto = (nomeCompleto) => {
  const partes = String(nomeCompleto || '')
    .trim()
    .split(/s+/)
    .filter(Boolean);
  if (partes.length === 0) return 'Operador';
  if (partes.length === 1) return partes[0];
  return `${partes[0]} ${partes[partes.length - 1]}`;
};

const obterIniciais = (nomeCompleto) => {
  const partes = String(nomeCompleto || '')
    .trim()
    .split(/s+/)
    .filter(Boolean);
  if (partes.length === 0) return 'OP';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
};

export default function Sidebar() {
  const location = useLocation();
  const { turmaSelecionada } = useTurma();

  // Sessão e identificação de perfil
  const sessaoRaw = localStorage.getItem('sessao_operador');
  const sessao = sessaoRaw ? JSON.parse(sessaoRaw) : null;
  const usuario = sessao?.usuario || sessao || {};
  const papel = (usuario.papel || sessao?.papel || 'ENTREVISTADOR').toUpperCase();
  const isAdmin = papel === 'ADMIN';
  const isFinanceiro = papel === 'FINANCEIRO';
  const podeVerCashback = papel === 'ADMIN' || papel === 'FINANCEIRO';

  const {
    isMenuOpen,
    closeMenu,
    isSidebarCollapsed,
    toggleSidebarCollapsed
  } = useMenu();

  const [esconderModoTv, setEsconderModoTv] = useState(
    () => new URLSearchParams(window.location.search).get('tv') === '1'
  );

  useEffect(() => {
    const onTvMode = (e) => setEsconderModoTv(Boolean(e.detail));
    window.addEventListener('warroom-tv-mode', onTvMode);
    return () => window.removeEventListener('warroom-tv-mode', onTvMode);
  }, []);

  const [badges, setBadges] = useState({
    empresas: 0,
    mesas: 0,
    entrevistas: 0,
    aprovacoes: 0
  });

  const carregarBadges = useCallback(async () => {
    try {
      const tId = turmaSelecionada || localStorage.getItem('turma_ativa_id') || '';
      if (!tId) return;

      const [cliRes, propRes] = await Promise.all([
        api.get(`/clientes?turmaId=${encodeURIComponent(tId)}`).catch(() => []),
        api.get(`/financeiro/propostas?turmaId=${encodeURIComponent(tId)}`).catch(() => [])
      ]);

      const clientes = Array.isArray(cliRes) ? cliRes : cliRes?.clientes || [];
      const propostas = Array.isArray(propRes) ? propRes : propRes?.propostas || [];

      const grupos = new Map();
      for (const c of clientes) {
        const isGiant = Boolean(c.membro_giants) || String(c.origem || '').toUpperCase().includes('GIAN');
        if (isGiant) continue;

        const cnpjDigits = String(c.cnpj || c.cpf_cnpj || '').replace(/\D/g, '');
        const chave = cnpjDigits.length === 14
          ? `cnpj:${cnpjDigits}`
          : `emp:${String(c.empresa || c.id).trim().toLowerCase()}`;

        if (!grupos.has(chave)) {
          grupos.set(chave, []);
        }
        grupos.get(chave).push(c);
      }

      let pendAlmoco = 0;
      let pendMesa = 0;
      let emMesa = 0;

      for (const membros of grupos.values()) {
        const encerrado = membros.some((m) => {
          const st = String(m.status_aprovacao || '').toLowerCase();
          const et = String(m.etapa_funil || '').toLowerCase();
          return (
            Boolean(m.ficha_fechada) ||
            ['aprovada', 'aprovado', 'aprovada_com_ressalva', 'recusada', 'recusado'].includes(st) ||
            ['aguardando_aprovacao', 'fechamento', 'concluido', 'concluida', 'vendido', 'decisao_futura', 'nao_fechou', 'reprovado'].includes(et)
          );
        });
        if (encerrado) continue;

        const almocoOk = membros.some((m) => Boolean(m.almoco_pago || m.cortesia_almoco || m.atendimento_sem_almoco));
        const temMesa = membros.some((m) => m.mesa_alocada !== null && m.mesa_alocada !== undefined && String(m.mesa_alocada) !== '');

        if (!almocoOk) {
          pendAlmoco += 1;
        } else if (!temMesa) {
          pendMesa += 1;
        } else {
          emMesa += 1;
        }
      }

      const aprovacoesPendentes = propostas.filter(
        (p) => String(p.status_aprovacao || 'pendente').toLowerCase() === 'pendente'
      ).length;

      setBadges({
        empresas: pendAlmoco,
        mesas: pendMesa,
        entrevistas: emMesa,
        aprovacoes: aprovacoesPendentes
      });
    } catch (_) {}
  }, [turmaSelecionada]);

  useEffect(() => {
    carregarBadges();
    const timer = setInterval(carregarBadges, 45000);
    return () => clearInterval(timer);
  }, [carregarBadges, location.pathname]);

  const menuVisao = [
    { label: 'Início', path: '/home', icon: 'home', badge: 0 },
    { label: 'War Room', path: '/war-room', icon: 'monitoring', badge: 0 }
  ];

  const menuOperacao = [
    { label: 'Empresas', path: '/companies', icon: 'domain', badge: badges.empresas, badgeTitle: 'Empresas com almoço pendente' },
    ...(!isFinanceiro ? [{ label: 'Salão & Mesas', path: '/lunch', icon: 'restaurant', badge: badges.mesas, badgeTitle: 'Empresas aguardando mesa' }] : []),
    ...(!isFinanceiro ? [{ label: 'Entrevistas', path: '/interviews', icon: 'assignment', badge: badges.entrevistas, badgeTitle: 'Empresas em atendimento na mesa' }] : []),
    { label: 'Aprovações', path: '/approvals', icon: 'verified', badge: badges.aprovacoes, badgeTitle: 'Propostas pendentes de aprovação' },
    ...(podeVerCashback ? [{ label: 'Cashback Empresas', path: '/cashback', icon: 'savings', badge: 0 }] : [])
  ];

  const menuAdmin = [
    { label: 'Usuários & Acessos', path: '/admin/users', icon: 'manage_accounts', badge: 0 },
    { label: 'Cadastro Geral (CNPJs)', path: '/admin/companies', icon: 'corporate_fare', badge: 0 },
    { label: 'Turmas & Eventos', path: '/admin/cohorts', icon: 'event', badge: 0 },
    { label: 'Regras Comerciais', path: '/admin/rules', icon: 'rule', badge: 0 },
    { label: 'Trilha de Auditoria', path: '/admin/audit', icon: 'history_edu', badge: 0 }
  ];

  const isRotaAtiva = (path) =>
    location.pathname === path || (path !== '/home' && location.pathname.startsWith(path));

  const linkEstilo = (path) => {
    const ativo = isRotaAtiva(path);
    return {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: isSidebarCollapsed ? 'center' : 'space-between',
      gap: isSidebarCollapsed ? 0 : '0.65rem',
      padding: isSidebarCollapsed ? '0.68rem 0' : '0.62rem 0.85rem',
      borderRadius: '9px',
      textDecoration: 'none',
      fontWeight: '700',
      fontSize: '0.85rem',
      color: ativo ? '#fff' : '#334155',
      background: ativo ? '#ff5722' : 'transparent',
      transition: 'all 0.16s ease',
      marginBottom: '0.22rem'
    };
  };

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout', {});
    } catch (_) {
    } finally {
      localStorage.removeItem('sessao_operador');
      window.location.href = '/login';
    }
  };

  useEffect(() => {
    api.get('/usuarios').then((users) => {
      if (Array.isArray(users)) {
        const uEmail = (usuario.email || sessao?.email || '').toLowerCase();
        const dbUser = users.find((u) => u.email?.toLowerCase() === uEmail || u.id === usuario.id);
        if (dbUser && dbUser.papel) {
          const papelBanco = dbUser.papel.toUpperCase();
          if (papelBanco !== papel) {
            const atualizada = {
              ...sessao,
              papel: papelBanco,
              nome: dbUser.nome,
              usuario: {
                ...usuario,
                id: dbUser.id,
                nome: dbUser.nome,
                papel: papelBanco,
                ativo: dbUser.ativo
              }
            };
            localStorage.setItem('sessao_operador', JSON.stringify(atualizada));
            window.location.reload();
          }
        }
      }
    }).catch(() => {});
  }, []);

  const larguraSidebar = isSidebarCollapsed ? '72px' : '242px';
  const nomeCompletoUsuario = usuario.nome || 'Rodrigo Moreira';
  const nomeCurtoUsuario = formatarNomeCurto(nomeCompletoUsuario);
  const iniciaisUsuario = obterIniciais(nomeCompletoUsuario);

  const renderItemMenu = (item) => {
    const ativo = isRotaAtiva(item.path);
    const temBadge = Number(item.badge || 0) > 0;
    const tooltip = temBadge
      ? `${item.label} (${item.badge} ${item.badgeTitle || 'pendente(s)'})`
      : item.label;

    return (
      <Link
        key={item.path}
        to={item.path}
        onClick={closeMenu}
        title={tooltip}
        style={linkEstilo(item.path)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.68rem', minWidth: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.2rem', flexShrink: 0 }}>
            {item.icon}
          </span>
          {!isSidebarCollapsed && (
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.label}
            </span>
          )}
        </div>

        {!isSidebarCollapsed && temBadge && (
          <span
            style={{
              background: ativo ? 'rgba(255,255,255,0.24)' : '#fff7ed',
              color: ativo ? '#ffffff' : '#c2410c',
              border: ativo ? '1px solid rgba(255,255,255,0.35)' : '1px solid #fed7aa',
              fontSize: '0.69rem',
              fontWeight: '800',
              padding: '0.06rem 0.44rem',
              borderRadius: '999px',
              lineHeight: 1.35,
              flexShrink: 0
            }}
          >
            {item.badge}
          </span>
        )}

        {isSidebarCollapsed && temBadge && (
          <span
            style={{
              position: 'absolute',
              top: '5px',
              right: '11px',
              minWidth: '16px',
              height: '16px',
              padding: '0 4px',
              borderRadius: '999px',
              background: ativo ? '#0f172a' : '#ff5722',
              color: '#ffffff',
              fontSize: '0.62rem',
              fontWeight: '900',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1.5px solid #ffffff'
            }}
          >
            {item.badge}
          </span>
        )}
      </Link>
    );
  };

  if (esconderModoTv) return null;

  return (
    <>
      <div className={`sidebar-overlay ${isMenuOpen ? 'open' : ''}`} onClick={closeMenu}></div>
      <aside
        className={`sidebar-container ${isMenuOpen ? 'open' : ''}`}
        style={{
          width: larguraSidebar,
          minWidth: larguraSidebar,
          background: '#ffffff',
          borderRight: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          height: '100vh',
          boxSizing: 'border-box',
          overflowY: 'auto',
          overflowX: 'hidden',
          transition: 'width 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), min-width 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)'
        }}
      >
        {/* Topo e Menus */}
        <div style={{ padding: isSidebarCollapsed ? '1.15rem 0.55rem' : '1.25rem 0.85rem' }}>
          {/* Identidade do Sistema + Botão Retrátil */}
          <div
            style={{
              display: 'flex',
              flexDirection: isSidebarCollapsed ? 'column' : 'row',
              alignItems: 'center',
              justifyContent: isSidebarCollapsed ? 'center' : 'space-between',
              gap: isSidebarCollapsed ? '0.55rem' : '0.5rem',
              marginBottom: '1.45rem',
              paddingLeft: isSidebarCollapsed ? 0 : '0.35rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '9px',
                  background: '#ff5722',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  flexShrink: 0,
                  boxShadow: '0 2px 6px rgba(255,87,34,0.28)'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>rocket_launch</span>
              </div>
              {!isSidebarCollapsed && (
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ fontSize: '0.98rem', fontWeight: '800', color: '#0f172a', margin: 0, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
                    GIANTS Flow
                  </h2>
                  <span style={{ fontSize: '0.69rem', color: '#64748b', fontWeight: '600', display: 'block', whiteSpace: 'nowrap' }}>
                    Grupo Acelerador
                  </span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              title={isSidebarCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
              style={{
                width: isSidebarCollapsed ? '36px' : '28px',
                height: '28px',
                borderRadius: '7px',
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
                color: '#475569',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1.05rem' }}>
                {isSidebarCollapsed ? 'chevron_right' : 'chevron_left'}
              </span>
            </button>
          </div>

          {/* Bloco 1: Visão Executiva */}
          <div style={{ marginBottom: '1.1rem' }}>
            {!isSidebarCollapsed && (
              <span style={{ display: 'block', fontSize: '0.67rem', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.4rem', paddingLeft: '0.45rem' }}>
                Visão Geral
              </span>
            )}
            <nav>{menuVisao.map(renderItemMenu)}</nav>
          </div>

          {/* Bloco 2: Jornada Operacional do Evento */}
          <div style={{ marginBottom: '1.15rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.85rem' }}>
            {!isSidebarCollapsed && (
              <span style={{ display: 'block', fontSize: '0.67rem', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.4rem', paddingLeft: '0.45rem' }}>
                Operação do Evento
              </span>
            )}
            <nav>{menuOperacao.map(renderItemMenu)}</nav>
          </div>

          {/* Bloco 3: Administração (Visível apenas para ADMIN) */}
          {isAdmin && (
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.85rem' }}>
              {!isSidebarCollapsed && (
                <span style={{ display: 'block', fontSize: '0.67rem', fontWeight: '800', color: '#ea580c', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.4rem', paddingLeft: '0.45rem' }}>
                  Administração
                </span>
              )}
              <nav>{menuAdmin.map(renderItemMenu)}</nav>
            </div>
          )}
        </div>

        {/* Rodapé: Operador Logado */}
        <div style={{ padding: isSidebarCollapsed ? '0.85rem 0.5rem' : '0.85rem 0.9rem', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
          {isSidebarCollapsed ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
              <div
                title={`${nomeCompletoUsuario} (${papel})`}
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '50%',
                  background: '#0f172a',
                  color: '#ffffff',
                  fontSize: '0.75rem',
                  fontWeight: '800',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {iniciaisUsuario}
              </div>
              <button
                type="button"
                onClick={() => { closeMenu(); handleLogout(); }}
                title="Sair do Sistema"
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  cursor: 'pointer',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '34px',
                  height: '30px',
                  borderRadius: '7px'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>logout</span>
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '50%',
                    background: '#0f172a',
                    color: '#ffffff',
                    fontSize: '0.75rem',
                    fontWeight: '800',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  {iniciaisUsuario}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <span
                    title={nomeCompletoUsuario}
                    style={{ fontSize: '0.83rem', fontWeight: '800', color: '#0f172a', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >
                    {nomeCurtoUsuario}
                  </span>
                  <span style={{ fontSize: '0.68rem', fontWeight: '800', color: '#ff5722', display: 'block', textTransform: 'uppercase' }}>
                    {papel || 'ADMIN'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => { closeMenu(); handleLogout(); }}
                title="Sair do Sistema"
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  cursor: 'pointer',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  padding: '0.35rem 0.55rem',
                  borderRadius: '7px',
                  fontSize: '0.72rem',
                  fontWeight: '700',
                  flexShrink: 0
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>logout</span>
                Sair
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
