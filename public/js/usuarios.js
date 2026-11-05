// public/js/usuarios.js
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';

  // 1. Autenticação e Sessão
  const sessaoRaw = localStorage.getItem('sessao_operador');
  if (!sessaoRaw) {
    window.location.href = '/login';
    return;
  }
  const sessao = JSON.parse(sessaoRaw);
  const papel = (sessao.papel || 'comercial').toLowerCase();

  if (papel !== 'admin') {
    alert('Acesso restrito. Apenas administradores podem gerenciar a equipe.');
    window.location.href = '/hub';
    return;
  }

  // Sincroniza Rodapé da Sidebar
  const labelNomeUsuario = document.getElementById('labelNomeUsuario');
  const badgePapelUsuario = document.getElementById('badgePapelUsuario');
  const avatarOperadorLetra = document.getElementById('avatarOperadorLetra');
  if (labelNomeUsuario) labelNomeUsuario.textContent = sessao.nome || 'Operador';
  if (badgePapelUsuario) badgePapelUsuario.textContent = (sessao.papel || 'ADMIN').toUpperCase();
  if (avatarOperadorLetra) {
    avatarOperadorLetra.innerHTML = `${(sessao.nome || 'O').charAt(0).toUpperCase()}<span class="avatar-online-dot"></span>`;
  }

  document.getElementById('btnEncerrarSessao')?.addEventListener('click', () => {
    localStorage.removeItem('sessao_operador');
    window.location.href = '/login';
  });

  // 2. Elementos DOM
  const badgeTotalUsuarios = document.getElementById('badgeTotalUsuarios');
  const btnViewTable = document.getElementById('btnViewTable');
  const btnViewBoard = document.getElementById('btnViewBoard');
  const containerTabela = document.getElementById('containerTabela');
  const containerBoard = document.getElementById('containerBoard');
  const listaUsuariosCorpo = document.getElementById('listaUsuariosCorpo');
  const inputBuscaUsuario = document.getElementById('inputBuscaUsuario');
  const btnToggleInativos = document.getElementById('btnToggleInativos');
  const btnNovoUsuario = document.getElementById('btnNovoUsuario');
  const selectFiltroPapel = document.getElementById('selectFiltroPapel');

  // Modal de Usuário
  const modalUsuario = document.getElementById('modalUsuario');
  const modalUsuarioTitulo = document.getElementById('modalUsuarioTitulo');
  const btnFecharModalUsuario = document.getElementById('btnFecharModalUsuario');
  const btnCancelarUsuario = document.getElementById('btnCancelarUsuario');
  const formUsuario = document.getElementById('formUsuario');
  const btnSalvarUsuario = document.getElementById('btnSalvarUsuario');
  const usuarioId = document.getElementById('usuarioId');
  const inputNomeUsuario = document.getElementById('inputNomeUsuario');
  const inputEmailUsuario = document.getElementById('inputEmailUsuario');
  const inputSenhaUsuario = document.getElementById('inputSenhaUsuario');
  const selectPapelUsuario = document.getElementById('selectPapelUsuario');

  let usuarios = [];
  let visaoAtual = 'table';
  let ocultarInativos = false;
  let filtroPapel = 'todos';
  let termoBusca = '';

  function escapeHtml(texto) {
    if (!texto) return '';
    return String(texto)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatarBadgePapel(papelStr) {
    const p = (papelStr || '').toLowerCase();
    if (p === 'admin') return '<span class="kpi-badge-pill orange">Admin</span>';
    if (p === 'financeiro') return '<span class="kpi-badge-pill green">Financeiro</span>';
    return '<span class="kpi-badge-pill blue">Comercial</span>';
  }

  function formatarBadgeStatus(ativo) {
    return ativo
      ? '<span class="kpi-badge-pill green"><span class="status-indicator-dot online"></span>Ativo</span>'
      : '<span class="kpi-badge-pill gray"><span class="status-indicator-dot offline"></span>Inativo</span>';
  }

  // 3. Alternância de Visualização e Filtros
  btnViewTable?.addEventListener('click', () => {
    visaoAtual = 'table';
    btnViewTable.classList.add('active');
    btnViewBoard?.classList.remove('active');
    if (containerTabela) containerTabela.style.display = 'block';
    if (containerBoard) containerBoard.style.display = 'none';
    renderizarVisualizacao();
  });

  btnViewBoard?.addEventListener('click', () => {
    visaoAtual = 'board';
    btnViewBoard.classList.add('active');
    btnViewTable?.classList.remove('active');
    if (containerTabela) containerTabela.style.display = 'none';
    if (containerBoard) containerBoard.style.display = 'grid';
    renderizarVisualizacao();
  });

  btnToggleInativos?.addEventListener('click', () => {
    ocultarInativos = !ocultarInativos;
    btnToggleInativos.classList.toggle('active', ocultarInativos);
    btnToggleInativos.innerHTML = ocultarInativos
      ? '<span class="material-symbols-outlined" style="font-size: 17px;">visibility</span><span>Mostrar Inativos</span>'
      : '<span class="material-symbols-outlined" style="font-size: 17px;">visibility_off</span><span>Ocultar Inativos</span>';
    renderizarVisualizacao();
  });

  selectFiltroPapel?.addEventListener('change', (e) => {
    filtroPapel = e.target.value;
    renderizarVisualizacao();
  });

  inputBuscaUsuario?.addEventListener('input', (e) => {
    termoBusca = e.target.value.toLowerCase().trim();
    renderizarVisualizacao();
  });

  // 4. API Fetch
  async function carregarUsuarios() {
    try {
      const res = await fetch('/api/usuarios');
      if (!res.ok) throw new Error('Falha ao consultar equipe.');
      usuarios = await res.json();
      if (badgeTotalUsuarios) badgeTotalUsuarios.textContent = usuarios.length;
      renderizarVisualizacao();
    } catch (err) {
      console.error('Erro ao carregar usuários:', err);
    }
  }

  function obterUsuariosFiltrados() {
    return usuarios.filter((u) => {
      const nomeSafe = u.nome ? u.nome.toLowerCase() : '';
      const emailSafe = u.email ? u.email.toLowerCase() : '';
      const atendeBusca = nomeSafe.includes(termoBusca) || emailSafe.includes(termoBusca);
      const atendePapel =
        filtroPapel === 'todos' || u.papel.toLowerCase() === filtroPapel.toLowerCase();
      const atendeStatus = ocultarInativos ? u.ativo : true;

      return atendeBusca && atendePapel && atendeStatus;
    });
  }

  function renderizarVisualizacao() {
    const lista = obterUsuariosFiltrados();
    if (visaoAtual === 'table') {
      renderizarTabela(lista);
    } else {
      renderizarBoard(lista);
    }
  }

  // 5. Visão em Tabela D.CC
  function renderizarTabela(lista) {
    if (!listaUsuariosCorpo) return;
    listaUsuariosCorpo.innerHTML = '';

    if (lista.length === 0) {
      listaUsuariosCorpo.innerHTML = `
        <tr>
          <td colspan="5" class="table-empty">
            <div class="empty-state-box">
              <span class="material-symbols-outlined empty-icon">group_off</span>
              <span>Nenhum operador localizado com os filtros atuais.</span>
            </div>
          </td>
        </tr>`;
      return;
    }

    lista.forEach((u) => {
      const tr = document.createElement('tr');
      const letra = u.nome ? u.nome.charAt(0).toUpperCase() : 'U';
      const nomeSeguro = escapeHtml(u.nome);
      const emailSeguro = escapeHtml(u.email);

      tr.innerHTML = `
        <td>
          <div class="um-user-cell">
            <div class="um-avatar-circle">${letra}</div>
            <div class="um-user-name-block">
              <span class="um-name-bold">${nomeSeguro}</span>
            </div>
          </div>
        </td>
        <td><span class="um-email-cell">${emailSeguro}</span></td>
        <td>${formatarBadgePapel(u.papel)}</td>
        <td>${formatarBadgeStatus(u.ativo)}</td>
        <td style="text-align: right;">
          <div class="um-actions-cell">
            <button type="button" class="btn-row-action" data-action="editar" title="Editar Operador">
              <span class="material-symbols-outlined">edit</span>
            </button>
            <button type="button" class="btn-row-action" data-action="status" title="${u.ativo ? 'Suspender Operador' : 'Ativar Operador'}">
              <span class="material-symbols-outlined">${u.ativo ? 'pause_circle' : 'play_circle'}</span>
            </button>
            <button type="button" class="btn-row-action delete" data-action="excluir" title="Excluir Operador">
              <span class="material-symbols-outlined">delete</span>
            </button>
          </div>
        </td>
      `;

      tr.querySelector('[data-action="editar"]')?.addEventListener('click', () =>
        abrirModalEdicao(u)
      );
      tr.querySelector('[data-action="status"]')?.addEventListener('click', () =>
        alternarStatus(u.id)
      );
      tr.querySelector('[data-action="excluir"]')?.addEventListener('click', () =>
        excluirUsuario(u.id, u.nome)
      );

      listaUsuariosCorpo.appendChild(tr);
    });
  }

  // 6. Visão em Colunas (Kanban Board)
  function renderizarBoard(lista) {
    if (!containerBoard) return;
    containerBoard.innerHTML = '';

    const colunas = [
      { papel: 'comercial', titulo: 'Comercial & Captação', badgeClass: 'blue' },
      { papel: 'financeiro', titulo: 'Mesa Financeira', badgeClass: 'green' },
      { papel: 'admin', titulo: 'Administradores', badgeClass: 'orange' },
    ];

    colunas.forEach((col) => {
      const usuariosColuna = lista.filter((u) => u.papel.toLowerCase() === col.papel.toLowerCase());
      const colDiv = document.createElement('div');
      colDiv.className = 'board-column';

      colDiv.innerHTML = `
        <div class="board-column-header">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <h3 class="board-column-title">${col.titulo}</h3>
          </div>
          <span class="kpi-badge-pill ${col.badgeClass}">${usuariosColuna.length}</span>
        </div>
        <div class="board-cards-list" id="cards-col-${col.papel}"></div>
      `;

      const cardsWrap = colDiv.querySelector(`#cards-col-${col.papel}`);

      if (usuariosColuna.length === 0) {
        cardsWrap.innerHTML =
          '<div class="table-empty" style="padding: 1.5rem 0.5rem; font-size: 0.8rem;">Sem operadores cadastrados nesta função.</div>';
      } else {
        usuariosColuna.forEach((u) => {
          const card = document.createElement('div');
          card.className = 'board-user-card';
          const letra = u.nome ? u.nome.charAt(0).toUpperCase() : 'U';

          card.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <div class="um-avatar-circle">${letra}</div>
              <div style="flex: 1; overflow: hidden;">
                <div class="um-name-bold" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(u.nome)}</div>
                <div class="um-email-cell" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(u.email)}</div>
              </div>
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--border-light); padding-top: 0.65rem; margin-top: 0.35rem;">
              ${formatarBadgeStatus(u.ativo)}
              <div class="um-actions-cell">
                <button type="button" class="btn-row-action" data-action="editar" title="Editar">
                  <span class="material-symbols-outlined">edit</span>
                </button>
                <button type="button" class="btn-row-action delete" data-action="excluir" title="Excluir">
                  <span class="material-symbols-outlined">delete</span>
                </button>
              </div>
            </div>
          `;

          card
            .querySelector('[data-action="editar"]')
            ?.addEventListener('click', () => abrirModalEdicao(u));
          card
            .querySelector('[data-action="excluir"]')
            ?.addEventListener('click', () => excluirUsuario(u.id, u.nome));
          cardsWrap.appendChild(card);
        });
      }
      containerBoard.appendChild(colDiv);
    });
  }

  // 7. Ações de Modal e CRUD
  btnNovoUsuario?.addEventListener('click', () => {
    formUsuario?.reset();
    if (usuarioId) usuarioId.value = '';
    if (modalUsuarioTitulo) modalUsuarioTitulo.textContent = 'Cadastrar Novo Usuário';
    if (inputSenhaUsuario) {
      inputSenhaUsuario.required = true;
      inputSenhaUsuario.placeholder = 'Mínimo 6 caracteres';
    }
    modalUsuario.style.display = 'flex';
  });

  function abrirModalEdicao(u) {
    if (usuarioId) usuarioId.value = u.id;
    if (inputNomeUsuario) inputNomeUsuario.value = u.nome;
    if (inputEmailUsuario) inputEmailUsuario.value = u.email;
    if (selectPapelUsuario) selectPapelUsuario.value = u.papel.toLowerCase();
    if (inputSenhaUsuario) {
      inputSenhaUsuario.required = false;
      inputSenhaUsuario.value = '';
      inputSenhaUsuario.placeholder = 'Deixe em branco para não alterar';
    }
    if (modalUsuarioTitulo) modalUsuarioTitulo.textContent = 'Editar Usuário';
    modalUsuario.style.display = 'flex';
  }

  function fecharModalUsuario() {
    if (modalUsuario) modalUsuario.style.display = 'none';
  }

  btnFecharModalUsuario?.addEventListener('click', fecharModalUsuario);
  btnCancelarUsuario?.addEventListener('click', fecharModalUsuario);

  modalUsuario?.addEventListener('click', (e) => {
    if (e.target === modalUsuario) fecharModalUsuario();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalUsuario?.style.display === 'flex') fecharModalUsuario();
  });

  // Salvar (Blindagem Anti-Double Submit)
  formUsuario?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = usuarioId?.value;

    const payload = {
      nome: inputNomeUsuario?.value.trim(),
      email: inputEmailUsuario?.value.trim(),
      papel: selectPapelUsuario?.value,
      senha: inputSenhaUsuario?.value.trim() || undefined,
    };

    const url = id ? `/api/usuarios/${id}` : '/api/usuarios';
    const method = id ? 'PUT' : 'POST';

    try {
      if (btnSalvarUsuario) {
        btnSalvarUsuario.disabled = true;
        btnSalvarUsuario.innerHTML = '<span>Salvando...</span>';
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.erro || 'Erro ao salvar usuário.');
      }

      fecharModalUsuario();
      await carregarUsuarios();
    } catch (err) {
      alert(`Erro: ${err.message}`);
    } finally {
      if (btnSalvarUsuario) {
        btnSalvarUsuario.disabled = false;
        btnSalvarUsuario.innerHTML =
          '<span class="material-symbols-outlined">check</span><span>Salvar Operador</span>';
      }
    }
  });

  // Alterar Status Ativo/Inativo
  async function alternarStatus(id) {
    try {
      const res = await fetch(`/api/usuarios/${id}/status`, { method: 'PATCH' });
      if (!res.ok) throw new Error('Não foi possível alterar status.');
      await carregarUsuarios();
    } catch (err) {
      alert(`Erro ao alterar status: ${err.message}`);
    }
  }

  // Excluir Usuário
  function excluirUsuario(id, nome) {
    if (!confirm(`Deseja realmente remover o operador "${nome}"? Esta ação não pode ser desfeita.`))
      return;
    efetuarExclusao(id);
  }

  async function efetuarExclusao(id) {
    try {
      const res = await fetch(`/api/usuarios/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.erro || 'Falha ao excluir usuário.');
      await carregarUsuarios();
    } catch (err) {
      alert(`Erro: ${err.message}`);
    }
  }

  await carregarUsuarios();
});
