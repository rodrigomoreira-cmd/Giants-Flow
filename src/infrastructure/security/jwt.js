const crypto = require('crypto');
const redisModule = require('../redis/client');
const redisClient = redisModule?.redisClient || redisModule;

const DEFAULT_TTL_SECONDS = 12 * 60 * 60; // 12 horas

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length < 32) {
    if (process.env.NODE_ENV === 'test') {
      return 'test-jwt-secret-key-minimum-32-chars-ok';
    }
    throw new Error('FATAL: Variável de ambiente JWT_SECRET ausente ou menor que 32 caracteres.');
  }
  return secret.trim();
}

function base64UrlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(JSON.stringify(input), 'utf8');
  return buf.toString('base64url');
}

function base64UrlDecode(str) {
  return JSON.parse(Buffer.from(str, 'base64url').toString('utf8'));
}

function assinarJWT({ userId, userRole, ttlSeconds = DEFAULT_TTL_SECONDS }) {
  const secret = getJwtSecret();
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: Number(userId),
    role: String(userRole || 'USER').toUpperCase(),
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + ttlSeconds
  };

  const encodedHeader = base64UrlEncode(header);
  const encodedPayload = base64UrlEncode(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(signingInput)
    .digest('base64url');

  return {
    token: `${signingInput}.${signature}`,
    payload
  };
}

function verificarJWT(token) {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, providedSignature] = parts;
  const secret = getJwtSecret();

  let header;
  let payload;
  try {
    header = base64UrlDecode(encodedHeader);
    payload = base64UrlDecode(encodedPayload);
  } catch {
    return null;
  }

  if (header?.alg !== 'HS256' || header?.typ !== 'JWT') return null;

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  const sigBufA = Buffer.from(providedSignature, 'utf8');
  const sigBufB = Buffer.from(expectedSignature, 'utf8');
  if (sigBufA.length !== sigBufB.length || !crypto.timingSafeEqual(sigBufA, sigBufB)) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= now) {
    return null;
  }

  if (!payload.sub || !payload.jti) {
    return null;
  }

  return payload;
}

async function registrarSessaoAtiva(payload) {
  if (!redisClient || !payload?.jti) return;
  try {
    if (redisClient.status === 'wait') await redisClient.connect();
    const ttl = Math.max(60, payload.exp - Math.floor(Date.now() / 1000));
    await redisClient.set(`auth:session:${payload.jti}`, String(payload.sub), 'EX', ttl);
  } catch (err) {
    console.warn('⚠️ Aviso ao registrar sessão no Redis:', err.message);
  }
}

async function revogarToken(payload) {
  if (!redisClient || !payload?.jti) return;
  try {
    if (redisClient.status === 'wait') await redisClient.connect();
    const ttl = Math.max(60, (payload.exp || Math.floor(Date.now() / 1000) + 3600) - Math.floor(Date.now() / 1000));
    await redisClient.set(`auth:revoked:${payload.jti}`, '1', 'EX', ttl);
    await redisClient.del(`auth:session:${payload.jti}`);
  } catch (err) {
    console.warn('⚠️ Aviso ao revogar token no Redis:', err.message);
  }
}

async function revogarTodasSessoesUsuario(userId) {
  if (!redisClient || !userId) return;
  try {
    if (redisClient.status === 'wait') await redisClient.connect();
    const now = Math.floor(Date.now() / 1000);
    await redisClient.set(`auth:user_min_iat:${userId}`, String(now), 'EX', DEFAULT_TTL_SECONDS);
  } catch (err) {
    console.warn('⚠️ Aviso ao invalidar sessões do usuário no Redis:', err.message);
  }
}

async function verificarTokenRevogado(payload) {
  if (!redisClient || !payload?.jti) return false;
  try {
    if (redisClient.status === 'wait') await redisClient.connect();
    const [revoked, minIatRaw] = await Promise.all([
      redisClient.get(`auth:revoked:${payload.jti}`),
      redisClient.get(`auth:user_min_iat:${payload.sub}`)
    ]);

    if (revoked === '1') return true;
    if (minIatRaw && Number(payload.iat) < Number(minIatRaw)) return true;
    return false;
  } catch (err) {
    console.warn('⚠️ Falha temporária ao consultar revogação no Redis:', err.message);
    return false;
  }
}

module.exports = {
  assinarJWT,
  verificarJWT,
  registrarSessaoAtiva,
  revogarToken,
  revogarTodasSessoesUsuario,
  verificarTokenRevogado
};
