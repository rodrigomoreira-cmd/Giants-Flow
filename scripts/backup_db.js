const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const backupDir = path.join(rootDir, 'backups');

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const backupFile = path.join(backupDir, `backup_evento_operacao_${timestamp}.sql`);
const dumpContainerPath = `/tmp/dump_${timestamp}.sql`;

const dbUser = 'admin_local';
const dbPass = 'senha_segura_evento';
const dbName = 'evento_operacao';

console.log('==========================================================');
console.log('   GIANTS FLOW - ROTINA DE HEALTH CHECK & BACKUP ATÔMICO  ');
console.log('==========================================================');
console.log(`Início: ${now.toLocaleString('pt-BR')}`);

try {
  // 1. HEALTH CHECK DO POSTGRESQL
  console.log(`\n[1/4] Executando Health Check do Banco (${dbName})...`);
  const sqlHealth = [
    "SELECT 'CONEXAO' AS item, 'OK' AS status, current_database() AS detalhes",
    "UNION ALL",
    "SELECT 'INDICE_CONCORRENCIA_LUNCH', CASE WHEN count(*)>0 THEN 'OK' ELSE 'ALERTA_AUSENTE' END, 'uq_fichas_turma_mesa_assento' FROM pg_indexes WHERE tablename='fichas' AND indexname='uq_fichas_turma_mesa_assento'",
    "UNION ALL",
    "SELECT 'TABELAS_DOMINIO', CASE WHEN count(*)>=6 THEN 'OK' ELSE 'INCOMPLETO' END, 'Total: ' || count(*)::text FROM pg_tables WHERE schemaname='public' AND tablename IN ('fichas','aplicacoes','propostas','usuarios','mesas','turmas')"
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

  // 3. EXTRAÇÃO DO DUMP ATÔMICO
  console.log('\n[3/4] Gerando dump estrutural e de dados (pg_dump)...');
  execSync(
    `docker compose exec -T -e PGPASSWORD=${dbPass} postgres sh -c "pg_dump -U ${dbUser} -d ${dbName} --clean --if-exists --no-owner --no-privileges > ${dumpContainerPath}"`,
    { stdio: 'inherit' }
  );

  execSync(`docker cp db_sistema:${dumpContainerPath} "${backupFile}"`, { stdio: 'inherit' });
  execSync(`docker compose exec -T postgres rm -f ${dumpContainerPath}`, { stdio: 'inherit' });

  if (fs.existsSync(backupFile) && fs.statSync(backupFile).size > 1024) {
    const sizeKb = (fs.statSync(backupFile).size / 1024).toFixed(2);
    console.log(`✔ Backup gerado com sucesso: ${path.basename(backupFile)} (${sizeKb} KB)`);
  } else {
    throw new Error('O arquivo de dump foi gerado vazio ou corrompido.');
  }

  // 4. POLÍTICA DE RETENÇÃO (MANTÉM OS 10 MAIS RECENTES)
  console.log('\n[4/4] Aplicando política de retenção...');
  const files = fs.readdirSync(backupDir)
    .filter(f => f.startsWith('backup_evento_operacao_') && f.endsWith('.sql'))
    .map(f => ({ name: f, fullPath: path.join(backupDir, f), time: fs.statSync(path.join(backupDir, f)).mtime.getTime() }))
    .sort((a, b) => b.time - a.time);

  if (files.length > 10) {
    const toDelete = files.slice(10);
    toDelete.forEach(f => {
      fs.unlinkSync(f.fullPath);
      console.log(` - Backup expirado removido: ${f.name}`);
    });
  }
  console.log(`✔ Retenção validada. Backups mantidos em disco: ${Math.min(files.length, 10)}`);

  console.log('\n==========================================================');
  console.log('          OPERAÇÃO CONCLUÍDA COM TOTAL INTEGRIDADE        ');
  console.log('==========================================================');
} catch (err) {
  console.error('\n🔴 Erro durante a rotina de backup:', err.message);
  process.exit(1);
}