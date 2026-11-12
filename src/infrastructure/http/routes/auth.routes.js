const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const dbModule = require('../../database/connection');
const { rlsStorage } = require('../../database/connection');
const redisModule = require('../../redis/client');
const redisClient = redisModule?.redisClient || redisModule;
const {
  assinarJWT,
  verificarJWT,
  registrarSessaoAtiva,
  revogarToken
} = require('../../security/jwt');

const pool = dbModule.pool || dbModule;

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 300; // 5 minutos

function getRateLimitKey(req, email) {
  const rawIp = (req.headers['x-forwarded-for'] || req.ip || 'unknown').split(',')[0].trim();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  return `auth:ratelimit:${rawIp}:${normalizedEmail}`;
}

async function verificarBloqueioBruteForce(key) {
  if (!redisClient) return { blocked: false, ttl: 0 };
  try {
    if (redisClient.status === 'wait') await redisClient.connect();
    const attempts = Number(await redisClient.get(key)) || 0;
    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      const ttl = await redisClient.ttl(key);
      return { blocked: true, ttl: ttl > 0 ? ttl : LOCKOUT_SECONDS };
    }
    return { blocked: false, ttl: 0 };
  } catch {
    return { blocked: false, ttl: 0 };
  }
}

async function registrarFalhaLogin(key) {
  if (!redisClient) return;
  try {
    if (redisClient.status === 'wait') await redisClient.connect();
    const count = await redisClient.incr(key);
    if (count === 1) {
      await redisClient.expire(key, LOCKOUT_SECONDS);
    }
  } catch (err) {
    console.warn('⚠️ Aviso rate-limit Redis:', err.message);
  }
}

async function limparFalhasLogin(key) {
  if (!redisClient) return;
  try {
    if (redisClient.status === 'wait') await redisClient.connect();
    await redisClient.del(key);
  } catch {}
}

// LOGIN AUTENTICADO COM BCRYPT + RATE LIMIT REDIS + EMISSÃO DE JWT HS256
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

      const rateKey = getRateLimitKey(req, email);
      const statusBloqueio = await verificarBloqueioBruteForce(rateKey);
      if (statusBloqueio.blocked) {
        res.setHeader('Retry-After', String(statusBloqueio.ttl));
        return res.status(429).json({
          error: `Muitas tentativas de login falhas. Aguarde ${statusBloqueio.ttl}s antes de tentar novamente.`
        });
      }

      const { rows } = await pool.query(
        'SELECT id, nome, email, papel, senha, ativo FROM usuarios WHERE LOWER(email) = LOWER($1) LIMIT 1',
        [email.trim()]
      );

      if (rows.length === 0) {
        await registrarFalhaLogin(rateKey);
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
        await registrarFalhaLogin(rateKey);
        return res.status(401).json({ error: 'Credenciais inválidas.' });
      }

      await limparFalhasLogin(rateKey);

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
