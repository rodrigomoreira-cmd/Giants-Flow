import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Link, useLocation } from 'react-router-dom';

export default function Sidebar() {
  const location = useLocation();

  // Sessão e identificação de perfil
  const sessaoRaw = localStorage.getItem('sessao_operador');
  const sessao = sessaoRaw ? JSON.parse(sessaoRaw) : null;
  const usuario = sessao?.usuario || sessao || {};
  const papel = (usuario.papel || sessao?.papel || 'ADMIN').toUpperCase();
  const isAdmin = papel === 'ADMIN';

  const menuGeral = [
    { label: 'Início', path: '/home', icon: 'home' },
    { label: 'Empresas', path: '/companies', icon: 'domain' },
    { label: 'Entrevistas', path: '/interviews', icon: 'assignment' },
    { label: 'Aprovações', path: '/approvals', icon: 'verified' },
    { label: 'Almoço', path: '/lunch', icon: 'restaurant' },
  ];

  const menuAdmin = [
    { label: 'Usuários & Acessos', path: '/admin/users', icon: 'manage_accounts' },
    { label: 'Admin Empresas', path: '/admin/companies', icon: 'corporate_fare' },
    { label: 'Turmas & Eventos', path: '/admin/cohorts', icon: 'event' },
    { label: 'Regras Comerciais', path: '/admin/rules', icon: 'rule' }
  ];

  const linkEstilo = (path) => {
    const ativo = location.pathname === path || (path !== '/home' && location.pathname.startsWith(path));
    return {
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      padding: '0.65rem 1rem',
      borderRadius: '8px',
      textDecoration: 'none',
      fontWeight: '700',
      fontSize: '0.88rem',
      color: ativo ? '#fff' : '#334155',
      background: ativo ? '#ff5722' : 'transparent',
      transition: 'all 0.15s ease',
      marginBottom: '0.25rem'
    };
  };

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout', {});
    } catch (_) {
      // Prossegue com limpeza local mesmo se o token já estiver expirado
    } finally {
      localStorage.removeItem('sessao_operador');
      window.location.href = '/login';
    }
  };

  
  useEffect(() => {
    // Revalidação em background: garante que mudanças de papel no PostgreSQL reflitam na sessão ativa
    api.get('/usuarios').then(users => {
      if (Array.isArray(users)) {
        const uEmail = (usuario.email || sessao?.email || '').toLowerCase();
        const dbUser = users.find(u => u.email?.toLowerCase() === uEmail || u.id === usuario.id);
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

  return (
    <aside style={{
      width: '240px',
      minWidth: '240px',
      background: '#fff',
      borderRight: '1px solid #e2e8f0',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      height: '100vh',
      boxSizing: 'border-box',
      overflowY: 'auto'
    }}>
      {/* Topo e Menus */}
      <div style={{ padding: '1.5rem 1rem' }}>
        {/* Identidade do Sistema */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '2rem', paddingLeft: '0.5rem' }}>
          <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#ff5722', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.25rem' }}>rocket_launch</span>
          </div>
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: '800', color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
              GIANTS Flow
            </h2>
            <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '600' }}>Grupo Acelerador</span>
          </div>
        </div>

        {/* Bloco 1: Operação Geral */}
        <div style={{ marginBottom: '1.5rem' }}>
          <span style={{ display: 'block', fontSize: '0.7rem', fontWeight: '800', color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.5rem', paddingLeft: '0.5rem' }}>
            Programa GIANTS
          </span>
          <nav>
            {menuGeral.map((item) => (
              <Link key={item.path} to={item.path} style={linkEstilo(item.path)}>
                <span className="material-symbols-outlined" style={{ fontSize: '1.15rem' }}>{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Bloco 2: Administração (Visível apenas para ADMIN) */}
        {isAdmin && (
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '1rem' }}>
            <span style={{ display: 'block', fontSize: '0.7rem', fontWeight: '800', color: '#ea580c', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.5rem', paddingLeft: '0.5rem' }}>
              Administração
            </span>
            <nav>
              {menuAdmin.map((item) => (
                <Link key={item.path} to={item.path} style={linkEstilo(item.path)}>
                  <span className="material-symbols-outlined" style={{ fontSize: '1.15rem' }}>{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </div>

      {/* Rodapé: Operaçãor Logado */}
      <div style={{ padding: '1rem', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#0f172a', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {usuario.nome || 'Rodrigo Moreira'}
            </span>
            <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#ff5722', display: 'block', textTransform: 'uppercase' }}>
              {papel || 'ADMIN'}
            </span>
          </div>

          <button
            onClick={handleLogout}
            title="Sair do Sistema"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.4rem',
              borderRadius: '6px'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.25rem' }}>logout</span>
          </button>
        </div>
      </div>
    </aside>
  );
}