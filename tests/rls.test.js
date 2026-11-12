const { describe, it, after } = require('node:test');
const assert = require('node:assert');
const express = require('express');

const { pool, rlsStorage } = require('../src/infrastructure/database/connection.js');
const fichasRoutesModule = require('../src/infrastructure/http/routes/fichas.routes.js');
const fichasRoutes = fichasRoutesModule.default || fichasRoutesModule;

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  rlsStorage.run({ userId: null, userRole: 'ANON' }, () => next());
});
app.use('/fichas', fichasRoutes);

describe('Fluxo Crítico: Row Level Security (RLS) & Isolamento de Pool', () => {
  after(async () => {
    if (pool.end) await pool.end();
  });

  it('Deve ocultar registros sensíveis no PostgreSQL para contexto ANON', async () => {
    await rlsStorage.run({ userId: null, userRole: 'ANON' }, async () => {
      const fichas = await pool.query('SELECT COUNT(*)::int AS total FROM fichas');
      const usuarios = await pool.query('SELECT COUNT(*)::int AS total FROM usuarios');
      const regras = await pool.query('SELECT COUNT(*)::int AS total FROM regras_comerciais');

      assert.strictEqual(fichas.rows[0].total, 0);
      assert.strictEqual(usuarios.rows[0].total, 0);
      assert.strictEqual(regras.rows[0].total, 0);
    });
  });

  it('Deve barrar INSERT em fichas via PostgreSQL RLS (42501) e retornar HTTP 403', async () => {
    const server = app.listen(0);
    const { port } = server.address();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/fichas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: 'Teste Bloqueio RLS',
          telefone: '11999999999',
          empresa: 'Empresa Bloqueada'
        })
      });
      const data = await res.json();
      assert.strictEqual(res.status, 403);
      assert.match(data.erro, /RLS/i);
    } finally {
      server.close();
    }
  });

  it('Deve limpar o contexto RLS ao devolver conexão ao pool (ADMIN -> ANON)', async () => {
    await rlsStorage.run({ userId: 1, userRole: 'ADMIN' }, async () => {
      const regrasAdmin = await pool.query('SELECT COUNT(*)::int AS total FROM regras_comerciais');
      assert.ok(regrasAdmin.rows[0].total > 0, 'ADMIN deve visualizar regras comerciais');
    });

    await rlsStorage.run({ userId: null, userRole: 'ANON' }, async () => {
      const regrasAnon = await pool.query('SELECT COUNT(*)::int AS total FROM regras_comerciais');
      assert.strictEqual(regrasAnon.rows[0].total, 0, 'Conexão reutilizada não pode vazar contexto ADMIN');
    });
  });
});
