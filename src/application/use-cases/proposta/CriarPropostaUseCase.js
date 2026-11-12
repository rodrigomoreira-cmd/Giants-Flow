// src/application/use-cases/proposta/CriarPropostaUseCase.js
const { EtapaFunil, StatusProposta } = require('../../../domain/enums/StatusEnum');
const Proposta = require('../../../domain/entities/Proposta');
const clienteRepository = require('../../../infrastructure/database/repositories/ClienteRepository');
const propostaRepository = require('../../../infrastructure/database/repositories/PropostaRepository');
const { pool } = require('../../../infrastructure/database/connection');

class CriarPropostaUseCase {
  async execute(dados) {
    const aplicacaoId = dados.aplicacaoId || dados.aplicacao_id || dados.clienteId || dados.cliente_id;
    const produtoId = dados.produtoId || dados.produto_id;

    if (!aplicacaoId) {
      throw new Error('O participante (aplicacaoId) é obrigatório para emissão da proposta.');
    }
    if (!produtoId) {
      throw new Error('O produto selecionado é obrigatório.');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Lock pessimista para impedir concorrência na mesma ficha
      const { rows: clienteRows } = await client.query(
        'SELECT id, etapa_atual, nome_completo FROM aplicacoes WHERE id = $1 FOR UPDATE',
        [Number(aplicacaoId)]
      );

      if (clienteRows.length === 0) {
        throw new Error(`Participante #${aplicacaoId} não encontrado no sistema.`);
      }

      const cliente = clienteRows[0];
      if (cliente.etapa_atual === EtapaFunil.REPROVADO) {
        throw new Error('Ação bloqueada: não é permitido emitir proposta comercial para um participante reprovado.');
      }

      // Cálculo atômico garantido do saldo devedor e parcelas
      const vTotal = Number(dados.valorTotal ?? dados.valor_total) || 0;
      const vEntrada = Number(dados.valorEntrada ?? dados.valor_entrada) || 0;
      const cashback = Number(dados.cashback) || 0;
      const qtdParcelas = Number(dados.quantidadeParcelas ?? dados.quantidade_parcelas) || 1;
      const saldoDevedor = Math.max(0, vTotal - vEntrada - cashback);
      const valorParcelaCalculado = dados.valorParcela 
        ? Number(dados.valorParcela) 
        : Number((saldoDevedor / qtdParcelas).toFixed(2));

      const proposta = new Proposta({
        aplicacaoId: Number(aplicacaoId),
        produtoId: Number(produtoId),
        valorTotal: vTotal,
        valorEntrada: vEntrada,
        cashback,
        metodoPagamento: dados.metodoPagamento ?? dados.metodo_pagamento ?? 'Pix',
        quantidadeParcelas: qtdParcelas,
        valorParcela: valorParcelaCalculado,
        status: StatusProposta.ENVIADO_FINANCEIRO,
        podeCriarProposta: true,
      });

      const propostaSalva = await propostaRepository.salvar(proposta, client);

      // Transiciona etapa mantendo a transação aberta
      await client.query(
        'UPDATE aplicacoes SET etapa_atual = $1, updated_at = NOW() WHERE id = $2',
        [EtapaFunil.EM_ANALISE_FINANCEIRA, cliente.id]
      );

      await client.query('COMMIT');
      return propostaSalva;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = new CriarPropostaUseCase();
module.exports.CriarPropostaUseCase = CriarPropostaUseCase;
