// src/infrastructure/database/connection.js
const { Pool } = require('pg');
const { AsyncLocalStorage } = require('async_hooks');
require('dotenv').config();

const rlsStorage = new AsyncLocalStorage();

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'admin_local',
  password: process.env.DB_PASSWORD || 'senha_segura_evento',
  database: process.env.DB_DATABASE || process.env.DB_NAME || 'evento_operacao',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('🔴 Erro inesperado no Pool do PostgreSQL:', err.message);
});

function wrapClient(client) {
  const store = rlsStorage.getStore();
  const originalRelease = client.release.bind(client);

  client.release = function(err) {
    if (store && store.userId) {
      client.query("SELECT set_config('app.current_user_id', '', false), set_config('app.user_role', '', false)")
        .catch(() => {})
        .finally(() => originalRelease(err));
    } else {
      originalRelease(err);
    }
  };

  return client;
}

const originalConnect = pool.connect.bind(pool);

pool.connect = function(callback) {
  const store = rlsStorage.getStore();

  // 1. Suporte a Callback (usado internamente pelo pool.query no pg)
  if (typeof callback === 'function') {
    return originalConnect((err, client, release) => {
      if (err) return callback(err);

      wrapClient(client);

      if (store && store.userId) {
        client.query(
          "SELECT set_config('app.current_user_id', $1, false), set_config('app.user_role', $2, false)",
          [String(store.userId), String(store.userRole || 'USER')],
          (rlsErr) => {
            if (rlsErr) console.warn('⚠️ Falha ao setar contexto RLS na conexão:', rlsErr.message);
            callback(null, client, client.release);
          }
        );
      } else {
        callback(null, client, client.release);
      }
    });
  }

  // 2. Suporte a Promise (usado diretamente com: const client = await pool.connect())
  return originalConnect().then(async (client) => {
    wrapClient(client);

    if (store && store.userId) {
      try {
        await client.query(
          "SELECT set_config('app.current_user_id', $1, false), set_config('app.user_role', $2, false)",
          [String(store.userId), String(store.userRole || 'USER')]
        );
      } catch (err) {
        console.warn('⚠️ Falha ao setar contexto RLS na conexão:', err.message);
      }
    }

    return client;
  });
};

module.exports = { pool, rlsStorage };