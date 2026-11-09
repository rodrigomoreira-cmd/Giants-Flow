const { describe, it, after } = require('node:test');
const assert = require('node:assert');
const express = require('express');

const authRoutesModule = require('../src/infrastructure/http/routes/auth.routes.js');
const authRoutes = authRoutesModule.default || authRoutesModule;
const dbModule = require('../src/infrastructure/database/connection.js');
const pool = dbModule.pool || dbModule;

const app = express();
app.use(express.json());
app.use('/auth', authRoutes);

describe('Fluxo Crítico: Autenticação & Bcrypt', () => {
  after(async () => {
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
});