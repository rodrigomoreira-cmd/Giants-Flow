// public/js/financeiro.js
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';

  // =========================================================================
  // 1. SESSÃO & SEGURANÇA
  // =========================================================================
  const sessaoRaw = localStorage.getItem('sessao_operador');
  if (!sessaoRaw) {
    window.location.href = '/login';
    return;
  }
  const sessao = JSON.parse(sessaoRaw);

  const labelNomeUsuario = document.getElementById('labelNomeUsuario');
  const badgePapelUsuario = document.getElementById('badgePapelUsuario');
  const avatarOperadorLetra = document.getElementById('avatarOperadorLetra');
  const btnEncerrarSessao = document.getElementById('btnEncerrarSessao');

  if (labelNomeUsuario) labelNomeUsuario.textContent = sessao.nome || 'Operador Financeiro';
  if (badgePapelUsuario)
    badgePapelUsuario.textContent = (sessao.papel || 'FINANCEIRO').toUpperCase();
  if (avatarOperadorLetra)
    avatarOperadorLetra.textContent = (sessao.nome || 'F').charAt(0).toUpperCase();

  btnEncerrarSessao?.addEventListener('click', () => {
    localStorage.removeItem('sessao_operador');
    window.location.href = '/login';
  });

  // =========================================================================
  // 2. ELEMENTOS DO DOM
  // =========================================================================
  const statusConectividade = document.getElementById('statusConectividade');
  const btnAlternarSom = document.getElementById('btnAlternarSom');
  const btnAtualizarFila = document.getElementById('btnAtualizarFila');
  const countFilaPendentes = document.getElementById('countFilaPendentes');
  const countTabPendentes = document.getElementById('countTabPendentes');
  const countTabAprovados = document.getElementById('countTabAprovados');
  const countTabRecusados = document.getElementById('countTabRecusados');
  const inputBuscaFinanceiro = document.getElementById('inputBuscaFinanceiro');
  const containerListaPropostas = document.getElementById('containerListaPropostas');
  const filterPills = document.querySelectorAll('.pill-filter');

  // Painel de Detalhe
  const painelDetalheProposta = document.getElementById('painelDetalheProposta');
  const painelEmptyStateFinanceiro = document.getElementById('painelEmptyStateFinanceiro');
  const viewPropostaId = document.getElementById('viewPropostaId');
  const viewStatusBadge = document.getElementById('viewStatusBadge');
  const viewDataEmissao = document.getElementById('viewDataEmissao');
  const viewClienteAvatar = document.getElementById('viewClienteAvatar');
  const viewClienteNome = document.getElementById('viewClienteNome');
  const viewClienteEmpresa = document.getElementById('viewClienteEmpresa');
  const viewClienteDoc = document.getElementById('viewClienteDoc');
  const viewClienteTelefone = document.getElementById('viewClienteTelefone');
  const viewClienteEmail = document.getElementById('viewClienteEmail');

  const viewProdutoNome = document.getElementById('viewProdutoNome');
  const viewValorTotal = document.getElementById('viewValorTotal');
  const viewValorEntrada = document.getElementById('viewValorEntrada');
  const viewCashback = document.getElementById('viewCashback');
  const viewMetodoPagamento = document.getElementById('viewMetodoPagamento');
  const viewParcelamento = document.getElementById('viewParcelamento');

  const boxFormularioParecer = document.getElementById('boxFormularioParecer');
  const selectScoreSerasa = document.getElementById('selectScoreSerasa');
  const inputScoreManual = document.getElementById('inputScoreManual');
  const inputParecerAuditoria = document.getElementById('inputParecerAuditoria');
  const btnAprovarProposta = document.getElementById('btnAprovarProposta');
  const btnRecusarModal = document.getElementById('btnRecusarModal');
  const boxVendaConcretizada = document.getElementById('boxVendaConcretizada');
  const btnConcretizarVenda = document.getElementById('btnConcretizarVenda');

  // Modal de Recusa
  const modalRecusaFinanceira = document.getElementById('modalRecusaFinanceira');
  const modalRecusaSubtitulo = document.getElementById('modalRecusaSubtitulo');
  const formRecusaFinanceira = document.getElementById('formRecusaFinanceira');
  const modalMotivoRecusa = document.getElementById('modalMotivoRecusa');
  const modalJustificativaDetalhada = document.getElementById('modalJustificativaDetalhada');
  const btnFecharModalRecusa = document.getElementById('btnFecharModalRecusa');
  const btnCancelarModalRecusa = document.getElementById('btnCancelarModalRecusa');
  const btnConfirmarRecusa = document.getElementById('btnConfirmarRecusa');

  // =========================================================================
  // 3. ESTADO DA APLICAÇÃO
  // =========================================================================
  let propostas = [];
  let propostaAtiva = null;
  let filtroAtual = 'pendentes';
  let termoBusca = '';
  let somHabilitado = localStorage.getItem('financeiro_som_ativo') !== 'false';
  let audioCtx = null;
  let totalPendentesAnterior = 0;
  let isSubmitting = false;

  // =========================================================================
  // 4. SINTETIZADOR DE ÁUDIO NATIVO (WEB AUDIO API)
  // =========================================================================
  function inicializarAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function emitirAlertaSonoroProposta() {
    if (!somHabilitado) return;
    try {
      inicializarAudioContext();
      if (!audioCtx) return;

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      // Sequência harmónica ascendente de aprovação/alerta
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880.0, audioCtx.currentTime + 0.15); // A5

      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.35);
    } catch (err) {
      console.warn('Alerta sonoro bloqueado pelo navegador.');
    }
  }

  function atualizarBotaoSom() {
    if (btnAlternarSom) {
      btnAlternarSom.textContent = somHabilitado ? '🔔' : '🔕';
      btnAlternarSom.title = somHabilitado ? 'Som Habilitado' : 'Som Mudo';
    }
  }

  btnAlternarSom?.addEventListener('click', () => {
    somHabilitado = !somHabilitado;
    localStorage.setItem('financeiro_som_ativo', String(somHabilitado));
    atualizarBotaoSom();
    if (somHabilitado) emitirAlertaSonoroProposta();
  });

  atualizarBotaoSom();

  // =========================================================================
  // 5. SERVIÇO DE TOASTS & FORMATAÇÃO
  // =========================================================================
  function showToast(mensagem, tipo = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.textContent = mensagem;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, 3500);
  }

  const formatadorMoeda = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });

  // =========================================================================
  // 6. CARGA DE PROPOSTAS DO FINANCEIRO
  // =========================================================================
  async function carregarPropostasFinanceiro(silencioso = false) {
    if (!silencioso && statusConectividade) {
      statusConectividade.className = 'connectivity-badge syncing';
      statusConectividade.innerHTML = '<span class="pulse-dot"></span> Sincronizando...';
    }

    try {
      const res = await fetch('/api/financeiro/propostas');
      if (!res.ok) throw new Error('Não foi possível carregar a esteira financeira.');
      const data = await res.json();

      propostas = Array.isArray(data) ? data : [];

      // Deteção de novos contratos para alerta acústico
      const pendentesAtuais = propostas.filter((p) => p.status === 'enviado_financeiro').length;
      if (pendentesAtuais > totalPendentesAnterior && totalPendentesAnterior > 0) {
        emitirAlertaSonoroProposta();
        showToast('Nova proposta comercial recebida para análise de risco!', 'info');
      }
      totalPendentesAnterior = pendentesAtuais;

      atualizarContadoresTabs();
      renderizarListaFila();

      // Se a proposta ativa mudou de estado externamente, re-renderiza o espelho
      if (propostaAtiva) {
        const atualizada = propostas.find((p) => p.id === propostaAtiva.id);
        if (atualizada) {
          propostaAtiva = atualizada;
          exibirDetalheProposta(propostaAtiva);
        }
      }

      if (statusConectividade) {
        statusConectividade.className = 'connectivity-badge online';
        statusConectividade.innerHTML = '<span class="pulse-dot"></span> Sincronizado';
      }
    } catch (err) {
      if (statusConectividade) {
        statusConectividade.className = 'connectivity-badge offline';
        statusConectividade.innerHTML = '<span class="pulse-dot"></span> Erro de Conexão';
      }
      if (!silencioso) showToast(err.message, 'error');
    }
  }

  function atualizarContadoresTabs() {
    const pendentes = propostas.filter((p) => p.status === 'enviado_financeiro').length;
    const aprovados = propostas.filter((p) => ['aprovado', 'vendido'].includes(p.status)).length;
    const recusados = propostas.filter((p) => p.status === 'recusado').length;

    countFilaPendentes.textContent = pendentes;
    countTabPendentes.textContent = pendentes;
    countTabAprovados.textContent = aprovados;
    countTabRecusados.textContent = recusados;
  }

  // =========================================================================
  // 7. RENDERIZAÇÃO DA FILA DE CRÉDITO
  // =========================================================================
  function renderizarListaFila() {
    const filtrados = propostas.filter((p) => {
      const nome = (p.cliente_nome || p.nome_completo || '').toLowerCase();
      const empresa = (p.cliente_empresa || p.empresa || '').toLowerCase();
      const cnpj = (p.cnpj || '').toLowerCase();
      const atendeBusca =
        nome.includes(termoBusca) || empresa.includes(termoBusca) || cnpj.includes(termoBusca);

      if (!atendeBusca) return false;

      if (filtroAtual === 'pendentes') return p.status === 'enviado_financeiro';
      if (filtroAtual === 'aprovados') return ['aprovado', 'vendido'].includes(p.status);
      if (filtroAtual === 'recusados') return p.status === 'recusado';
      return true;
    });

    if (filtrados.length === 0) {
      containerListaPropostas.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 2.5rem 1rem;">
          Nenhum contrato neste filtro.
        </div>
      `;
      return;
    }

    containerListaPropostas.innerHTML = filtrados
      .map((p) => {
        const isSelected = propostaAtiva?.id === p.id;
        const total = Number(p.valor_total || 0);

        let badgeClass = 'status-enviado_financeiro';
        let badgeLabel = 'Em Análise';
        if (p.status === 'aprovado') {
          badgeClass = 'status-aprovado';
          badgeLabel = 'Aprovado';
        } else if (p.status === 'recusado') {
          badgeClass = 'status-recusado';
          badgeLabel = 'Recusado';
        } else if (p.status === 'vendido') {
          badgeClass = 'status-vendido';
          badgeLabel = 'Vendido 🏆';
        }

        return `
          <div class="proposta-queue-card ${isSelected ? 'selected' : ''}" data-id="${p.id}">
            <div class="queue-card-top">
              <span class="queue-card-name">${p.cliente_nome || p.nome_completo || 'Participante'}</span>
              <span class="status-pill-small ${badgeClass}">${badgeLabel}</span>
            </div>
            <div class="queue-card-company">${p.cliente_empresa || p.empresa || 'Empresa não informada'}</div>
            <div class="queue-card-bottom">
              <span class="queue-card-product">${p.produto_nome || 'Oferta Oficial'}</span>
              <span class="queue-card-price font-mono">${formatadorMoeda.format(total)}</span>
            </div>
          </div>
        `;
      })
      .join('');

    containerListaPropostas.querySelectorAll('.proposta-queue-card').forEach((card) => {
      card.addEventListener('click', () => {
        inicializarAudioContext();
        const id = Number(card.dataset.id);
        const selecionada = propostas.find((p) => p.id === id);
        if (selecionada) selecionarProposta(selecionada);
      });
    });
  }

  // =========================================================================
  // 8. ESPELHO DA PROPOSTA SELECIONADA
  // =========================================================================
  function selecionarProposta(proposta) {
    propostaAtiva = proposta;
    renderizarListaFila();
    exibirDetalheProposta(proposta);
  }

  function exibirDetalheProposta(p) {
    painelEmptyStateFinanceiro.style.display = 'none';
    painelDetalheProposta.style.display = 'block';

    viewPropostaId.textContent = `PROPOSTA #${p.id}`;
    viewStatusBadge.className = `status-pill-small status-${p.status}`;
    viewStatusBadge.textContent = (p.status || '').replace('_', ' ').toUpperCase();
    viewDataEmissao.textContent = p.created_at
      ? new Date(p.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : 'Hoje';

    const nome = p.cliente_nome || p.nome_completo || 'Participante';
    viewClienteAvatar.textContent = nome.charAt(0).toUpperCase();
    viewClienteNome.textContent = nome;
    viewClienteEmpresa.textContent = p.cliente_empresa || p.empresa || 'Não informada';
    viewClienteDoc.textContent = p.cnpj || p.cpf || 'Não informado';
    viewClienteTelefone.textContent = p.telefone || 'Sem telefone';
    viewClienteEmail.textContent = p.email || 'Sem e-mail';

    viewProdutoNome.textContent = p.produto_nome || 'Programa Oficial';
    viewValorTotal.textContent = formatadorMoeda.format(Number(p.valor_total || 0));
    viewValorEntrada.textContent = formatadorMoeda.format(Number(p.valor_entrada || 0));
    viewCashback.textContent = formatadorMoeda.format(Number(p.cashback || 0));
    viewMetodoPagamento.textContent = (p.metodo_pagamento || '').replace('_', ' ').toUpperCase();

    const parcelas = Number(p.quantidade_parcelas || 1);
    const valorParcela = Number(p.valor_parcela || 0);
    viewParcelamento.textContent = `${parcelas}x de ${formatadorMoeda.format(valorParcela)}`;

    // Regras Visuais de Acordo com o Status
    if (p.status === 'enviado_financeiro') {
      boxFormularioParecer.style.display = 'block';
      boxVendaConcretizada.style.display = 'none';
    } else if (p.status === 'aprovado') {
      boxFormularioParecer.style.display = 'none';
      boxVendaConcretizada.style.display = 'flex';
    } else {
      // Recusado ou Vendido
      boxFormularioParecer.style.display = 'none';
      boxVendaConcretizada.style.display = 'none';
    }
  }

  // =========================================================================
  // 9. PROCESSAR DECISÃO DE RISCO (APROVAR / RECUSAR)
  // =========================================================================
  async function executarDecisaoFinanceira(decisao, parecerTexto = '') {
    if (!propostaAtiva || isSubmitting) return;

    isSubmitting = true;
    btnAprovarProposta.disabled = true;
    btnRecusarModal.disabled = true;

    const payload = {
      propostaId: propostaAtiva.id,
      analistaId: sessao.id,
      statusSerasa: selectScoreSerasa.value,
      decisao,
      parecer: parecerTexto || inputParecerAuditoria.value,
    };

    try {
      const res = await fetch('/api/financeiro/analisar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || 'Falha ao processar análise financeira.');

      showToast(`Proposta #${propostaAtiva.id} marcada como ${decisao.toUpperCase()}!`, 'success');
      await carregarPropostasFinanceiro(true);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      isSubmitting = false;
      btnAprovarProposta.disabled = false;
      btnRecusarModal.disabled = false;
    }
  }

  btnAprovarProposta?.addEventListener('click', () => {
    executarDecisaoFinanceira('aprovado');
  });

  // Modal de Recusa
  btnRecusarModal?.addEventListener('click', () => {
    if (!propostaAtiva) return;
    modalRecusaSubtitulo.textContent = `Participante: ${propostaAtiva.cliente_nome || propostaAtiva.nome_completo}`;
    modalJustificativaDetalhada.value = '';
    modalRecusaFinanceira.classList.add('active');
    modalRecusaFinanceira.setAttribute('aria-hidden', 'false');
    setTimeout(() => modalJustificativaDetalhada.focus(), 100);
  });

  function fecharModalRecusa() {
    modalRecusaFinanceira.classList.remove('active');
    modalRecusaFinanceira.setAttribute('aria-hidden', 'true');
  }

  btnFecharModalRecusa?.addEventListener('click', fecharModalRecusa);
  btnCancelarModalRecusa?.addEventListener('click', fecharModalRecusa);

  formRecusaFinanceira?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const motivo = modalMotivoRecusa.options[modalMotivoRecusa.selectedIndex].text;
    const detalhes = modalJustificativaDetalhada.value.trim();
    const parecerConsolidado = `[${motivo}] ${detalhes}`;

    fecharModalRecusa();
    await executarDecisaoFinanceira('recusado', parecerConsolidado);
  });

  // =========================================================================
  // 10. CONCRETIZAR VENDA FINAL (ETAPA: VENDIDO)
  // =========================================================================
  btnConcretizarVenda?.addEventListener('click', async () => {
    if (!propostaAtiva || isSubmitting) return;

    if (!confirm(`Confirmar recebimento e concretizar a venda da Proposta #${propostaAtiva.id}?`)) {
      return;
    }

    isSubmitting = true;
    btnConcretizarVenda.disabled = true;
    btnConcretizarVenda.innerHTML = '<span class="spinner-border"></span> A concretizar...';

    try {
      const res = await fetch(`/api/propostas/${propostaAtiva.id}/vender`, {
        method: 'POST',
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || 'Falha ao concretizar venda.');

      showToast(`🏆 Venda da Proposta #${propostaAtiva.id} concretizada com sucesso!`, 'success');
      await carregarPropostasFinanceiro(true);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      isSubmitting = false;
      btnConcretizarVenda.disabled = false;
      btnConcretizarVenda.innerHTML =
        '<span class="kbd-hint">[V]</span> Marcar como Vendido Oficial';
    }
  });

  // =========================================================================
  // 11. ATALHOS DE TECLADO GLOBAIS (ACCESSIBILITY & SPEED)
  // =========================================================================
  window.addEventListener('keydown', (e) => {
    // Ignorar teclas se o operador estiver a escrever em inputs/textareas
    const tag = document.activeElement?.tagName?.toLowerCase();
    const isEditing = tag === 'input' || tag === 'textarea' || tag === 'select';

    if (modalRecusaFinanceira.classList.contains('active')) {
      if (e.key === 'Escape') fecharModalRecusa();
      return;
    }

    if (isEditing) return;

    const key = e.key.toUpperCase();

    // [A] - Aprovar
    if (key === 'A') {
      e.preventDefault();
      if (propostaAtiva && propostaAtiva.status === 'enviado_financeiro') {
        executarDecisaoFinanceira('aprovado');
      }
    }

    // [R] - Recusar
    if (key === 'R') {
      e.preventDefault();
      if (propostaAtiva && propostaAtiva.status === 'enviado_financeiro') {
        btnRecusarModal.click();
      }
    }

    // [V] - Vender
    if (key === 'V') {
      e.preventDefault();
      if (propostaAtiva && propostaAtiva.status === 'aprovado') {
        btnConcretizarVenda.click();
      }
    }

    // [ArrowDown] / [ArrowUp] - Navegação na fila
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const cards = Array.from(containerListaPropostas.querySelectorAll('.proposta-queue-card'));
      if (cards.length === 0) return;

      const currentIndex = cards.findIndex((c) => Number(c.dataset.id) === propostaAtiva?.id);
      let nextIndex = 0;

      if (e.key === 'ArrowDown') {
        nextIndex = currentIndex < cards.length - 1 ? currentIndex + 1 : 0;
      } else {
        nextIndex = currentIndex > 0 ? currentIndex - 1 : cards.length - 1;
      }

      const nextCard = cards[nextIndex];
      if (nextCard) {
        nextCard.click();
        nextCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  });

  // =========================================================================
  // 12. FILTROS & LISTENERS AUXILIARES
  // =========================================================================
  filterPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      filterPills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      filtroAtual = pill.dataset.filter || 'pendentes';
      renderizarListaFila();
    });
  });

  inputBuscaFinanceiro?.addEventListener('input', (e) => {
    termoBusca = e.target.value.toLowerCase().trim();
    renderizarListaFila();
  });

  btnAtualizarFila?.addEventListener('click', () => {
    carregarPropostasFinanceiro(false);
  });

  // Polling silencioso a cada 6 segundos para acompanhar o salão em tempo real
  setInterval(() => carregarPropostasFinanceiro(true), 6000);

  // Inicialização
  await carregarPropostasFinanceiro(false);
});
