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

describe('Fluxo Crítico: Row Level Security (RLS), Isolamento por Operador & Auditoria', () => {
  after(async () => {
    if (pool.end) await pool.end();
  });

  it('Deve ocultar registros sensíveis no PostgreSQL para contexto ANON', async () => {
    await rlsStorage.run({ userId: null, userRole: 'ANON' }, async () => {
      const fichas = await pool.query('SELECT COUNT(*)::int AS total FROM fichas');
      const usuarios = await pool.query('SELECT COUNT(*)::int AS total FROM usuarios');
      const regras = await pool.query('SELECT COUNT(*)::int AS total FROM regras_comerciais');
      const logs = await pool.query('SELECT COUNT(*)::int AS total FROM log_auditoria');

      assert.strictEqual(fichas.rows[0].total, 0);
      assert.strictEqual(usuarios.rows[0].total, 0);
      assert.strictEqual(regras.rows[0].total, 0);
      assert.strictEqual(logs.rows[0].total, 0);
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

  it('Deve isolar fichas entre operadores (ENTREVISTADOR A vs B) e conceder visão global ao ADMIN', async () => {
    const operadorA = 9001;
    const operadorB = 9002;
    let fichaAId;
    let fichaBId;

    await rlsStorage.run({ userId: 1, userRole: 'ADMIN' }, async () => {
      const resA = await pool.query(
        `INSERT INTO fichas (nome_participante, telefone, empresa, entrevistador_id)
         VALUES ('Cliente Operador A', '11911111111', 'Empresa A', $1) RETURNING id`,
        [operadorA]
      );
      const resB = await pool.query(
        `INSERT INTO fichas (nome_participante, telefone, empresa, entrevistador_id)
         VALUES ('Cliente Operador B', '11922222222', 'Empresa B', $1) RETURNING id`,
        [operadorB]
      );
      fichaAId = resA.rows[0].id;
      fichaBId = resB.rows[0].id;
    });

    try {
      // Operador A enxerga sua ficha e NÃO enxerga a do Operador B
      await rlsStorage.run({ userId: operadorA, userRole: 'ENTREVISTADOR' }, async () => {
        const visiveisA = await pool.query(
          'SELECT id FROM fichas WHERE id = ANY($1::int[])',
          [[fichaAId, fichaBId]]
        );
        assert.deepStrictEqual(visiveisA.rows.map(r => r.id), [fichaAId]);

        // Tentativa de UPDATE na ficha do Operador B afeta 0 linhas
        const updB = await pool.query(
          "UPDATE fichas SET empresa = 'Hackeada' WHERE id = $1 RETURNING id",
          [fichaBId]
        );
        assert.strictEqual(updB.rowCount, 0);
      });

      // ADMIN enxerga ambas as fichas
      await rlsStorage.run({ userId: 1, userRole: 'ADMIN' }, async () => {
        const visiveisAdmin = await pool.query(
          'SELECT id FROM fichas WHERE id = ANY($1::int[]) ORDER BY id',
          [[fichaAId, fichaBId]]
        );
        assert.deepStrictEqual(visiveisAdmin.rows.map(r => r.id), [fichaAId, fichaBId]);
      });
    } finally {
      await rlsStorage.run({ userId: 1, userRole: 'ADMIN' }, async () => {
        await pool.query('DELETE FROM fichas WHERE id = ANY($1::int[])', [[fichaAId, fichaBId]]);
      });
    }
  });

  it('Deve registrar trilha imutável em log_auditoria com usuario_id, mascarar senha e barrar DELETE', async () => {
    const emailAudit = `audit.trail.${Date.now()}@teste.com`;
    let userCriadoId;

    await rlsStorage.run({ userId: 77, userRole: 'ADMIN' }, async () => {
      const ins = await pool.query(
        `INSERT INTO usuarios (nome, email, papel, senha, ativo)
         VALUES ('Operador Auditado', $1, 'VENDEDOR', '$2a$10$secrethashvalue', true) RETURNING id`,
        [emailAudit]
      );
      userCriadoId = ins.rows[0].id;

      const logs = await pool.query(
        `SELECT tabela, operacao, registro_id, usuario_id, usuario_papel, dados_novos
         FROM log_auditoria
         WHERE tabela = 'usuarios' AND registro_id = $1
         ORDER BY id DESC LIMIT 1`,
        [String(userCriadoId)]
      );

      assert.strictEqual(logs.rows.length, 1);
      assert.strictEqual(logs.rows[0].operacao, 'INSERT');
      assert.strictEqual(logs.rows[0].usuario_id, 77);
      assert.strictEqual(logs.rows[0].usuario_papel, 'ADMIN');
      assert.strictEqual(logs.rows[0].dados_novos.email, emailAudit);
      assert.strictEqual(logs.rows[0].dados_novos.senha, undefined, 'Hash de senha não deve ser gravado no log');

      // Garante imutabilidade: DELETE em log_auditoria é bloqueado pelo RLS (0 linhas afetadas)
      const delLog = await pool.query(
        "DELETE FROM log_auditoria WHERE tabela = 'usuarios' AND registro_id = $1 RETURNING id",
        [String(userCriadoId)]
      );
      assert.strictEqual(delLog.rowCount, 0, 'Logs de auditoria devem ser imutáveis (append-only)');

      // Limpa o usuário de teste
      await pool.query('DELETE FROM usuarios WHERE id = $1', [userCriadoId]);
    });
  });
});