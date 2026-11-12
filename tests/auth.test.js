const { describe, it, after } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const bcrypt = require('bcryptjs');

const authRoutesModule = require('../src/infrastructure/http/routes/auth.routes.js');
const authRoutes = authRoutesModule.default || authRoutesModule;
const { pool, rlsStorage } = require('../src/infrastructure/database/connection.js');
const { verificarJWT, verificarTokenRevogado } = require('../src/infrastructure/security/jwt.js');
const redisModule = require('../src/infrastructure/redis/client.js');
const redisClient = redisModule?.redisClient || redisModule;

const app = express();
app.use(express.json());
app.use('/auth', authRoutes);

describe('Fluxo Crítico: Autenticação, JWT HS256 & Revogação Redis', () => {
  after(async () => {
    if (redisClient && redisClient.status !== 'end') {
      try { await redisClient.quit(); } catch {}
    }
    if (pool.end) await pool.end();
  });

  it('Deve rejeitar login sem preenchimento de e-mail (400)', async () => {
    const server = app.listen(0);
    const { port } = server.address();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      assert.strictEqual(res.status, 400);
      assert.match(data.error, /E-mail/i);
    } finally {
      server.close();
    }
  });

  it('Deve rejeitar login sem senha mesmo com e-mail válido (400)', async () => {
    const server = app.listen(0);
    const { port } = server.address();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@teste.com' })
      });
      const data = await res.json();
      assert.strictEqual(res.status, 400);
      assert.match(data.error, /Senha/i);
    } finally {
      server.close();
    }
  });

  it('Deve rejeitar credenciais com e-mail inexistente sem conceder admin (401)', async () => {
    const server = app.listen(0);
    const { port } = server.address();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'usuario.inexistente.999@teste.com', senha: '123' })
      });
      const data = await res.json();
      assert.strictEqual(res.status, 401);
      assert.strictEqual(data.error, 'Credenciais inválidas.');
    } finally {
      server.close();
    }
  });

  it('Deve emitir JWT HS256 válido, rejeitar adulteração e revogar via logout no Redis', async () => {
    const emailTeste = `jwt.audit.${Date.now()}@teste.com`;
    const senhaPlana = 'SenhaForte#2026';
    const hash = await bcrypt.hash(senhaPlana, 10);

    let criadoId;
    await rlsStorage.run({ userId: null, userRole: 'SYSTEM' }, async () => {
      const ins = await pool.query(
        `INSERT INTO usuarios (nome, email, papel, senha, ativo)
         VALUES ($1, $2, 'ADMIN', $3, true) RETURNING id`,
        ['Auditor JWT', emailTeste, hash]
      );
      criadoId = ins.rows[0].id;
    });

    const server = app.listen(0);
    const { port } = server.address();

    try {
      const res = await fetch(`http://127.0.0.1:${port}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailTeste, senha: senhaPlana })
      });
      const data = await res.json();
      assert.strictEqual(res.status, 200);
      assert.ok(data.token && data.token.split('.').length === 3, 'Deve retornar JWT de 3 segmentos');

      // Valida assinatura e claims
      const payload = verificarJWT(data.token);
      assert.strictEqual(payload.sub, criadoId);
      assert.strictEqual(payload.role, 'ADMIN');

      // Garante que token adulterado ou previsível antigo é rejeitado
      assert.strictEqual(verificarJWT(`${data.token}x`), null);
      assert.strictEqual(verificarJWT(`token-admin-${criadoId}`), null);

      // Executa logout e confirma revogação imediata no Redis
      const logoutRes = await fetch(`http://127.0.0.1:${port}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.token}` }
      });
      assert.strictEqual(logoutRes.status, 200);

      const estaRevogado = await verificarTokenRevogado(payload);
      assert.strictEqual(estaRevogado, true, 'JTI deve constar como revogado no Redis após logout');
    } finally {
      server.close();
      await rlsStorage.run({ userId: null, userRole: 'SYSTEM' }, async () => {
        await pool.query('DELETE FROM usuarios WHERE id = $1', [criadoId]);
      });
    }
  });
});
