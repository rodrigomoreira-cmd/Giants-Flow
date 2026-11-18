const { exigirPapeis } = require('../middlewares/rbac');
const express = require('express');
const router = express.Router();
const dbModule = require('../../database/connection');
const pool = dbModule.pool || dbModule;

router.get('/', exigirPapeis('ADMIN'), async (req, res) => {
  const papel = String(req.usuario?.papel || '').toUpperCase();
  if (!['ADMIN'].includes(papel)) {
    return res.status(403).json({ error: 'Acesso restrito exclusivamente ao perfil Administrador.' });
  }

  try {
    const { tabela, usuarioId, limit } = req.query;
    const maxRows = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);

    const conditions = [];
    const params = [];

    if (tabela && typeof tabela === 'string') {
      params.push(tabela.trim().toLowerCase());
      conditions.push(`l.tabela = $${params.length}`);
    }

    if (usuarioId && !Number.isNaN(Number(usuarioId))) {
      params.push(Number(usuarioId));
      conditions.push(`l.usuario_id = $${params.length}`);
    }

    params.push(maxRows);
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT
         l.id,
         l.tabela,
         l.operacao,
         l.registro_id,
         l.usuario_id,
         u.nome AS usuario_nome,
         l.usuario_papel,
         l.dados_anteriores,
         l.dados_novos,
         l.criado_em
       FROM log_auditoria l
       LEFT JOIN usuarios u ON u.id = l.usuario_id
       ${whereClause}
       ORDER BY l.id DESC
       LIMIT $${params.length}`,
      params
    );

    return res.json(rows);
  } catch (err) {
    if (err.code === '42501') {
      return res.status(403).json({ error: 'Permissão negada pela política RLS de auditoria.' });
    }
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;