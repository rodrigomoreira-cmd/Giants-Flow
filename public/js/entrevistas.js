// public/js/entrevistas.js
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';

  // =========================================================================
  // 1. VERIFICAÇÃO DE SESSÃO & CABEÇALHO DO OPERADOR
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

  if (labelNomeUsuario) labelNomeUsuario.textContent = sessao.nome || 'Operador';
  if (badgePapelUsuario) badgePapelUsuario.textContent = (sessao.papel || 'OPERADOR').toUpperCase();
  if (avatarOperadorLetra) {
    avatarOperadorLetra.innerHTML = `${(sessao.nome || 'O').charAt(0).toUpperCase()}<span class="avatar-online-dot"></span>`;
  }

  btnEncerrarSessao?.addEventListener('click', () => {
    localStorage.removeItem('sessao_operador');
    window.location.href = '/login';
  });

  // =========================================================================
  // 2. ELEMENTOS DA INTERFACE (DOM)
  // =========================================================================
  const selectTurma = document.getElementById('selectTurma');
  const selectOrientacaoPalco = document.getElementById('selectOrientacaoPalco');
  const floorStageWrapper = document.getElementById('floorStageWrapper');
  const tablesStage = document.getElementById('tablesStage');
  const guestListContainer = document.getElementById('guestListContainer');
  const inputBuscaParticipante = document.getElementById('inputBuscaParticipante');
  const selectLocalizarMesa = document.getElementById('selectLocalizarMesa');
  const canvasSummary = document.getElementById('canvasSummary');
  const btnAdicionarMesa = document.getElementById('btnAdicionarMesa');
  const zoomIndicator = document.getElementById('zoomIndicator');
  const btnZoomIn = document.getElementById('btnZoomIn');
  const btnZoomOut = document.getElementById('btnZoomOut');
  const btnZoomReset = document.getElementById('btnZoomReset');
  const filterBtns = document.querySelectorAll('.pill-btn');

  // Elementos do Modal de Parecer
  const modalResultadoEntrevista = document.getElementById('modalResultadoEntrevista');
  const formResultadoEntrevista = document.getElementById('formResultadoEntrevista');
  const modalResultadoTitulo = document.getElementById('modalResultadoTitulo');
  const modalResultadoMeta = document.getElementById('modalResultadoMeta');
  const modalResultadoAplicacaoId = document.getElementById('modalResultadoAplicacaoId');
  const modalResultadoObservacoes = document.getElementById('modalResultadoObservacoes');
  const btnFecharModalResultado = document.getElementById('btnFecharModalResultado');
  const btnCancelarModalResultado = document.getElementById('btnCancelarModalResultado');
  const btnTurnoAlmoco = document.getElementById('btnTurnoAlmoco');
  const btnTurnoJantar = document.getElementById('btnTurnoJantar');
  const btnSalvarModalResultado = document.getElementById('btnSalvarModalResultado');

  // =========================================================================
  // 3. ESTADO LOCAL DO SALÃO
  // =========================================================================
  let turmas = [];
  let mesas = [];
  let participantes = [];
  let entrevistadores = [];
  let participanteSelecionado = null;
  let filtroAtual = 'pendentes';
  let termoBusca = '';
  let zoomAtual = 1;
  let turnoSelecionadoModal = 'almoco';
  let isSubmitting = false;

  // Sanitizador defensivo de acentuação (UTF-8)
  function sanitizarTexto(txt) {
    if (!txt) return '';
    return String(txt)
      .replace(/Imers\?\?o/gi, 'Imersão')
      .replace(/Implementa\?\?\?\?o/gi, 'Implementação')
      .replace(/Inscri\?\?o/gi, 'Inscrição')
      .replace(/\?\?/g, 'çã');
  }

  // =========================================================================
  // 4. SERVIÇO DE TOASTS
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

  // =========================================================================
  // 5. CONTROLES DE ZOOM E ORIENTAÇÃO DO PALCO
  // =========================================================================
  function aplicarZoom(novoZoom) {
    zoomAtual = Math.min(Math.max(novoZoom, 0.5), 1.8);
    if (floorStageWrapper) {
      floorStageWrapper.style.transform = `scale(${zoomAtual})`;
    }
    if (zoomIndicator) {
      zoomIndicator.textContent = `${Math.round(zoomAtual * 100)}%`;
    }
  }

  btnZoomIn?.addEventListener('click', () => aplicarZoom(zoomAtual + 0.1));
  btnZoomOut?.addEventListener('click', () => aplicarZoom(zoomAtual - 0.1));
  btnZoomReset?.addEventListener('click', () => aplicarZoom(1));

  selectOrientacaoPalco?.addEventListener('change', () => {
    if (!floorStageWrapper) return;
    floorStageWrapper.className = `floor-stage-wrapper pos-${selectOrientacaoPalco.value}`;
  });

  // =========================================================================
  // 6. FILTROS E BUSCA NA SIDEBAR DE PARTICIPANTES
  // =========================================================================
  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      filtroAtual = btn.dataset.filter || 'pendentes';
      renderizarListaParticipantes();
    });
  });

  inputBuscaParticipante?.addEventListener('input', (e) => {
    termoBusca = e.target.value.toLowerCase().trim();
    renderizarListaParticipantes();
  });

  // =========================================================================
  // 7. CARGA DE DADOS DO SALÃO
  // =========================================================================
  async function carregarDadosSalao() {
    try {
      let data = null;
      try {
        const resIniciais = await fetch('/api/apoio/dados-iniciais');
        if (resIniciais.ok) {
          data = await resIniciais.json();
        }
      } catch (errApi) {
        data = null;
      }

      if (!data) {
        const resAux = await fetch('/api/auxiliares');
        if (!resAux.ok) throw new Error('Não foi possível carregar os dados estruturais do salão.');
        data = await resAux.json();
      }

      turmas = data.turmas || [];
      entrevistadores = data.entrevistadores || [];
      mesas = (data.mesas || []).map((m) => ({
        id: Number(m.id),
        numero: Number(m.numero),
        capacidade_total: Number(m.capacidade_total || 4),
        ocupantes: Number(m.ocupantes || 0),
        tem_entrevistador: m.tem_entrevistador !== false,
        ocupantes_detalhes: Array.isArray(m.ocupantes_detalhes) ? m.ocupantes_detalhes : [],
      }));

      // Preenchimento com nomes de turmas sanitizados
      if (selectTurma && selectTurma.options.length === 0 && turmas.length > 0) {
        selectTurma.innerHTML = '';
        turmas.forEach((t) => {
          const opt = document.createElement('option');
          opt.value = t.id;
          opt.textContent = `${t.codigo || 'T'} - ${sanitizarTexto(t.nome)}`;
          selectTurma.appendChild(opt);
        });
      }

      const turmaIdAtual = selectTurma?.value || turmas[0]?.id || 1;
      await carregarParticipantesDaTurma(turmaIdAtual);

      renderizarMesas();
      atualizarResumoSalao();
      atualizarSeletorLocalizador();
    } catch (err) {
      console.error('🔴 [carregarDadosSalao] Erro:', err.message);
      showToast(err.message, 'error');
    }
  }

  async function carregarParticipantesDaTurma(turmaId) {
    try {
      const res = await fetch(`/api/clientes?turmaId=${turmaId}`);
      if (!res.ok) throw new Error('Erro ao carregar participantes da turma.');
      participantes = await res.json();
      renderizarListaParticipantes();
    } catch (err) {
      console.error('🔴 [carregarParticipantesDaTurma] Erro:', err.message);
      showToast(err.message, 'error');
    }
  }

  // =========================================================================
  // 8. RENDERIZAÇÃO DA LISTA DE PARTICIPANTES
  // =========================================================================
  function renderizarListaParticipantes() {
    if (!guestListContainer) return;
    guestListContainer.innerHTML = '';

    const filtrados = participantes.filter((p) => {
      const nome = (p.nome_completo || p.nome || '').toLowerCase();
      const empresa = (p.empresa || '').toLowerCase();
      const atendeBusca = nome.includes(termoBusca) || empresa.includes(termoBusca);

      const estaSentado = mesas.some((m) =>
        (m.ocupantes_detalhes || []).some((oc) => oc.aplicacao_id === p.id)
      );

      if (!atendeBusca) return false;

      if (filtroAtual === 'pendentes') {
        return p.etapa_atual === 'ficha_preenchida' && !estaSentado;
      }
      if (filtroAtual === 'sentados') {
        return estaSentado;
      }
      return true;
    });

    if (filtrados.length === 0) {
      guestListContainer.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 2rem 1rem;">
          Nenhum participante disponível.
        </div>
      `;
      return;
    }

    filtrados.forEach((p) => {
      const mesaAlocada = mesas.find((m) =>
        (m.ocupantes_detalhes || []).some((oc) => oc.aplicacao_id === p.id)
      );

      const isLocked = !mesaAlocada && p.etapa_atual !== 'ficha_preenchida';

      let statusBadgeHtml = '';
      if (mesaAlocada) {
        statusBadgeHtml = `<span class="badge-mesa-info" title="Clique para focar no salão">Mesa ${mesaAlocada.numero}</span>`;
      } else if (p.etapa_atual === 'proposta_liberada') {
        statusBadgeHtml = `<span class="badge-etapa badge-etapa-liberado">Proposta Liberada</span>`;
      } else if (
        p.etapa_atual === 'em_analise_financeira' ||
        p.etapa_atual === 'aprovado_financeiro'
      ) {
        statusBadgeHtml = `<span class="badge-etapa badge-etapa-financeiro">Financeiro</span>`;
      } else if (p.etapa_atual === 'vendido') {
        statusBadgeHtml = `<span class="badge-etapa badge-etapa-vendido">Vendido</span>`;
      } else if (p.etapa_atual === 'reprovado') {
        statusBadgeHtml = `<span class="badge-etapa badge-etapa-reprovado">Reprovado</span>`;
      }

      const item = document.createElement('div');
      item.className = `guest-item ${mesaAlocada ? 'item-seated' : ''} ${isLocked ? 'item-locked' : ''} ${
        participanteSelecionado?.id === p.id ? 'selected' : ''
      }`;

      item.innerHTML = `
        <div class="guest-info">
          <div class="guest-avatar">${(p.nome_cracha || p.nome_completo || 'P').charAt(0).toUpperCase()}</div>
          <div style="overflow: hidden;">
            <div class="guest-details-name">${p.nome_cracha || p.nome_completo}</div>
            <div class="guest-details-company">${p.empresa || 'Empresa não informada'}</div>
          </div>
        </div>
        ${statusBadgeHtml}
      `;

      item.addEventListener('click', () => {
        if (mesaAlocada) {
          focarMesa(mesaAlocada.numero);
          return;
        }

        if (isLocked) {
          showToast(
            `Participante já avançou para a etapa: ${p.etapa_atual}. Não pode ser agendado.`,
            'info'
          );
          return;
        }

        if (participanteSelecionado?.id === p.id) {
          participanteSelecionado = null;
          item.classList.remove('selected');
        } else {
          participanteSelecionado = p;
          document.querySelectorAll('.guest-item').forEach((el) => el.classList.remove('selected'));
          item.classList.add('selected');
        }
      });

      guestListContainer.appendChild(item);
    });
  }

  // =========================================================================
  // 9. RENDERIZAÇÃO DAS MESAS REDONDAS & CADEIRAS (GOOGLE MATERIAL SYMBOLS)
  // =========================================================================
  function renderizarMesas() {
    if (!tablesStage) return;
    tablesStage.innerHTML = '';

    mesas.forEach((m) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'table-wrapper';
      wrapper.id = `mesa-wrapper-${m.numero}`;

      const container = document.createElement('div');
      container.className = 'round-table-container';

      // Tampo Central da Mesa
      const surface = document.createElement('div');
      surface.className = 'table-surface circle';
      surface.innerHTML = `
        <div class="table-title">Mesa ${m.numero}</div>
        <div class="table-capacity-tag">${m.ocupantes}/${m.capacidade_total}</div>
        <div class="table-controls">
          <button type="button" class="btn-ctrl" data-action="dec-cap" title="Diminuir cadeiras">
            <span class="material-symbols-outlined" style="font-size: 14px;">remove</span>
          </button>
          <button type="button" class="btn-ctrl" data-action="inc-cap" title="Aumentar cadeiras">
            <span class="material-symbols-outlined" style="font-size: 14px;">add</span>
          </button>
          <button type="button" class="btn-ctrl btn-ctrl-entrevistador ${m.tem_entrevistador ? 'ativo' : ''}" title="Alternar Entrevistador">
            <span class="material-symbols-outlined" style="font-size: 14px;">mic</span>
          </button>
          <button type="button" class="btn-ctrl btn-ctrl-delete" title="Excluir mesa">
            <span class="material-symbols-outlined" style="font-size: 14px;">delete</span>
          </button>
        </div>
      `;

      surface.querySelector('[data-action="inc-cap"]').addEventListener('click', (e) => {
        e.stopPropagation();
        alterarCapacidadeMesa(m.id, 1);
      });

      surface.querySelector('[data-action="dec-cap"]').addEventListener('click', (e) => {
        e.stopPropagation();
        alterarCapacidadeMesa(m.id, -1);
      });

      surface.querySelector('.btn-ctrl-entrevistador').addEventListener('click', (e) => {
        e.stopPropagation();
        alternarEntrevistadorMesa(m.id);
      });

      surface.querySelector('.btn-ctrl-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        removerMesa(m.id, m.numero);
      });

      container.appendChild(surface);

      // Distribuição Espacial Orbital das Cadeiras
      const totalLugares = m.capacidade_total + (m.tem_entrevistador ? 1 : 0);
      const raio = 105;
      const anguloPasso = (2 * Math.PI) / totalLugares;
      const ocupantes = m.ocupantes_detalhes || [];

      let ocupanteIndex = 0;

      for (let i = 0; i < totalLugares; i++) {
        const angulo = i * anguloPasso - Math.PI / 2;
        const x = 125 + raio * Math.cos(angulo);
        const y = 125 + raio * Math.sin(angulo);

        const chair = document.createElement('div');
        chair.style.left = `${x}px`;
        chair.style.top = `${y}px`;

        if (i === 0 && m.tem_entrevistador) {
          // Cadeira reservada do Entrevistador
          chair.className = 'chair-slot interviewer-chair';
          chair.innerHTML = `
            <div class="chair-avatar">
              <span class="material-symbols-outlined" style="font-size: 16px;">mic</span>
            </div>
            <span class="chair-name">Mesa ${m.numero}</span>
          `;
        } else {
          // Assentos dos Participantes
          const ocupante = ocupantes[ocupanteIndex];
          ocupanteIndex++;

          if (ocupante) {
            chair.className = 'chair-slot occupied';
            chair.innerHTML = `
              <div class="chair-avatar" title="${ocupante.nome || 'Participante'}">
                <span class="material-symbols-outlined" style="font-size: 16px;">person</span>
              </div>
              <span class="chair-name">${ocupante.nome_cracha || (ocupante.nome || 'P').split(' ')[0]}</span>
              <button type="button" class="chair-remove-btn" title="Desalocar cadeira">
                <span class="material-symbols-outlined" style="font-size: 11px;">close</span>
              </button>
            `;

            chair.querySelector('.chair-remove-btn')?.addEventListener('click', (e) => {
              e.stopPropagation();
              desalocarParticipante(ocupante.entrevista_id);
            });

            chair.addEventListener('click', () => abrirModalResultado(ocupante, m.numero));
          } else {
            chair.className = 'chair-slot empty';
            chair.innerHTML = `
              <div class="chair-avatar" title="Lugar vago">
                <span class="material-symbols-outlined" style="font-size: 16px;">add</span>
              </div>
              <span class="chair-name">Livre</span>
            `;

            chair.addEventListener('click', () => {
              if (!participanteSelecionado) {
                showToast(
                  'Selecione primeiro um participante na lista lateral para sentar nesta cadeira.',
                  'info'
                );
                return;
              }
              alocarParticipanteNaMesa(participanteSelecionado.id, m.id);
            });
          }
        }

        container.appendChild(chair);
      }

      wrapper.appendChild(container);
      tablesStage.appendChild(wrapper);
    });
  }

  // =========================================================================
  // 10. AÇÕES DE MESAS
  // =========================================================================
  btnAdicionarMesa?.addEventListener('click', async () => {
    try {
      const proxNumero = mesas.length > 0 ? Math.max(...mesas.map((m) => m.numero)) + 1 : 1;
      const res = await fetch('/api/mesas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero: proxNumero, capacidadeTotal: 4 }),
      });
      if (!res.ok) throw new Error('Falha ao adicionar mesa.');
      showToast(`Mesa #${proxNumero} adicionada ao salão.`, 'success');
      await carregarDadosSalao();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  async function alterarCapacidadeMesa(id, delta) {
    try {
      const res = await fetch(`/api/mesas/${id}/capacidade`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta }),
      });
      if (!res.ok) throw new Error('Não foi possível alterar a capacidade da mesa.');
      await carregarDadosSalao();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function alternarEntrevistadorMesa(id) {
    try {
      const res = await fetch(`/api/mesas/${id}/entrevistador`, { method: 'PATCH' });
      if (!res.ok) throw new Error('Falha ao alternar cadeira do entrevistador.');
      await carregarDadosSalao();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function removerMesa(id, numero) {
    if (!confirm(`Deseja realmente remover a Mesa ${numero}?`)) return;
    try {
      const res = await fetch(`/api/mesas/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.erro || 'Falha ao remover mesa.');
      showToast(`Mesa ${numero} removida do salão.`, 'info');
      await carregarDadosSalao();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // =========================================================================
  // 11. ALOCAÇÃO & DESALOCAÇÃO DE PARTICIPANTES
  // =========================================================================
  async function alocarParticipanteNaMesa(aplicacaoId, mesaId) {
    const entrevistadorPadrao = entrevistadores[0]?.id || sessao.id;
    try {
      const res = await fetch('/api/entrevistas/agendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aplicacaoId,
          mesaId,
          entrevistadorId: entrevistadorPadrao,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.erro || 'Não foi possível alocar o participante na mesa.');
      }

      showToast('Participante alocado com sucesso!', 'success');
      participanteSelecionado = null;
      await carregarDadosSalao();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function desalocarParticipante(entrevistaId) {
    if (!confirm('Deseja retirar este participante da mesa e devolvê-lo à fila?')) return;
    try {
      const res = await fetch(`/api/mesas/cadeiras/${entrevistaId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao desalocar participante.');
      showToast('Cadeira liberada. Participante retornado para a fila.', 'info');
      await carregarDadosSalao();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // =========================================================================
  // 12. MODAL DE AVALIAÇÃO DE ENTREVISTA
  // =========================================================================
  function abrirModalResultado(ocupante, mesaNumero) {
    modalResultadoAplicacaoId.value = ocupante.aplicacao_id;
    modalResultadoTitulo.textContent = `Avaliar: ${ocupante.nome_cracha || ocupante.nome}`;
    modalResultadoMeta.textContent = `Mesa ${mesaNumero} • ${ocupante.empresa || 'Empresa não informada'}`;
    modalResultadoObservacoes.value = ocupante.observacoes || '';

    turnoSelecionadoModal = 'almoco';
    btnTurnoAlmoco?.classList.add('active');
    btnTurnoJantar?.classList.remove('active');

    const radioAprovado = formResultadoEntrevista.querySelector('input[value="aprovado"]');
    if (radioAprovado) radioAprovado.checked = true;

    modalResultadoEntrevista.classList.add('active');
    modalResultadoEntrevista.setAttribute('aria-hidden', 'false');
  }

  function fecharModalResultado() {
    modalResultadoEntrevista.classList.remove('active');
    modalResultadoEntrevista.setAttribute('aria-hidden', 'true');
    formResultadoEntrevista.reset();
  }

  btnFecharModalResultado?.addEventListener('click', fecharModalResultado);
  btnCancelarModalResultado?.addEventListener('click', fecharModalResultado);

  btnTurnoAlmoco?.addEventListener('click', () => {
    turnoSelecionadoModal = 'almoco';
    btnTurnoAlmoco.classList.add('active');
    btnTurnoJantar.classList.remove('active');
  });

  btnTurnoJantar?.addEventListener('click', () => {
    turnoSelecionadoModal = 'jantar';
    btnTurnoJantar.classList.add('active');
    btnTurnoAlmoco.classList.remove('active');
  });

  formResultadoEntrevista?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    const aplicacaoId = Number(modalResultadoAplicacaoId.value);
    const resultado = formResultadoEntrevista.decisaoEntrevista.value;
    const observacao = modalResultadoObservacoes.value;

    if (!aplicacaoId || !resultado) {
      showToast('Selecione uma decisão para concluir a avaliação.', 'error');
      return;
    }

    isSubmitting = true;
    btnSalvarModalResultado.disabled = true;
    btnSalvarModalResultado.textContent = 'Gravando no Banco...';

    try {
      const res = await fetch('/api/entrevistas/resultado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aplicacaoId,
          turno: turnoSelecionadoModal,
          resultado,
          observacao,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.erro || 'Falha ao registrar resultado no servidor.');
      }

      fecharModalResultado();
      const msgResultado =
        resultado === 'aprovado' ? 'Aprovado para Proposta!' : 'Desqualificado / Reprovado.';
      showToast(`Parecer concluído: ${msgResultado} Assento liberado no salão.`, 'success');
      await carregarDadosSalao();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      isSubmitting = false;
      btnSalvarModalResultado.disabled = false;
      btnSalvarModalResultado.textContent = 'Concluir & Liberar Cadeira';
    }
  });

  // =========================================================================
  // 13. RESUMO DO SALÃO & LOCALIZADOR
  // =========================================================================
  function atualizarResumoSalao() {
    if (!canvasSummary) return;
    const totalMesas = mesas.length;
    let vagasLivres = 0;

    mesas.forEach((m) => {
      const ocupados = m.ocupantes || 0;
      vagasLivres += Math.max(0, m.capacidade_total - ocupados);
    });

    canvasSummary.innerHTML = `
      ${totalMesas} Mesa${totalMesas !== 1 ? 's' : ''} • <span class="highlight-green">${vagasLivres} Lugar${
        vagasLivres !== 1 ? 'es' : ''
      } Livre${vagasLivres !== 1 ? 's' : ''}</span>
    `;
  }

  function atualizarSeletorLocalizador() {
    if (!selectLocalizarMesa) return;
    selectLocalizarMesa.innerHTML = '<option value="">Localizar quem está na mesa...</option>';

    mesas.forEach((m) => {
      const opt = document.createElement('option');
      opt.value = m.numero;
      const ocupantesNomes = (m.ocupantes_detalhes || [])
        .map((oc) => oc.nome_cracha || (oc.nome || '').split(' ')[0])
        .filter(Boolean)
        .join(', ');
      opt.textContent = `Mesa ${m.numero} (${m.ocupantes || 0} p.) ${ocupantesNomes ? `- ${ocupantesNomes}` : ''}`;
      selectLocalizarMesa.appendChild(opt);
    });
  }

  selectLocalizarMesa?.addEventListener('change', () => {
    const num = selectLocalizarMesa.value;
    if (num) focarMesa(num);
  });

  function focarMesa(numero) {
    const el = document.getElementById(`mesa-wrapper-${numero}`);
    if (!el) return;
    document.querySelectorAll('.table-wrapper').forEach((w) => w.classList.remove('mesa-foco'));
    el.classList.add('mesa-foco');
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    setTimeout(() => el.classList.remove('mesa-foco'), 3500);
  }

  selectTurma?.addEventListener('change', () => {
    carregarParticipantesDaTurma(selectTurma.value);
  });

  setInterval(carregarDadosSalao, 8000);
  await carregarDadosSalao();
});
