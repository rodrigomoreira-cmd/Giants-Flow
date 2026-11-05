/**
 * D.CC - HUB / OVERVIEW SCRIPT
 * Sincronização em tempo real com filtro por Turma
 */

document.addEventListener('DOMContentLoaded', () => {
  const selectFiltroTurma = document.getElementById('selectFiltroTurma');
  const metricaFaturamento = document.getElementById('metricaFaturamento');
  const metricaTotalVendas = document.getElementById('metricaTotalVendas');
  const metricaFichas = document.getElementById('metricaFichas');
  const metricaTaxaConversao = document.getElementById('metricaTaxaConversao');
  const metricaConversaoDiff = document.getElementById('metricaConversaoDiff');
  const metricaTicketMedio = document.getElementById('metricaTicketMedio');
  const containerMixProdutos = document.getElementById('containerMixProdutos');
  const listaUltimasVendas = document.getElementById('listaUltimasVendas');
  const inputBusca = document.getElementById('inputBuscaParticipante');

  let clientesGeral = [];
  let propostasGeral = [];
  let produtosGeral = [];
  let turmasCarregadas = false;

  const formatadorMoeda = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  function formatarValorKPI(valor) {
    if (valor >= 1000000) return `R$ ${(valor / 1000000).toFixed(1).replace('.', ',')} mi`;
    if (valor >= 1000) return `R$ ${(valor / 1000).toFixed(1).replace('.', ',')} mil`;
    return formatadorMoeda.format(valor);
  }

  function escapeHtml(texto) {
    if (!texto) return '';
    return String(texto)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function carregarTurmas() {
    if (turmasCarregadas || !selectFiltroTurma) return;
    try {
      const res = await fetch('/api/auxiliares');
      if (res.ok) {
        const dados = await res.json();
        const turmas = dados.turmas || [];
        
        selectFiltroTurma.innerHTML = '<option value="">Todas as Turmas</option>';
        turmas.forEach((t) => {
          const opt = document.createElement('option');
          opt.value = String(t.id);
          opt.textContent = `${t.codigo} - ${t.nome}`;
          if (t.ativa) {
            opt.selected = true;
          }
          selectFiltroTurma.appendChild(opt);
        });
        turmasCarregadas = true;
      }
    } catch (e) {
      console.warn('Falha ao carregar lista de turmas:', e);
    }
  }

  function aplicarFiltroERenderizar() {
    const turmaId = selectFiltroTurma ? selectFiltroTurma.value : '';

    const clientesFiltrados = turmaId
      ? clientesGeral.filter((c) => String(c.turma_id) === String(turmaId))
      : clientesGeral;

    const propostasFiltradas = turmaId
      ? propostasGeral.filter((p) => {
          if (p.turma_id) return String(p.turma_id) === String(turmaId);
          return clientesFiltrados.some((c) => c.id === p.aplicacao_id);
        })
      : propostasGeral;

    const totalFichas = clientesFiltrados.length;
    const vendasFechadas = propostasFiltradas.filter((p) => p.status === 'vendido');
    const totalVendas = vendasFechadas.length;
    const totalFaturado = vendasFechadas.reduce(
      (acc, p) => acc + (Number(p.valor_total) || 0),
      0
    );
    const taxaConversao =
      totalFichas > 0 ? ((totalVendas / totalFichas) * 100).toFixed(1) : '0.0';
    const ticketMedio = totalVendas > 0 ? totalFaturado / totalVendas : 0;

    if (metricaFaturamento) metricaFaturamento.textContent = formatarValorKPI(totalFaturado);
    if (metricaTotalVendas)
      metricaTotalVendas.textContent = `${totalVendas} ${totalVendas === 1 ? 'venda' : 'vendas'}`;
    if (metricaFichas) metricaFichas.textContent = String(totalFichas);
    if (metricaTaxaConversao) metricaTaxaConversao.textContent = `${taxaConversao}%`;
    if (metricaConversaoDiff)
      metricaConversaoDiff.textContent = totalVendas > 0 ? '+0.0%' : '0.0%';
    if (metricaTicketMedio) metricaTicketMedio.textContent = formatarValorKPI(ticketMedio);

    renderizarMix(vendasFechadas, produtosGeral);
    renderizarFechamentos(vendasFechadas, clientesFiltrados);
  }

  function renderizarMix(vendas, produtos) {
    if (!containerMixProdutos) return;

    if (!produtos || produtos.length === 0) {
      containerMixProdutos.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 3rem 1rem; color: var(--text-muted); text-align: center; gap: 0.5rem;">
          <span class="material-symbols-outlined" style="font-size: 38px; color: #CBD5E1;">inventory_2</span>
          <span style="font-weight: 700; font-size: 0.9rem; color: var(--text-secondary);">Nenhum produto cadastrado</span>
        </div>
      `;
      return;
    }

    const totalVendas = vendas.length;
    containerMixProdutos.innerHTML = produtos
      .map((prod) => {
        const nomeProd = prod.nome || '';
        const vendasDesteProduto = vendas.filter(
          (v) => (v.produto_nome || '').trim().toLowerCase() === nomeProd.trim().toLowerCase()
        ).length;
        const pct = totalVendas > 0 ? Math.round((vendasDesteProduto / totalVendas) * 100) : 0;

        return `
          <div class="mix-bar-item">
            <div class="mix-bar-meta">
              <span class="mix-product-name">${escapeHtml(nomeProd)}</span>
              <span class="mix-product-percent">${pct}% (${vendasDesteProduto})</span>
            </div>
            <div class="mix-track">
              <div class="mix-fill" style="width: ${pct}%;"></div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function renderizarFechamentos(vendas, clientes) {
    if (!listaUltimasVendas) return;

    if (vendas.length === 0) {
      listaUltimasVendas.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 3rem 1rem; color: var(--text-muted); text-align: center; gap: 0.5rem;">
          <span class="material-symbols-outlined" style="font-size: 38px; color: #CBD5E1;">receipt_long</span>
          <span style="font-weight: 700; font-size: 0.9rem; color: var(--text-secondary);">Nenhum fechamento registrado</span>
          <span style="font-size: 0.775rem;">As vendas formalizadas no salão aparecerão aqui em tempo real.</span>
        </div>
      `;
      return;
    }

    listaUltimasVendas.innerHTML = vendas
      .map((v) => {
        const cliente = clientes.find((cli) => cli.id === v.aplicacao_id) || {};
        const nome = v.cliente_nome || cliente.nome_completo || 'Participante';
        const produto = v.produto_nome || 'Programa de Aceleração';
        const valor = Number(v.valor_total || 0);
        const dataHora = v.created_at
          ? new Date(v.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : '--:--';

        return `
          <div class="recent-sale-row">
            <div class="recent-sale-avatar">${escapeHtml(nome.charAt(0).toUpperCase())}</div>
            <div class="recent-sale-info">
              <div class="recent-sale-client">${escapeHtml(nome)}</div>
              <div class="recent-sale-product">${escapeHtml(produto)} • ${dataHora}</div>
            </div>
            <div class="recent-sale-value-col">
              <span class="recent-sale-amount">${formatadorMoeda.format(valor)}</span>
              <span class="recent-sale-time">Confirmado</span>
            </div>
          </div>
        `;
      })
      .join('');
  }

  async function atualizarPainelHub() {
    try {
      await carregarTurmas();

      const [resClientes, resPropostas, resProdutos] = await Promise.all([
        fetch('/api/clientes').catch(() => ({ ok: false })),
        fetch('/api/propostas').catch(() => ({ ok: false })),
        fetch('/api/produtos').catch(() => ({ ok: false })),
      ]);

      if (resClientes.ok) clientesGeral = await resClientes.json();
      if (resPropostas.ok) propostasGeral = await resPropostas.json();
      if (resProdutos.ok) produtosGeral = await resProdutos.json();

      aplicarFiltroERenderizar();
    } catch (err) {
      console.error('Erro na atualização do Hub:', err);
    }
  }

  if (selectFiltroTurma) {
    selectFiltroTurma.addEventListener('change', () => {
      aplicarFiltroERenderizar();
    });
  }

  if (inputBusca) {
    inputBusca.addEventListener('input', (e) => {
      const termo = e.target.value.toLowerCase().trim();
      const linhas = listaUltimasVendas.querySelectorAll('.recent-sale-row');
      linhas.forEach((linha) => {
        const texto = linha.textContent.toLowerCase();
        linha.style.display = texto.includes(termo) ? 'flex' : 'none';
      });
    });
  }

  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (inputBusca) inputBusca.focus();
    }
  });

  atualizarPainelHub();
  setInterval(atualizarPainelHub, 10000);
});
