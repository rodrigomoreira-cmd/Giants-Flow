const { describe, it, after } = require('node:test');
const assert = require('node:assert');
const dbModule = require('../src/infrastructure/database/connection.js');
const pool = dbModule.pool || dbModule;

describe('Fluxo Crítico: Salão de Lunch & Concorrência de Assentos', () => {
  after(async () => {
    // Encerra conexões abertas para o Node finalizar os testes instantaneamente
    if (pool.end) await pool.end();
  });

  it('PostgreSQL deve barrar alocação simultânea no mesmo assento do Lunch (Constraint 23505)', async () => {
    const mesaLunch = 14;
    const assentoLunch = 2;
    const turmaLunch = 5555;

    // Limpeza prévia
    await pool.query('DELETE FROM fichas WHERE turma_id = $1', [turmaLunch]);

    // Primeira alocação no assento do Lunch
    const res1 = await pool.query(
      `INSERT INTO fichas (nome_participante, telefone, email, empresa, turma_id, mesa_alocada, assento_alocado, almoco_pago)
       VALUES ('Participante A', '11999991111', 'lunch.a@teste.com', 'Empresa Lunch', $1, $2, $3, true) RETURNING id`,
      [turmaLunch, mesaLunch, assentoLunch]
    );
    assert.strictEqual(res1.rows.length, 1);

    // Tentativa concorrente no mesmo assento e turma
    let erroConstraint = null;
    try {
      await pool.query(
        `INSERT INTO fichas (nome_participante, telefone, email, empresa, turma_id, mesa_alocada, assento_alocado, almoco_pago)
         VALUES ('Participante B', '11999992222', 'lunch.b@teste.com', 'Empresa Lunch', $1, $2, $3, false) RETURNING id`,
        [turmaLunch, mesaLunch, assentoLunch]
      );
    } catch (err) {
      erroConstraint = err;
    }

    assert.ok(erroConstraint !== null, 'Deveria violar a unicidade de assento no salão de Lunch');
    assert.strictEqual(erroConstraint.code, '23505');

    // Limpeza dos dados de teste
    await pool.query('DELETE FROM fichas WHERE turma_id = $1', [turmaLunch]);
  });
});