// src/infrastructure/database/repositories/PropostaRepository.js
const { pool } = require('../connection');
const Proposta = require('../../../domain/entities/Proposta');

class PropostaRepository {
  async salvar(proposta, clientParam = null) {
    const runner = clientParam || pool;
    // C?lculo defensivo de fallback para satisfazer a constraint NOT NULL de valor_parcela
    const qtdParcelas = Number(proposta.quantidadeParcelas) || 1;
    const vTotal = Number(proposta.valorTotal) || 0;
    const vEntrada = Number(proposta.valorEntrada) || 0;
    const valorParcelaCalculado = proposta.valorParcela
      ? Number(proposta.valorParcela)
      : Number(((vTotal - vEntrada) / qtdParcelas).toFixed(2));

    // Sanitiza??o para respeitar o ENUM status_prop do Postgres ('enviado_financeiro')
    let statusBanco = proposta.status;
    if (!statusBanco || statusBanco === 'em_analise_financeira' || statusBanco === 'em_digitacao') {
      statusBanco = 'enviado_financeiro';
    }

    const query = `
      INSERT INTO propostas (
        aplicacao_id, produto_id, valor_total, valor_entrada,
        cashback, metodo_pagamento, quantidade_parcelas, valor_parcela, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
    `;
    const values = [
      proposta.aplicacaoId,
      proposta.produtoId,
      vTotal,
      vEntrada,
      proposta.cashback || 0,
      proposta.metodoPagamento,
      qtdParcelas,
      valorParcelaCalculado,
      statusBanco,
    ];

    const { rows } = await runner.query(query, values);
    return this._mapearParaEntidade(rows[0]);
  }

  async buscarPorId(id) {
    const query = `SELECT * FROM propostas WHERE id = $1;`;
    const { rows } = await pool.query(query, [id]);
    if (rows.length === 0) return null;
    return this._mapearParaEntidade(rows[0]);
  }

  async listarParaFinanceiro() {
    const query = `
      SELECT 
        p.*, 
        a.nome_completo AS cliente_nome, 
        a.empresa AS cliente_empresa, 
        a.cnpj AS cliente_cnpj,
        a.turma_id,
        a.turma_id,
        a.turma_id,
        pr.nome AS produto_nome,
        af.status_serasa,
        af.decisao_financeiro,
        af.parecer
      FROM propostas p
      JOIN aplicacoes a ON a.id = p.aplicacao_id
      JOIN produtos pr ON pr.id = p.produto_id
      LEFT JOIN analises_financeiras af ON af.proposta_id = p.id
      ORDER BY p.created_at DESC;
    `;
    const { rows } = await pool.query(query);
    return rows;
  }

  async atualizarStatus(id, novoStatus) {
    // Alinha status de aprova??o ao enum nativo
    let statusFinal = novoStatus;
    if (novoStatus === 'em_analise_financeira') statusFinal = 'enviado_financeiro';

    const query = `
      UPDATE propostas 
      SET status = $1 
      WHERE id = $2 
      RETURNING *;
    `;
    const { rows } = await pool.query(query, [statusFinal, id]);
    if (rows.length === 0) return null;
    return this._mapearParaEntidade(rows[0]);
  }

  _mapearParaEntidade(row) {
    return new Proposta({
      id: row.id,
      aplicacaoId: row.aplicacao_id,
      produtoId: row.produto_id,
      valorTotal: Number(row.valor_total),
      valorEntrada: Number(row.valor_entrada),
      cashback: Number(row.cashback),
      metodoPagamento: row.metodo_pagamento,
      quantidadeParcelas: Number(row.quantidade_parcelas),
      valorParcela: Number(row.valor_parcela),
      status: row.status,
      podeCriarProposta: true,
    });
  }
}

module.exports = new PropostaRepository();

