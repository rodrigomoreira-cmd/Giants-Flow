// src/application/use-cases/financeiro/ProcessarAnaliseFinanceiraUseCase.js
const { pool } = require('../../../infrastructure/database/connection');
const { EtapaFunil, StatusProposta } = require('../../../domain/enums/StatusEnum');
const propostaRepository = require('../../../infrastructure/database/repositories/PropostaRepository');
const clienteRepository = require('../../../infrastructure/database/repositories/ClienteRepository');

class ProcessarAnaliseFinanceiraUseCase {
  async execute({ propostaId, analistaId, statusSerasa = 'analisado', decisao, parecer = '' }) {
    const pId = Number(propostaId);
    const aId = Number(analistaId);

    if (!pId || !aId) {
      throw new Error('Identificadores da proposta e do analista são obrigatórios.');
    }

    if (!decisao) {
      throw new Error('A decisão financeira (aprovado/recusado) é obrigatória.');
    }

    const decisaoNormalizada = String(decisao).trim().toLowerCase();

    // 1. Validar proposta existente na base
    const proposta = await propostaRepository.buscarPorId(pId);
    if (!proposta) {
      throw new Error(`Proposta #${pId} não foi encontrada.`);
    }

    const cliente = await clienteRepository.buscarPorId(proposta.aplicacaoId);
    if (!cliente) {
      throw new Error(`Cliente vinculado à proposta #${pId} não foi localizado.`);
    }

    let novoStatusProposta;
    let novaEtapaCliente;

    // Respeito estrito aos enums: status_prop ('aprovado'/'recusado') e etapa_funil ('aprovado_financeiro'/'reprovado')
    if (['aprovado', 'aprovada'].includes(decisaoNormalizada)) {
      novoStatusProposta = StatusProposta.APROVADO;
      novaEtapaCliente = EtapaFunil.APROVADO_FINANCEIRO;
    } else if (['recusado', 'reprovado', 'recusada', 'reprovada'].includes(decisaoNormalizada)) {
      novoStatusProposta = StatusProposta.RECUSADO;
      novaEtapaCliente = EtapaFunil.REPROVADO;
    } else {
      throw new Error(`Decisão inválida: "${decisao}". Utilize "aprovado" ou "recusado".`);
    }

    // 2. Transação atômica ACID com UPSERT na análise financeira
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // UPSERT idempotente blindado contra analises_financeiras_proposta_id_key
      const analiseQuery = `
        INSERT INTO analises_financeiras (
          proposta_id, analista_id, status_serasa, decisao_financeiro, parecer
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (proposta_id) DO UPDATE SET
          analista_id = EXCLUDED.analista_id,
          status_serasa = EXCLUDED.status_serasa,
          decisao_financeiro = EXCLUDED.decisao_financeiro,
          parecer = EXCLUDED.parecer
        RETURNING *;
      `;
      const analiseRes = await client.query(analiseQuery, [
        pId,
        aId,
        String(statusSerasa || 'analisado').trim(),
        novoStatusProposta,
        String(parecer || '').trim(),
      ]);

      // Atualização do status da proposta comercial (enum status_prop)
      await client.query('UPDATE propostas SET status = $1 WHERE id = $2;', [
        novoStatusProposta,
        pId,
      ]);

      // Atualização da etapa na ficha de aplicação do participante
      await client.query(
        'UPDATE aplicacoes SET etapa_atual = $1, updated_at = NOW() WHERE id = $2;',
        [novaEtapaCliente, proposta.aplicacaoId]
      );

      await client.query('COMMIT');

      return {
        sucesso: true,
        analise: analiseRes.rows[0],
        statusProposta: novoStatusProposta,
        etapaCliente: novaEtapaCliente,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Falha na transação financeira: ${error.message}`);
    } finally {
      client.release();
    }
  }

  async concretizarVenda(propostaId) {
    const pId = Number(propostaId);
    if (!pId) {
      throw new Error('Identificador da proposta inválido.');
    }

    const proposta = await propostaRepository.buscarPorId(pId);
    if (!proposta) {
      throw new Error(`Proposta #${pId} não foi encontrada.`);
    }

    if (proposta.status !== StatusProposta.APROVADO) {
      throw new Error(
        `Trava de Compliance: Venda bloqueada. A proposta precisa estar com status "aprovado" pelo financeiro. Status atual: "${proposta.status}".`
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const propRes = await client.query(
        'UPDATE propostas SET status = $1 WHERE id = $2 RETURNING *;',
        [StatusProposta.VENDIDO, pId]
      );

      await client.query(
        'UPDATE aplicacoes SET etapa_atual = $1, updated_at = NOW() WHERE id = $2;',
        [EtapaFunil.VENDIDO, proposta.aplicacaoId]
      );

      await client.query('COMMIT');

      return propRes.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Falha ao concretizar venda: ${error.message}`);
    } finally {
      client.release();
    }
  }
}

module.exports = new ProcessarAnaliseFinanceiraUseCase();
module.exports.ProcessarAnaliseFinanceiraUseCase = ProcessarAnaliseFinanceiraUseCase;
