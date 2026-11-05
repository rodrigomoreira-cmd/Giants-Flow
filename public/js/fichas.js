// public/js/fichas.js
document.addEventListener('DOMContentLoaded', async () => {
  const sessaoRaw = localStorage.getItem('sessao_operador');
  if (!sessaoRaw) {
    window.location.href = '/login';
    return;
  }
  const sessao = JSON.parse(sessaoRaw);

  // Elementos do Layout Principal
  const selectTurma = document.getElementById('selectTurma');
  const selectCaptador = document.getElementById('selectCaptador');
  const formFicha = document.getElementById('formFicha');
  const btnSalvarFicha = document.getElementById('btnSalvarFicha');
  const listaFichasCorpo = document.getElementById('listaFichasCorpo');
  const contadorFichas = document.getElementById('contadorFichas');

  // Elementos do Modal de Edição
  const modalEditar = document.getElementById('modalEditarCliente');
  const formEditar = document.getElementById('formEditarCliente');
  const btnSalvarEdicao = document.getElementById('btnSalvarEdicao');
  const btnFecharModalEdicao = document.getElementById('btnFecharModalEdicao');
  const btnCancelarEdicao = document.getElementById('btnCancelarEdicao');
  const editClienteId = document.getElementById('editClienteId');
  const editNomeCompleto = document.getElementById('editNomeCompleto');
  const editNomeCracha = document.getElementById('editNomeCracha');
  const editCnpj = document.getElementById('editCnpj');
  const editEmpresa = document.getElementById('editEmpresa');
  const editTelefone = document.getElementById('editTelefone');
  const editEmail = document.getElementById('editEmail');
  const editSelectCaptador = document.getElementById('editSelectCaptador');

  let turmasCarregadas = [];
  let captadoresCarregados = [];

  function escapeHtml(texto) {
    if (!texto) return '';
    return String(texto)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // 1. Carga Inicial
  async function carregarDadosIniciais() {
    try {
      const res = await fetch('/api/auxiliares');
      if (!res.ok) throw new Error('Falha ao obter dados auxiliares.');
      const data = await res.json();

      turmasCarregadas = data.turmas || [];
      captadoresCarregados = data.captadores || [];

      // Popula Select de Turmas
      selectTurma.innerHTML = '';
      if (turmasCarregadas.length === 0) {
        selectTurma.innerHTML = '<option value="">Sem turmas disponíveis</option>';
      } else {
        turmasCarregadas.forEach((t) => {
          const opt = document.createElement('option');
          opt.value = t.id;
          opt.textContent = `${t.codigo} - ${t.nome}`;
          selectTurma.appendChild(opt);
        });
      }

      // Popula Selects de Captadores (Cadastro e Edição)
      selectCaptador.innerHTML = '<option value="">Selecione o Captador</option>';
      if (editSelectCaptador) {
        editSelectCaptador.innerHTML = '<option value="">Sem captador definido</option>';
      }

      captadoresCarregados.forEach((c) => {
        const optCadastro = document.createElement('option');
        optCadastro.value = c.id;
        optCadastro.textContent = c.nome;
        if (c.id === sessao.id) optCadastro.selected = true;
        selectCaptador.appendChild(optCadastro);

        if (editSelectCaptador) {
          const optEdit = document.createElement('option');
          optEdit.value = c.id;
          optEdit.textContent = c.nome;
          editSelectCaptador.appendChild(optEdit);
        }
      });

      if (turmasCarregadas.length > 0) {
        await carregarListaClientes(selectTurma.value);
      }
    } catch (err) {
      console.error('Erro na inicialização:', err);
      listaFichasCorpo.innerHTML = `<tr><td colspan="7" class="table-empty" style="color:var(--danger);">Erro de conexão com o servidor.</td></tr>`;
    }
  }

  // 2. Renderização da Tabela
  async function carregarListaClientes(turmaId) {
    if (!turmaId) {
      listaFichasCorpo.innerHTML = `<tr><td colspan="7" class="table-empty">Selecione uma turma para carregar as fichas.</td></tr>`;
      contadorFichas.textContent = '0 Fichas';
      return;
    }

    try {
      listaFichasCorpo.innerHTML = `<tr><td colspan="7" class="table-empty">Carregando participantes...</td></tr>`;
      const res = await fetch(`/api/clientes?turmaId=${turmaId}`);
      const clientes = await res.json();

      if (!res.ok || !Array.isArray(clientes)) {
        throw new Error(clientes.erro || 'Falha ao buscar participantes.');
      }

      listaFichasCorpo.innerHTML = '';
      contadorFichas.textContent = `${clientes.length} Ficha${clientes.length !== 1 ? 's' : ''}`;

      if (clientes.length === 0) {
        listaFichasCorpo.innerHTML = `<tr><td colspan="7" class="table-empty">Nenhum participante cadastrado nesta turma.</td></tr>`;
        return;
      }

      clientes.forEach((c) => {
        const tr = document.createElement('tr');
        let badgeClasse = 'badge-yellow';
        let etapaTexto = 'Aguardando Mesa';

        if (c.etapa_atual === 'em_entrevista') {
          badgeClasse = 'badge-blue';
          etapaTexto = 'Em Entrevista';
        } else if (
          c.etapa_atual === 'proposta_liberada' ||
          c.etapa_atual === 'em_analise_financeira'
        ) {
          badgeClasse = 'badge-yellow';
          etapaTexto = 'Em Análise de Crédito';
        } else if (c.etapa_atual === 'aprovado_financeiro' || c.proposta_status === 'aprovado') {
          badgeClasse = 'badge-blue';
          etapaTexto = 'Crédito Aprovado';
        } else if (c.etapa_atual === 'vendido' || c.proposta_status === 'vendido') {
          badgeClasse = 'badge-green';
          etapaTexto = 'Vendido';
        } else if (c.etapa_atual === 'reprovado') {
          badgeClasse = 'badge-red';
          etapaTexto = 'Reprovado / Baixa';
        }

        // Mantém Editar sempre visível e adiciona Fechar Venda quando liberado
        let actionsHtml = `
          <button type="button" class="btn btn-secondary btn-sm" data-action="editar">✏️ Editar</button>
        `;

        const aptoParaFechamento =
          (c.etapa_atual === 'aprovado_financeiro' || c.proposta_status === 'aprovado') &&
          c.etapa_atual !== 'vendido';

        if (aptoParaFechamento && c.proposta_id) {
          actionsHtml += `
            <button type="button" class="btn btn-primary btn-sm" data-action="fechar-venda" data-proposta="${c.proposta_id}">
              🤝 Fechar Venda
            </button>
          `;
        } else if (c.etapa_atual === 'vendido' || c.proposta_status === 'vendido') {
          actionsHtml += `<span style="font-size:0.8rem; color:var(--success); font-weight:700;">✓ Finalizado</span>`;
        }

        tr.innerHTML = `
          <td style="font-weight:700; color:var(--text-muted);">#${c.id.toString().padStart(3, '0')}</td>
          <td>
            <div class="ficha-cliente-cell">
              <span class="ficha-nome">${escapeHtml(c.nome_completo)}</span>
              ${c.nome_cracha ? `<span class="ficha-cracha">Crachá: ${escapeHtml(c.nome_cracha)}</span>` : ''}
            </div>
          </td>
          <td><span class="ficha-empresa">${escapeHtml(c.empresa)}</span></td>
          <td><span class="ficha-contato">${escapeHtml(c.telefone)}</span></td>
          <td>${escapeHtml(c.captador_nome) || '-'}</td>
          <td><span class="badge ${badgeClasse}">${etapaTexto}</span></td>
          <td style="text-align: right;"><div class="actions-cell">${actionsHtml}</div></td>
        `;

        tr.querySelector('[data-action="editar"]')?.addEventListener('click', () => {
          abrirModalEdicao(c);
        });

        tr.querySelector('[data-action="fechar-venda"]')?.addEventListener('click', () => {
          concluirFechamentoVenda(c.proposta_id, c.nome_completo);
        });

        listaFichasCorpo.appendChild(tr);
      });
    } catch (err) {
      console.error('Erro na listagem:', err);
      listaFichasCorpo.innerHTML = `<tr><td colspan="7" class="table-empty" style="color:var(--danger);">Erro: ${err.message}</td></tr>`;
    }
  }

  // 3. Controle do Modal de Edição
  function abrirModalEdicao(cliente) {
    if (!modalEditar) return;
    editClienteId.value = cliente.id;
    editNomeCompleto.value = cliente.nome_completo || '';
    editNomeCracha.value = cliente.nome_cracha || '';
    editCnpj.value = cliente.cnpj || '';
    editEmpresa.value = cliente.empresa || '';
    editTelefone.value = cliente.telefone || '';
    editEmail.value = cliente.email || '';

    if (editSelectCaptador) {
      editSelectCaptador.value = cliente.responsavel_ficha_id || '';
    }

    modalEditar.style.display = 'flex';
    editNomeCompleto.focus();
  }

  function fecharModalEdicao() {
    if (modalEditar) modalEditar.style.display = 'none';
  }

  btnFecharModalEdicao?.addEventListener('click', fecharModalEdicao);
  btnCancelarEdicao?.addEventListener('click', fecharModalEdicao);

  modalEditar?.addEventListener('click', (e) => {
    if (e.target === modalEditar) fecharModalEdicao();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalEditar?.style.display === 'flex') {
      fecharModalEdicao();
    }
  });

  formEditar?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = editClienteId.value;

    const payload = {
      nomeCompleto: editNomeCompleto.value.trim(),
      nomeCracha: editNomeCracha.value.trim() || null,
      cnpj: editCnpj.value.trim() || null,
      empresa: editEmpresa.value.trim(),
      telefone: editTelefone.value.trim(),
      email: editEmail.value.trim() || null,
      responsavelFichaId: editSelectCaptador?.value ? Number(editSelectCaptador.value) : null,
    };

    try {
      if (btnSalvarEdicao) {
        btnSalvarEdicao.disabled = true;
        btnSalvarEdicao.textContent = 'Salvando...';
      }

      const res = await fetch(`/api/clientes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.erro || 'Falha ao salvar dados.');

      fecharModalEdicao();
      alert('Participante atualizado com sucesso!');
      await carregarListaClientes(selectTurma.value);
    } catch (err) {
      alert(`Erro: ${err.message}`);
    } finally {
      if (btnSalvarEdicao) {
        btnSalvarEdicao.disabled = false;
        btnSalvarEdicao.textContent = 'Salvar Alterações';
      }
    }
  });

  // 4. Fechamento de Venda
  async function concluirFechamentoVenda(propostaId, clienteNome) {
    if (!propostaId) {
      alert('Erro: Proposta associada não identificada.');
      return;
    }

    if (
      !confirm(
        `Deseja realizar o aperto de mão e oficializar o fechamento da venda para ${clienteNome}?`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/propostas/${propostaId}/vender`, { method: 'PATCH' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.erro || 'Falha ao oficializar venda.');

      alert('Venda oficializada com sucesso! O Dashboard foi atualizado.');
      await carregarListaClientes(selectTurma.value);
    } catch (err) {
      alert(`Erro: ${err.message}`);
    }
  }

  // 5. Cadastro de Nova Ficha
  formFicha?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const turmaId = selectTurma.value;
    const captadorId = selectCaptador.value;
    const nomeCompleto = document.getElementById('inputNomeCompleto').value.trim();
    const empresa = document.getElementById('inputEmpresa').value.trim();
    const telefone = document.getElementById('inputTelefone').value.trim();

    if (!turmaId) {
      alert('Selecione uma turma.');
      selectTurma.focus();
      return;
    }

    if (!captadorId) {
      alert('Selecione o captador responsável.');
      selectCaptador.focus();
      return;
    }

    const payload = {
      turmaId: Number(turmaId),
      responsavelFichaId: Number(captadorId),
      nomeCompleto,
      nomeCracha: document.getElementById('inputNomeCracha').value.trim() || null,
      empresa,
      cnpj: document.getElementById('inputCpfCnpj').value.trim() || null,
      telefone,
      email: document.getElementById('inputEmail').value.trim() || null,
    };

    try {
      if (btnSalvarFicha) {
        btnSalvarFicha.disabled = true;
        btnSalvarFicha.textContent = 'Cadastrando...';
      }

      const res = await fetch('/api/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`Erro ao cadastrar: ${data.erro || 'Dados inválidos'}`);
        return;
      }

      formFicha.reset();
      selectTurma.value = turmaId;
      selectCaptador.value = captadorId;
      document.getElementById('inputNomeCompleto').focus();

      alert('Participante cadastrado com sucesso!');
      await carregarListaClientes(turmaId);
    } catch (err) {
      alert(`Erro de comunicação: ${err.message}`);
    } finally {
      if (btnSalvarFicha) {
        btnSalvarFicha.disabled = false;
        btnSalvarFicha.textContent = 'Salvar Ficha de Aplicação';
      }
    }
  });

  selectTurma?.addEventListener('change', () => carregarListaClientes(selectTurma.value));
  await carregarDadosIniciais();
});
