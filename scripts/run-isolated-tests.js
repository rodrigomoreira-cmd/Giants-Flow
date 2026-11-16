const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const COMPOSE_FILE = path.join(ROOT, 'docker-compose.test.yml');
const PROJECT_NAME = 'sistema_eventos_test';

function runCmd(cmd, opts = {}) {
  return execSync(cmd, {
    cwd: ROOT,
    stdio: opts.stdio || 'pipe',
    encoding: 'utf8',
    ...opts
  });
}

async function main() {
  let exitCode = 1;
  try {
    console.log('🧪 [TEST:ISOLATED] Subindo Postgres e Redis efêmeros em memória (portas 55432 / 56379)...');
    runCmd(`docker compose -p ${PROJECT_NAME} -f "${COMPOSE_FILE}" up -d --wait`, { stdio: 'inherit' });

    console.log('📐 [TEST:ISOLATED] Sincronizando schema limpo para o banco evento_test...');
    let schemaSql = '';
    try {
      schemaSql = runCmd('docker compose exec -T postgres pg_dump -U admin_local -d evento_operacao --schema-only --no-owner --no-privileges');
    } catch (_) {
      schemaSql = runCmd('docker compose exec -T postgres pg_dump -U postgres -d eventfunnel --schema-only --no-owner --no-privileges');
    }

    if (schemaSql && schemaSql.trim()) {
      spawnSync(
        'docker',
        ['compose', '-p', PROJECT_NAME, '-f', COMPOSE_FILE, 'exec', '-T', 'postgres_test', 'psql', '-U', 'app_evento_user', '-d', 'evento_test'],
        { cwd: ROOT, input: schemaSql, encoding: 'utf8', stdio: ['pipe', 'ignore', 'pipe'] }
      );
    }

    // Garante usuário e role compatíveis caso o dump referencie roles específicas
    const bootstrapRoles = `
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'admin_local') THEN
          CREATE ROLE admin_local SUPERUSER LOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_evento_user') THEN
          CREATE ROLE app_evento_user SUPERUSER LOGIN;
        ELSE
          ALTER ROLE app_evento_user WITH SUPERUSER;
        END IF;
      END $$;
    `;
    spawnSync(
      'docker',
      ['compose', '-p', PROJECT_NAME, '-f', COMPOSE_FILE, 'exec', '-T', 'postgres_test', 'psql', '-U', 'app_evento_user', '-d', 'evento_test'],
      { cwd: ROOT, input: bootstrapRoles, encoding: 'utf8', stdio: ['pipe', 'ignore', 'pipe'] }
    );

    // Aplica migrations incrementais
    const migrationsDir = path.join(ROOT, 'src', 'infrastructure', 'database', 'migrations');
    if (fs.existsSync(migrationsDir)) {
      const arquivos = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
      for (const arq of arquivos) {
        const sql = fs.readFileSync(path.join(migrationsDir, arq), 'utf8');
        spawnSync(
          'docker',
          ['compose', '-p', PROJECT_NAME, '-f', COMPOSE_FILE, 'exec', '-T', 'postgres_test', 'psql', '-U', 'app_evento_user', '-d', 'evento_test'],
          { cwd: ROOT, input: sql, encoding: 'utf8', stdio: ['pipe', 'ignore', 'pipe'] }
        );
      }
    }

    console.log('🚀 [TEST:ISOLATED] Executando suíte de testes de integração contra evento_test...\n');
    const envTest = {
      ...process.env,
      NODE_ENV: 'test',
      DB_HOST: '127.0.0.1',
      DB_PORT: '55432',
      DB_USER: 'app_evento_user',
      DB_PASSWORD: 'test_isolated_password_2026',
      DB_DATABASE: 'evento_test',
      DB_NAME: 'evento_test',
      DATABASE_URL: 'postgresql://app_evento_user:test_isolated_password_2026@127.0.0.1:55432/evento_test',
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: '56379',
      REDIS_URL: 'redis://127.0.0.1:56379',
      JWT_SECRET: 'test_isolated_jwt_secret_key_minimum_32_chars_2026',
      PAYMENT_WEBHOOK_SECRET: 'test_webhook_hmac_secret_2026'
    };

    const res = spawnSync(process.execPath, ['--test', 'tests/*.test.js'], {
      cwd: ROOT,
      env: envTest,
      stdio: 'inherit'
    });
    exitCode = res.status ?? 1;
  } finally {
    console.log('\n🧹 [TEST:ISOLATED] Derrubando e limpando containers efêmeros de teste...');
    try {
      runCmd(`docker compose -p ${PROJECT_NAME} -f "${COMPOSE_FILE}" down -v`, { stdio: 'inherit' });
    } catch (e) {
      console.warn('⚠️ Aviso ao limpar containers de teste:', e.message);
    }
  }

  process.exit(exitCode);
}

main();
