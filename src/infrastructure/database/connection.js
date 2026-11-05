// src/infrastructure/database/connection.js
const { Pool } = require('pg');
require('dotenv').config();

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

module.exports = { pool };
