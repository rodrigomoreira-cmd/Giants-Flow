const express = require('express');
const router = express.Router();
const { pool } = require('../../database/connection');

// Listar catálogo de produtos
router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nome, valor_base, ativo FROM produtos ORDER BY id ASC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao consultar produtos: ' + err.message });
  }
});

// Registrar novo produto (apenas ADMIN)
router.post('/', async (req, res) => {
  const papel = String(req.usuario?.papel || '').toUpperCase();
  if (papel !== 'ADMIN') {
    return res.status(403).json({ erro: 'Apenas administradores podem cadastrar produtos.' });
  }
  try {
    const { nome, valor_base } = req.body;
    if (!nome || !nome.trim()) {
      return res.status(400).json({ erro: 'O nome do produto é obrigatório.' });
    }
    const { rows } = await pool.query(
      'INSERT INTO produtos (nome, valor_base, ativo) VALUES ($1, $2, true) RETURNING id, nome, valor_base, ativo',
      [nome.trim(), Number(valor_base) || 0]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao registrar produto: ' + err.message });
  }
});

// Atualizar preço ou nome de produto existente (apenas ADMIN; não altera propostas já fechadas)
router.put('/:id', async (req, res) => {
  const papel = String(req.usuario?.papel || '').toUpperCase();
  if (papel !== 'ADMIN') {
    return res.status(403).json({ erro: 'Apenas administradores podem alterar valores de produtos.' });
  }
  try {
    const { id } = req.params;
    const { nome, valor_base, ativo } = req.body;
    if (!nome || !nome.trim()) {
      return res.status(400).json({ erro: 'O nome do produto é obrigatório.' });
    }
    const { rows } = await pool.query(
      'UPDATE produtos SET nome = $1, valor_base = $2, ativo = COALESCE($3, ativo) WHERE id = $4 RETURNING id, nome, valor_base, ativo',
      [nome.trim(), Number(valor_base) || 0, ativo !== undefined ? Boolean(ativo) : null, id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ erro: 'Produto não encontrado.' });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao atualizar produto: ' + err.message });
  }
});

// Remover produto (apenas ADMIN)
router.delete('/:id', async (req, res) => {
  const papel = String(req.usuario?.papel || '').toUpperCase();
  if (papel !== 'ADMIN') {
    return res.status(403).json({ erro: 'Apenas administradores podem remover produtos.' });
  }
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM produtos WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ erro: 'Produto não encontrado.' });
    }
    res.json({ mensagem: 'Produto excluído com sucesso.' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao excluir produto: ' + err.message });
  }
});

module.exports = router;