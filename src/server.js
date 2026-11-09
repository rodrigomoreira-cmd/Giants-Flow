// src/server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { pool, rlsStorage } = require('./infrastructure/database/connection');
const redisModule = require('./infrastructure/redis/client');
const redisClient = redisModule?.redisClient || redisModule;

const routesModule = require('./infrastructure/http/routes');
const apiRoutes =
  typeof routesModule === 'function' ? routesModule : routesModule.routes || routesModule.default;

const app = express();
const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = path.join(__dirname, '../public');

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

app.get('/favicon.ico', (_req, res) => res.status(204).end());

// Servir frontend estático
app.use(express.static(PUBLIC_DIR, { index: false }));

function renderHtml(res, filename) {
  const filePath = path.join(PUBLIC_DIR, filename);
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }
  return res.status(404).send(`
    <div style="font-family: sans-serif; padding: 2rem; text-align: center;">
      <h3>Arquivo não encontrado: ${filename}</h3>
      <p>Verifique se o arquivo existe na pasta public/.</p>
      <a href="/hub">Voltar ao Hub</a>
    </div>
  `);
}

// Rotas de Páginas
app.get('/', (_req, res) => res.redirect('/login'));

app.get(['/login', '/login.html'], (_req, res) => renderHtml(res, 'login.html'));
app.get(['/hub', '/hub.html'], (_req, res) => renderHtml(res, 'hub.html'));
app.get(['/usuarios', '/usuarios.html'], (_req, res) => renderHtml(res, 'usuarios.html'));
app.get(['/produtos', '/produtos.html'], (_req, res) => renderHtml(res, 'produtos.html'));
app.get(['/fichas', '/fichas.html'], (_req, res) => renderHtml(res, 'fichas.html'));
app.get(['/entrevistas', '/entrevistas.html'], (_req, res) => renderHtml(res, 'entrevistas.html'));
app.get(['/pitch', '/pitch.html'], (_req, res) => renderHtml(res, 'pitch.html'));
app.get(['/propostas', '/propostas.html'], (_req, res) => renderHtml(res, 'propostas.html'));
app.get(['/financeiro', '/financeiro.html'], (_req, res) => renderHtml(res, 'financeiro.html'));

// Middleware de Contexto RLS (Sessão de Usuário no PostgreSQL)
app.use('/api', async (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  let userId = null;
  let userRole = null;

  if (token) {
    const match = token.match(/token-(?:auth|admin)-(\d+)/);
    if (match) {
      const parsedId = parseInt(match[1], 10);
      try {
        const { rows } = await pool.query(
          'SELECT id, papel, ativo FROM usuarios WHERE id = $1 LIMIT 1',
          [parsedId]
        );
        if (rows.length > 0 && rows[0].ativo) {
          userId = rows[0].id;
          userRole = (rows[0].papel || 'USER').toUpperCase();
          req.usuario = rows[0];
        }
      } catch (e) {
        console.warn('⚠️ Erro ao verificar token RLS:', e.message);
      }
    }
  }

  rlsStorage.run({ userId, userRole }, () => {
    next();
  });
});

// Ponto Único de Entrada para a API (/api/...)
if (typeof apiRoutes === 'function') {
  app.use('/api', apiRoutes);
} else {
  console.warn('⚠️ Roteador /api não exportou uma função de middleware válida.');
}

// Healthcheck
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'healthy', uptime: process.uptime() });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', error: error.message });
  }
});

// Fallback 404
app.use((req, res) => {
  if (req.accepts('html')) {
    return res.status(404).send(`
      <div style="font-family: sans-serif; padding: 2rem; text-align: center; color: #333;">
        <h2>404 - Rota Não Encontrada</h2>
        <p>A página <code>${req.originalUrl}</code> não existe no servidor.</p>
        <a href="/hub" style="color: #007aff; font-weight: bold;">Voltar ao Hub</a>
      </div>
    `);
  }
  return res.status(404).json({ erro: 'Recurso não encontrado.' });
});

async function iniciarServidor() {
  try {
    await pool.query('SELECT NOW()');
    console.log('🟢 Conexão com PostgreSQL validada.');

    if (redisClient && typeof redisClient.connect === 'function') {
      try {
        await redisClient.connect();
      } catch (redisErr) {
        console.warn('⚠️ Operando sem cache Redis temporariamente:', redisErr.message);
      }
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('🔴 Falha crítica ao iniciar servidor:', err.message);
    process.exit(1);
  }
}

iniciarServidor();
