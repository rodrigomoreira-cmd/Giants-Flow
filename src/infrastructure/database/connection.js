// src/infrastructure/database/connection.js
const { Pool } = require('pg');
const { AsyncLocalStorage } = require('async_hooks');
require('dotenv').config();

const rlsStorage = new AsyncLocalStorage();

const pool = new Pool({
  host: process.env.DB_HOST || 'app_postgres',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'admin_local',
  password: process.env.DB_PASSWORD || 'senha_segura_evento',
  database: process.env.DB_DATABASE || process.env.DB_NAME || 'evento_operacao',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('🔴 Erro inesperado no Pool do PostgreSQL:', err.message);
});

// Intercepta checkout de conexões para aplicar o contexto RLS da requisição
const originalConnect = pool.connect.bind(pool);
pool.connect = async function() {
  const client = await originalConnect();
  const store = rlsStorage.getStore();

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
};

module.exports = { pool, rlsStorage };
