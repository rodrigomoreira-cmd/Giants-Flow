const { exigirPapeis, obterPapelUsuario } = require('../middlewares/rbac');
﻿const express = require('express');
const router = express.Router();
const dbModule = require('../../database/connection');
const pool = dbModule.pool || dbModule;
const { exigirTurmaAtiva } = require('../../database/verificarTurmaAtiva');
const { registrarAuditoria } = require('./warroom.routes');

// 1. LISTAGEM DE CLIENTES / PARTICIPANTES POR TURMA
router.get('/clientes', async (req, res) => {
  try {
    const rawTurma = req.query.turmaId || req.query.turma_id || '';
    const digits = String(rawTurma).replace(/\D/g, '');
    const turmaFiltro = digits ? parseInt(digits, 10) : 1491;

    const { rows } = await pool.query(
      `SELECT id,
        nome_participante,
        nome_cracha,
        empresa,
        CASE
          WHEN LENGTH(regexp_replace(COALESCE(cnpj, cpf_cnpj, ''), '[^0-9]', '', 'g')) = 14
            THEN COALESCE(NULLIF(TRIM(cnpj), ''), NULLIF(TRIM(cpf_cnpj), ''))
          ELSE NULL
        END AS cnpj,
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
        origem,
        cv_cartao,
        historico_produtos_elegiveis,
        valor_investido_pac_ae,
        cashback_upgrade_90_pct,
        etapa_funil,
        status_aprovacao,
        ficha_fechada,
        valor_negociado,
        dados_proposta
      FROM fichas
      WHERE ($1::INT IS NULL OR turma_id = $1::INT)
      ORDER BY id ASC`,
      [turmaFiltro]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. ALOCAÇÃO NO SALÃO DE LUNCH (MESA E ASSENTO)
router.patch('/clientes/:id/mesa', async (req, res) => {
  const { id } = req.params;
  const fichaId = parseInt(id, 10);
  await exigirTurmaAtiva({ fichaId });
  const { mesa, assento } = req.body;
  const mesaNum = mesa !== null && mesa !== undefined && mesa !== '' ? parseInt(mesa, 10) : null;
  const assentoNum = assento !== null && assento !== undefined && assento !== '' ? parseInt(assento, 10) : null;

  if (isNaN(fichaId)) {
    return res.status(400).json({ error: 'ID do participante inválido.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: fichaRows } = await client.query(
      'SELECT id, turma_id, nome_participante, empresa, almoco_pago, cortesia_almoco, membro_giants, etapa_funil, ficha_fechada, status_aprovacao, cashback_upgrade_90_pct, historico_produtos_elegiveis, valor_investido_pac_ae FROM fichas WHERE id = $1::integer FOR UPDATE',
      [fichaId]
    );

    if (fichaRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Participante não encontrado no sistema.' });
    }

    const fichaAtual = fichaRows[0];
    const turmaId = fichaAtual.turma_id;

    if (mesaNum !== null && assentoNum !== null) {
      if (
        Boolean(fichaAtual.ficha_fechada) ||
        ['aguardando_aprovacao', 'fechamento', 'concluido', 'reprovado'].includes(
          String(fichaAtual.etapa_funil || '').toLowerCase()
        )
      ) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          error: 'Esta empresa já concluiu a entrevista e teve a mesa liberada. Reabra a ficha na aba Empresas caso precise realocar.'
        });
      }

      const liberadoAlmoco =
        Boolean(fichaAtual.membro_giants) ||
        Boolean(fichaAtual.almoco_pago) ||
        Boolean(fichaAtual.cortesia_almoco) ||
        String(fichaAtual.origem || '').toUpperCase() === 'GIANTS';

      if (!liberadoAlmoco) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          error: 'Acesso negado: participante não possui almoço liberado (Membro GIANTS, R$ 1.000 pago ou Cortesia).'
        });
      }

      const { rows: ocupante } = await client.query(
        'SELECT id, nome_participante FROM fichas WHERE mesa_alocada = $1::integer AND assento_alocado = $2::integer AND COALESCE(turma_id, 0) = COALESCE($3::integer, 0) AND id <> $4::integer FOR UPDATE',
        [mesaNum, assentoNum, turmaId, fichaId]
      );

      if (ocupante.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error:
            'O assento ' +
            assentoNum +
            ' da Mesa ' +
            mesaNum +
            ' do Salão de Lunch já está ocupado por ' +
            (ocupante[0].nome_participante || 'outro participante') +
            '.'
        });
      }
    }

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

    if (cashback !== undefined && cashback !== null && Number(clienteAtual[0]?.cashback || 0) !== Number(cashback)) {
      await registrarAuditoria(client, {
        fichaId: Number(id),
        empresa: rows[0]?.empresa || clienteAtual[0]?.empresa,
        cnpj: rows[0]?.cnpj,
        acao: 'EDICAO_CASHBACK',
        detalhes: `Cashback alterado de R$ ${Number(clienteAtual[0]?.cashback || 0).toFixed(2)} para R$ ${Number(cashback).toFixed(2)}`,
        req
      });
    }

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

