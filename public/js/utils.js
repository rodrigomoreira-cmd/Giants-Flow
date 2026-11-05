// public/js/utils.js
window.AppUtils = (function () {
  'use strict';

  const formatadorMoeda = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });

  function formatarMoeda(valor) {
    return formatadorMoeda.format(Number(valor) || 0);
  }

  function formatarValorKPI(valor) {
    const num = Number(valor) || 0;
    if (num <= 0) return 'R$ 0,00';
    if (num >= 1000) {
      return `R$ ${(num / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
    }
    return formatadorMoeda.format(num);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toast(mensagem, tipo = 'info') {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      document.body.appendChild(container);
    }

    const item = document.createElement('div');
    item.className = `toast toast-${tipo}`;
    item.textContent = mensagem;
    container.appendChild(item);

    setTimeout(() => {
      item.style.opacity = '0';
      setTimeout(() => item.remove(), 250);
    }, 3500);
  }

  return {
    formatarMoeda,
    formatarValorKPI,
    escapeHtml,
    toast,
  };
})();
