// public/js/propostas.js
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';

  // 1. Sessão & Cabeçalho do Operador
  const sessaoRaw = localStorage.getItem('sessao_operador');
  if (sessaoRaw) {
    try {
      const sessao = JSON.parse(sessaoRaw);
      const labelNomeUsuario = document.getElementById('labelNomeUsuario');
      const badgePapelUsuario = document.getElementById('badgePapelUsuario');
      const avatarOperadorLetra = document.getElementById('avatarOperadorLetra');
      if (labelNomeUsuario) labelNomeUsuario.textContent = sessao.nome || 'Operador';
      if (badgePapelUsuario)
        badgePapelUsuario.textContent = (sessao.papel || 'COMERCIAL').toUpperCase();
      if (avatarOperadorLetra) {
        avatarOperadorLetra.innerHTML = `${(sessao.nome || 'O').charAt(0).toUpperCase()}<span class="avatar-online-dot"></span>`;
      }
    } catch (e) {
      console.warn('Erro ao carregar sessão local.');
    }
  }

  document.getElementById('btnEncerrarSessao')?.addEventListener('click', () => {
    localStorage.removeItem('sessao_operador');
    window.location.href = '/login';
  });

  // 2. Elementos DOM
  const selectTurma = document.getElementById('selectTurma');
  const btnAtualizarDados = document.getElementById('btnAtualizarDados');
  const countAprovados = document.getElementById('countAprovados');
  const inputBuscaAprovado = document.getElementById('inputBuscaAprovado');
  const containerAprovados = document.getElementById('containerAprovados');

  const painelProposta = document.getElementById('painelProposta');
  const painelEmptyState = document.getElementById('painelEmptyState');
  const avatarClienteSelecionado = document.getElementById('avatarClienteSelecionado');
  const nomeClienteSelecionado = document.getElementById('nomeClienteSelecionado');
  const empresaClienteSelecionado = document.getElementById('empresaClienteSelecionado');
  const btnTrocarParticipante = document.getElementById('btnTrocarParticipante');

  const formCriarProposta = document.getElementById('formCriarProposta');
  const inputAplicacaoId = document.getElementById('inputAplicacaoId');
  const selectProduto = document.getElementById('selectProduto');
  const inputValorTotal = document.getElementById('inputValorTotal');
  const inputValorEntrada = document.getElementById('inputValorEntrada');
  const inputCashback = document.getElementById('inputCashback');
  const inputSaldoDevedor = document.getElementById('inputSaldoDevedor');
  const selectMetodoPagamento = document.getElementById('selectMetodoPagamento');
  const selectParcelas = document.getElementById('selectParcelas');
  const displayValorParcela = document.getElementById('displayValorParcela');
  const inputValorParcela = document.getElementById('inputValorParcela');
  const btnCancelarProposta = document.getElementById('btnCancelarProposta');
  const btnSalvarProposta = document.getElementById('btnSalvarProposta');

  let turmas = [];
  let produtos = [];
  let participantesAprovados = [];
  let participanteAtivo = null;
  let termoBusca = '';
  let isSubmitting = false;

  const formatadorMoeda = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });

  // Sanitizador defensivo UTF-8
  function sanitizarTexto(txt) {
    if (!txt) return '';
    return String(txt)
      .replace(/Imers\?\?o/gi, 'Imersão')
      .replace(/Implementa\?\?\?\?o/gi, 'Implementação')
      .replace(/Inscri\?\?o/gi, 'Inscrição')
      .replace(/\?\?/g, 'çã');
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

  // 3. Carga Inicial de Dados de Apoio
  async function carregarDadosIniciais() {
    try {
      let data = null;
      try {
        const resIniciais = await fetch('/api/apoio/dados-iniciais');
        if (resIniciais.ok) data = await resIniciais.json();
      } catch (e) {
        data = null;
      }

      if (!data) {
        const resAux = await fetch('/api/auxiliares');
        if (resAux.ok) data = await resAux.json();
      }

      if (!data) {
        throw new Error('Falha ao obter dados auxiliares.');
      }

      turmas = data.turmas || [];
      produtos = (data.produtos || []).map((p) => ({
        id: Number(p.id),
        nome: sanitizarTexto(p.nome),
        valor_base: Number(p.valor_base || 0),
      }));

      // Monta turmas com sanitização
      if (selectTurma && turmas.length > 0) {
        selectTurma.innerHTML = '';
        turmas.forEach((t) => {
          const opt = document.createElement('option');
          opt.value = t.id;
          opt.textContent = `${t.codigo || 'T'} - ${sanitizarTexto(t.nome)}`;
          selectTurma.appendChild(opt);
        });
        const turmaPadrao = turmas.find((t) => Number(t.id) === 1);
        if (turmaPadrao) selectTurma.value = '1';
      }

      // Monta produtos
      if (selectProduto) {
        selectProduto.innerHTML = '<option value="">Selecione o produto oficial...</option>';
        produtos.forEach((prod) => {
          const opt = document.createElement('option');
          opt.value = prod.id;
          opt.textContent = `${prod.nome} — ${formatadorMoeda.format(prod.valor_base)}`;
          selectProduto.appendChild(opt);
        });
      }

      const turmaIdParaBuscar = selectTurma?.value || (turmas[0] ? turmas[0].id : 1);
      await carregarParticipantesAprovados(turmaIdParaBuscar);
    } catch (err) {
      console.error('🔴 Erro em carregarDadosIniciais:', err);
      await carregarParticipantesAprovados(1);
    }
  }

  // 4. Busca e Filtro de Participantes
  async function carregarParticipantesAprovados(turmaId) {
    try {
      const idLimpo = Number(turmaId) || 1;
      const res = await fetch(`/api/clientes?turmaId=${idLimpo}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const todosClientes = await res.json();

      participantesAprovados = (Array.isArray(todosClientes) ? todosClientes : []).filter(
        (c) => c.etapa_atual === 'proposta_liberada'
      );

      renderizarListaAprovados();
    } catch (err) {
      console.error('🔴 Erro ao carregar participantes:', err);
      showToast('Não foi possível carregar os clientes da turma.', 'error');
    }
  }

  // 5. Renderização da Lista Lateral de Aprovados
  function renderizarListaAprovados() {
    if (!containerAprovados) return;
    if (countAprovados) countAprovados.textContent = participantesAprovados.length;

    const filtrados = participantesAprovados.filter((p) => {
      const nome = (p.nome_completo || p.nome || '').toLowerCase();
      const empresa = (p.empresa || '').toLowerCase();
      return nome.includes(termoBusca) || empresa.includes(termoBusca);
    });

    if (filtrados.length === 0) {
      containerAprovados.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 2rem 1rem;">
          Nenhum participante com proposta liberada nesta turma.
        </div>
      `;
      return;
    }

    containerAprovados.innerHTML = filtrados
      .map((p) => {
        const isSelected = participanteAtivo?.id === p.id;
        const inicial = (p.nome_cracha || p.nome_completo || 'P').charAt(0).toUpperCase();

        return `
          <div class="aprovado-card ${isSelected ? 'selected' : ''}" data-id="${p.id}">
            <div class="aprovado-avatar">${inicial}</div>
            <div class="aprovado-info">
              <div class="aprovado-nome">${p.nome_cracha || p.nome_completo}</div>
              <div class="aprovado-empresa">${p.empresa || 'Empresa não informada'}</div>
            </div>
            <span class="material-symbols-outlined aprovado-arrow">chevron_right</span>
          </div>
        `;
      })
      .join('');

    containerAprovados.querySelectorAll('.aprovado-card').forEach((card) => {
      card.addEventListener('click', () => {
        const id = Number(card.dataset.id);
        const participante = participantesAprovados.find((p) => p.id === id);
        if (participante) selecionarParticipante(participante);
      });
    });
  }

  // 6. Seleção e Cálculos Reativos
  function selecionarParticipante(participante) {
    participanteAtivo = participante;
    renderizarListaAprovados();

    if (inputAplicacaoId) inputAplicacaoId.value = participante.id;
    if (nomeClienteSelecionado)
      nomeClienteSelecionado.textContent = participante.nome_completo || participante.nome;
    if (empresaClienteSelecionado) {
      empresaClienteSelecionado.textContent = `${participante.empresa || 'Sem empresa'} • Tel: ${participante.telefone || 'Sem telefone'}`;
    }
    if (avatarClienteSelecionado) {
      avatarClienteSelecionado.textContent = (
        participante.nome_cracha ||
        participante.nome_completo ||
        'P'
      )
        .charAt(0)
        .toUpperCase();
    }

    if (painelEmptyState) painelEmptyState.style.display = 'none';
    if (painelProposta) painelProposta.style.display = 'block';

    if (produtos.length === 1 && selectProduto && !selectProduto.value) {
      selectProduto.value = produtos[0].id;
      if (inputValorTotal) inputValorTotal.value = produtos[0].valor_base.toFixed(2);
    }

    recalcularValores();
  }

  function desmarcarParticipante() {
    participanteAtivo = null;
    formCriarProposta?.reset();
    if (inputAplicacaoId) inputAplicacaoId.value = '';
    if (painelProposta) painelProposta.style.display = 'none';
    if (painelEmptyState) painelEmptyState.style.display = 'flex';
    renderizarListaAprovados();
  }

  btnTrocarParticipante?.addEventListener('click', desmarcarParticipante);
  btnCancelarProposta?.addEventListener('click', desmarcarParticipante);

  function recalcularValores() {
    const valorTotal = Math.max(0, Number(inputValorTotal?.value) || 0);
    const valorEntrada = Math.max(0, Number(inputValorEntrada?.value) || 0);
    const cashback = Math.max(0, Number(inputCashback?.value) || 0);
    const parcelas = Math.max(1, Number(selectParcelas?.value) || 1);

    const saldoDevedor = Math.max(0, valorTotal - valorEntrada - cashback);
    const valorParcela = Number((saldoDevedor / parcelas).toFixed(2));

    if (inputSaldoDevedor) inputSaldoDevedor.value = saldoDevedor.toFixed(2);
    if (inputValorParcela) inputValorParcela.value = valorParcela.toFixed(2);
    if (displayValorParcela) displayValorParcela.textContent = formatadorMoeda.format(valorParcela);
  }

  selectProduto?.addEventListener('change', () => {
    const prod = produtos.find((p) => p.id === Number(selectProduto.value));
    if (prod && inputValorTotal) inputValorTotal.value = prod.valor_base.toFixed(2);
    recalcularValores();
  });

  inputValorTotal?.addEventListener('input', recalcularValores);
  inputValorEntrada?.addEventListener('input', recalcularValores);
  inputCashback?.addEventListener('input', recalcularValores);
  selectParcelas?.addEventListener('change', recalcularValores);

  // 7. Submissão do Formulário
  formCriarProposta?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    const aplicacaoId = Number(inputAplicacaoId?.value);
    const produtoId = Number(selectProduto?.value);
    const valorTotal = Number(inputValorTotal?.value) || 0;
    const valorEntrada = Number(inputValorEntrada?.value) || 0;
    const cashback = Number(inputCashback?.value) || 0;
    const metodoPagamento = selectMetodoPagamento?.value || 'cartao_credito';
    const quantidadeParcelas = Number(selectParcelas?.value) || 1;
    const valorParcela = Number(inputValorParcela?.value) || 0;

    if (!aplicacaoId || !produtoId || valorTotal <= 0) {
      showToast('Selecione o participante, o produto e preencha os valores.', 'error');
      return;
    }

    isSubmitting = true;
    if (btnSalvarProposta) {
      btnSalvarProposta.disabled = true;
      btnSalvarProposta.innerHTML = `<span>Enviando ao Financeiro...</span>`;
    }

    try {
      const res = await fetch('/api/propostas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aplicacaoId,
          produtoId,
          valorTotal,
          valorEntrada,
          cashback,
          metodoPagamento,
          quantidadeParcelas,
          valorParcela,
          status: 'enviado_financeiro',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || 'Falha ao gerar proposta.');

      showToast(`Proposta #${data.id} enviada à Mesa Financeira!`, 'success');
      participantesAprovados = participantesAprovados.filter((p) => p.id !== aplicacaoId);
      desmarcarParticipante();

      setTimeout(() => {
        window.location.href = '/financeiro';
      }, 1000);
    } catch (err) {
      console.error('🔴 Erro ao salvar proposta:', err);
      showToast(err.message, 'error');
    } finally {
      isSubmitting = false;
      if (btnSalvarProposta) {
        btnSalvarProposta.disabled = false;
        btnSalvarProposta.innerHTML = `<span>Formalizar & Enviar ao Financeiro</span><span class="material-symbols-outlined">arrow_forward</span>`;
      }
    }
  });

  inputBuscaAprovado?.addEventListener('input', (e) => {
    termoBusca = e.target.value.toLowerCase().trim();
    renderizarListaAprovados();
  });

  selectTurma?.addEventListener('change', () => {
    carregarParticipantesAprovados(selectTurma.value);
  });

  btnAtualizarDados?.addEventListener('click', async () => {
    showToast('Atualizando dados...', 'info');
    await carregarDadosIniciais();
  });

  await carregarDadosIniciais();
});