// 3. VALIDADOR DE ALMOÇO (PAGO R$ 1.000, CORTESIA DEBITANDO R$ 1.000 OU GIANTS)
router.patch('/clientes/:id/almoco', async (req, res) => {
  const client = await pool.connect();
  try {
    const fichaId = parseInt(req.params.id, 10);
    await exigirTurmaAtiva({ fichaId });
    const { tipo, cv_cartao, participantes_ids, todos_empresa_ids } = req.body;
    const papelReqAlmoco = obterPapelUsuario(req);
    if (String(tipo || '').trim().toLowerCase() === 'cortesia' && !['ADMIN', 'FINANCEIRO'].includes(papelReqAlmoco)) {
      return res.status(403).json({
        error: 'Acesso negado (RBAC): somente perfis Administrador ou Financeiro podem conceder cortesia de almoço.'
      });
    }

    if (isNaN(fichaId)) {
      return res.status(400).json({ error: 'ID da ficha inválido.' });
    }

    const cv = (cv_cartao || '').trim() || null;

    await client.query('BEGIN');
    await client.query("SET LOCAL app.user_role = 'SYSTEM'");

    const { rows: baseRows } = await client.query(
      'SELECT id, turma_id, empresa, cnpj, cpf_cnpj, membro_giants FROM fichas WHERE id = $1::int FOR UPDATE',
      [fichaId]
    );

    if (baseRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Empresa/participante não encontrado.' });
    }

    const base = baseRows[0];
    const cnpjLimpo = String(base.cnpj || base.cpf_cnpj || '').replace(/\D/g, '');
    const empNorm = String(base.empresa || '').trim().toLowerCase();

    const idsEnviados = Array.isArray(todos_empresa_ids)
      ? todos_empresa_ids.map((x) => parseInt(x, 10)).filter((n) => !isNaN(n))
      : [];

    const { rows: sociosEmpresa } = await client.query(
      `SELECT id, membro_giants
       FROM fichas
       WHERE turma_id = $1::int
         AND COALESCE(membro_giants, false) = false
         AND (
           id = $2::int
           OR id = ANY($3::int[])
           OR ($4::text <> '' AND LENGTH($4::text) >= 11 AND regexp_replace(COALESCE(cnpj, cpf_cnpj, ''), '\\D', '', 'g') = $4::text)
           OR ($5::text <> '' AND $5::text NOT IN ('empresa sga', 'sem empresa', 'empresa não informada', 'empresa nao informada') AND LOWER(TRIM(COALESCE(empresa, ''))) = $5::text)
         )
       ORDER BY id ASC`,
      [base.turma_id, fichaId, idsEnviados, cnpjLimpo, empNorm]
    );

    const todosIds = sociosEmpresa.length > 0 ? sociosEmpresa.map((s) => Number(s.id)) : [fichaId];

    const marcadosRaw = Array.isArray(participantes_ids)
      ? participantes_ids.map((x) => parseInt(x, 10)).filter((n) => !isNaN(n))
      : [];
    const idsParticipantes = marcadosRaw.length > 0 ? marcadosRaw : todosIds;
    const titularPaganteId = idsParticipantes.includes(fichaId) ? fichaId : idsParticipantes[0];

    if (tipo === 'pago') {
      await client.query(
        `UPDATE fichas
         SET almoco_pago = CASE WHEN id = ANY($2::int[]) THEN true ELSE false END,
             cortesia_almoco = false,
             membro_giants = false,
             valor_almoco = CASE WHEN id = $3::int THEN 1000.00 ELSE 0.00 END,
             cv_cartao = CASE WHEN id = ANY($2::int[]) THEN COALESCE($4::varchar, cv_cartao) ELSE NULL END,
             mesa_alocada = CASE WHEN id = ANY($2::int[]) THEN mesa_alocada ELSE NULL END,
             assento_alocado = CASE WHEN id = ANY($2::int[]) THEN assento_alocado ELSE NULL END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ANY($1::int[])`,
        [todosIds, idsParticipantes, titularPaganteId, cv]
      );
    } else if (tipo === 'cortesia') {
      // Debita os R$ 1.000,00 (valor_almoco = 0 e almoco_pago = false), garantindo almoço e mesa para os sócios selecionados
      await client.query(
        `UPDATE fichas
         SET almoco_pago = false,
             valor_almoco = 0.00,
             cv_cartao = NULL,
             cortesia_almoco = CASE WHEN id = ANY($2::int[]) THEN true ELSE false END,
             membro_giants = false,
             mesa_alocada = CASE WHEN id = ANY($2::int[]) THEN mesa_alocada ELSE NULL END,
             assento_alocado = CASE WHEN id = ANY($2::int[]) THEN assento_alocado ELSE NULL END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ANY($1::int[])`,
        [todosIds, idsParticipantes]
      );
    } else if (tipo === 'giants') {
      await client.query(
        `UPDATE fichas
         SET almoco_pago = false,
             cortesia_almoco = false,
             membro_giants = true,
             valor_almoco = 0.00,
             cv_cartao = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ANY($1::int[])`,
        [todosIds]
      );
    } else {
      await client.query(
        `UPDATE fichas
         SET almoco_pago = false,
             cortesia_almoco = false,
             valor_almoco = 0.00,
             cv_cartao = NULL,
             mesa_alocada = NULL,
             assento_alocado = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ANY($1::int[])`,
        [todosIds]
      );
    }

    if (tipo === 'cortesia') {
      await registrarAuditoria(client, {
        turmaId: base.turma_id,
        fichaId,
        empresa: base.empresa,
        cnpj: base.cnpj || base.cpf_cnpj,
        acao: 'CORTESIA_ALMOCO',
        detalhes: `Cortesia de almoço autorizada (R$ 1.000,00 debitado) para ${idsParticipantes.length} participante(s)`,
        req
      });
    }

    const { rows: atualizadas } = await client.query(
      'SELECT id, empresa, nome_participante, almoco_pago, cortesia_almoco, membro_giants, valor_almoco, cv_cartao, mesa_alocada, etapa_funil FROM fichas WHERE id = ANY($1::int[]) ORDER BY id ASC',
      [todosIds]
    );

    await client.query('COMMIT');
    res.json(atualizadas[0] || { sucesso: true, atualizadas });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Erro ao validar almoço: ' + err.message });
  } finally {
    client.release();
  }
});

