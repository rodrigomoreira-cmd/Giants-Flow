const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const dbModule = require('../../database/connection');
const { rlsStorage } = require('../../database/connection');
const {
  assinarJWT,
  verificarJWT,
  registrarSessaoAtiva,
  revogarToken
} = require('../../security/jwt');

const pool = dbModule.pool || dbModule;

// LOGIN AUTENTICADO COM BCRYPT + EMISSÃO DE JWT HS256
router.post('/login', async (req, res) => {
  return rlsStorage.run({ userId: null, userRole: 'SYSTEM' }, async () => {
    try {
      const { email, senha } = req.body;
      if (!email || typeof email !== 'string' || !email.trim()) {
        return res.status(400).json({ error: 'E-mail obrigatório.' });
      }
      if (!senha || typeof senha !== 'string') {
        return res.status(400).json({ error: 'Senha obrigatória.' });
      }

      const { rows } = await pool.query(
        'SELECT id, nome, email, papel, senha, ativo FROM usuarios WHERE LOWER(email) = LOWER($1) LIMIT 1',
        [email.trim()]
      );

      if (rows.length === 0) {
        return res.status(401).json({ error: 'Credenciais inválidas.' });
      }

      const u = rows[0];
      if (u.ativo === false) {
        return res.status(403).json({ error: 'Acesso bloqueado: este usuário foi inativado no sistema.' });
      }

      let senhaValida = false;
      const isBcrypt = typeof u.senha === 'string' && u.senha.startsWith('$2');

      if (isBcrypt) {
        senhaValida = await bcrypt.compare(senha, u.senha);
      } else {
        senhaValida = Boolean(u.senha && u.senha === senha);
        if (senhaValida) {
          const novoHash = await bcrypt.hash(senha, 10);
          await pool.query('UPDATE usuarios SET senha = $1 WHERE id = $2', [novoHash, u.id]);
        }
      }

      if (!senhaValida) {
        return res.status(401).json({ error: 'Credenciais inválidas.' });
      }

      const papelFinal = (u.papel || 'USER').toUpperCase();
      const { token, payload } = assinarJWT({ userId: u.id, userRole: papelFinal });
      await registrarSessaoAtiva(payload);

      return res.json({
        token,
        expiresAt: payload.exp * 1000,
        usuario: {
          id: u.id,
          nome: u.nome,
          email: u.email,
          papel: papelFinal,
          ativo: u.ativo
        }
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });
});

// LOGOUT COM REVOGAÇÃO IMEDIATA DO JTI NO REDIS
router.post('/logout', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const payload = verificarJWT(token);

    if (payload) {
      await revogarToken(payload);
    }

    return res.json({ message: 'Sessão encerrada com segurança.' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// VALIDAÇÃO DA SESSÃO ATUAL
router.get('/me', (req, res) => {
  if (!req.usuario) {
    return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
  }
  return res.json({
    usuario: {
      id: req.usuario.id,
      nome: req.usuario.nome,
      email: req.usuario.email,
      papel: (req.usuario.papel || 'USER').toUpperCase(),
      ativo: req.usuario.ativo
    }
  });
});

module.exports = router;
