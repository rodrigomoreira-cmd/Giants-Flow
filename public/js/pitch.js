// public/js/pitch.js
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Verificação de Sessão e Permissão
  const sessaoRaw = localStorage.getItem('sessao_operador');
  if (!sessaoRaw) {
    window.location.href = '/login';
    return;
  }
  const sessao = JSON.parse(sessaoRaw);
  const papel = (sessao.papel || 'comercial').toLowerCase();

  if (papel !== 'admin') {
    alert('Acesso restrito. Apenas administradores podem gerenciar o PITCH de palco.');
    window.location.href = '/hub';
    return;
  }

  // 2. Elementos Globais
  const gridProdutos = document.getElementById('gridProdutosPitch');
  const btnRecarregar = document.getElementById('btnRecarregar');
  let produtosCarregados = [];

  // Função para comprimir a imagem antes de converter para Base64 (Evita HTTP 413 Payload Too Large)
  function comprimirImagemBase64(file, maxWidth, maxHeight, quality, callback) {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        callback(dataUrl);
      };
    };
  }

  function escapeHtml(texto) {
    if (!texto) return '';
    return String(texto)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // 3. Busca de Produtos no Servidor
  async function carregarProdutosPitch() {
    try {
      const res = await fetch('/api/pitch/produtos');
      if (!res.ok) throw new Error('Falha ao carregar produtos do pitch.');
      produtosCarregados = await res.json();
      renderizarCardsProdutos();
    } catch (err) {
      console.error('Erro ao carregar pitch:', err);
      gridProdutos.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--danger);">Erro de conexão.</div>`;
    }
  }

  // 4. Renderização Dinâmica dos Cartões
  function renderizarCardsProdutos() {
    if (!gridProdutos) return;
    gridProdutos.innerHTML = '';

    if (!Array.isArray(produtosCarregados) || produtosCarregados.length === 0) {
      gridProdutos.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 3rem 1rem;">
          Nenhum produto base encontrado.
        </div>
      `;
      return;
    }

    produtosCarregados.forEach((prod) => {
      const estaLiberado = prod.pitch_liberado || prod.status_pitch === 'liberado';
      const card = document.createElement('div');
      card.className = `pitch-card ${estaLiberado ? 'released' : ''}`;
      card.id = `card-produto-${prod.id}`;

      card.innerHTML = `
        <div class="pitch-card-header">
          <div class="pitch-product-name">${escapeHtml(prod.nome)}</div>
          <span class="product-pitch-badge ${estaLiberado ? 'badge-liberado' : 'badge-aguardando'}">
            ${estaLiberado ? 'Liberado no Palco' : 'Aguardando Pitch'}
          </span>
        </div>

        <div class="pitch-upload-box" id="upload-box-${prod.id}">
          <input type="file" id="file-input-${prod.id}" accept="image/jpeg, image/png" style="display: none;">
          ${
            prod.imagem_pitch
              ? `
                <img src="${prod.imagem_pitch}" alt="Slide" class="pitch-preview-img" id="img-preview-${prod.id}">
                <button type="button" class="btn-remove-photo" id="btn-remove-${prod.id}">Remover Slide</button>
              `
              : `
                <span class="pitch-upload-icon">📷</span>
                <span class="pitch-upload-label">Carregar Foto do Slide</span>
                <span class="pitch-upload-hint">Formatos JPG ou PNG</span>
              `
          }
        </div>

        <form class="pitch-form-body" id="form-pitch-${prod.id}">
          <div class="pitch-field-group">
            <label>Valor Oficial da Oferta (R$)</label>
            <div class="price-input-wrapper">
              <span class="price-prefix">R$</span>
              <input type="number" step="0.01" id="input-preco-${prod.id}" value="${prod.valor_base || ''}" placeholder="0.00" required>
            </div>
          </div>

          <div class="pitch-field-group">
            <label>Condições de Palco / Parcelamento</label>
            <textarea id="input-condicoes-${prod.id}" rows="2" placeholder="Ex: Entrada no PIX + 12x no cartão...">${escapeHtml(prod.condicoes_palco)}</textarea>
          </div>

          <div class="pitch-field-group">
            <label>Bônus Anunciados</label>
            <textarea id="input-bonus-${prod.id}" rows="2" placeholder="Ex: Acompanhamento individual...">${escapeHtml(prod.bonus_anunciados)}</textarea>
          </div>

          <div class="pitch-card-footer">
            <button type="button" class="btn-pitch-save" id="btn-save-${prod.id}">Salvar Rascunho</button>
            <button type="button" class="btn-pitch-release ${estaLiberado ? 'released-active' : ''}" id="btn-release-${prod.id}" ${estaLiberado ? 'disabled' : ''}>
              ${estaLiberado ? '✓ Oferta Disponível no Salão' : '⚡ Liberar Oferta no Telão'}
            </button>
          </div>
        </form>
      `;

      // Eventos de Foto do Slide
      const uploadBox = card.querySelector(`#upload-box-${prod.id}`);
      const fileInput = card.querySelector(`#file-input-${prod.id}`);
      const btnRemove = card.querySelector(`#btn-remove-${prod.id}`);

      uploadBox?.addEventListener('click', (e) => {
        if (e.target.id === `btn-remove-${prod.id}`) return;
        fileInput?.click();
      });

      fileInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Comprime a imagem para evitar estouro de Payload do Express (HTTP 413)
        comprimirImagemBase64(file, 1280, 720, 0.7, (compressedBase64) => {
          prod.imagem_pitch = compressedBase64;
          renderizarCardsProdutos();
        });
      });

      btnRemove?.addEventListener('click', (e) => {
        e.stopPropagation();
        prod.imagem_pitch = null;
        renderizarCardsProdutos();
      });

      // Ação: Salvar Rascunho
      const btnSave = card.querySelector(`#btn-save-${prod.id}`);
      btnSave?.addEventListener('click', async () => {
        const valorBase = card.querySelector(`#input-preco-${prod.id}`).value;
        const condicoesPalco = card.querySelector(`#input-condicoes-${prod.id}`).value;
        const bonusAnunciados = card.querySelector(`#input-bonus-${prod.id}`).value;

        btnSave.disabled = true;
        btnSave.textContent = 'Salvando...';

        try {
          const res = await fetch(`/api/pitch/produtos/${prod.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              valorBase: Number(valorBase) || 0,
              condicoesPalco,
              bonusAnunciados,
              imagemPitch: prod.imagem_pitch,
            }),
          });

          if (!res.ok) throw new Error('Falha ao salvar rascunho da oferta.');
          window.showToast?.('Rascunho atualizado com sucesso!', 'success') ||
            alert('Salvo com sucesso!');
        } catch (err) {
          alert(`Erro: ${err.message}`);
        } finally {
          btnSave.disabled = false;
          btnSave.textContent = 'Salvar Rascunho';
        }
      });

      // Ação: Liberar Oferta via modal genérico modal.js
      const btnRelease = card.querySelector(`#btn-release-${prod.id}`);
      btnRelease?.addEventListener('click', () => {
        const valorBase = card.querySelector(`#input-preco-${prod.id}`).value;

        if (!valorBase || Number(valorBase) <= 0) {
          alert('Preencha o valor oficial antes de liberar a oferta para a equipe.');
          return;
        }

        window
          .mostrarConfirmacao({
            titulo: `Liberar Oferta: ${prod.nome}`,
            mensagem: `Confirmar liberação de ${prod.nome} por R$ ${Number(valorBase).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}? O valor e as condições ficarão disponíveis para toda a equipe comercial no sistema.`,
            icone: '🚀',
            textoOk: 'Confirmar & Liberar',
            tipoBotao: 'btn-primary',
          })
          .then(async (confirmado) => {
            if (!confirmado) return;

            btnRelease.disabled = true;
            btnRelease.textContent = 'Liberando...';

            try {
              const payload = {
                id: prod.id,
                valorAnunciado: Number(valorBase),
                condicoesPalco: card.querySelector(`#input-condicoes-${prod.id}`).value,
                bonusAnunciados: card.querySelector(`#input-bonus-${prod.id}`).value,
                imagemPitch: prod.imagem_pitch,
              };

              const res = await fetch(`/api/pitch/produtos/${prod.id}/liberar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              });

              if (!res.ok) throw new Error('Falha na liberação.');
              await carregarProdutosPitch();
              window.showToast?.('Oferta liberada e enviada aos vendedores.', 'success');
            } catch (err) {
              alert(`Erro na liberação: ${err.message}`);
              btnRelease.disabled = false;
              btnRelease.textContent = '⚡ Liberar Oferta no Telão';
            }
          });
      });

      gridProdutos.appendChild(card);
    });
  }

  btnRecarregar?.addEventListener('click', carregarProdutosPitch);
  await carregarProdutosPitch();
});
