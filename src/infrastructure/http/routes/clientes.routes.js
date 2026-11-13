const express = require('express');
const router = express.Router();
const dbModule = require('../../database/connection');
const pool = dbModule.pool || dbModule;

// 3. CLIENTES COM CASHBACK ATÔMICO
router.get('/clientes', async (req, res) => {
  try {
    const rawTurma = req.query.turmaId || req.query.turma_id || '';
    const digits = String(rawTurma).replace(/\D/g, '');
    const turmaFiltro = digits ? parseInt(digits, 10) : 1491;

    const { rows } = await pool.query(`
      SELECT id, 
        nome_participante, 
        nome_cracha, 
        empresa, 
        cnpj, 
        cpf_cnpj, 
        telefone, 
        email, 
        turma_id, 
        almoco_pago, 
        membro_giants, 
        valor_almoco, 
        cortesia_almoco, 
        mesa_alocada, 
        assento_alocado,
        status, 
        cargo,
        origem, historico_produtos_elegiveis, valor_investido_pac_ae, cashback_upgrade_90_pct ,
        etapa_funil,
        status_aprovacao,
        ficha_fechada,
        valor_negociado,
        dados_proposta
      FROM fichas
      WHERE ($1::INT IS NULL OR turma_id = $1::INT)
      ORDER BY id ASC
    `, [turmaFiltro]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ALOCAÇÃO NO SALÃO DE LUNCH (MESA E ASSENTO)
router.patch('/clientes/:id/mesa', async (req, res) => {
  const { id } = req.params;
  const fichaId = parseInt(id, 10);
  const { mesa, assento } = req.body;
  const mesaNum = (mesa !== null && mesa !== undefined && mesa !== '') ? parseInt(mesa, 10) : null;
  const assentoNum = (assento !== null && assento !== undefined && assento !== '') ? parseInt(assento, 10) : null;

  if (isNaN(fichaId)) {
    return res.status(400).json({ error: 'ID do participante inválido.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Obter dados do participante com bloqueio pessimista FOR UPDATE
    const { rows: fichaRows } = await client.query(
      'SELECT  id, turma_id, nome_participante, empresa, almoco_pago, cortesia_almoco, membro_giants, etapa_funil, cashback_upgrade_90_pct, historico_produtos_elegiveis, valor_investido_pac_ae  FROM fichas WHERE id = $1::integer FOR UPDATE',
      [fichaId]
    );

    if (fichaRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Participante não encontrado no sistema.' });
    }

    const fichaAtual = fichaRows[0];
    const turmaId = fichaAtual.turma_id;

    // 2. Se for uma alocação no Lunch, validar elegibilidade e concorrência no Salão
    if (mesaNum !== null && assentoNum !== null) {
      const liberadoAlmoco = Boolean(fichaAtual.membro_giants) || Boolean(fichaAtual.almoco_pago) || Boolean(fichaAtual.cortesia_almoco) || String(fichaAtual.origem).toUpperCase() === 'GIANTS';

      if (!liberadoAlmoco) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          error: 'Acesso negado: participante não possui almoço liberado (Membro GIANTS, R$ 1.000 pago ou Cortesia).'
        });
      }

      // Checa concorrência de assento no Salão de Lunch com casting tipado
      const { rows: ocupante } = await client.query(
        'SELECT  id, nome_participante, cashback_upgrade_90_pct, historico_produtos_elegiveis, valor_investido_pac_ae  FROM fichas WHERE mesa_alocada = $1::integer AND assento_alocado = $2::integer AND COALESCE(turma_id, 0) = COALESCE($3::integer, 0) AND id <> $4::integer FOR UPDATE',
        [mesaNum, assentoNum, turmaId, fichaId]
      );

      if (ocupante.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'O assento ' + assentoNum + ' da Mesa ' + mesaNum + ' do Salão de Lunch já está ocupado por ' + (ocupante[0].nome_participante || 'outro participante') + '.'
        });
      }
    }

    // 3. Atualizar alocação no Salão de Lunch com casting explícito ($1::integer)
    const sqlUpdate = `
      UPDATE fichas 
      SET mesa_alocada = $1::integer, 
          assento_alocado = $2::integer, 
          etapa_funil = CASE 
            WHEN $1::integer IS NOT NULL AND (etapa_funil IS NULL OR etapa_funil IN ('lead', 'novo')) THEN 'entrevista' 
            ELSE etapa_funil 
          END, 
          updated_at = CURRENT_TIMESTAMP 
      WHERE id = $3::integer 
      RETURNING id, empresa, nome_participante, mesa_alocada, assento_alocado, almoco_pago, cortesia_almoco, membro_giants, etapa_funil
    `;

    const { rows } = await client.query(sqlUpdate, [mesaNum, assentoNum, fichaId]);

    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ERRO ALOCAÇÃO SALÃO DE LUNCH:', err);
    if (err.code === '23505') {
      return res.status(409).json({
        error: 'Conflito de concorrência: este assento do Salão de Lunch acabou de ser ocupado por outro operador.'
      });
    }
    res.status(500).json({ error: 'Erro ao alocar no Salão de Lunch: ' + err.message });
  } finally {
    client.release();
  }
});

// VALIDADOR DE ALMOÇO (PAGO R$ 1000, CORTESIA OU GIANTS)
router.patch('/clientes/:id/almoco', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { tipo, cv_cartao } = req.body; 

    let almoco_pago = false;
    let cortesia_almoco = false;
    let membro_giants = false;
    let cv = (cv_cartao || '').trim() || null;

    if (tipo === 'pago') {
      almoco_pago = true;
    } else if (tipo === 'cortesia') {
      cortesia_almoco = true;
    } else if (tipo === 'giants') {
      membro_giants = true;
    }

    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE fichas 
       SET almoco_pago = $1,
           cortesia_almoco = $2,
           membro_giants = $3,
           cv_cartao = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING id, empresa, nome_participante, almoco_pago, cortesia_almoco, membro_giants, cv_cartao, etapa_funil`,
      [almoco_pago, cortesia_almoco, membro_giants, cv, id]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Erro ao validar almoço: ' + err.message });
  } finally {
    client.release();
  }
});

router.patch('/clientes/:id', async (req, res) => {
  try {
    const { almoco_pago, cortesia_almoco, cortesia } = req.body;
    const { rows } = await pool.query(
      `UPDATE fichas 
       SET almoco_pago = COALESCE($1, almoco_pago),
           cortesia_almoco = COALESCE($2, COALESCE($3, cortesia_almoco))
       WHERE id = $4 RETURNING *`,
      [almoco_pago, cortesia_almoco, cortesia, req.params.id]
    );
    res.json(rows[0] || { sucesso: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/clientes/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    let { empresa, nome_completo, email, telefone, cnpj, cashback } = req.body;

    if (cashback !== undefined && cashback !== null) {
      cashback = Number(cashback);
      if (isNaN(cashback) || !isFinite(cashback)) {
        return res.status(400).json({ error: 'O valor do cashback deve ser um número válido.' });
      }
      if (cashback < 0) {
        return res.status(400).json({ error: 'O cashback não pode ser um valor negativo.' });
      }
      if (cashback > 50000) {
        return res.status(400).json({ error: 'O cashback ultrapassa o limite teto permitido (R$ 50.000,00).' });
      }
    }

    await client.query('BEGIN');

    const { rows: clienteAtual } = await client.query(
      'SELECT  id, cashback, empresa, cashback_upgrade_90_pct, historico_produtos_elegiveis, valor_investido_pac_ae  FROM fichas WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (clienteAtual.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    const { rows } = await client.query(
      `UPDATE fichas 
       SET empresa = COALESCE($1, empresa),
           nome_participante = COALESCE($2, nome_participante),
           email = COALESCE($3, email),
           telefone = COALESCE($4, telefone),
           cnpj = COALESCE($5, cnpj),
           cashback = COALESCE($6, cashback),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 
       RETURNING *`,
      [empresa, nome_completo, email, telefone, cnpj, cashback, id]
    );

    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});


// SINCRONIZAÇÃO EM LOTE DE CASHBACK DE UPGRADE (90% PAC/AE) POR CNPJ
router.post('/clientes/sincronizar-cashback-cnpj', async (req, res) => {
  const client = await pool.connect();
  try {
    const registros = Array.isArray(req.body) ? req.body : (req.body.registros || []);
    if (registros.length === 0) {
      return res.status(400).json({ error: 'Envie um array de registros com cnpj/empresa e cashback_upgrade_90_pct.' });
    }

    await client.query('BEGIN');
    let atualizados = 0;

    // Deduplica por CNPJ antes de aplicar para garantir crédito único por empresa
    const mapaCnpj = new Map();
    for (const r of registros) {
      const cnpjLimpo = String(r.cnpj || r.cpfcnpj || '').replace(/\D/g, '');
      const razaoNorm = String(r.empresa || r.razaoSocial || '').trim().toUpperCase();
      const chave = cnpjLimpo.length >= 11 ? `cnpj:${cnpjLimpo}` : (razaoNorm ? `emp:${razaoNorm}` : null);
      if (!chave) continue;

      const valInvestido = Number(r.valor_investido_pac_ae || 0);
      const valCashback = Number(r.cashback_upgrade_90_pct || (valInvestido * 0.90) || 0);
      const hist = r.historico_produtos_elegiveis || null;

      const atual = mapaCnpj.get(chave);
      if (!atual || valCashback > atual.valCashback) {
        mapaCnpj.set(chave, { cnpjLimpo, razaoNorm, valInvestido, valCashback, hist });
      }
    }

    for (const item of mapaCnpj.values()) {
      if (item.cnpjLimpo.length >= 11) {
        const resUpd = await client.query(
          `UPDATE fichas
           SET historico_produtos_elegiveis = COALESCE($1, historico_produtos_elegiveis),
               valor_investido_pac_ae = $2,
               cashback_upgrade_90_pct = $3,
               updated_at = CURRENT_TIMESTAMP
           WHERE REGEXP_REPLACE(COALESCE(cnpj, cpf_cnpj, ''), '\D', '', 'g') = $4`,
          [item.hist, item.valInvestido, item.valCashback, item.cnpjLimpo]
        );
        atualizados += resUpd.rowCount || 0;
      } else if (item.razaoNorm) {
        const resUpd = await client.query(
          `UPDATE fichas
           SET historico_produtos_elegiveis = COALESCE($1, historico_produtos_elegiveis),
               valor_investido_pac_ae = $2,
               cashback_upgrade_90_pct = $3,
               updated_at = CURRENT_TIMESTAMP
           WHERE UPPER(TRIM(COALESCE(empresa, ''))) = $4`,
          [item.hist, item.valInvestido, item.valCashback, item.razaoNorm]
        );
        atualizados += resUpd.rowCount || 0;
      }
    }

    await client.query('COMMIT');
    res.json({ sucesso: true, empresasProcessadas: mapaCnpj.size, fichasAtualizadas: atualizados });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Erro ao sincronizar cashback por CNPJ: ' + err.message });
  } finally {
    client.release();
  }
});

module.exports = router;