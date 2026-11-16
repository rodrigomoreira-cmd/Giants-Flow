// src/infrastructure/database/connection.js
const { Pool } = require('pg');
const { AsyncLocalStorage } = require('async_hooks');
require('dotenv').config();

// Trava de integridade: bloqueia inicialização se a senha não vier do ambiente
if (!process.env.DB_PASSWORD) {
  console.error('❌ [FATAL] DB_PASSWORD não definida nas variáveis de ambiente. Inicialização abortada.');
  process.exit(1);
}

const rlsStorage = new AsyncLocalStorage();

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'app_evento_user',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE || process.env.DB_NAME || 'evento_operacao',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('🔴 Erro inesperado no Pool do PostgreSQL:', err.message);
});

function resolverContextoRLS(store) {
  if (!store) {
    return { userId: '', userRole: 'SYSTEM' };
  }
  if (store.userId) {
    return {
      userId: String(store.userId),
      userRole: String(store.userRole || 'USER').toUpperCase(),
    };
  }
  return {
    userId: '',
    userRole: String(store.userRole || 'ANON').toUpperCase(),
  };
}

function wrapClient(client) {
  const originalRelease = client.release.bind(client);

  client.release = function(err) {
    client.query("SELECT set_config('app.current_user_id', '', false), set_config('app.user_role', '', false)")
      .catch(() => {})
      .finally(() => originalRelease(err));
  };

  return client;
}

const originalConnect = pool.connect.bind(pool);

pool.connect = function(callback) {
  const ctx = resolverContextoRLS(rlsStorage.getStore());

  // 1. Suporte a Callback (usado internamente pelo pool.query no pg)
  if (typeof callback === 'function') {
    return originalConnect((err, client, release) => {
      if (err) return callback(err);

      wrapClient(client);

      client.query(
        "SELECT set_config('app.current_user_id', $1, false), set_config('app.user_role', $2, false)",
        [ctx.userId, ctx.userRole],
        (rlsErr) => {
          if (rlsErr) console.warn('⚠️ Falha ao setar contexto RLS na conexão:', rlsErr.message);
          callback(null, client, client.release);
        }
      );
    });
  }

  // 2. Suporte a Promise (usado diretamente com: const client = await pool.connect())
  return originalConnect().then(async (client) => {
    wrapClient(client);

    try {
      await client.query(
        "SELECT set_config('app.current_user_id', $1, false), set_config('app.user_role', $2, false)",
        [ctx.userId, ctx.userRole]
      );
    } catch (err) {
      console.warn('⚠️ Falha ao setar contexto RLS na conexão:', err.message);
    }

    return client;
  });
};

module.exports = { pool, rlsStorage };

// Garante coluna atendimento_sem_almoco em ambientes existentes e testes isolados
pool.query('ALTER TABLE fichas ADD COLUMN IF NOT EXISTS atendimento_sem_almoco BOOLEAN DEFAULT false').catch(() => {});
