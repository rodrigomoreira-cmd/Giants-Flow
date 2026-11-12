const express = require('express');
const router = express.Router();

const dbModule = require('../../database/connection');
const pool = dbModule.pool || dbModule;

// Garante a existência da tabela regras_comerciais ao carregar o módulo
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS regras_comerciais (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        chave VARCHAR(50) NOT NULL UNIQUE,
        valor_numerico NUMERIC(12,2) DEFAULT 0,
        valor_texto VARCHAR(255),
        descricao TEXT,
        ativa BOOLEAN DEFAULT true,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO regras_comerciais (nome, chave, valor_numerico, descricao, ativa)
      VALUES 
        ('Desconto Comercial Máximo AutÃ´nomo', 'desconto_maximo_autonomo', 0.00, 'Qualquer desconto superior a R$ 0 exige aprovação de alçada.', true),
        ('Piso de Entrada Mínima', 'entrada_minima_padrao', 10000.00, 'Entradas inferiores a este piso bloqueiam a ficha como Aguardando Aprovação.', true),
        ('Taxa de Almoço por Empresa', 'taxa_almoco_empresa', 1000.00, 'Valor oficial da taxa de almoço cobrado por CNPJ participante.', true),
        ('Permitir Boleto no Saldo sem Aprovação', 'permite_boleto_saldo', 0, 'Se 0, qualquer saldo via boleto bancário exige autorização prévia.', true)
      ON CONFLICT (chave) DO NOTHING;
    `);
    console.log('ðŸŸ¢ [DB] Tabela regras_comerciais pronta e populada.');
  } catch (err) {
    console.error('ðŸ”´ [DB] Erro ao sincronizar regras_comerciais:', err.message);
  }
})();

// --- TURMAS ---
router.get('/turmas', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM turmas ORDER BY id ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/turmas', async (req, res) => {
  try {
    const { codigo, nome, ativa } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO turmas (codigo, nome, ativa) VALUES ($1, $2, $3) RETURNING *',
      [codigo, nome, ativa !== false]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/turmas/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { ativa } = req.body;
    const { rows } = await pool.query(
      'UPDATE turmas SET ativa = $1 WHERE id = $2 RETURNING *',
      [ativa, id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/turmas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM turmas WHERE id = $1', [id]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- REGRAS COMERCIAIS ---
router.get('/regras', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM regras_comerciais ORDER BY id ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /regras/:id - Atualização atômica com validação de limites no servidor
router.put('/regras/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    let { valor_numerico, ativa, descricao } = req.body;

    // 1. Sanitização e validação de tipos
    if (valor_numerico !== undefined) {
      valor_numerico = Number(valor_numerico);
      if (isNaN(valor_numerico) || !isFinite(valor_numerico)) {
        return res.status(400).json({ error: 'O valor numérico fornecido é inválido.' });
      }
    }

    if (ativa !== undefined) {
      ativa = Boolean(ativa);
    }

    await client.query('BEGIN');

    // 2. Lock de linha para leitura atômica e prevenção de lost update
    const { rows: regraAtual } = await client.query(
      'SELECT id, chave, nome, valor_numerico, ativa FROM regras_comerciais WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (regraAtual.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Regra comercial não encontrada.' });
    }

    const regra = regraAtual[0];

    // 3. Validação de teto e piso conforme a natureza da regra
    if (valor_numerico !== undefined) {
      // Bloqueio de valores negativos para qualquer regra
      if (valor_numerico < 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'O valor numérico não pode ser negativo.' });
      }

      // Validação de regras percentuais (ex: descontos, comissões ou taxas)
      const isPercentual = (regra.chave && (regra.chave.toLowerCase().includes('pct') || regra.chave.toLowerCase().includes('percentual'))) ||
                           (regra.nome && regra.nome.toLowerCase().includes('percentual'));

      if (isPercentual && valor_numerico > 100) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Regras percentuais não podem exceder 100%.' });
      }

      // Teto máximo operacional para valores monetários absolutos
      if (valor_numerico > 10000000) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Valor numérico ultrapassa o limite máximo permitido pelo sistema.' });
      }
    }

    // 4. Atualização atômica
    const { rows: atualizado } = await client.query(
      `UPDATE regras_comerciais 
       SET valor_numerico = COALESCE($1, valor_numerico),
           ativa = COALESCE($2, ativa),
           descricao = COALESCE($3, descricao),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 
       RETURNING *`,
      [valor_numerico, ativa, descricao, id]
    );

    await client.query('COMMIT');
    res.json(atualizado[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[ERRO /regras/:id]:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;