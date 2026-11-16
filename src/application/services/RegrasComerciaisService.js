const dbModule = require('../../infrastructure/database/connection');
const pool = dbModule.pool || dbModule;

const TIPOS_REGRA_VALIDOS = Object.freeze(['MONETARIO', 'PERCENTUAL', 'BOOLEANO', 'INTEIRO']);

const REGRAS_PADRAO = Object.freeze({
  desconto_maximo_autonomo: {
    nome: 'Desconto Comercial Máximo Autônomo',
    tipo_regra: 'MONETARIO',
    valor_numerico: 0.0,
    valor_minimo: 0.0,
    valor_maximo: 10000000.0,
    descricao: 'Qualquer desconto superior a este limite exige aprovação de alçada.',
    ativa: true
  },
  entrada_minima_padrao: {
    nome: 'Entrada Mínima (Valor de 1 Parcela)',
    tipo_regra: 'INTEIRO',
    valor_numerico: 1,
    valor_minimo: 1,
    valor_maximo: 24,
    descricao: 'A entrada mínima deve ser maior ou igual ao valor de 1 parcela da proposta. Entradas menores exigem aprovação de alçada.',
    ativa: true
  },
  taxa_almoco_empresa: {
    nome: 'Taxa de Almoço por Empresa',
    tipo_regra: 'MONETARIO',
    valor_numerico: 1000.0,
    valor_minimo: 0.0,
    valor_maximo: 100000.0,
    descricao: 'Valor oficial da taxa de almoço cobrado por CNPJ participante.',
    ativa: true
  },
  permite_boleto_saldo: {
    nome: 'Permitir Boleto no Saldo sem Aprovação',
    tipo_regra: 'BOOLEANO',
    valor_numerico: 0,
    valor_minimo: 0,
    valor_maximo: 1,
    descricao: 'Se 0, qualquer saldo via boleto bancário exige autorização prévia.',
    ativa: true
  }
});

