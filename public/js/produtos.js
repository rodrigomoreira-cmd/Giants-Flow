// public/js/produtos.js
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';

  // 1. Sessão & Rodapé
  const sessaoRaw = localStorage.getItem('sessao_operador');
  if (sessaoRaw) {
    try {
      const sessao = JSON.parse(sessaoRaw);
      const labelNomeUsuario = document.getElementById('labelNomeUsuario');
      const badgePapelUsuario = document.getElementById('badgePapelUsuario');
      const avatarOperadorLetra = document.getElementById('avatarOperadorLetra');
      if (labelNomeUsuario) labelNomeUsuario.textContent = sessao.nome || 'Operador';
      if (badgePapelUsuario)
        badgePapelUsuario.textContent = (sessao.papel || 'ADMIN').toUpperCase();
      if (avatarOperadorLetra) {
        avatarOperadorLetra.innerHTML = `${(sessao.nome || 'O').charAt(0).toUpperCase()}<span class="avatar-online-dot"></span>`;
      }
    } catch (e) {
      console.warn('Erro ao carregar sessão.');
    }
  }

  document.getElementById('btnEncerrarSessao')?.addEventListener('click', () => {
    localStorage.removeItem('sessao_operador');
    window.location.href = '/login';
  });

  // 2. Elementos DOM
  const badgeTotalProdutos = document.getElementById('badgeTotalProdutos');
  const listaProdutosCorpo = document.getElementById('listaProdutosCorpo');
  const inputBuscaProduto = document.getElementById('inputBuscaProduto');
  const btnNovoProduto = document.getElementById('btnNovoProduto');

  const modalProduto = document.getElementById('modalProduto');
  const modalProdutoTitulo = document.getElementById('modalProdutoTitulo');
  const btnFecharModalProduto = document.getElementById('btnFecharModalProduto');
  const btnCancelarProduto = document.getElementById('btnCancelarProduto');
  const formProduto = document.getElementById('formProduto');
  const btnSalvarProduto = document.getElementById('btnSalvarProduto');
  const produtoId = document.getElementById('produtoId');
  const inputNomeProduto = document.getElementById('inputNomeProduto');
  const inputValorBase = document.getElementById('inputValorBase');

  let produtos = [];
  let termoBusca = '';

  const formatadorMoeda = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });

  function escapeHtml(texto) {
    if (!texto) return '';
    return String(texto)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showToast(mensagem, tipo = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.textContent = mensagem;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 250);
    }, 3500);
  }

  // 3. Consulta de Produtos
  async function carregarProdutos() {
    try {
      const res = await fetch('/api/produtos');
      if (!res.ok) throw new Error('Falha ao carregar catálogo.');
      produtos = await res.json();
      if (badgeTotalProdutos) badgeTotalProdutos.textContent = produtos.length;
      renderizarTabela();
    } catch (err) {
      console.error('Erro ao carregar produtos:', err);
      showToast('Não foi possível carregar a lista de produtos.', 'error');
    }
  }

  // 4. Renderização da Tabela
  function renderizarTabela() {
    if (!listaProdutosCorpo) return;
    listaProdutosCorpo.innerHTML = '';

    const filtrados = produtos.filter((p) => (p.nome || '').toLowerCase().includes(termoBusca));

    if (filtrados.length === 0) {
      listaProdutosCorpo.innerHTML = `
        <tr>
          <td colspan="4" class="table-empty">
            <div class="empty-state-box">
              <span class="material-symbols-outlined empty-icon">inventory_2</span>
              <span>Nenhum produto cadastrado no catálogo.</span>
            </div>
          </td>
        </tr>`;
      return;
    }

    filtrados.forEach((prod) => {
      const tr = document.createElement('tr');
      const valor = Number(prod.valor_base || 0);

      tr.innerHTML = `
        <td><strong class="font-mono text-muted">#${prod.id}</strong></td>
        <td>
          <div style="display: flex; align-items: center; gap: 0.65rem;">
            <div class="recent-sale-avatar" style="width: 34px; height: 34px; border-radius: 10px; font-size: 0.85rem;">
              <span class="material-symbols-outlined" style="font-size: 18px;">sell</span>
            </div>
            <strong>${escapeHtml(prod.nome)}</strong>
          </div>
        </td>
        <td>
          <span class="font-mono text-accent" style="font-weight: 800; font-size: 0.95rem;">
            ${formatadorMoeda.format(valor)}
          </span>
        </td>
        <td style="text-align: right;">
          <div class="um-actions-cell">
            <button type="button" class="btn-row-action" data-action="editar" title="Editar Produto">
              <span class="material-symbols-outlined">edit</span>
            </button>
            <button type="button" class="btn-row-action delete" data-action="excluir" title="Excluir Produto">
              <span class="material-symbols-outlined">delete</span>
            </button>
          </div>
        </td>
      `;

      tr.querySelector('[data-action="editar"]')?.addEventListener('click', () =>
        abrirModalEdicao(prod)
      );
      tr.querySelector('[data-action="excluir"]')?.addEventListener('click', () =>
        excluirProduto(prod.id, prod.nome)
      );

      listaProdutosCorpo.appendChild(tr);
    });
  }

  inputBuscaProduto?.addEventListener('input', (e) => {
    termoBusca = e.target.value.toLowerCase().trim();
    renderizarTabela();
  });

  // 5. Abertura e Fechamento do Modal
  btnNovoProduto?.addEventListener('click', () => {
    formProduto?.reset();
    if (produtoId) produtoId.value = '';
    if (modalProdutoTitulo) modalProdutoTitulo.textContent = 'Cadastrar Novo Produto';
    modalProduto.style.display = 'flex';
    inputNomeProduto?.focus();
  });

  function abrirModalEdicao(prod) {
    if (produtoId) produtoId.value = prod.id;
    if (inputNomeProduto) inputNomeProduto.value = prod.nome;
    if (inputValorBase) inputValorBase.value = Number(prod.valor_base || 0).toFixed(2);
    if (modalProdutoTitulo) modalProdutoTitulo.textContent = 'Editar Produto';
    modalProduto.style.display = 'flex';
  }

  function fecharModalProduto() {
    if (modalProduto) modalProduto.style.display = 'none';
  }

  btnFecharModalProduto?.addEventListener('click', fecharModalProduto);
  btnCancelarProduto?.addEventListener('click', fecharModalProduto);

  modalProduto?.addEventListener('click', (e) => {
    if (e.target === modalProduto) fecharModalProduto();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalProduto?.style.display === 'flex') {
      fecharModalProduto();
    }
  });

  // 6. Submissão (Criar / Editar)
  formProduto?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = produtoId?.value;
    const nome = inputNomeProduto?.value.trim();
    const valor_base = Number(inputValorBase?.value) || 0;

    if (!nome) {
      showToast('Preencha o nome do produto.', 'error');
      return;
    }

    const payload = { nome, valor_base };
    const url = id ? `/api/produtos/${id}` : '/api/produtos';
    const method = id ? 'PUT' : 'POST';

    try {
      if (btnSalvarProduto) {
        btnSalvarProduto.disabled = true;
        btnSalvarProduto.innerHTML = '<span>Salvando...</span>';
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.erro || 'Falha ao salvar produto.');
      }

      fecharModalProduto();
      showToast(
        id ? 'Produto atualizado com sucesso!' : 'Produto cadastrado com sucesso!',
        'success'
      );
      await carregarProdutos();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      if (btnSalvarProduto) {
        btnSalvarProduto.disabled = false;
        btnSalvarProduto.innerHTML =
          '<span class="material-symbols-outlined">check</span><span>Salvar Produto</span>';
      }
    }
  });

  // 7. Exclusão de Produto
  async function excluirProduto(id, nome) {
    if (!confirm(`Deseja realmente excluir o produto "${nome}"?`)) return;

    try {
      const res = await fetch(`/api/produtos/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.erro || 'Falha ao excluir produto.');
      }

      showToast('Produto removido com sucesso.', 'success');
      await carregarProdutos();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  await carregarProdutos();
});
