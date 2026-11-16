const { exigirPapeis } = require('../middlewares/rbac');
const express = require('express');
const router = express.Router();

const dbModule = require('../../database/connection');
const pool = dbModule.pool || dbModule;
const regrasComerciaisService = require('../../../application/services/RegrasComerciaisService');

// Inicializa estrutura e regras padrão via camada de serviço única
regrasComerciaisService
  .garantirEstruturaEPopular(pool)
  .then(() => console.log('🟢 [DB] Tabela regras_comerciais pronta e sincronizada via RegrasComerciaisService.'))
  .catch((err) => console.error('🔴 [DB] Erro ao sincronizar regras_comerciais:', err.message));

// --- TURMAS (INTEGRADAS AO POSTGRESQL COM MÉTRICAS REAIS) ---
router.get('/turmas', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL app.user_role = 'SYSTEM'");

    const { rows } = await client.query(`
      WITH stats_fichas AS (
        SELECT
          f.turma_id,
          COUNT(*)::int AS total_alunos,
          COUNT(DISTINCT
            CASE
              WHEN COALESCE(f.membro_giants, false) = true OR UPPER(TRIM(COALESCE(f.origem, ''))) = 'GIANTS'
                THEN 'giants:id:' || f.id::text
              WHEN LENGTH(regexp_replace(COALESCE(f.cnpj, f.cpf_cnpj, ''), '\D', '', 'g')) = 14
                THEN 'cnpj:' || regexp_replace(COALESCE(f.cnpj, f.cpf_cnpj, ''), '\D', '', 'g')
              WHEN LOWER(TRIM(COALESCE(f.empresa, ''))) NOT IN ('', 'empresa sga', 'sem empresa', 'empresa não informada', 'empresa nao informada')
                THEN 'emp:' || LOWER(TRIM(f.empresa))
              ELSE 'id:' || f.id::text
            END
          )::int AS total_empresas,
          COUNT(*) FILTER (
            WHERE COALESCE(f.membro_giants, false) = true
               OR UPPER(TRIM(COALESCE(f.origem, ''))) = 'GIANTS'
          )::int AS giants_presentes,
          COUNT(DISTINCT
            CASE
              WHEN COALESCE(f.membro_giants, false) = false
               AND UPPER(TRIM(COALESCE(f.origem, ''))) <> 'GIANTS'
               AND (COALESCE(f.almoco_pago, false) = true OR COALESCE(f.cortesia_almoco, false) = true OR COALESCE(f.valor_almoco, 0) > 0)
              THEN
                CASE
                  WHEN LENGTH(regexp_replace(COALESCE(f.cnpj, f.cpf_cnpj, ''), '\D', '', 'g')) >= 11
                    THEN 'cnpj:' || regexp_replace(COALESCE(f.cnpj, f.cpf_cnpj, ''), '\D', '', 'g')
                  WHEN LOWER(TRIM(COALESCE(f.empresa, ''))) NOT IN ('', 'empresa sga', 'sem empresa', 'empresa não informada', 'empresa nao informada')
                    THEN 'emp:' || LOWER(TRIM(f.empresa))
                  ELSE 'id:' || f.id::text
                END
              ELSE NULL
            END
          )::int AS fichas_preenchidas,
          COUNT(DISTINCT
            CASE
              WHEN COALESCE(f.membro_giants, false) = false
               AND UPPER(TRIM(COALESCE(f.origem, ''))) <> 'GIANTS'
               AND (f.dados_proposta IS NOT NULL OR COALESCE(f.valor_negociado, 0) > 0)
              THEN
                CASE
                  WHEN LENGTH(regexp_replace(COALESCE(f.cnpj, f.cpf_cnpj, ''), '\D', '', 'g')) >= 11
                    THEN 'cnpj:' || regexp_replace(COALESCE(f.cnpj, f.cpf_cnpj, ''), '\D', '', 'g')
                  WHEN LOWER(TRIM(COALESCE(f.empresa, ''))) NOT IN ('', 'empresa sga', 'sem empresa', 'empresa não informada', 'empresa nao informada')
                    THEN 'emp:' || LOWER(TRIM(f.empresa))
                  ELSE 'id:' || f.id::text
                END
              ELSE NULL
            END
          )::int AS contratos_fechados,
          COALESCE(SUM(
            CASE
              WHEN COALESCE(f.membro_giants, false) = false
               AND UPPER(TRIM(COALESCE(f.origem, ''))) <> 'GIANTS'
               AND (f.dados_proposta IS NOT NULL OR COALESCE(f.valor_negociado, 0) > 0)
              THEN GREATEST(
                0,
                COALESCE(f.valor_negociado, 0)
                - COALESCE(f.cashback, 0)
                - COALESCE(NULLIF(f.dados_proposta->>'permuta', '')::numeric, 0)
              )
              ELSE 0
            END
          ), 0)::numeric(14,2) AS competencia_total,
          (
            COALESCE(SUM(COALESCE(f.valor_almoco, 0)), 0)
            + COALESCE(SUM(
              CASE
                WHEN COALESCE(f.membro_giants, false) = false
                 AND UPPER(TRIM(COALESCE(f.origem, ''))) <> 'GIANTS'
                 AND f.dados_proposta IS NOT NULL
                THEN COALESCE(NULLIF(f.dados_proposta->>'valorEntrada', '')::numeric, 0)
                ELSE 0
              END
            ), 0)
          )::numeric(14,2) AS caixa_total
        FROM fichas f
        GROUP BY f.turma_id
      )
      SELECT
        t.*,
        COALESCE(s.total_alunos, 0) AS total_alunos,
        COALESCE(s.total_empresas, 0) AS total_empresas,
        COALESCE(s.giants_presentes, 0) AS giants_presentes,
        COALESCE(s.fichas_preenchidas, 0) AS fichas_preenchidas,
        COALESCE(s.contratos_fechados, 0) AS contratos_fechados,
        COALESCE(s.competencia_total, 0) AS competencia_total,
        COALESCE(s.caixa_total, 0) AS caixa_total
      FROM turmas t
      LEFT JOIN stats_fichas s ON s.turma_id = t.id
      ORDER BY t.ativa DESC, t.data_inicio DESC NULLS LAST, t.id DESC
    `);

    await client.query('COMMIT');
    res.json(rows);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.post('/turmas', exigirPapeis('ADMIN'), async (req, res) => {
  try {
    const {
      codigo,
      nome,
      ativa = true,
      data_inicio = null,
      data_fim = null,
      meta_caixa = 0,
      meta_competencia = 0,
      qtd_mesas = 40,
      status_evento
    } = req.body;

    if (!nome || !String(nome).trim()) {
      return res.status(400).json({ error: 'O nome da turma/evento é obrigatório.' });
    }

    const statusFinal = status_evento || (ativa !== false ? 'AO_VIVO' : 'PREPARACAO');
    const ativaFinal = statusFinal === 'ENCERRADA' ? false : ativa !== false;

    const { rows } = await pool.query(
      `INSERT INTO turmas (
         codigo, nome, ativa, data_inicio, data_fim,
         meta_caixa, meta_competencia, qtd_mesas, status_evento
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        codigo ? String(codigo).trim() : null,
        String(nome).trim(),
        ativaFinal,
        data_inicio || null,
        data_fim || null,
        Number(meta_caixa) || 0,
        Number(meta_competencia) || 0,
        Number(qtd_mesas) || 40,
        statusFinal
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Já existe uma turma cadastrada com este nome.' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.put('/turmas/:id', exigirPapeis('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      codigo,
      nome,
      ativa,
      data_inicio,
      data_fim,
      meta_caixa,
      meta_competencia,
      qtd_mesas,
      status_evento
    } = req.body;

    if (!nome || !String(nome).trim()) {
      return res.status(400).json({ error: 'O nome da turma/evento é obrigatório.' });
    }

    const statusFinal = status_evento || (ativa ? 'AO_VIVO' : 'ENCERRADA');
    const ativaFinal = statusFinal === 'ENCERRADA' ? false : Boolean(ativa);

    const { rows } = await pool.query(
      `UPDATE turmas
       SET codigo = $1,
           nome = $2,
           ativa = $3,
           data_inicio = $4,
           data_fim = $5,
           meta_caixa = $6,
           meta_competencia = $7,
           qtd_mesas = $8,
           status_evento = $9,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $10
       RETURNING *`,
      [
        codigo ? String(codigo).trim() : null,
        String(nome).trim(),
        ativaFinal,
        data_inicio || null,
        data_fim || null,
        Number(meta_caixa) || 0,
        Number(meta_competencia) || 0,
        Number(qtd_mesas) || 40,
        statusFinal,
        id
      ]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Turma não encontrada.' });
    }
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Já existe outra turma com este mesmo nome.' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.patch('/turmas/:id/status', exigirPapeis('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const { ativa, status_evento } = req.body;
    const ativaBool = Boolean(ativa);
    const statusFinal = status_evento || (ativaBool ? 'AO_VIVO' : 'ENCERRADA');

    const { rows } = await pool.query(
      `UPDATE turmas
       SET ativa = $1,
           status_evento = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [ativaBool, statusFinal, id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/turmas/:id', exigirPapeis('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: vinc } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM fichas WHERE turma_id = $1)::int AS qtd_fichas,
         (SELECT COUNT(*) FROM propostas WHERE turma_id = $1)::int AS qtd_propostas`,
      [id]
    );

    if ((vinc[0]?.qtd_fichas || 0) > 0 || (vinc[0]?.qtd_propostas || 0) > 0) {
      return res.status(400).json({
        error: `Esta turma possui ${vinc[0].qtd_fichas} aluno(s) e ${vinc[0].qtd_propostas} proposta(s) no banco. Para preservar o histórico, apenas inative ou encerre a turma.`
      });
    }

    await pool.query('DELETE FROM turmas WHERE id = $1', [id]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- REGRAS COMERCIAIS (DELEGADO AO RegrasComerciaisService - SINGLE SOURCE OF TRUTH) ---
router.get('/regras', async (req, res) => {
  try {
    const regras = await regrasComerciaisService.listarTodas(pool);
    res.json(regras);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/regras/:id', exigirPapeis('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;
    const { valor_numerico, ativa, descricao, tipo_regra } = req.body;
    const regraAtualizada = await regrasComerciaisService.atualizarRegra(id, {
      valor_numerico,
      ativa,
      descricao,
      tipo_regra
    });
    res.json(regraAtualizada);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;
