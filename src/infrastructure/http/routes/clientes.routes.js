const express = require('express');
const router = express.Router();
const dbModule = require('../../database/connection');
const pool = dbModule.pool || dbModule;

// 3. CLIENTES COM CASHBACK ATÃ”MICO
router.get('/clientes', async (req, res) => {
  try {
    const { turmaId } = req.query;
    let query = `
      SELECT f.id, f.empresa, f.nome_participante AS nome_completo, f.email, f.telefone,
             f.cnpj, f.etapa_funil AS status, f.almoco_pago, f.cortesia_almoco, f.membro_giants,
             f.cashback, f.mesa_alocada, f.mesa_alocada AS "mesaId", f.assento_alocado, f.assento_alocado AS "assentoId",
             f.entrevistador_id, f.created_at
      FROM fichas f
    `;
    const params = [];
    if (turmaId) { query += ' WHERE f.turma_id = $1 OR f.turma_id IS NULL'; params.push(turmaId); }
    query += ' ORDER BY f.id DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/clientes', async (req, res) => {
  try {
    const { empresa, nome, email, telefone, cnpj, turmaId } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO fichas (empresa, nome_participante, email, telefone, cnpj, turma_id, etapa_funil)
       VALUES ($1, $2, $3, $4, $5, $6, 'novo') RETURNING *`, [empresa, nome, email, telefone, cnpj, turmaId || 1]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// VALIDADOR DE ALMOÇO (PAGO R$ 1000, CORTESIA OU GIANTS)

// ALOCAÇÃO NO SALÃO DE LUNCH (MESA E ASSENTO)
// ALOCAÇÃO DIRETA NO SALÃO DE LUNCH (MESA E ASSENTO)
// ALOCAÇÃO DIRETA NO SALÃO DE LUNCH (MESA E ASSENTO)
// ALOCAÇÃO NO SALÃO DE LUNCH
// ALOCAÇÃO NO SALÃO DE LUNCH
﻿// ALOCAÇÃO NO SALÃO DE LUNCH
router.patch('/clientes/:id/mesa', async (req, res) => {
  const { id } = req.params;
  const fichaId = parseInt(id, 10);
  const { mesa, assento } = req.body;
  const mesaNum = (mesa !== null && mesa !== undefined && mesa !== '') ? parseInt(mesa, 10) : null;
  const assentoNum = (assento !== null && assento !== undefined && assento !== '') ? parseInt(assento, 10) : null;

  if (isNaN(fichaId)) {
    return res.status(400).json({ error: 'ID do participante inválido.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Obter dados do participante com bloqueio pessimista FOR UPDATE
    const { rows: fichaRows } = await client.query(
      'SELECT id, turma_id, nome_participante, empresa, almoco_pago, cortesia_almoco, membro_giants, etapa_funil FROM fichas WHERE id = $1::integer FOR UPDATE',
      [fichaId]
    );

    if (fichaRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Participante não encontrado no sistema.' });
    }

    const fichaAtual = fichaRows[0];
    const turmaId = fichaAtual.turma_id;

    // 2. Se for uma alocação no Lunch, validar elegibilidade e concorrência no Salão
    if (mesaNum !== null && assentoNum !== null) {
      const liberadoAlmoco = Boolean(fichaAtual.membro_giants) || 
                            Boolean(fichaAtual.almoco_pago) || 
                            Boolean(fichaAtual.cortesia_almoco);

      if (!liberadoAlmoco) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          error: 'Acesso negado: participante não possui almoço liberado (Membro GIANTS, R$ 1.000 pago ou Cortesia).'
        });
      }

      // Checa concorrência de assento no Salão de Lunch com casting tipado
      const { rows: ocupante } = await client.query(
        'SELECT id, nome_participante FROM fichas WHERE mesa_alocada = $1::integer AND assento_alocado = $2::integer AND COALESCE(turma_id, 0) = COALESCE($3::integer, 0) AND id <> $4::integer FOR UPDATE',
        [mesaNum, assentoNum, turmaId, fichaId]
      );

      if (ocupante.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'O assento ' + assentoNum + ' da Mesa ' + mesaNum + ' do Salão de Lunch já está ocupado por ' + (ocupante[0].nome_participante || 'outro participante') + '.'
        });
      }
    }

    // 3. Atualizar alocação no Salão de Lunch com casting explícito ($1::integer)
    const sqlUpdate = `
      UPDATE fichas 
      SET mesa_alocada = $1::integer, 
          assento_alocado = $2::integer, 
          etapa_funil = CASE 
            WHEN $1::integer IS NOT NULL AND (etapa_funil IS NULL OR etapa_funil IN ('lead', 'novo')) THEN 'entrevista' 
            ELSE etapa_funil 
          END, 
          updated_at = CURRENT_TIMESTAMP 
      WHERE id = $3::integer 
      RETURNING id, empresa, nome_participante, mesa_alocada, assento_alocado, almoco_pago, cortesia_almoco, membro_giants, etapa_funil
    `;

    const { rows } = await client.query(sqlUpdate, [mesaNum, assentoNum, fichaId]);

    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ERRO ALOCAÇÃO SALÃO DE LUNCH:', err);
    if (err.code === '23505') {
      return res.status(409).json({
        error: 'Conflito de concorrência: este assento do Salão de Lunch acabou de ser ocupado por outro operador.'
      });
    }
    res.status(500).json({ error: 'Erro ao alocar no Salão de Lunch: ' + err.message });
  } finally {
    client.release();
  }
});

router.patch('/clientes/:id/almoco', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { tipo, cv_cartao } = req.body; 
    // tipo: 'pago' | 'cortesia' | 'giants' | 'pendente'

    let almoco_pago = false;
    let cortesia_almoco = false;
    let membro_giants = false;
    let cv = (cv_cartao || '').trim() || null;

    if (tipo === 'pago') {
      almoco_pago = true;
    } else if (tipo === 'cortesia') {
      cortesia_almoco = true;
    } else if (tipo === 'giants') {
      membro_giants = true;
    }

    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE fichas 
       SET almoco_pago = $1,
           cortesia_almoco = $2,
           membro_giants = $3,
           cv_cartao = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING id, empresa, nome_participante, almoco_pago, cortesia_almoco, membro_giants, cv_cartao, etapa_funil`,
      [almoco_pago, cortesia_almoco, membro_giants, cv, id]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Erro ao validar almoço: ' + err.message });
  } finally {
    client.release();
  }
});

router.patch('/clientes/:id', async (req, res) => {
  try {
    const { almoco_pago, cortesia_almoco, cortesia } = req.body;
    const { rows } = await pool.query(
      `UPDATE fichas 
       SET almoco_pago = COALESCE($1, almoco_pago),
           cortesia_almoco = COALESCE($2, COALESCE($3, cortesia_almoco))
       WHERE id = $4 RETURNING *`,
      [almoco_pago, cortesia_almoco, cortesia, req.params.id]
    );
    res.json(rows[0] || { sucesso: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/clientes/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    let { empresa, nome_completo, email, telefone, cnpj, cashback } = req.body;

    if (cashback !== undefined && cashback !== null) {
      cashback = Number(cashback);
      if (isNaN(cashback) || !isFinite(cashback)) {
        return res.status(400).json({ error: 'O valor do cashback deve ser um número válido.' });
      }
      if (cashback < 0) {
        return res.status(400).json({ error: 'O cashback não pode ser um valor negativo.' });
      }
      if (cashback > 50000) {
        return res.status(400).json({ error: 'O cashback ultrapassa o limite teto permitido (R$ 50.000,00).' });
      }
    }

    await client.query('BEGIN');

    const { rows: clienteAtual } = await client.query(
      'SELECT id, cashback, empresa FROM fichas WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (clienteAtual.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    const { rows } = await client.query(
      `UPDATE fichas 
       SET empresa = COALESCE($1, empresa),
           nome_participante = COALESCE($2, nome_participante),
           email = COALESCE($3, email),
           telefone = COALESCE($4, telefone),
           cnpj = COALESCE($5, cnpj),
           cashback = COALESCE($6, cashback),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 
       RETURNING *`,
      [empresa, nome_completo, email, telefone, cnpj, cashback, id]
    );

    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});


module.exports = router;
