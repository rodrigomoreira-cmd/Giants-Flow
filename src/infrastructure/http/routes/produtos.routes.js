// src/infrastructure/http/routes/produtos.routes.js
const express = require('express');
const router = express.Router();
const { pool } = require('../../database/connection');

// Listar cat?logo de produtos
router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, nome, valor_base FROM produtos ORDER BY id ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao consultar produtos: ' + err.message });
  }
});

// Registrar novo produto
router.post('/', async (req, res) => {
  try {
    const { nome, valor_base } = req.body;
    if (!nome || !nome.trim()) {
      return res.status(400).json({ erro: 'O nome do produto ? obrigat?rio.' });
    }
    const { rows } = await pool.query(
      'INSERT INTO produtos (nome, valor_base) VALUES ($1, $2) RETURNING id, nome, valor_base',
      [nome.trim(), Number(valor_base) || 0]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao registrar produto: ' + err.message });
  }
});

// Atualizar produto existente
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, valor_base } = req.body;
    if (!nome || !nome.trim()) {
      return res.status(400).json({ erro: 'O nome do produto ? obrigat?rio.' });
    }
    const { rows } = await pool.query(
      'UPDATE produtos SET nome = $1, valor_base = $2 WHERE id = $3 RETURNING id, nome, valor_base',
      [nome.trim(), Number(valor_base) || 0, id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ erro: 'Produto n?o encontrado.' });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao atualizar produto: ' + err.message });
  }
});

// Remover produto
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM produtos WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ erro: 'Produto n?o encontrado.' });
    }
    res.json({ mensagem: 'Produto exclu?do com sucesso.' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao excluir produto: ' + err.message });
  }
});

module.exports = router;
