// public/js/auth.js
(function () {
  'use strict';

  const sessaoRaw = localStorage.getItem('sessao_operador');
  const pathAtual = window.location.pathname;

  // Se estiver na p?gina de login e j? houver sess?o ativa, vai para o Hub
  if (pathAtual === '/login' || pathAtual === '/login.html' || pathAtual === '/') {
    if (sessaoRaw) {
      window.location.href = '/hub';
    }
    return;
  }

  // Se estiver numa p?gina restrita sem sess?o ativa, bloqueia e redireciona ao login
  if (!sessaoRaw) {
    window.location.href = '/login';
    return;
  }

  window.AppAuth = {
    getSessao() {
      try {
        return JSON.parse(sessaoRaw);
      } catch (e) {
        return null;
      }
    },
    logout() {
      localStorage.removeItem('sessao_operador');
      window.location.href = '/login';
    },
    exigirAdmin() {
      const sessao = this.getSessao();
      if (!sessao || (sessao.papel || '').toLowerCase() !== 'admin') {
        alert('Acesso restrito exclusivamente a administradores.');
        window.location.href = '/hub';
      }
    },
  };
})();
