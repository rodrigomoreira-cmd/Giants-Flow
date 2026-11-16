const SEGREDOS_FRACOS = new Set([
  '',
  '123456',
  'password',
  'password123',
  'secret',
  'jwt_secret',
  'changeme',
  'admin',
  '***'
]);

const CHAVES_ESTRITAMENTE_SECRETAS = [
  'JWT_SECRET',
  'DB_PASSWORD',
  'POSTGRES_PASSWORD',
  'PAYMENT_WEBHOOK_SECRET',
  'STRIPE_WEBHOOK_SECRET',
  'MP_WEBHOOK_SECRET',
  'DATABASE_URL',
  'REDIS_URL'
];

function validarAmbienteSeguro(env = process.env) {
  const isProd = String(env.NODE_ENV || '').toLowerCase() === 'production';
  const avisos = [];
  const errosFatais = [];

  // 1. Impede que qualquer chave secreta seja exposta com prefixo de frontend
  for (const chaveEnv of Object.keys(env)) {
    const upper = chaveEnv.toUpperCase();
    if (
      upper.startsWith('VITE_') ||
      upper.startsWith('NEXT_PUBLIC_') ||
      upper.startsWith('EXPO_PUBLIC_')
    ) {
      const semPrefixo = upper.replace(/^(VITE_|NEXT_PUBLIC_|EXPO_PUBLIC_)/, '');
      if (CHAVES_ESTRITAMENTE_SECRETAS.includes(semPrefixo) || /SECRET|PASSWORD|PRIVATE_KEY|TOKEN/.test(semPrefixo)) {
        errosFatais.push(
          `VAZAMENTO DE SEGREDO DETECTADO: A variável "${chaveEnv}" possui prefixo público de frontend!`
        );
      }
    }
  }

  // 2. Verifica presença e força de JWT_SECRET e DB_PASSWORD
  const jwtSecret = String(env.JWT_SECRET || '').trim();
  if (!jwtSecret) {
    if (isProd) errosFatais.push('JWT_SECRET obrigatório ausente em ambiente de produção.');
    else avisos.push('JWT_SECRET não definido no ambiente local.');
  } else if (isProd && (jwtSecret.length < 16 || SEGREDOS_FRACOS.has(jwtSecret.toLowerCase()))) {
    errosFatais.push('JWT_SECRET fraco ou padrão detectado em produção (mínimo recomendado: 32 caracteres).');
  }

  const dbPass = String(env.DB_PASSWORD || '').trim();
  if (!dbPass && isProd) {
    errosFatais.push('DB_PASSWORD obrigatório ausente em ambiente de produção.');
  } else if (isProd && SEGREDOS_FRACOS.has(dbPass.toLowerCase())) {
    avisos.push('DB_PASSWORD está utilizando uma senha simples/padrão; recomenda-se rotacionar no .env.');
  }

  if (!String(env.PAYMENT_WEBHOOK_SECRET || env.STRIPE_WEBHOOK_SECRET || env.MP_WEBHOOK_SECRET || '').trim()) {
    avisos.push('PAYMENT_WEBHOOK_SECRET não definido: configure antes de ativar webhooks externos em produção.');
  }

  if (errosFatais.length > 0) {
    throw new Error(`[ENV GUARD] Falha crítica de segurança na configuração de ambiente:\n - ${errosFatais.join('\n - ')}`);
  }

  for (const aviso of avisos) {
    console.warn(`⚠️ [ENV GUARD] ${aviso}`);
  }

  return { ok: true, avisos };
}

module.exports = {
  validarAmbienteSeguro,
  CHAVES_ESTRITAMENTE_SECRETAS
};
