const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { pool } = require('../src/infrastructure/database/connection');
const {
  adquirirChaveIdempotencia,
  concluirChaveIdempotencia,
  verificarAssinaturaWebhook
} = require('../src/infrastructure/security/idempotencia');
const regrasComerciaisService = require('../src/application/services/RegrasComerciaisService');
const { validarAmbienteSeguro } = require('../src/infrastructure/security/envGuard');

describe('Auditoria de Segurança e Integridade (Achados #2, #3, #4, #5)', () => {
  after(async () => {
    await pool.end();
  });

  test('Achado #3: Idempotency-Key bloqueia duplicidade e rejeita divergência de payload', async () => {
    const client = await pool.connect();
    const chave = `test_idem_${Date.now()}`;
    const payloadOriginal = { aplicacaoId: 999, valorTotal: 279000, valorEntrada: 10000 };

    try {
      await client.query('BEGIN');
      const primeira = await adquirirChaveIdempotencia(client, {
        escopo: 'POST:/propostas',
        key: chave,
        payload: payloadOriginal
      });
      assert.equal(primeira.replay, false);
      assert.ok(primeira.keyId);

      await concluirChaveIdempotencia(client, primeira.keyId, 201, { id: 501, valorTotal: 279000 });
      await client.query('COMMIT');

      // Reenvio idêntico deve retornar replay = true com o corpo cacheado
      await client.query('BEGIN');
      const segunda = await adquirirChaveIdempotencia(client, {
        escopo: 'POST:/propostas',
        key: chave,
        payload: payloadOriginal
      });
      assert.equal(segunda.replay, true);
      assert.equal(segunda.statusCode, 201);
      assert.equal(segunda.body.id, 501);
      await client.query('COMMIT');

      // Reenvio da mesma chave com valor adulterado deve retornar conflito 422
      await client.query('BEGIN');
      const adulterada = await adquirirChaveIdempotencia(client, {
        escopo: 'POST:/propostas',
        key: chave,
        payload: { aplicacaoId: 999, valorTotal: 1000, valorEntrada: 1000 }
      });
      assert.equal(adulterada.conflict, true);
      assert.equal(adulterada.statusCode, 422);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
  });

  test('Achado #3: Verificação HMAC-SHA256 com rawBody valida assinatura Stripe e rejeita assinatura forjada', () => {
    process.env.PAYMENT_WEBHOOK_SECRET = 'test_webhook_hmac_secret_2026';
    const rawStr = JSON.stringify({ id: 'evt_test_1', type: 'payment_intent.succeeded' });
    const rawBody = Buffer.from(rawStr, 'utf8');
    const ts = Math.floor(Date.now() / 1000);
    const sigValida = crypto
      .createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET)
      .update(`${ts}.${rawStr}`)
      .digest('hex');

    const ok = verificarAssinaturaWebhook({
      rawBody,
      body: JSON.parse(rawStr),
      headers: { 'stripe-signature': `t=${ts},v1=${sigValida}` }
    });
    assert.equal(ok.valido, true);
    assert.equal(ok.provider, 'stripe');

    const forjada = verificarAssinaturaWebhook({
      rawBody,
      body: JSON.parse(rawStr),
      headers: { 'stripe-signature': `t=${ts},v1=${'0'.repeat(64)}` }
    });
    assert.equal(forjada.valido, false);
  });

  test('Achado #4: RegrasComerciaisService aplica tipagem explícita (PERCENTUAL <= 100, BOOLEANO 0/1) sem string matching', async () => {
    await regrasComerciaisService.garantirEstruturaEPopular(pool);

    assert.throws(() => {
      regrasComerciaisService.validarValorPorTipo({
        tipo_regra: 'PERCENTUAL',
        valor_numerico: 105,
        valor_minimo: 0,
        valor_maximo: 100
      });
    }, /PERCENTUAL/);

    assert.throws(() => {
      regrasComerciaisService.validarValorPorTipo({
        tipo_regra: 'BOOLEANO',
        valor_numerico: 2,
        valor_minimo: 0,
        valor_maximo: 1
      });
    }, /BOOLEANO/);

    const avaliacao = await regrasComerciaisService.avaliarProposta(
      {
        valorTotal: 279000,
        valorEntrada: 5000,
        desconto: 0,
        formaRestante: 'Pix'
      },
      pool
    );
    assert.equal(avaliacao.exigeAprovacaoAlcada, true);
    assert.ok(avaliacao.motivosAlcada.some((m) => m.includes('abaixo do piso mínimo')));
  });

  test('Achado #5: envGuard bloqueia exposição de segredo com prefixo público VITE_', () => {
    assert.throws(() => {
      validarAmbienteSeguro({
        NODE_ENV: 'production',
        JWT_SECRET: 'chave_super_secreta_producao_2026_valida',
        DB_PASSWORD: 'senha_forte_producao_2026',
        VITE_JWT_SECRET: 'vazou_para_o_navegador'
      });
    }, /VAZAMENTO DE SEGREDO DETECTADO/);
  });
});
