const crypto = require('crypto');

function gerarHashSha256(conteudo) {
  const texto = Buffer.isBuffer(conteudo)
    ? conteudo
    : typeof conteudo === 'string'
    ? conteudo
    : JSON.stringify(conteudo || {});
  return crypto.createHash('sha256').update(texto).digest('hex');
}

function extrairIdempotencyKey(req) {
  const headerKey =
    req.headers?.['idempotency-key'] ||
    req.headers?.['x-idempotency-key'] ||
    req.body?.idempotencyKey ||
    req.body?.idempotency_key ||
    '';
  const limpa = String(headerKey).trim();
  return limpa ? limpa.slice(0, 180) : null;
}

async function garantirTabelasIdempotencia(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      id SERIAL PRIMARY KEY,
      idempotency_key VARCHAR(180) NOT NULL,
      escopo VARCHAR(80) NOT NULL,
      request_hash VARCHAR(64) NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'PROCESSING',
      response_status INT,
      response_body JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_idempotency_scope_key UNIQUE (escopo, idempotency_key)
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS webhook_events (
      id SERIAL PRIMARY KEY,
      provider VARCHAR(50) NOT NULL DEFAULT 'gateway',
      event_id VARCHAR(180) NOT NULL,
      event_type VARCHAR(100) NOT NULL,
      payload_hash VARCHAR(64) NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'PROCESSING',
      proposta_id INT NULL,
      ficha_id INT NULL,
      raw_payload JSONB,
      resultado JSONB,
      processed_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_webhook_provider_event UNIQUE (provider, event_id)
    );
  `);
}

/**
 * Adquire lock transacional de idempotência para uma chave e escopo.
 * Retorna:
 *  - { replay: true, statusCode, body } se a requisição já foi concluída anteriormente
 *  - { conflict: true, reason } se a mesma chave foi enviada com payload diferente ou está em andamento
 *  - { replay: false, keyId } se o fluxo atual adquiriu o direito exclusivo de execução
 */
async function adquirirChaveIdempotencia(client, { escopo, key, payload }) {
  if (!key) {
    return { replay: false, keyId: null };
  }

  await garantirTabelasIdempotencia(client);
  const requestHash = gerarHashSha256(payload);

  const inserted = await client.query(
    `INSERT INTO idempotency_keys (idempotency_key, escopo, request_hash, status)
     VALUES ($1, $2, $3, 'PROCESSING')
     ON CONFLICT (escopo, idempotency_key) DO NOTHING
     RETURNING id`,
    [key, escopo, requestHash]
  );

  if (inserted.rows.length > 0) {
    return { replay: false, keyId: inserted.rows[0].id };
  }

  const { rows } = await client.query(
    `SELECT id, request_hash, status, response_status, response_body
     FROM idempotency_keys
     WHERE escopo = $1 AND idempotency_key = $2
     FOR UPDATE`,
    [escopo, key]
  );

  const existente = rows[0];
  if (!existente) {
    return { replay: false, keyId: null };
  }

  if (existente.request_hash !== requestHash) {
    return {
      conflict: true,
      statusCode: 422,
      reason: 'Idempotency-Key já utilizada com parâmetros de pagamento/proposta diferentes.'
    };
  }

  if (existente.status === 'COMPLETED' && existente.response_body) {
    return {
      replay: true,
      statusCode: existente.response_status || 200,
      body: existente.response_body
    };
  }

  return {
    conflict: true,
    statusCode: 409,
    reason: 'Requisição com esta Idempotency-Key já está sendo processada.'
  };
}

async function concluirChaveIdempotencia(client, keyId, statusCode, body) {
  if (!keyId) return;
  await client.query(
    `UPDATE idempotency_keys
     SET status = 'COMPLETED',
         response_status = $1,
         response_body = $2::jsonb,
         updated_at = NOW()
     WHERE id = $3`,
    [statusCode, JSON.stringify(body || {}), keyId]
  );
}

/**
 * Valida assinatura HMAC-SHA256 usando o corpo bruto (req.rawBody).
 * Suporta:
 *  - Stripe: header `stripe-signature` (t=...,v1=...)
 *  - Mercado Pago: header `x-signature` (ts=...,v1=...)
 *  - Genérico HMAC SHA-256: header `x-webhook-signature` (sha256=... ou hex puro)
 */
function verificarAssinaturaWebhook(req) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET || process.env.MP_WEBHOOK_SECRET || '';
  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}), 'utf8');

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return { valido: false, motivo: 'Segredo de webhook não configurado em produção (PAYMENT_WEBHOOK_SECRET).' };
    }
    return { valido: true, provider: 'dev-unsigned' };
  }

  // 1. Padrão Stripe: stripe-signature: t=1700000000,v1=abcdef...
  const stripeSig = req.headers?.['stripe-signature'];
  if (stripeSig) {
    const partes = Object.fromEntries(
      String(stripeSig)
        .split(',')
        .map((p) => p.trim().split('='))
        .filter((kv) => kv.length === 2)
    );
    if (!partes.t || !partes.v1) {
      return { valido: false, motivo: 'Cabeçalho stripe-signature malformado.' };
    }
    const signedPayload = `${partes.t}.${rawBody.toString('utf8')}`;
    const esperado = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
    const a = Buffer.from(partes.v1, 'hex');
    const b = Buffer.from(esperado, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { valido: false, motivo: 'Assinatura stripe-signature inválida.' };
    }
    return { valido: true, provider: 'stripe' };
  }

  // 2. Padrão Mercado Pago: x-signature: ts=...,v1=...
  const mpSig = req.headers?.['x-signature'];
  if (mpSig && String(mpSig).includes('v1=')) {
    const partes = Object.fromEntries(
      String(mpSig)
        .split(',')
        .map((p) => p.trim().split('='))
        .filter((kv) => kv.length === 2)
    );
    const dataId = req.body?.data?.id || req.query?.['data.id'] || '';
    const requestId = req.headers?.['x-request-id'] || '';
    const manifest = `id:${dataId};request-id:${requestId};ts:${partes.ts || ''};`;
    const esperado = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
    const a = Buffer.from(String(partes.v1 || ''), 'hex');
    const b = Buffer.from(esperado, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { valido: false, motivo: 'Assinatura Mercado Pago (x-signature) inválida.' };
    }
    return { valido: true, provider: 'mercadopago' };
  }

  // 3. Padrão HMAC-SHA256 genérico: x-webhook-signature: sha256=<hex> ou <hex>
  const genericSig = req.headers?.['x-webhook-signature'] || req.headers?.['x-hub-signature-256'];
  if (!genericSig) {
    return { valido: false, motivo: 'Cabeçalho de assinatura do webhook ausente.' };
  }
  const recebidoHex = String(genericSig).replace(/^sha256=/i, '').trim();
  const esperadoHex = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(recebidoHex, 'hex');
  const b = Buffer.from(esperadoHex, 'hex');
  if (a.length === 0 || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valido: false, motivo: 'Assinatura HMAC-SHA256 do webhook inválida.' };
  }
  return { valido: true, provider: 'hmac-sha256' };
}

module.exports = {
  gerarHashSha256,
  extrairIdempotencyKey,
  garantirTabelasIdempotencia,
  adquirirChaveIdempotencia,
  concluirChaveIdempotencia,
  verificarAssinaturaWebhook
};
