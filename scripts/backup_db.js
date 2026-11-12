const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const rootDir = path.resolve(__dirname, '..');
const backupDir = path.join(rootDir, 'backups');

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const rawSqlTemp = path.join(backupDir, `backup_evento_operacao_${timestamp}.sql`);
const backupFileGz = `${rawSqlTemp}.gz`;
const dumpContainerPath = `/tmp/dump_${timestamp}.sql`;

// Usa role administrativa (bypass RLS) configurada no .env
const dbUser = process.env.ADMIN_DB_USER || 'admin_local';
const dbPass = process.env.ADMIN_DB_PASSWORD || 'senha_segura_evento';
const dbName = process.env.DB_DATABASE || 'evento_operacao';

console.log('==========================================================');
console.log('   GIANTS FLOW - HEALTH CHECK & BACKUP COMPACTADO (.GZ)   ');
console.log('==========================================================');
console.log(`Início: ${now.toLocaleString('pt-BR')} | Base: ${dbName} | Role: ${dbUser}`);

try {
  // 1. HEALTH CHECK DE SEGURANÇA E CONCORRÊNCIA DO POSTGRESQL
  console.log(`\n[1/4] Validando integridade estrutural e políticas RLS (${dbName})...`);
  const sqlHealth = [
    "SELECT 'CONEXAO' AS item, 'OK' AS status, current_database() AS detalhes",
    "UNION ALL",
    "SELECT 'INDICE_CONCORRENCIA_LUNCH', CASE WHEN count(*)>0 THEN 'OK' ELSE 'ALERTA_AUSENTE' END, 'uq_fichas_turma_mesa_assento' FROM pg_indexes WHERE tablename='fichas' AND indexname='uq_fichas_turma_mesa_assento'",
    "UNION ALL",
    "SELECT 'RLS_FORCADO_TABELAS', CASE WHEN count(*)>=6 THEN 'OK' ELSE 'ALERTA_RLS' END, 'Tabelas blindadas: ' || count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relrowsecurity AND c.relforcerowsecurity"
  ].join(' ');

  const resHealth = execSync(
    `docker compose exec -T -e PGPASSWORD=${dbPass} postgres psql -U ${dbUser} -d ${dbName} -c "${sqlHealth}"`,
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] }
  );
  console.log(resHealth.trim());

  // 2. VOLUMETRIA DAS TABELAS CRÍTICAS
  console.log('\n[2/4] Verificando volumetria das tabelas principais...');
  const sqlVol = "SELECT schemaname || '.' || relname AS tabela, n_live_tup AS registros_ativos FROM pg_stat_user_tables WHERE relname IN ('fichas','aplicacoes','propostas','usuarios','mesas','turmas','produtos') ORDER BY relname;";
  const resVol = execSync(
    `docker compose exec -T -e PGPASSWORD=${dbPass} postgres psql -U ${dbUser} -d ${dbName} -c "${sqlVol}"`,
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] }
  );
  console.log(resVol.trim());

  // 3. EXTRAÇÃO DO DUMP ATÔMICO E COMPRESSÃO GZIP
  console.log('\n[3/4] Gerando dump completo (pg_dump) e compactando em .sql.gz...');
  execSync(
    `docker compose exec -T -e PGPASSWORD=${dbPass} postgres sh -c "pg_dump -U ${dbUser} -d ${dbName} --clean --if-exists --no-owner --no-privileges > ${dumpContainerPath}"`,
    { stdio: 'inherit' }
  );

  execSync(`docker cp db_sistema:${dumpContainerPath} "${rawSqlTemp}"`, { stdio: 'inherit' });
  execSync(`docker compose exec -T postgres rm -f ${dumpContainerPath}`, { stdio: 'inherit' });

  const sqlBuffer = fs.readFileSync(rawSqlTemp);
  const gzBuffer = zlib.gzipSync(sqlBuffer, { level: 9 });
  fs.writeFileSync(backupFileGz, gzBuffer);
  fs.unlinkSync(rawSqlTemp);

  if (fs.existsSync(backupFileGz) && fs.statSync(backupFileGz).size > 512) {
    const rawKb = (sqlBuffer.length / 1024).toFixed(1);
    const gzKb = (gzBuffer.length / 1024).toFixed(1);
    console.log(`✔ Backup compactado com sucesso: ${path.basename(backupFileGz)} (${gzKb} KB | original: ${rawKb} KB)`);
  } else {
    throw new Error('O arquivo de backup compactado foi gerado vazio ou corrompido.');
  }

  // 4. POLÍTICA DE RETENÇÃO (MANTÉM OS 15 MAIS RECENTES)
  console.log('\n[4/4] Aplicando política de retenção...');
  const files = fs.readdirSync(backupDir)
    .filter(f => f.startsWith('backup_evento_operacao_') && (f.endsWith('.sql.gz') || f.endsWith('.sql')))
    .map(f => ({ name: f, fullPath: path.join(backupDir, f), time: fs.statSync(path.join(backupDir, f)).mtime.getTime() }))
    .sort((a, b) => b.time - a.time);

  if (files.length > 15) {
    const toDelete = files.slice(15);
    toDelete.forEach(f => {
      fs.unlinkSync(f.fullPath);
      console.log(` - Backup expirado removido: ${f.name}`);
    });
  }
  console.log(`✔ Retenção validada. Backups mantidos em disco: ${Math.min(files.length, 15)}`);

  console.log('\n==========================================================');
  console.log('          OPERAÇÃO CONCLUÍDA COM TOTAL INTEGRIDADE        ');
  console.log('==========================================================');
} catch (err) {
  console.error('\n🔴 Erro durante a rotina de backup:', err.message);
  process.exit(1);
}
