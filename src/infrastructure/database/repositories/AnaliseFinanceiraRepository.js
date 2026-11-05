// src/infrastructure/database/repositories/AnaliseFinanceiraRepository.js
const { pool } = require('../connection');
const AnaliseFinanceira = require('../../../domain/entities/AnaliseFinanceira');

class AnaliseFinanceiraRepository {
  async salvarOuAtualizar(analise) {
    const query = `
      INSERT INTO analises_financeiras (
        proposta_id, analista_id, status_serasa, decisao_financeiro, parecer, analisado_em
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (proposta_id) DO UPDATE SET
        analista_id = EXCLUDED.analista_id,
        status_serasa = EXCLUDED.status_serasa,
        decisao_financeiro = EXCLUDED.decisao_financeiro,
        parecer = EXCLUDED.parecer,
        analisado_em = EXCLUDED.analisado_em
      RETURNING *;
    `;
    const values = [
      analise.propostaId,
      analise.analistaId,
      analise.statusSerasa,
      analise.decisaoFinanceiro,
      analise.parecer,
      analise.analisadoEm,
    ];

    const { rows } = await pool.query(query, values);
    return rows[0];
  }

  async buscarPorPropostaId(propostaId) {
    const query = `SELECT * FROM analises_financeiras WHERE proposta_id = $1;`;
    const { rows } = await pool.query(query, [propostaId]);
    if (rows.length === 0) return null;

    return new AnaliseFinanceira({
      id: rows[0].id,
      propostaId: rows[0].proposta_id,
      analistaId: rows[0].analista_id,
      statusSerasa: rows[0].status_serasa,
      decisaoFinanceiro: rows[0].decisao_financeiro,
      parecer: rows[0].parecer,
      analisadoEm: rows[0].analisado_em,
    });
  }
}

module.exports = new AnaliseFinanceiraRepository();
