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

function execPsql(sql) {
  return spawnSync(
    'docker',
    ['compose', '-p', PROJECT_NAME, '-f', COMPOSE_FILE, 'exec', '-T', 'postgres_test', 'psql', '-U', 'postgres', '-d', 'evento_test'],
    { cwd: ROOT, input: sql, encoding: 'utf8', stdio: ['pipe', 'ignore', 'pipe'] }
  );
}

async function main() {
  let exitCode = 1;
  try {
    console.log('🧪 [TEST:ISOLATED] Subindo Postgres e Redis efêmeros em memória (portas 55432 / 56379)...');
    runCmd(`docker compose -p ${PROJECT_NAME} -f "${COMPOSE_FILE}" up -d --wait`, { stdio: 'inherit' });

    console.log('📐 [TEST:ISOLATED] Sincronizando schema limpo e permissões RLS para evento_test...');
    let schemaSql = '';
    try {
      schemaSql = runCmd('docker compose exec -T postgres pg_dump -U admin_local -d evento_operacao --schema-only --no-owner --no-privileges');
    } catch (_) {
      schemaSql = runCmd('docker compose exec -T postgres pg_dump -U postgres -d eventfunnel --schema-only --no-owner --no-privileges');
    }

    // Cria roles antes do schema: app_evento_user SEM superuser para que o PostgreSQL aplique RLS de verdade
    execPsql(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'admin_local') THEN
          CREATE ROLE admin_local SUPERUSER LOGIN PASSWORD 'test_isolated_password_2026';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_evento_user') THEN
          CREATE ROLE app_evento_user NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS LOGIN PASSWORD 'test_isolated_password_2026';
        ELSE
          ALTER ROLE app_evento_user WITH NOSUPERUSER NOBYPASSRLS;
        END IF;
      END $$;
      GRANT ALL PRIVILEGES ON DATABASE evento_test TO app_evento_user;
    `);

    if (schemaSql && schemaSql.trim()) {
      execPsql(schemaSql);
    }

    // Aplica migrations incrementais
    const migrationsDir = path.join(ROOT, 'src', 'infrastructure', 'database', 'migrations');
    if (fs.existsSync(migrationsDir)) {
      const arquivos = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
      for (const arq of arquivos) {
        const sql = fs.readFileSync(path.join(migrationsDir, arq), 'utf8');
        execPsql(sql);
      }
    }

    // Concede privilégios DML e sequences para app_evento_user (sujeito às políticas RLS) e semeia turma/produtos base
    execPsql(`
      GRANT USAGE, CREATE ON SCHEMA public TO app_evento_user;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_evento_user;
      GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO app_evento_user;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_evento_user;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO app_evento_user;

      INSERT INTO turmas (id, codigo, nome, ativa, status_evento)
      VALUES (1491, 'TURMA-TESTE', 'Turma Isolada de Testes', true, 'AO_VIVO')
      ON CONFLICT (id) DO NOTHING;

      SELECT setval(pg_get_serial_sequence('turmas', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM turmas), 1), 1491));

      DO $
      DECLARE
        col_valor text;
        has_ativo boolean;
      BEGIN
        SELECT column_name INTO col_valor
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'produtos'
          AND column_name IN ('valor_tabela', 'preco_tabela', 'valor_padrao', 'valor', 'preco')
        LIMIT 1;

        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'produtos' AND column_name = 'ativo'
        ) INTO has_ativo;

        IF col_valor IS NOT NULL AND has_ativo THEN
          EXECUTE format(
            'INSERT INTO produtos (id, nome, %I, ativo) VALUES (1, ''PAC'', 49000.00, true), (2, ''AE'', 99000.00, true), (3, ''GIANTS Individual'', 279000.00, true) ON CONFLICT (id) DO NOTHING',
            col_valor
          );
        ELSIF col_valor IS NOT NULL THEN
          EXECUTE format(
            'INSERT INTO produtos (id, nome, %I) VALUES (1, ''PAC'', 49000.00), (2, ''AE'', 99000.00), (3, ''GIANTS Individual'', 279000.00) ON CONFLICT (id) DO NOTHING',
            col_valor
          );
        ELSE
          INSERT INTO produtos (id, nome)
          VALUES (1, 'PAC'), (2, 'AE'), (3, 'GIANTS Individual')
          ON CONFLICT (id) DO NOTHING;
        END IF;

        PERFORM setval(pg_get_serial_sequence('produtos', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM produtos), 1), 3));
      END $;

      INSERT INTO usuarios (id, nome, email, senha, papel, pin, ativo)
      VALUES (1, 'Admin Teste Isolado', 'admin.teste@sistema.local', '$2b$10$abcdefghijklmnopqrstuv', 'admin', '1234', true)
      ON CONFLICT (id) DO NOTHING;

      SELECT setval(pg_get_serial_sequence('usuarios', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM usuarios), 1), 1));
    `);

    console.log('🚀 [TEST:ISOLATED] Executando suíte completa contra evento_test (com RLS ativo)...\n');
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