class RegrasComerciaisService {
  async garantirEstruturaEPopular(executor = pool) {
    await executor.query(`
      CREATE TABLE IF NOT EXISTS regras_comerciais (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        chave VARCHAR(50) NOT NULL UNIQUE,
        tipo_regra VARCHAR(20) NOT NULL DEFAULT 'MONETARIO',
        valor_numerico NUMERIC(12,2) DEFAULT 0,
        valor_minimo NUMERIC(12,2) DEFAULT 0,
        valor_maximo NUMERIC(12,2) DEFAULT 10000000,
        valor_texto VARCHAR(255),
        descricao TEXT,
        ativa BOOLEAN DEFAULT true,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    for (const [chave, cfg] of Object.entries(REGRAS_PADRAO)) {
      await executor.query(
        `INSERT INTO regras_comerciais (nome, chave, tipo_regra, valor_numerico, valor_minimo, valor_maximo, descricao, ativa)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (chave) DO NOTHING`,
        [
          cfg.nome,
          chave,
          cfg.tipo_regra,
          cfg.valor_numerico,
          cfg.valor_minimo,
          cfg.valor_maximo,
          cfg.descricao,
          cfg.ativa
        ]
      );
    }
  }

  async listarTodas(executor = pool) {
    const { rows } = await executor.query('SELECT * FROM regras_comerciais ORDER BY id ASC');
    return rows;
  }

  async obterMapaRegrasAtivas(executor = pool) {
    const mapa = {};
    for (const [chave, cfg] of Object.entries(REGRAS_PADRAO)) {
      mapa[chave] = { ...cfg, chave };
    }

    try {
      const { rows } = await executor.query(
        'SELECT chave, nome, tipo_regra, valor_numerico, valor_minimo, valor_maximo, valor_texto, ativa FROM regras_comerciais'
      );
      for (const r of rows) {
        mapa[r.chave] = {
          ...mapa[r.chave],
          ...r,
          valor_numerico: Number(r.valor_numerico ?? 0),
          valor_minimo: Number(r.valor_minimo ?? 0),
          valor_maximo: Number(r.valor_maximo ?? 10000000),
          ativa: Boolean(r.ativa)
        };
      }
    } catch (_) {
      // Fallback seguro aos valores padrão caso a tabela ainda esteja em inicialização
    }

    return mapa;
  }

  validarValorPorTipo({ tipo_regra, valor_numerico, valor_minimo, valor_maximo }) {
    const num = Number(valor_numerico);
    if (isNaN(num) || !isFinite(num)) {
      throw Object.assign(new Error('O valor numérico fornecido é inválido.'), { statusCode: 400 });
    }

    const tipo = String(tipo_regra || 'MONETARIO').toUpperCase();
    if (!TIPOS_REGRA_VALIDOS.includes(tipo)) {
      throw Object.assign(new Error(`Tipo de regra inválido (${tipo}). Permitidos: ${TIPOS_REGRA_VALIDOS.join(', ')}.`), {
        statusCode: 400
      });
    }

    if (num < 0) {
      throw Object.assign(new Error('O valor numérico não pode ser negativo.'), { statusCode: 400 });
    }

    if (tipo === 'PERCENTUAL' && num > 100) {
      throw Object.assign(new Error('Regras do tipo PERCENTUAL não podem exceder 100%.'), { statusCode: 400 });
    }

    if (tipo === 'BOOLEANO' && num !== 0 && num !== 1) {
      throw Object.assign(new Error('Regras do tipo BOOLEANO aceitam exclusivamente 0 (Não) ou 1 (Sim).'), {
        statusCode: 400
      });
    }

    if (tipo === 'INTEIRO' && !Number.isInteger(num)) {
      throw Object.assign(new Error('Regras do tipo INTEIRO não aceitam casas decimais.'), { statusCode: 400 });
    }

    const min = valor_minimo !== null && valor_minimo !== undefined ? Number(valor_minimo) : 0;
    const max = valor_maximo !== null && valor_maximo !== undefined ? Number(valor_maximo) : 10000000;

    if (num < min) {
      throw Object.assign(new Error(`O valor (${num}) é inferior ao piso permitido para esta regra (${min}).`), {
        statusCode: 400
      });
    }

    if (num > max) {
      throw Object.assign(new Error(`O valor (${num}) ultrapassa o teto permitido para esta regra (${max}).`), {
        statusCode: 400
      });
    }

    return num;
  }

  async atualizarRegra(id, { valor_numerico, ativa, descricao, tipo_regra }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: atualRows } = await client.query(
        'SELECT id, chave, nome, tipo_regra, valor_numerico, valor_minimo, valor_maximo, ativa FROM regras_comerciais WHERE id = $1 FOR UPDATE',
        [id]
      );

      if (atualRows.length === 0) {
        await client.query('ROLLBACK');
        throw Object.assign(new Error('Regra comercial não encontrada.'), { statusCode: 404 });
      }

      const regraAtual = atualRows[0];
      const tipoEfetivo = tipo_regra ? String(tipo_regra).toUpperCase() : regraAtual.tipo_regra;

      let valorValidado = undefined;
      if (valor_numerico !== undefined) {
        valorValidado = this.validarValorPorTipo({
          tipo_regra: tipoEfetivo,
          valor_numerico,
          valor_minimo: regraAtual.valor_minimo,
          valor_maximo: regraAtual.valor_maximo
        });
      }

      const ativaFinal = ativa !== undefined ? Boolean(ativa) : undefined;

      const { rows: atualizado } = await client.query(
        `UPDATE regras_comerciais
         SET tipo_regra = COALESCE($1, tipo_regra),
             valor_numerico = COALESCE($2, valor_numerico),
             ativa = COALESCE($3, ativa),
             descricao = COALESCE($4, descricao),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5
         RETURNING *`,
        [tipo_regra ? tipoEfetivo : null, valorValidado, ativaFinal, descricao, id]
      );

      await client.query('COMMIT');
      return atualizado[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Avalia uma proposta comercial contra a Single Source of Truth das regras ativas.
   */
  async avaliarProposta({
    valorTotal,
    valorEntrada,
    entradaComplementar = 0,
    cashback = 0,
    permuta = 0,
    quantidadeParcelas = 1,
    valorParcela = 0,
    desconto = 0,
    formaRestante,
    metodoPagamento
  }, executor = pool) {
    const regras = await this.obterMapaRegrasAtivas(executor);
    const motivosAlcada = [];

    const vTot = Number(valorTotal || 0);
    const vEnt = Number(valorEntrada || 0);
    const vEntComp = Number(entradaComplementar || 0);
    const vCb = Number(cashback || 0);
    const vPerm = Number(permuta || 0);
    const vDesc = Number(desconto || 0);
    const qtdParc = Math.max(1, Number(quantidadeParcelas) || 1);

    const saldoDevedor = Math.max(0, vTot - vEnt - vEntComp - vCb - vPerm - vDesc);
    const parcelaEfetiva = Number(valorParcela) > 0
      ? Number(valorParcela)
      : (saldoDevedor > 0 ? Number((saldoDevedor / qtdParc).toFixed(2)) : 0);

    const regraEntrada = regras.entrada_minima_padrao;
    const fatorParcelasMin = Math.max(1, Number(regraEntrada?.valor_numerico) || 1);
    const pisoEntradaCalculado = Number((parcelaEfetiva * fatorParcelasMin).toFixed(2));

    if (regraEntrada?.ativa && vTot > 0 && parcelaEfetiva > 0 && (vEnt + 0.05) < pisoEntradaCalculado) {
      motivosAlcada.push(
        `Entrada de R$ ${vEnt.toFixed(2)} abaixo do mínimo de ${fatorParcelasMin} parcela(s) (R$ ${pisoEntradaCalculado.toFixed(2)})`
      );
    }

    const regraDesconto = regras.desconto_maximo_autonomo;
    if (regraDesconto?.ativa && vDesc > regraDesconto.valor_numerico) {
      motivosAlcada.push(
        `Desconto de R$ ${vDesc.toFixed(2)} excede o limite autônomo de R$ ${regraDesconto.valor_numerico.toFixed(2)}`
      );
    }

    const regraBoleto = regras.permite_boleto_saldo;
    const formaSaldoNorm = String(formaRestante || metodoPagamento || '').toLowerCase();
    if (regraBoleto?.ativa && regraBoleto.valor_numerico === 0 && formaSaldoNorm.includes('boleto')) {
      motivosAlcada.push('Saldo com pagamento via Boleto Bancário exige aprovação prévia');
    }

    return {
      exigeAprovacaoAlcada: motivosAlcada.length > 0,
      motivosAlcada,
      parametrosAplicados: {
        pisoEntradaMinima: pisoEntradaCalculado,
        fatorParcelasEntradaMinima: fatorParcelasMin,
        valorParcelaReferencia: parcelaEfetiva,
        descontoMaximoAutonomo: regraDesconto?.valor_numerico ?? 0,
        permiteBoletoSaldo: Boolean(regraBoleto?.valor_numerico)
      }
    };
  }
}

module.exports = new RegrasComerciaisService();
module.exports.RegrasComerciaisService = RegrasComerciaisService;
module.exports.TIPOS_REGRA_VALIDOS = TIPOS_REGRA_VALIDOS;

