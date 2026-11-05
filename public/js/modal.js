// public/js/modal.js
(function () {
  // 1. Cria o container do Toast se não existir
  function obterToastContainer() {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      document.body.appendChild(container);
    }
    return container;
  }

  // 2. Toast Universal Sequoia
  window.showToast = function (mensagem, tipo = 'info') {
    const container = obterToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.textContent = mensagem;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  };

  // 3. Diálogo de Confirmação Sequoia Universal
  window.mostrarConfirmacao = function ({
    titulo = 'Confirmação',
    mensagem = 'Tem certeza de que deseja executar esta ação?',
    icone = '⚠️',
    textoOk = 'Confirmar',
    textoCancelar = 'Cancelar',
    tipoBotao = 'btn-primary',
  }) {
    return new Promise((resolve) => {
      let overlay = document.getElementById('globalConfirmOverlay');

      // Injeta o modal genérico utilizando classes do Design System padrão
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'globalConfirmOverlay';
        overlay.className = 'modal-overlay';
        overlay.style.cssText = `
          display: none;
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          align-items: center;
          justify-content: center;
          z-index: 10000;
          padding: 1.5rem;
        `;

        overlay.innerHTML = `
          <div class="modal-card" style="width: 100%; max-width: 400px; text-align: center; padding: 2rem 1.5rem;">
            <div id="globalConfirmIcon" style="font-size: 2.5rem; margin-bottom: 1rem;">⚠️</div>
            <h3 id="globalConfirmTitle" style="font-size: 1.25rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.5rem; letter-spacing: -0.02em;">Confirmação</h3>
            <p id="globalConfirmMsg" style="color: var(--text-secondary); font-size: 0.9rem; line-height: 1.5; margin-bottom: 1.75rem;">Mensagem</p>
            <div style="display: flex; justify-content: center; gap: 0.75rem; width: 100%;">
              <button type="button" class="btn btn-secondary" id="globalConfirmCancel" style="flex: 1;">Cancelar</button>
              <button type="button" class="btn" id="globalConfirmOk" style="flex: 1;">Confirmar</button>
            </div>
          </div>
        `;
        document.body.appendChild(overlay);
      }

      const elIcon = document.getElementById('globalConfirmIcon');
      const elTitle = document.getElementById('globalConfirmTitle');
      const elMsg = document.getElementById('globalConfirmMsg');
      const btnOk = document.getElementById('globalConfirmOk');
      const btnCancel = document.getElementById('globalConfirmCancel');

      // Popula dados dinâmicos
      elIcon.textContent = icone;
      elTitle.textContent = titulo;
      elMsg.textContent = mensagem;
      btnOk.textContent = textoOk;
      btnOk.className = `btn ${tipoBotao}`;
      btnCancel.textContent = textoCancelar;

      // Exibe
      overlay.style.display = 'flex';
      btnCancel.focus(); // Acessibilidade: previne confirmações acidentais via Enter

      // Funções de desmonte e resolução
      const limparEventosEFechar = (resultado) => {
        overlay.style.display = 'none';
        btnOk.removeEventListener('click', onOk);
        btnCancel.removeEventListener('click', onCancel);
        document.removeEventListener('keydown', onEsc);
        overlay.removeEventListener('click', onBackdropClick);
        resolve(resultado);
      };

      const onOk = () => limparEventosEFechar(true);
      const onCancel = () => limparEventosEFechar(false);
      const onEsc = (e) => {
        if (e.key === 'Escape') limparEventosEFechar(false);
      };
      const onBackdropClick = (e) => {
        if (e.target === overlay) limparEventosEFechar(false);
      };

      // Registro de escutas
      btnOk.addEventListener('click', onOk);
      btnCancel.addEventListener('click', onCancel);
      document.addEventListener('keydown', onEsc);
      overlay.addEventListener('click', onBackdropClick);
    });
  };
})();
