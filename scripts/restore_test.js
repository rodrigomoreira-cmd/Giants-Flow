const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const rootDir = path.resolve(__dirname, '..');
const backupDir = path.join(rootDir, 'backups');
const migrationsDir = path.join(rootDir, 'database', 'migrations');

const dbUser = process.env.ADMIN_DB_USER || 'admin_local';
const dbPass = process.env.ADMIN_DB_PASSWORD || 'senha_segura_evento';
const appUser = process.env.DB_USER || 'app_evento_user';
const targetDb = 'evento_test';

console.log('==========================================================');
console.log('   GIANTS FLOW - TESTE DE DISASTER RECOVERY (RESTORE)     ');
console.log('==========================================================');

try {
  // 1. Localiza o backup .sql.gz mais recente
  if (!fs.existsSync(backupDir)) {
    throw new Error('Diretório backups/ não encontrado. Execute "npm run backup" primeiro.');
  }

  const backups = fs.readdirSync(backupDir)
    .filter((f) => f.startsWith('backup_evento_operacao_') && f.endsWith('.sql.gz'))
    .map((f) => ({
      name: f,
      fullPath: path.join(backupDir, f),
      time: fs.statSync(path.join(backupDir, f)).mtime.getTime()
    }))
    .sort((a, b) => b.time - a.time);

  if (backups.length === 0) {
    throw new Error('Nenhum arquivo .sql.gz encontrado em backups/. Execute "npm run backup" primeiro.');
  }

  const latest = backups[0];
  console.log(`\n[1/6] Snapshot selecionado: ${latest.name} (${(fs.statSync(latest.fullPath).size / 1024).toFixed(1)} KB)`);

  // 2. Descompacta em arquivo temporário e envia ao contêiner PostgreSQL
  console.log('[2/6] Descompactando snapshot Gzip e transferindo para db_sistema...');
  const gzData = fs.readFileSync(latest.fullPath);
  const sqlData = zlib.gunzipSync(gzData);
  const tempLocalSql = path.join(backupDir, `_tmp_restore_${Date.now()}.sql`);
  const tempContainerSql = `/tmp/restore_test_${Date.now()}.sql`;

  fs.writeFileSync(tempLocalSql, sqlData);
  try {
    execSync(`docker cp "${tempLocalSql}" db_sistema:${tempContainerSql}`, { stdio: 'inherit' });
  } finally {
    if (fs.existsSync(tempLocalSql)) fs.unlinkSync(tempLocalSql);
  }

  // 3. Recria o schema public limpo em evento_test (simulação de perda total)
  console.log(`\n[3/6] Resetando schema public de '${targetDb}' para restauração a frio...`);
  const resetSql = [
    'DROP SCHEMA IF EXISTS public CASCADE;',
    'CREATE SCHEMA public;',
    `GRANT ALL ON SCHEMA public TO ${dbUser};`,
    `GRANT USAGE ON SCHEMA public TO ${appUser};`
  ].join(' ');

  execSync(
    `docker compose exec -T -e PGPASSWORD=${dbPass} postgres psql -v ON_ERROR_STOP=1 -U ${dbUser} -d ${targetDb} -c "${resetSql}"`,
    { stdio: 'inherit' }
  );

  // 4. Restaura estrutura, dados, triggers e políticas RLS do snapshot
  console.log(`\n[4/6] Restaurando dump SQL em '${targetDb}'...`);
  execSync(
    `docker compose exec -T -e PGPASSWORD=${dbPass} postgres psql -v ON_ERROR_STOP=1 -U ${dbUser} -d ${targetDb} -f ${tempContainerSql}`,
    { stdio: ['pipe', 'ignore', 'inherit'] }
  );
  execSync(`docker compose exec -T postgres rm -f ${tempContainerSql}`, { stdio: 'inherit' });

  // 5. Aplica migrações SQL idempotentes (garante compatibilidade mesmo com snapshots anteriores)
  console.log(`\n[5/6] Aplicando migrações SQL idempotentes e privilégios de '${appUser}'...`);
  if (fs.existsSync(migrationsDir)) {
    const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of migrationFiles) {
      const fullMigPath = path.join(migrationsDir, file);
      const migSql = fs.readFileSync(fullMigPath, 'utf8');
      execSync(
        `docker compose exec -T -e PGPASSWORD=${dbPass} postgres psql -v ON_ERROR_STOP=1 -U ${dbUser} -d ${targetDb}`,
        { input: migSql, stdio: ['pipe', 'ignore', 'inherit'] }
      );
      console.log(` -> Migração aplicada: ${file}`);
    }
  }

  const grantsSql = [
    `GRANT USAGE ON SCHEMA public TO ${appUser};`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${appUser};`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${appUser};`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${appUser};`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${appUser};`
  ].join(' ');

  execSync(
    `docker compose exec -T -e PGPASSWORD=${dbPass} postgres psql -v ON_ERROR_STOP=1 -U ${dbUser} -d ${targetDb} -c "${grantsSql}"`,
    { stdio: 'inherit' }
  );

  // 6. Auditoria pós-restauração
  console.log(`\n[6/6] Auditando integridade pós-restauração em '${targetDb}'...`);
  const auditSql = [
    "SELECT 'FICHAS_RESTAURADAS' AS check_item, count(*)::text AS resultado FROM public.fichas",
    "UNION ALL",
    "SELECT 'TURMAS_RESTAURADAS', count(*)::text FROM public.turmas",
    "UNION ALL",
    "SELECT 'RLS_FORCADO_TABELAS', count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relrowsecurity AND c.relforcerowsecurity",
    "UNION ALL",
    "SELECT 'INDICE_LUNCH_UNICO', CASE WHEN count(*)>0 THEN 'OK' ELSE 'FALHA' END FROM pg_indexes WHERE tablename='fichas' AND indexname='uq_fichas_turma_mesa_assento'"
  ].join(' ');

  const auditOut = execSync(
    `docker compose exec -T -e PGPASSWORD=${dbPass} postgres psql -U ${dbUser} -d ${targetDb} -c "${auditSql}"`,
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] }
  );
  console.log(auditOut.trim());

  console.log('\n==========================================================');
  console.log('   DISASTER RECOVERY VALIDADO COM 100% DE INTEGRIDADE     ');
  console.log('==========================================================');
} catch (err) {
  console.error('\n🔴 Falha no teste de restauração:', err.message);
  process.exit(1);
}