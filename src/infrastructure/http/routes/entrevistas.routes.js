const express = require('express');
const router = express.Router();
const dbModule = require('../../database/connection');
const pool = dbModule.pool || dbModule;

// 6. ALOCAÇÃO DO EMPRESÁRIO NA MESA COM ENTREVISTADOR DESIGNADO
router.post('/entrevistas/agendar', async (req, res) => {
  const client = await pool.connect();
  try {
    const b = req.body;
    const id = b.aplicacaoId || b.cliente_id || b.fichaId || b.id;
    const mesa = b.mesaId || b.mesa_id || b.mesa;
    const entrevistadorId = b.entrevistador_id ? Number(b.entrevistador_id) : (b.entrevistadores_ids?.[0] ? Number(b.entrevistadores_ids[0]) : null);

    if (!id || !mesa) return res.status(400).json({ error: 'ID do participante ou Mesa não fornecidos.' });

    await client.query('BEGIN');

    const { rows: clienteRows } = await client.query(
      'SELECT almoco_pago, cortesia_almoco, membro_giants FROM fichas WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (clienteRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    const c = clienteRows[0];
    const liberadoAlmoco = Boolean(c.membro_giants) || Boolean(c.almoco_pago) || Boolean(c.cortesia_almoco);

    if (!liberadoAlmoco) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Acesso negado: participante não possui almoço pago nem cortesia ativa.' });
    }

    const { rows } = await client.query(
      `UPDATE fichas 
       SET etapa_funil = 'entrevista', 
           mesa_alocada = $1, 
           entrevistador_id = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 
       RETURNING *`,
      [mesa, entrevistadorId, id]
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

router.post('/entrevistas/resultado', async (req, res) => {
  try {
    const id = req.body.entrevista_id || req.body.fichaId || req.body.participanteId || req.body.id || req.body.aplicacaoId;
    const resString = String(req.body.resultado || '').toLowerCase();
    
    let novaEtapa = 'aguardando_aprovacao';
    if (resString.includes('reprovado')) {
      novaEtapa = 'reprovado';
    } else if (resString.includes('proposta') || resString.includes('aprovado')) {
      novaEtapa = 'aguardando_aprovacao';
    } else if (resString.includes('almoco')) {
      novaEtapa = 'almoco';
    }

    const { rows } = await pool.query(
      "UPDATE fichas SET etapa_funil = $1, mesa_alocada = NULL, assento_alocado = NULL WHERE id = $2 RETURNING *",
      [novaEtapa, id]
    );
    res.json(rows[0] || { sucesso: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


module.exports = router;
