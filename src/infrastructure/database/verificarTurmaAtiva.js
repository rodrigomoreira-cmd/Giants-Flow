const dbModule = require('./connection');
const pool = dbModule.pool || dbModule;

/**
 * Garante que a turma esteja ativa (ativa = true e status_evento <> 'ENCERRADA')
 * antes de permitir qualquer escrita operacional (mesa, almoço, entrevista, proposta).
 */
async function exigirTurmaAtiva({ turmaId = null, fichaId = null, runner = null } = {}) {
  const db = runner || pool;
  let idTurmaAlvo = turmaId ? Number(turmaId) : null;

  if (!idTurmaAlvo && fichaId) {
    const { rows: fRows } = await db.query(
      'SELECT turma_id FROM fichas WHERE id = $1::int LIMIT 1',
      [Number(fichaId)]
    );
    if (fRows[0]?.turma_id) {
      idTurmaAlvo = Number(fRows[0].turma_id);
    }
  }

  if (!idTurmaAlvo) return null;

  const { rows: tRows } = await db.query(
    'SELECT id, codigo, nome, ativa, status_evento FROM turmas WHERE id = $1::int LIMIT 1',
    [idTurmaAlvo]
  );

  if (tRows.length > 0) {
    const t = tRows[0];
    const encerrada = t.ativa === false || String(t.status_evento || '').toUpperCase() === 'ENCERRADA';
    if (encerrada) {
      const err = new Error(
        `Operação bloqueada: a turma "${t.nome}" (#${t.id}) está desativada/encerrada. Para realizar alterações, reative-a em Administração → Turmas & Eventos.`
      );
      err.statusCode = 403;
      throw err;
    }
  }

  return idTurmaAlvo;
}

module.exports = { exigirTurmaAtiva };
