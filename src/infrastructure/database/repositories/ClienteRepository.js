// src/infrastructure/database/repositories/ClienteRepository.js
const { pool } = require('../connection');
const ClienteModule = require('../../../domain/entities/Cliente');
const Cliente = ClienteModule.Cliente || ClienteModule;

class ClienteRepository {
  async salvar(cliente) {
    const query = `
      INSERT INTO aplicacoes (
        turma_id, responsavel_ficha_id, nome_completo, nome_cracha,
        empresa, cnpj, telefone, email, etapa_atual
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
    `;
    const values = [
      cliente.turmaId ? Number(cliente.turmaId) : null,
      cliente.responsavelFichaId ? Number(cliente.responsavelFichaId) : null,
      cliente.nome,
      cliente.nomeCracha || null,
      cliente.empresa,
      cliente.cnpj || null,
      cliente.telefone,
      cliente.email || null,
      cliente.etapaAtual || 'ficha_preenchida',
    ];

    const { rows } = await pool.query(query, values);
    return this._mapearParaEntidade(rows[0]);
  }

  async buscarPorId(id) {
    const query = `SELECT * FROM aplicacoes WHERE id = $1 LIMIT 1;`;
    const { rows } = await pool.query(query, [Number(id)]);
    if (rows.length === 0) return null;
    return this._mapearParaEntidade(rows[0]);
  }

  // Método robusto com projeção explícita das colunas (garante o envio da etapa_atual)
  async listarPorTurma(turmaId) {
    const query = `
      SELECT 
        a.id, 
        a.turma_id, 
        a.nome_completo, 
        a.nome_cracha, 
        a.empresa, 
        a.cnpj, 
        a.telefone, 
        a.email, 
        a.etapa_atual,
        a.created_at,
        u.nome AS responsavel_nome, 
        t.nome AS turma_nome 
      FROM aplicacoes a
      LEFT JOIN usuarios u ON u.id = a.responsavel_ficha_id
      LEFT JOIN turmas t ON t.id = a.turma_id
      WHERE a.turma_id = $1
      ORDER BY a.created_at DESC;
    `;
    const { rows } = await pool.query(query, [Number(turmaId)]);
    return rows;
  }

  // Alias defensivo caso o ClienteController esteja a invocar buscarPorTurma em vez de listarPorTurma
  async buscarPorTurma(turmaId) {
    return this.listarPorTurma(turmaId);
  }

  async atualizarEtapa(id, novaEtapa) {
    const query = `
      UPDATE aplicacoes 
      SET etapa_atual = $1, updated_at = NOW() 
      WHERE id = $2 
      RETURNING *;
    `;
    const { rows } = await pool.query(query, [novaEtapa, Number(id)]);
    if (rows.length === 0) return null;
    return this._mapearParaEntidade(rows[0]);
  }

  async listarPendentesEntrevista(turmaId) {
    const query = `
      SELECT 
        a.id,
        a.nome_completo,
        a.nome_cracha,
        a.empresa,
        a.cnpj,
        a.telefone,
        a.etapa_atual,
        u.nome AS responsavel_nome
      FROM aplicacoes a
      LEFT JOIN usuarios u ON u.id = a.responsavel_ficha_id
      WHERE a.turma_id = $1 
        AND a.etapa_atual = 'ficha_preenchida'
      ORDER BY a.created_at ASC;
    `;
    const { rows } = await pool.query(query, [Number(turmaId)]);
    return rows;
  }

  _mapearParaEntidade(row) {
    if (!row) return null;
    return new Cliente({
      id: row.id,
      turmaId: row.turma_id,
      responsavelFichaId: row.responsavel_ficha_id,
      nome: row.nome_completo,
      nomeCracha: row.nome_cracha,
      empresa: row.empresa,
      cnpj: row.cnpj,
      telefone: row.telefone,
      email: row.email,
      etapaAtual: row.etapa_atual,
    });
  }
}

// Duplo export mandatório para estabilidade da injeção de dependências
module.exports = new ClienteRepository();
module.exports.ClienteRepository = ClienteRepository;
