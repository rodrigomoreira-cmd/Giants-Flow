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

// ALOCAÇÃO / DESALOCAÇÃO RÁPIDA DE MESA E ASSENTO
router.patch('/clientes/:id/mesa', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { mesa, assento } = req.body;
    const mesaNum = (mesa !== null && mesa !== undefined && mesa !== '') ? parseInt(mesa, 10) : null;
    const assentoNum = (assento !== null && assento !== undefined && assento !== '') ? parseInt(assento, 10) : null;

    await client.query('BEGIN');

    // 1. Obter dados da ficha alvo com lock de linha
    const { rows: fichaRows } = await client.query(
      'SELECT id, turma_id, nome_participante FROM fichas WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (fichaRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Participante não encontrado.' });
    }

    const fichaAtual = fichaRows[0];
    const turmaId = fichaAtual.turma_id;

    // 2. Se for uma ALOCAÇÃO (mesa e assento informados), validar conflitos e capacidade
    if (mesaNum !== null && assentoNum !== null) {
      // 2.1 Checar se a mesa existe e validar se assento excede a capacidade
      try {
        const { rows: mesaRows } = await client.query(
          'SELECT capacidade FROM mesas WHERE numero = $1 AND (turma_id = $2 OR turma_id IS NULL) LIMIT 1',
          [mesaNum, turmaId]
        );
        if (mesaRows.length > 0 && assentoNum > (mesaRows[0].capacidade || 10)) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: 'O assento ' + assentoNum + ' excede a capacidade máxima da Mesa ' + mesaNum + ' (' + mesaRows[0].capacidade + ' lugares).'
          });
        }
      } catch (e) {
        // Tabela mesas opcional na checagem estrita
      }

      // 2.2 Checar com FOR UPDATE se o assento já foi tomado por outra ficha
      const { rows: ocupante } = await client.query(
        `SELECT id, nome_participante FROM fichas 
         WHERE mesa_alocada = $1 
           AND assento_alocado = $2 
           AND COALESCE(turma_id, 0) = COALESCE($3, 0)
           AND id <> $4 
         FOR UPDATE`,
        [mesaNum, assentoNum, turmaId, id]
      );

      if (ocupante.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'Assento ' + assentoNum + ' da Mesa ' + mesaNum + ' já está ocupado por ' + (ocupante[0].nome_participante || 'outro participante') + '.'
        });
      }
    }

    // 3. Executar a alocação ou liberação de assento
    const { rows } = await client.query(
      `UPDATE fichas 
       SET mesa_alocada = $1,
           assento_alocado = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id, empresa, nome_participante, mesa_alocada, assento_alocado, almoco_pago, cortesia_almoco, membro_giants, etapa_funil`,
      [mesaNum, assentoNum, id]
    );

    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({
        error: 'Conflito de concorrência: este assento acabou de ser preenchido por outro operador.'
      });
    }
    res.status(500).json({ error: 'Erro ao atualizar mesa: ' + err.message });
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
