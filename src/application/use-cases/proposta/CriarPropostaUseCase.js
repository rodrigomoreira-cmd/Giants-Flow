// src/application/use-cases/proposta/CriarPropostaUseCase.js
const { EtapaFunil, StatusProposta } = require('../../../domain/enums/StatusEnum');
const Proposta = require('../../../domain/entities/Proposta');
const clienteRepository = require('../../../infrastructure/database/repositories/ClienteRepository');
const propostaRepository = require('../../../infrastructure/database/repositories/PropostaRepository');

class CriarPropostaUseCase {
  async execute(dados) {
    const aplicacaoId =
      dados.aplicacaoId || dados.aplicacao_id || dados.clienteId || dados.cliente_id;
    const produtoId = dados.produtoId || dados.produto_id;

    if (!aplicacaoId) {
      throw new Error('O participante (aplicacaoId) é obrigatório para emissão da proposta.');
    }
    if (!produtoId) {
      throw new Error('O produto selecionado é obrigatório.');
    }

    // 1. Validar existência do participante e consistência de funil
    const cliente = await clienteRepository.buscarPorId(Number(aplicacaoId));
    if (!cliente) {
      throw new Error(`Participante #${aplicacaoId} não encontrado no sistema.`);
    }

    if (cliente.etapaAtual === EtapaFunil.REPROVADO) {
      throw new Error(
        'Ação bloqueada: não é permitido emitir proposta comercial para um participante reprovado.'
      );
    }

    // 2. Instanciar proposta aplicando Type Safety, cálculo de parcela e status enviado_financeiro
    const proposta = new Proposta({
      aplicacaoId: Number(aplicacaoId),
      produtoId: Number(produtoId),
      valorTotal: dados.valorTotal ?? dados.valor_total,
      valorEntrada: dados.valorEntrada ?? dados.valor_entrada ?? 0,
      cashback: dados.cashback ?? 0,
      metodoPagamento: dados.metodoPagamento ?? dados.metodo_pagamento,
      quantidadeParcelas: dados.quantidadeParcelas ?? dados.quantidade_parcelas ?? 1,
      valorParcela: dados.valorParcela ?? dados.valor_parcela,
      status: StatusProposta.ENVIADO_FINANCEIRO,
      podeCriarProposta: true,
    });

    // 3. Persistir proposta na base evento_operacao
    const propostaSalva = await propostaRepository.salvar(proposta);

    // 4. Transicionar a etapa do participante para em_analise_financeira
    await clienteRepository.atualizarEtapa(cliente.id, EtapaFunil.EM_ANALISE_FINANCEIRA);

    return propostaSalva;
  }
}

module.exports = new CriarPropostaUseCase();
module.exports.CriarPropostaUseCase = CriarPropostaUseCase;
