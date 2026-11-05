// public/js/theme.js
(function () {
  const htmlTag = document.documentElement;

  // 1. Aplica o Tema Salvo Imediatamente (Evita flash de tela branca)
  const savedTheme = localStorage.getItem('app_theme') || 'dark';
  htmlTag.setAttribute('data-theme', savedTheme);

  document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.querySelector('.app-sidebar');

    // 2. Estado Salvo da Barra Lateral (Expandida ou Minimizada)
    const isSidebarCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';
    if (sidebar && isSidebarCollapsed) {
      sidebar.classList.add('collapsed');
    }

    // 3. Inserção e Controle do Botão de Minimizar
    if (sidebar) {
      const header = sidebar.querySelector('.sidebar-header');
      if (header && !document.getElementById('btnToggleSidebar')) {
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'btnToggleSidebar';
        toggleBtn.className = 'btn-sidebar-toggle';
        toggleBtn.type = 'button';
        toggleBtn.title = 'Minimizar / Expandir Menu';
        toggleBtn.setAttribute('aria-label', 'Alternar menu lateral');
        toggleBtn.innerHTML = sidebar.classList.contains('collapsed') ? '›' : '‹';

        toggleBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const collapsed = sidebar.classList.toggle('collapsed');
          localStorage.setItem('sidebar_collapsed', collapsed ? 'true' : 'false');
          toggleBtn.innerHTML = collapsed ? '›' : '‹';
        });

        header.appendChild(toggleBtn);
      }

      // Adiciona tooltips limpas (sem emojis) ao passar o mouse com menu recolhido
      const navItems = sidebar.querySelectorAll('.nav-item');
      navItems.forEach((item) => {
        // Limpa emojis e quebras de linha usando uma regex simples
        const textLimpo = item.textContent
          .replace(
            /[\uD800-\uDBFF][\uDC00-\uDFFF]|\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu,
            ''
          )
          .replace(/[\n\r]+|[\s]{2,}/g, ' ')
          .trim();

        if (!item.getAttribute('title') && textLimpo) {
          item.setAttribute('title', textLimpo);
        }
      });
    }

    // 4. Alternância de Tema ☀️ / 🌙
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    function updateThemeIcon() {
      if (!themeToggleBtn) return;
      const isDark = htmlTag.getAttribute('data-theme') === 'dark';
      themeToggleBtn.textContent = isDark ? '☀️' : '🌙';
      themeToggleBtn.setAttribute(
        'title',
        isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'
      );
    }

    updateThemeIcon();

    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', () => {
        const isDark = htmlTag.getAttribute('data-theme') === 'dark';
        const newTheme = isDark ? 'light' : 'dark';
        htmlTag.setAttribute('data-theme', newTheme);
        localStorage.setItem('app_theme', newTheme);
        updateThemeIcon();
      });
    }

    // 5. Preenchimento Global da Sidebar com Dados da Sessão
    const sessaoRaw = localStorage.getItem('sessao_operador');
    if (sessaoRaw) {
      try {
        const sessao = JSON.parse(sessaoRaw);
        const elNome = document.getElementById('labelNomeUsuario');
        const elPapel = document.getElementById('badgePapelUsuario');
        const elAvatar = document.getElementById('avatarOperadorLetra');

        if (elNome) elNome.textContent = sessao.nome || 'Operador';
        if (elPapel) elPapel.textContent = (sessao.papel || 'comercial').toUpperCase();
        if (elAvatar && sessao.nome) {
          elAvatar.textContent = sessao.nome.charAt(0).toUpperCase();
          elAvatar.setAttribute('title', `${sessao.nome} (${(sessao.papel || '').toUpperCase()})`);
        }
      } catch (e) {
        console.error('Erro ao ler sessão do operador:', e);
      }
    }

    // 6. Encerramento de Sessão Seguro (Substitui instâncias duplicadas)
    const btnSair = document.getElementById('btnEncerrarSessao');
    if (btnSair) {
      // Clona o botão para remover eventuais Listeners já pendurados por outros scripts (ex: hub.js)
      const novoBtnSair = btnSair.cloneNode(true);
      btnSair.parentNode.replaceChild(novoBtnSair, btnSair);

      novoBtnSair.addEventListener('click', () => {
        localStorage.removeItem('sessao_operador');
        window.location.href = '/login';
      });
    }
  });
})();
