const { pool } = require('../connection');

class UsuarioRepository {
  async buscarPorEmail(email) {
    const query = 'SELECT id, nome, email, senha, papel FROM usuarios WHERE LOWER(email) = LOWER($1) LIMIT 1';
    const { rows } = await pool.query(query, [email]);
    return rows[0] || null;
  }
}

module.exports = new UsuarioRepository();