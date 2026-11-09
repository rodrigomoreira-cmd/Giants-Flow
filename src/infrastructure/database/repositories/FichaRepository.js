const { pool } = require('../connection');

class FichaRepository {
  async listarTodas() {
    const query = `
      SELECT id, nome, nome_cracha, empresa, cpf_cnpj, telefone, email, origem, status, criado_em 
      FROM fichas 
      ORDER BY id DESC
    `;
    const { rows } = await pool.query(query);
    return rows;
  }

  async criar(dados) {
    const query = `
      INSERT INTO fichas (nome, nome_cracha, empresa, cpf_cnpj, telefone, email, origem, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    const valores = [
      dados.nome,
      dados.nome_cracha || null,
      dados.empresa || null,
      dados.cpf_cnpj || null,
      dados.telefone,
      dados.email || null,
      dados.origem || 'ORGANICO',
      dados.status || 'AGUARDANDO_TRIAGEM'
    ];
    const { rows } = await pool.query(query, valores);
    return rows[0];
  }
}

module.exports = new FichaRepository();