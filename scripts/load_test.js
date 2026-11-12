const { execSync } = require('child_process');

const BASE_URL = process.env.LOAD_TEST_URL || 'http://127.0.0.1:8081';
const CONCURRENT_OPERATORS = 40;
const WAVES = 3; // 40 * 3 = 120 requisições HTTP simultâneas via Nginx

function percentile(sortedArr, p) {
  if (sortedArr.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, Math.min(idx, sortedArr.length - 1))];
}

async function main() {
  console.log('==========================================================');
  console.log('   GIANTS FLOW - TESTE DE CARGA & CONCORRÊNCIA PRÉ-EVENTO ');
  console.log('==========================================================');
  console.log(`Alvo: ${BASE_URL} | Operadores simultâneos: ${CONCURRENT_OPERATORS} | Ondas: ${WAVES}`);

  // 1. Cria operador temporário e emite JWT válido dentro do contêiner app_sistema
  const setupScript = `
    const { pool, rlsStorage } = require('./src/infrastructure/database/connection');
    const { assinarJWT, registrarSessaoAtiva } = require('./src/infrastructure/security/jwt');
    const redisMod = require('./src/infrastructure/redis/client');
    const redis = redisMod?.redisClient || redisMod;
    (async () => {
      try {
        const email = 'loadtest.' + Date.now() + '@giantsflow.local';
        let userId;
        await rlsStorage.run({ userId: null, userRole: 'SYSTEM' }, async () => {
          const res = await pool.query(
            "INSERT INTO usuarios (nome, email, papel, senha, ativo) VALUES ('Load Tester', $1, 'ADMIN', 'hash_load', true) RETURNING id",
            [email]
          );
          userId = res.rows[0].id;
        });
        const { token, payload } = assinarJWT({ userId, userRole: 'ADMIN' });
        await registrarSessaoAtiva(payload);
        process.stdout.write(JSON.stringify({ userId, token }) + '\\n');
      } finally {
        if (redis && redis.status !== 'end') { try { await redis.quit(); } catch {} }
        await pool.end();
        process.exit(0);
      }
    })();
  `.replace(/\r?\n/g, ' ');

  const sessionRaw = execSync(`docker compose exec -T app_sistema node -e "${setupScript.replace(/"/g, '\\"')}"`, {
    encoding: 'utf8',
    timeout: 15000
  }).trim();
  const jsonLine = sessionRaw.split(/\r?\n/).find((l) => l.trim().startsWith('{'));
  if (!jsonLine) {
    throw new Error(`Saída inesperada ao gerar token de carga: ${sessionRaw}`);
  }
  const { userId, token } = JSON.parse(jsonLine);

  try {
    // 2. Dispara ondas concorrentes contra /api/health, /api/fichas e /api/auditoria via Nginx
    const endpoints = ['/api/health', '/api/fichas', '/api/auditoria?limit=20'];
    const latencies = [];
    const statusCounts = {};
    let networkErrors = 0;

    const inicioTotal = performance.now();

    for (let wave = 1; wave <= WAVES; wave++) {
      const tasks = Array.from({ length: CONCURRENT_OPERATORS }, async (_, idx) => {
        const endpoint = endpoints[(idx + wave) % endpoints.length];
        const t0 = performance.now();
        try {
          const res = await fetch(`${BASE_URL}${endpoint}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(10000)
          });
          await res.text();
          const dt = performance.now() - t0;
          latencies.push(dt);
          statusCounts[res.status] = (statusCounts[res.status] || 0) + 1;
        } catch {
          networkErrors++;
        }
      });
      await Promise.all(tasks);
    }

    const duracaoTotalMs = performance.now() - inicioTotal;
    latencies.sort((a, b) => a - b);
    const totalReq = CONCURRENT_OPERATORS * WAVES;
    const rps = ((totalReq / duracaoTotalMs) * 1000).toFixed(1);

    console.log('\n[1/2] Resultados HTTP via Nginx (40 operadores simultâneos):');
    console.log(` -> Requisições totais : ${totalReq} em ${(duracaoTotalMs / 1000).toFixed(2)}s (${rps} req/s)`);
    console.log(` -> Status HTTP        : ${JSON.stringify(statusCounts)} | Erros de rede: ${networkErrors}`);
    console.log(
      ` -> Latência           : p50=${percentile(latencies, 50).toFixed(1)}ms | p95=${percentile(latencies, 95).toFixed(1)}ms | max=${percentile(latencies, 100).toFixed(1)}ms`
    );

    if (networkErrors > 0 || (statusCounts[200] || 0) !== totalReq) {
      throw new Error(`Falha sob carga: esperado ${totalReq} respostas HTTP 200, obtido ${JSON.stringify(statusCounts)}`);
    }

    // 3. Simula 25 operadores tentando reservar exatamente o mesmo assento do Lunch no mesmo milissegundo
    const raceScript = `
      const { pool, rlsStorage } = require('./src/infrastructure/database/connection');
      (async () => {
        try {
          const turmaTeste = 999999;
          await rlsStorage.run({ userId: 1, userRole: 'ADMIN' }, async () => {
            await pool.query('DELETE FROM fichas WHERE turma_id = $1', [turmaTeste]);
            const attempts = Array.from({ length: 25 }, (_, i) =>
              pool.query(
                "INSERT INTO fichas (nome_participante, telefone, empresa, turma_id, mesa_alocada, assento_alocado, almoco_pago) VALUES ($1, '11900000000', 'Stress Lunch', $2, 10, 1, true) RETURNING id",
                ['Concorrente ' + i, turmaTeste]
              ).then(() => 'OK').catch((e) => e.code || 'ERR')
            );
            const results = await Promise.all(attempts);
            const okCount = results.filter((r) => r === 'OK').length;
            const conflictCount = results.filter((r) => r === '23505').length;
            await pool.query('DELETE FROM fichas WHERE turma_id = $1', [turmaTeste]);
            process.stdout.write(JSON.stringify({ okCount, conflictCount, total: results.length }) + '\\n');
          });
        } finally {
          await pool.end();
          process.exit(0);
        }
      })();
    `.replace(/\r?\n/g, ' ');

    const raceRaw = execSync(`docker compose exec -T app_sistema node -e "${raceScript.replace(/"/g, '\\"')}"`, {
      encoding: 'utf8',
      timeout: 15000
    }).trim();
    const raceLine = raceRaw.split(/\r?\n/).find((l) => l.trim().startsWith('{'));
    const race = JSON.parse(raceLine);

    console.log('\n[2/2] Disputa Simultânea de Assento no Lunch (25 requisições concorrentes):');
    console.log(` -> Alocações confirmadas: ${race.okCount} | Bloqueios atômicos (23505): ${race.conflictCount}/${race.total}`);

    if (race.okCount !== 1 || race.conflictCount !== 24) {
      throw new Error(`Violação de concorrência detectada: ${JSON.stringify(race)}`);
    }

    console.log('\n==========================================================');
    console.log('   SISTEMA APROVADO SOB CARGA REAL & CONCORRÊNCIA EXTREMA  ');
    console.log('==========================================================');
  } finally {
    // Limpa o usuário temporário de teste
    const cleanupScript = `
      const { pool, rlsStorage } = require('./src/infrastructure/database/connection');
      (async () => {
        try {
          await rlsStorage.run({ userId: null, userRole: 'SYSTEM' }, async () => {
            await pool.query('DELETE FROM usuarios WHERE id = $1', [${userId}]);
          });
        } finally {
          await pool.end();
          process.exit(0);
        }
      })();
    `.replace(/\r?\n/g, ' ');

    execSync(`docker compose exec -T app_sistema node -e "${cleanupScript.replace(/"/g, '\\"')}"`, {
      stdio: 'ignore',
      timeout: 15000
    });
  }
}

main().catch((err) => {
  console.error('\n🔴 Falha no teste de carga:', err.message);
  process.exit(1);
});