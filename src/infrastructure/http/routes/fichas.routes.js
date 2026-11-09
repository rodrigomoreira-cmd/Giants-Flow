// src/infrastructure/http/routes/fichas.routes.js
const express = require('express');
const router = express.Router();
const { pool } = require('../../database/connection');

// Listar todas as fichas
router.get('/', async (_req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const query = `
      SELECT id, nome, nome_cracha, empresa, cpf_cnpj, telefone, email, origem, status, criado_em 
      FROM fichas 
      ORDER BY id DESC
    `;
    const { rows } = await pool.query(query);
    return res.status(200).json(rows);
  } catch (err) {
    console.error('Erro ao consultar fichas:', err);
    return res.status(500).json({ erro: 'Erro ao consultar fichas: ' + err.message });
  }
});

// Registrar nova ficha
router.post('/', async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const { nome, nome_cracha, empresa, cpf_cnpj, telefone, email, origem, status } = req.body;

    if (!nome || !telefone) {
      return res.status(400).json({ erro: 'Nome e WhatsApp/Telefone são obrigatórios.' });
    }

    const query = `
      INSERT INTO fichas (nome, nome_cracha, empresa, cpf_cnpj, telefone, email, origem, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    const valores = [
      nome.trim(),
      nome_cracha ? nome_cracha.trim() : null,
      empresa ? empresa.trim() : null,
      cpf_cnpj ? cpf_cnpj.trim() : null,
      telefone.trim(),
      email ? email.trim().toLowerCase() : null,
      origem || 'ORGANICO',
      status || 'AGUARDANDO_TRIAGEM'
    ];

    const { rows } = await pool.query(query, valores);
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Erro ao registrar ficha:', err);
    return res.status(500).json({ erro: 'Erro ao registrar ficha: ' + err.message });
  }
});

module.exports = router;