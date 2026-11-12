const express = require('express');
const router = express.Router();
const { pool } = require('../../database/connection');

// Listar catálogo completo de produtos e subprodutos
router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, nome, categoria, tipo_item, valor_base, parcelas_padrao, valor_adicional_unitario, descricao_entregaveis, ativo
       FROM produtos
       WHERE ativo = true
       ORDER BY
         CASE categoria WHEN 'GIANTS' THEN 1 WHEN 'PAC' THEN 2 WHEN 'AE' THEN 3 ELSE 4 END,
         CASE tipo_item WHEN 'PRINCIPAL' THEN 1 WHEN 'ADICIONAL' THEN 2 WHEN 'CONVOCACAO' THEN 3 ELSE 4 END,
         id ASC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao consultar produtos: ' + err.message });
  }
});

// Registrar novo produto/subproduto (apenas ADMIN)
router.post('/', async (req, res) => {
  const papel = String(req.usuario?.papel || '').toUpperCase();
  if (papel !== 'ADMIN') {
    return res.status(403).json({ erro: 'Apenas administradores podem cadastrar produtos.' });
  }
  try {
    const { nome, categoria, tipo_item, valor_base, parcelas_padrao, valor_adicional_unitario, descricao_entregaveis } = req.body;
    if (!nome || !nome.trim()) {
      return res.status(400).json({ erro: 'O nome do produto é obrigatório.' });
    }
    const { rows } = await pool.query(
      `INSERT INTO produtos (nome, categoria, tipo_item, valor_base, parcelas_padrao, valor_adicional_unitario, descricao_entregaveis, ativo, status_pitch, pitch_liberado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, 'liberado', true)
       RETURNING id, nome, categoria, tipo_item, valor_base, parcelas_padrao, valor_adicional_unitario, descricao_entregaveis, ativo`,
      [
        nome.trim(),
        (categoria || 'GIANTS').toUpperCase(),
        (tipo_item || 'PRINCIPAL').toUpperCase(),
        Number(valor_base) || 0,
        Number(parcelas_padrao) || 12,
        Number(valor_adicional_unitario) || 0,
        descricao_entregaveis || ''
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao registrar produto: ' + err.message });
  }
});

// Atualizar preço, parcelamento ou descrição de produto/subproduto (apenas ADMIN; não altera vendas fechadas)
router.put('/:id', async (req, res) => {
  const papel = String(req.usuario?.papel || '').toUpperCase();
  if (papel !== 'ADMIN') {
    return res.status(403).json({ erro: 'Apenas administradores podem alterar valores de produtos.' });
  }
  try {
    const { id } = req.params;
    const { nome, valor_base, parcelas_padrao, valor_adicional_unitario, descricao_entregaveis, ativo } = req.body;
    if (!nome || !nome.trim()) {
      return res.status(400).json({ erro: 'O nome do produto é obrigatório.' });
    }
    const { rows } = await pool.query(
      `UPDATE produtos
       SET nome = $1,
           valor_base = $2,
           parcelas_padrao = COALESCE($3, parcelas_padrao),
           valor_adicional_unitario = COALESCE($4, valor_adicional_unitario),
           descricao_entregaveis = COALESCE($5, descricao_entregaveis),
           ativo = COALESCE($6, ativo)
       WHERE id = $7
       RETURNING id, nome, categoria, tipo_item, valor_base, parcelas_padrao, valor_adicional_unitario, descricao_entregaveis, ativo`,
      [
        nome.trim(),
        Number(valor_base) || 0,
        parcelas_padrao !== undefined ? Number(parcelas_padrao) : null,
        valor_adicional_unitario !== undefined ? Number(valor_adicional_unitario) : null,
        descricao_entregaveis !== undefined ? descricao_entregaveis : null,
        ativo !== undefined ? Boolean(ativo) : null,
        id
      ]
    );
    if (rows.length === 0) {
      return res.status(404).json({ erro: 'Produto não encontrado.' });
    }
    if (rows[0].tipo_item === 'ADICIONAL') {
      await pool.query(
        "UPDATE produtos SET valor_adicional_unitario = $1 WHERE categoria = $2 AND tipo_item = 'PRINCIPAL'",
        [Number(valor_base) || 0, rows[0].categoria]
      );
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao atualizar produto: ' + err.message });
  }
});

// Desativar produto (apenas ADMIN)
router.delete('/:id', async (req, res) => {
  const papel = String(req.usuario?.papel || '').toUpperCase();
  if (papel !== 'ADMIN') {
    return res.status(403).json({ erro: 'Apenas administradores podem remover produtos.' });
  }
  try {
    const { id } = req.params;
    const result = await pool.query('UPDATE produtos SET ativo = false WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ erro: 'Produto não encontrado.' });
    }
    res.json({ mensagem: 'Produto desativado com sucesso.' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao desativar produto: ' + err.message });
  }
});

module.exports = router;