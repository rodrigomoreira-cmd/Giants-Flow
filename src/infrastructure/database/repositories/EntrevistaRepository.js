// src/infrastructure/database/repositories/EntrevistaRepository.js
const { pool } = require('../connection');
const Entrevista = require('../../../domain/entities/Entrevista');
const Mesa = require('../../../domain/entities/Mesa');

class EntrevistaRepository {
  _mapearParaEntidade(row) {
    if (!row) return null;
    const EntrevistaClass = Entrevista.Entrevista || Entrevista;
    return new EntrevistaClass({
      id: row.id,
      aplicacaoId: row.aplicacao_id,
      mesaId: row.mesa_id,
      entrevistadorId: row.entrevistador_id,
      statusAlmoco: row.status_almoco,
      statusJantar: row.status_jantar,
      liberarProposta: row.liberar_proposta,
      observacoes: row.observacoes,
    });
  }

  async buscarPorAplicacaoId(aplicacaoId) {
    const query = `
      SELECT id, aplicacao_id, mesa_id, entrevistador_id, status_almoco, status_jantar, liberar_proposta, observacoes
      FROM entrevistas
      WHERE aplicacao_id = $1
      LIMIT 1;
    `;
    const { rows } = await pool.query(query, [Number(aplicacaoId)]);
    if (rows.length === 0) return null;
    return this._mapearParaEntidade(rows[0]);
  }

  async salvar(entrevista) {
    const EntrevistaClass = Entrevista.Entrevista || Entrevista;
    const ent =
      entrevista instanceof EntrevistaClass ? entrevista : new EntrevistaClass(entrevista);

    // UPSERT blindado respeitando a constraint UNIQUE(aplicacao_id) sem a coluna updated_at
    const query = `
      INSERT INTO entrevistas (
        aplicacao_id, mesa_id, entrevistador_id, status_almoco, status_jantar, liberar_proposta, observacoes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (aplicacao_id) DO UPDATE SET
        mesa_id = EXCLUDED.mesa_id,
        entrevistador_id = COALESCE(EXCLUDED.entrevistador_id, entrevistas.entrevistador_id),
        status_almoco = COALESCE(EXCLUDED.status_almoco, entrevistas.status_almoco),
        status_jantar = COALESCE(EXCLUDED.status_jantar, entrevistas.status_jantar),
        liberar_proposta = EXCLUDED.liberar_proposta,
        observacoes = COALESCE(EXCLUDED.observacoes, entrevistas.observacoes)
      RETURNING id, aplicacao_id, mesa_id, entrevistador_id, status_almoco, status_jantar, liberar_proposta, observacoes;
    `;

    const params = [
      ent.aplicacaoId,
      ent.mesaId,
      ent.entrevistadorId,
      ent.statusAlmoco,
      ent.statusJantar,
      ent.liberarProposta,
      ent.observacoes,
    ];

    const { rows } = await pool.query(query, params);
    return this._mapearParaEntidade(rows[0]);
  }

  async atualizarStatusTurnos(entrevista) {
    const EntrevistaClass = Entrevista.Entrevista || Entrevista;
    const ent =
      entrevista instanceof EntrevistaClass ? entrevista : new EntrevistaClass(entrevista);

    const query = `
      UPDATE entrevistas
      SET status_almoco = $1,
          status_jantar = $2,
          liberar_proposta = $3,
          observacoes = $4,
          mesa_id = $5
      WHERE aplicacao_id = $6
      RETURNING id, aplicacao_id, mesa_id, entrevistador_id, status_almoco, status_jantar, liberar_proposta, observacoes;
    `;

    const params = [
      ent.statusAlmoco,
      ent.statusJantar,
      ent.liberarProposta,
      ent.observacoes,
      ent.mesaId,
      ent.aplicacaoId,
    ];

    const { rows } = await pool.query(query, params);
    if (rows.length === 0) return null;
    return this._mapearParaEntidade(rows[0]);
  }

  async desvincularMesa(aplicacaoId) {
    const query = `
      UPDATE entrevistas
      SET mesa_id = NULL
      WHERE aplicacao_id = $1
      RETURNING id, aplicacao_id, mesa_id;
    `;
    const { rows } = await pool.query(query, [Number(aplicacaoId)]);
    return rows[0] || null;
  }

  async buscarMesaComOcupacao(mesaId) {
    const query = `
      SELECT 
        m.id, 
        m.numero, 
        m.capacidade_total, 
        COALESCE(m.tem_entrevistador, true) AS tem_entrevistador,
        COUNT(e.id) FILTER (WHERE a.etapa_atual = 'em_entrevista')::INT AS ocupantes_atuais
      FROM mesas m
      LEFT JOIN entrevistas e ON e.mesa_id = m.id
      LEFT JOIN aplicacoes a ON a.id = e.aplicacao_id
      WHERE m.id = $1
      GROUP BY m.id, m.numero, m.capacidade_total, m.tem_entrevistador;
    `;

    const { rows } = await pool.query(query, [Number(mesaId)]);
    if (rows.length === 0) return null;

    const MesaClass = Mesa.Mesa || Mesa;
    return new MesaClass({
      id: rows[0].id,
      numero: rows[0].numero,
      capacidadeTotal: rows[0].capacidade_total,
      ocupantesAtuais: rows[0].ocupantes_atuais,
      temEntrevistador: rows[0].tem_entrevistador,
    });
  }
}

module.exports = new EntrevistaRepository();
module.exports.EntrevistaRepository = EntrevistaRepository;
