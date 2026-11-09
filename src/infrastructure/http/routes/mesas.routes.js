const express = require('express');
const router = express.Router();
const dbModule = require('../../database/connection');
const pool = dbModule.pool || dbModule;

// 2. AUXILIARES: MESAS COM SEUS ENTREVISTADORES ESCALADOS E OCUPANTES
router.get('/auxiliares', async (req, res) => {
  try {
    const { rows: entrevistadores } = await pool.query(
      'SELECT id, nome, email, papel, ativo FROM usuarios WHERE ativo = true ORDER BY nome ASC'
    );
    const { rows: turmas } = await pool.query(
      'SELECT id, codigo, nome, ativa FROM turmas ORDER BY id ASC'
    );

    const { rows: ocupantes } = await pool.query(`
      SELECT id, nome_participante AS nome, empresa,
             mesa_alocada, almoco_pago, cortesia_almoco, membro_giants, etapa_funil,
             entrevistador_id, entrevistadores_ids
      FROM fichas
      WHERE mesa_alocada IS NOT NULL
      ORDER BY id ASC
    `);

    let listaMesas = [];
    try {
      const { rows: dbMesas } = await pool.query('SELECT * FROM mesas ORDER BY numero ASC');
      if (dbMesas && dbMesas.length > 0) listaMesas = dbMesas;
    } catch (_) {}

    if (listaMesas.length === 0) {
      listaMesas = [
        { id: 1, numero: 1, nome: 'Mesa 1', capacidade_total: 4, entrevistadores_ids: [] },
        { id: 2, numero: 2, nome: 'Mesa 2', capacidade_total: 4, entrevistadores_ids: [] },
        { id: 3, numero: 3, nome: 'Mesa 3', capacidade_total: 4, entrevistadores_ids: [] },
        { id: 4, numero: 4, nome: 'Mesa 4', capacidade_total: 4, entrevistadores_ids: [] },
        { id: 5, numero: 5, nome: 'Mesa 5', capacidade_total: 4, entrevistadores_ids: [] },
        { id: 6, numero: 6, nome: 'Mesa 6', capacidade_total: 4, entrevistadores_ids: [] }
      ];
    }

    const mesasComOcupantes = listaMesas.map(m => {
      const numMesa = Number(m.numero || m.id);
      
      // Entrevistadores fixos/escalados nesta mesa física
      const idsMesaEntr = Array.isArray(m.entrevistadores_ids) && m.entrevistadores_ids.length > 0
        ? m.entrevistadores_ids
        : (m.entrevistador_id ? [m.entrevistador_id] : []);

      const entrevistadoresEscalados = (entrevistadores || [])
        .filter(e => idsMesaEntr.includes(e.id))
        .map(e => ({ id: e.id, nome: e.nome, email: e.email }));

      // Empresários sentados nesta mesa
      const detalhes = ocupantes
        .filter(f => Number(f.mesa_alocada) === Number(m.id) || Number(f.mesa_alocada) === numMesa)
        .map(f => {
          const entrIndividual = (entrevistadores || []).find(e => e.id === f.entrevistador_id);
          return {
            entrevista_id: f.id,
            nome: f.nome,
            nome_cracha: f.nome,
            empresa: f.empresa,
            etapa_funil: f.etapa_funil,
            status_almoco: (f.almoco_pago || f.cortesia_almoco || f.membro_giants) ? 'liberado' : 'pendente',
            entrevistador_id: f.entrevistador_id,
            entrevistador_nome: entrIndividual ? entrIndividual.nome : 'Não definido'
          };
        });

      return {
        id: m.id,
        numero: numMesa,
        nome: m.nome || `Mesa ${numMesa}`,
        capacidade_total: m.capacidade_total || 4,
        ocupantes: detalhes.length,
        ocupantes_detalhes: detalhes,
        entrevistadores_ids: idsMesaEntr,
        entrevistadores_escalados: entrevistadoresEscalados,
        entrevistadorNome: entrevistadoresEscalados.map(e => e.nome).join(', ') || null,
        tem_entrevistador: entrevistadoresEscalados.length > 0
      };
    });

    res.json({
      entrevistadores: entrevistadores || [],
      turmas: turmas || [],
      mesas: mesasComOcupantes
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ESCALA DE ENTREVISTADORES NA MESA (PATCH /mesas/:id/entrevistadores)
router.patch('/mesas/:id/entrevistadores', async (req, res) => {
  try {
    let ids = req.body.entrevistadores_ids || [];
    if (!Array.isArray(ids)) ids = ids ? [ids] : [];
    ids = ids.map(Number).filter(n => !isNaN(n) && n > 0);
    const tem = ids.length > 0;
    const prim = tem ? ids[0] : null;

    const { rows } = await pool.query(
      `UPDATE mesas 
       SET entrevistadores_ids = $1, 
           tem_entrevistador = $2, 
           entrevistador_id = $3 
       WHERE id = $4 OR numero = $4 
       RETURNING *`,
      [ids, tem, prim, req.params.id]
    );

    res.json(rows[0] || { sucesso: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.delete('/mesas/cadeiras/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE fichas SET mesa_alocada = NULL, assento_alocado = NULL WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    res.json({ sucesso: true, ficha: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CRIAÇÃO REAL DE MESAS COM PERSISTÊNCIA NO POSTGRESQL
router.post('/mesas', async (req, res) => {
  const client = await pool.connect();
  try {
    const { numero, capacidade_total } = req.body;
    const cap = parseInt(capacidade_total, 10) || 5;

    await client.query('BEGIN');

    let num = parseInt(numero, 10);
    if (!num) {
      const { rows: maxRows } = await client.query('SELECT COALESCE(MAX(numero), 0) + 1 AS prox FROM mesas');
      num = maxRows[0].prox;
    }

    const { rows } = await client.query(
      `INSERT INTO mesas (numero, capacidade_total, tem_entrevistador, entrevistadores_ids)
       VALUES ($1, $2, false, '{}')
       RETURNING *`,
      [num, cap]
    );

    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Erro ao criar mesa no banco: ' + err.message });
  } finally {
    client.release();
  }
});

// ALTERAÇÃO DE CAPACIDADE DE ASSENTOS DA MESA
router.patch('/mesas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { capacidade_total } = req.body;
    const cap = parseInt(capacidade_total, 10) || 5;

    const { rows } = await pool.query(
      'UPDATE mesas SET capacidade_total = $1 WHERE id = $2 OR numero = $2 RETURNING *',
      [cap, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Mesa não encontrada.' });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao alterar capacidade da mesa: ' + err.message });
  }
});

// EXCLUSÃO DE MESA E DESALOCAÇÃO DE PARTICIPANTES
router.delete('/mesas/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');

    await client.query(
      `UPDATE fichas 
       SET mesa_alocada = NULL, assento_alocado = NULL 
       WHERE mesa_alocada = $1 OR mesa_alocada IN (SELECT numero FROM mesas WHERE id = $1)`,
      [id]
    );

    const { rows } = await client.query(
      'DELETE FROM mesas WHERE id = $1 OR numero = $1 RETURNING *',
      [id]
    );

    await client.query('COMMIT');
    res.json({ sucesso: true, mesaExcluida: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Erro ao excluir mesa: ' + err.message });
  } finally {
    client.release();
  }
});

module.exports = router;


module.exports = router;
