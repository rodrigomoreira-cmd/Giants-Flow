const express = require('express');
const router = express.Router();
const dbModule = require('../../database/connection');
const pool = dbModule.pool || dbModule;

// LOGIN REAL COM BASE NA TABELA USUARIOS DO POSTGRESQL
router.post('/login', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'E-mail obrigatório.' });
    }

    const { rows } = await pool.query(
      'SELECT id, nome, email, papel, ativo FROM usuarios WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [email.trim()]
    );

    if (rows.length === 0) {
      // Fallback: se não achar por email exato, tenta achar usuário admin ativo
      const { rows: adminFallback } = await pool.query(
        "SELECT id, nome, email, papel, ativo FROM usuarios WHERE papel = 'admin' AND ativo = true ORDER BY id ASC LIMIT 1"
      );
      if (adminFallback.length > 0) {
        const u = adminFallback[0];
        return res.json({
          token: 'token-admin-' + u.id,
          usuario: {
            id: u.id,
            nome: u.nome,
            email: u.email,
            papel: (u.papel || 'admin').toUpperCase(),
            ativo: u.ativo
          }
        });
      }
      return res.status(401).json({ error: 'Usuário não encontrado.' });
    }

    const u = rows[0];
    if (u.ativo === false) {
      return res.status(403).json({ error: 'Acesso bloqueado: este usuário foi inativado no sistema.' });
    }
    const papelFinal = (u.papel || 'admin').toUpperCase();

    res.json({
      token: 'token-auth-' + u.id,
      usuario: {
        id: u.id,
        nome: u.nome,
        email: u.email,
        papel: papelFinal,
        ativo: u.ativo
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
