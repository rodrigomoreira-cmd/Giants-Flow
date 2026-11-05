// public/js/sidebar.js
(function () {
  'use strict';

  function renderizarSidebar() {
    const aside = document.querySelector('aside.app-sidebar');
    if (!aside) return;

    const pathAtual = window.location.pathname;

    // Configuração única de navegação
    const itensMenu = [
      { href: '/hub', icon: 'grid_view', label: 'Overview', module: 'hub' },
      { href: '/fichas', icon: 'description', label: 'Fichas', module: 'fichas' },
      {
        href: '/entrevistas',
        icon: 'table_restaurant',
        label: 'Entrevistas',
        module: 'entrevistas',
      },
      { href: '/pitch', icon: 'bolt', label: 'Pitch / Oferta', module: 'pitch' },
      { href: '/propostas', icon: 'request_quote', label: 'Propostas', module: 'propostas' },
      { href: '/financeiro', icon: 'shield', label: 'Financeiro', module: 'financeiro' },
    ];

    const itensOutros = [
      { href: '/usuarios', icon: 'group', label: 'Equipe', module: 'usuarios' },
      { href: '/produtos', icon: 'inventory_2', label: 'Produtos', module: 'produtos' },
    ];

    function gerarLink(item) {
      const isActive = pathAtual === item.href || pathAtual === `${item.href}.html`;
      return `
        <a href="${item.href}" class="nav-item ${isActive ? 'active' : ''}" data-module="${item.module}">
          <span class="material-symbols-outlined nav-icon">${item.icon}</span>
          <span class="nav-label">${item.label}</span>
        </a>
      `;
    }

    aside.innerHTML = `
      <!-- CABEÇALHO DO LOGO -->
      <div class="sidebar-header">
        <div class="sidebar-icon-logo">
          <span class="material-symbols-outlined">filter_alt</span>
        </div>
        <span class="brand-name-text">EventFunnel</span>
      </div>

      <!-- SEÇÃO MENU -->
      <div class="sidebar-group">
        <span class="sidebar-category-tag">Menu</span>
        <nav class="sidebar-nav">
          ${itensMenu.map(gerarLink).join('')}
        </nav>
      </div>

      <!-- SEÇÃO OUTROS -->
      <div class="sidebar-group" style="margin-top: 1rem;">
        <span class="sidebar-category-tag">Outros</span>
        <nav class="sidebar-nav">
          ${itensOutros.map(gerarLink).join('')}
        </nav>
      </div>

      <!-- RODAPÉ DO OPERADOR -->
      <div class="sidebar-footer">
        <div class="user-profile-card">
          <div class="sidebar-avatar" id="avatarOperadorLetra">
            R
            <span class="avatar-online-dot"></span>
          </div>
          <div class="user-info-text">
            <span class="user-meta-name" id="labelNomeUsuario">Rodrigo Moreira</span>
            <span class="user-meta-role" id="badgePapelUsuario">ADMIN</span>
          </div>
          <button class="btn-sidebar-options" id="btnEncerrarSessao" title="Encerrar Sessão">
            <span class="material-symbols-outlined">logout</span>
          </button>
        </div>
      </div>
    `;

    // Hidratação dos dados de sessão e evento de logout
    const sessaoRaw = localStorage.getItem('sessao_operador');
    if (sessaoRaw) {
      try {
        const sessao = JSON.parse(sessaoRaw);
        const labelNome = aside.querySelector('#labelNomeUsuario');
        const badgePapel = aside.querySelector('#badgePapelUsuario');
        const avatarLetra = aside.querySelector('#avatarOperadorLetra');

        if (labelNome) labelNome.textContent = sessao.nome || 'Operador';
        if (badgePapel) badgePapel.textContent = (sessao.papel || 'ADMIN').toUpperCase();
        if (avatarLetra) {
          avatarLetra.innerHTML = `${(sessao.nome || 'R').charAt(0).toUpperCase()}<span class="avatar-online-dot"></span>`;
        }
      } catch (e) {
        console.warn('Erro ao carregar dados de sessão no menu.');
      }
    }

    aside.querySelector('#btnEncerrarSessao')?.addEventListener('click', () => {
      localStorage.removeItem('sessao_operador');
      window.location.href = '/login';
    });
  }

  // Executa assim que o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderizarSidebar);
  } else {
    renderizarSidebar();
  }
})();
