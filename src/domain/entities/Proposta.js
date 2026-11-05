// src/domain/entities/Proposta.js
const { StatusProposta } = require('../enums/StatusEnum');

class Proposta {
  constructor({
    id = null,
    aplicacaoId,
    aplicacao_id,
    produtoId,
    produto_id,
    valorTotal,
    valor_total,
    valorEntrada = 0,
    valor_entrada = 0,
    cashback = 0,
    metodoPagamento,
    metodo_pagamento,
    quantidadeParcelas = 1,
    quantidade_parcelas = 1,
    valorParcela = null,
    valor_parcela = null,
    status = StatusProposta.ENVIADO_FINANCEIRO,
    podeCriarProposta = true,
  } = {}) {
    this.id = id ? Number(id) : null;
    const appId = aplicacaoId ?? aplicacao_id;
    const prodId = produtoId ?? produto_id;

    if (!appId) throw new Error('O cliente (aplicacaoId) é obrigatório para gerar a proposta.');
    if (!prodId) throw new Error('O produto selecionado é obrigatório para gerar a proposta.');

    this.aplicacaoId = Number(appId);
    this.produtoId = Number(prodId);

    this.valorTotal = Number(valorTotal ?? valor_total ?? 0);
    this.valorEntrada = Number(valorEntrada ?? valor_entrada ?? 0);
    this.cashback = Number(cashback ?? 0);

    const metodo = metodoPagamento ?? metodo_pagamento;
    if (!metodo) throw new Error('O método de pagamento é obrigatório.');
    this.metodoPagamento = String(metodo).trim();

    this.quantidadeParcelas = Math.max(1, Number(quantidadeParcelas ?? quantidade_parcelas ?? 1));

    // Cálculo matemático estrito para satisfazer a restrição NOT NULL (numeric(12,2))
    const parcelaInformada = valorParcela ?? valor_parcela;
    if (
      parcelaInformada !== null &&
      parcelaInformada !== undefined &&
      Number(parcelaInformada) > 0
    ) {
      this.valorParcela = Number(Number(parcelaInformada).toFixed(2));
    } else {
      const saldoDevedor = Math.max(0, this.valorTotal - this.valorEntrada - this.cashback);
      this.valorParcela = Number((saldoDevedor / this.quantidadeParcelas).toFixed(2));
    }

    // Sanitização e conformidade estrita com o enum status_prop nativo do PostgreSQL
    let statusRecebido = status;
    if (
      !statusRecebido ||
      statusRecebido === 'em_analise_financeira' ||
      statusRecebido === 'em_digitacao'
    ) {
      statusRecebido = StatusProposta.ENVIADO_FINANCEIRO;
    }
    this.status = statusRecebido;
    this.podeCriarProposta = Boolean(podeCriarProposta);

    this.validarRegrasFinanceiras();
  }

  validarRegrasFinanceiras() {
    if (this.valorTotal <= 0) {
      throw new Error('O valor total da proposta deve ser maior que zero.');
    }
    if (this.valorEntrada < 0) {
      throw new Error('O valor de entrada não pode ser negativo.');
    }
    if (this.cashback < 0) {
      throw new Error('O cashback não pode ser negativo.');
    }
    if (this.valorEntrada + this.cashback > this.valorTotal) {
      throw new Error('A soma da entrada e do cashback não pode ultrapassar o valor total.');
    }
    if (this.valorParcela < 0) {
      throw new Error('O valor da parcela calculado é inválido.');
    }
  }

  aprovar() {
    this.status = StatusProposta.APROVADO;
  }

  recusar() {
    this.status = StatusProposta.RECUSADO;
  }

  concretizarVenda() {
    if (this.status !== StatusProposta.APROVADO) {
      throw new Error(
        `A venda só pode ser concretizada se a proposta estiver aprovada pelo financeiro. Status atual: ${this.status}`
      );
    }
    this.status = StatusProposta.VENDIDO;
  }
}

module.exports = Proposta;
module.exports.Proposta = Proposta;
