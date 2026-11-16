
function sanitizarEmpresaLgpd(valor) {
  if (!valor) return valor;
  return String(valor)
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '')
    .replace(/\b\d{11}\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function extrairCnpjSomentePj(valor) {
  if (!valor) return null;
  const digits = String(valor).replace(/\D/g, '');
  return digits.length === 14 ? String(valor).trim() : null;
}

// src/infrastructure/http/routes/fichas.routes.js
const express = require('express');
const router = express.Router();
const { pool } = require('../../database/connection');

// Listar todas as fichas
router.get('/', async (_req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const query = `
      SELECT id, nome_participante AS nome, nome_cracha, empresa, cpf_cnpj, telefone, email, origem, status, criado_em, historico_produtos_elegiveis, valor_investido_pac_ae, cashback_upgrade_90_pct 
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
    const { nome: nomeRaw, nome_participante, nome_cracha, empresa, cpf_cnpj, telefone, email, origem, status } = req.body;

    const nome = nomeRaw || nome_participante;
    if (!nome || !telefone) {
      return res.status(400).json({ erro: 'Nome e WhatsApp/Telefone são obrigatórios.' });
    }

    const query = `
      INSERT INTO fichas (nome_participante, nome_cracha, empresa, cpf_cnpj, telefone, email, origem, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    const valores = [
      nome.trim(),
      nome_cracha ? nome_cracha.trim() : null,
      empresa ? sanitizarEmpresaLgpd(empresa) : null,
      extrairCnpjSomentePj(cpf_cnpj),
      telefone.trim(),
      email ? email.trim().toLowerCase() : null,
      origem || 'ORGANICO',
      status || 'AGUARDANDO_TRIAGEM'
    ];

    const { rows } = await pool.query(query, valores);
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Erro ao registrar ficha:', err);
    if (err.code === '42501') {
      return res.status(403).json({ erro: 'Acesso negado pela política de segurança do banco de dados (RLS).' });
    }
    return res.status(500).json({ erro: 'Erro ao registrar ficha: ' + err.message });
  }
});

module.exports = router;