// 4. ATUALIZAÇÃO RÁPIDA DE ALMOÇO/CORTESIA (ATALHO DO SALÃO DE LUNCH)
router.patch('/clientes/:id', async (req, res) => {
  try {
    await exigirTurmaAtiva({ fichaId: req.params.id });
    const { almoco_pago, cortesia_almoco, cortesia, valor_almoco } = req.body;
    const cortesiaFinal = cortesia_almoco !== undefined ? cortesia_almoco : cortesia;
    const pagoFinal = cortesiaFinal === true && almoco_pago === undefined ? false : almoco_pago;
    const valorFinal =
      cortesiaFinal === true && valor_almoco === undefined
        ? 0
        : pagoFinal === true && valor_almoco === undefined
        ? 1000
        : valor_almoco;

    const { rows } = await pool.query(
      `UPDATE fichas
       SET almoco_pago = COALESCE($1, almoco_pago),
           cortesia_almoco = COALESCE($2, cortesia_almoco),
           valor_almoco = COALESCE($3, valor_almoco),
           cv_cartao = CASE WHEN $2 = true THEN NULL ELSE cv_cartao END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 RETURNING *`,
      [pagoFinal, cortesiaFinal, valorFinal, req.params.id]
    );
    res.json(rows[0] || { sucesso: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. EDIÇÃO CADASTRAL DO CLIENTE
router.put('/clientes/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await exigirTurmaAtiva({ fichaId: id });
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
      'SELECT id, cashback, empresa, cashback_upgrade_90_pct, historico_produtos_elegiveis, valor_investido_pac_ae FROM fichas WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (clienteAtual.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    if (cashback !== undefined && cashback !== null) {
      const cashbackAnterior = Number(clienteAtual[0].cashback || 0);
      if (Math.abs(cashback - cashbackAnterior) > 0.009) {
        const papelReqCashback = obterPapelUsuario(req);
        if (!['ADMIN', 'FINANCEIRO'].includes(papelReqCashback)) {
          await client.query('ROLLBACK');
          return res.status(403).json({
            error: 'Acesso negado (RBAC): somente perfis Administrador ou Financeiro podem alterar o valor de cashback.'
          });
        }
      }
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

// 6. SINCRONIZAÇÃO EM LOTE DE CASHBACK DE UPGRADE POR CNPJ
router.post('/clientes/sincronizar-cashback-cnpj', exigirPapeis('ADMIN', 'FINANCEIRO'), async (req, res) => {
  const client = await pool.connect();
  try {
    const registros = Array.isArray(req.body) ? req.body : req.body.registros || [];
    if (registros.length === 0) {
      return res.status(400).json({ error: 'Envie um array de registros com cnpj/empresa e cashback_upgrade_90_pct.' });
    }

    await client.query('BEGIN');
    let atualizados = 0;

    const mapaCnpj = new Map();
    for (const r of registros) {
      const cnpjLimpo = String(r.cnpj || r.cpfcnpj || '').replace(/\D/g, '');
      const razaoNorm = String(r.empresa || r.razaoSocial || '').trim().toUpperCase();
      const chave = cnpjLimpo.length >= 11 ? `cnpj:${cnpjLimpo}` : razaoNorm ? `emp:${razaoNorm}` : null;
      if (!chave) continue;

      const valInvestido = Number(r.valor_investido_pac_ae || 0);
      const valCashback = Number(r.cashback_upgrade_90_pct || valInvestido * 0.9 || 0);
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
