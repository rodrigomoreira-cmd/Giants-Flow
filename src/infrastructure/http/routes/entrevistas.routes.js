const { exigirPapeis } = require('../middlewares/rbac');
﻿const express = require('express');
const router = express.Router();
const dbModule = require('../../database/connection');
const pool = dbModule.pool || dbModule;
const { exigirTurmaAtiva } = require('../../database/verificarTurmaAtiva');
const { registrarAuditoria } = require('./warroom.routes');
const { verificarJWT } = require('../../security/jwt');

function extrairUsuarioRequisicao(req) {
  if (req.usuario && req.usuario.papel) {
    return {
      id: req.usuario.id || null,
      papel: String(req.usuario.papel).toUpperCase()
    };
  }
  const authHeader = req.headers?.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (token) {
    try {
      const payload = verificarJWT(token);
      if (payload) {
        return {
          id: payload.userId || payload.id || null,
          papel: String(payload.userRole || payload.papel || '').toUpperCase()
        };
      }
    } catch (_) {}
  }
  return { id: null, papel: '' };
}

// ALOCAÇÃO DO EMPRESÁRIO NA MESA COM ENTREVISTADOR DESIGNADO
router.post('/entrevistas/agendar', async (req, res) => {
  const client = await pool.connect();
  try {
    const b = req.body;
    const id = b.aplicacaoId || b.cliente_id || b.fichaId || b.id;
    if (id) await exigirTurmaAtiva({ fichaId: id });
    const mesa = b.mesaId || b.mesa_id || b.mesa;
    const entrevistadorId = b.entrevistador_id
      ? Number(b.entrevistador_id)
      : (b.entrevistadores_ids?.[0] ? Number(b.entrevistadores_ids[0]) : null);

    if (!id || !mesa) return res.status(400).json({ error: 'ID do participante ou Mesa não fornecidos.' });

    await client.query('BEGIN');
    await client.query("SET LOCAL app.user_role = 'SYSTEM'");

    const { rows: clienteRows } = await client.query(
      'SELECT almoco_pago, cortesia_almoco, atendimento_sem_almoco, membro_giants, ficha_fechada FROM fichas WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (clienteRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    const c = clienteRows[0];
    if (c.ficha_fechada) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Esta ficha já foi encerrada. Solicite ao Administrador para reabri-la.' });
    }

    const liberadoAlmoco = Boolean(c.membro_giants) || Boolean(c.almoco_pago) || Boolean(c.cortesia_almoco) || Boolean(c.atendimento_sem_almoco);
    if (!liberadoAlmoco) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Acesso negado: participante não possui almoço pago nem cortesia ativa.' });
    }

    // Converte id interno da mesa (ex: 36) para o número físico real (ex: 2)
    let numeroMesaReal = null;
    if (b.mesaNumero !== undefined && b.mesaNumero !== null && b.mesaNumero !== '') {
      const { rows: mRows } = await client.query(
        'SELECT numero FROM mesas WHERE numero = $1::int LIMIT 1',
        [Number(b.mesaNumero)]
      );
      if (mRows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Mesa ${b.mesaNumero} não existe no cadastro do salão.` });
      }
      numeroMesaReal = Number(mRows[0].numero);
    } else if (b.mesaId !== undefined && b.mesaId !== null && b.mesaId !== '') {
      const { rows: mRows } = await client.query(
        'SELECT numero FROM mesas WHERE id = $1::int LIMIT 1',
        [Number(b.mesaId)]
      );
      if (mRows.length > 0) {
        numeroMesaReal = Number(mRows[0].numero);
      } else {
        const { rows: mByNum } = await client.query(
          'SELECT numero FROM mesas WHERE numero = $1::int LIMIT 1',
          [Number(b.mesaId)]
        );
        if (mByNum.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Mesa selecionada não encontrada no salão.' });
        }
        numeroMesaReal = Number(mByNum[0].numero);
      }
    } else {
      const rawM = Number(mesa);
      const { rows: mRows } = await client.query(
        'SELECT numero FROM mesas WHERE numero = $1::int OR id = $1::int ORDER BY CASE WHEN numero = $1::int THEN 0 ELSE 1 END LIMIT 1',
        [rawM]
      );
      if (mRows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Mesa ${rawM} não encontrada no salão.` });
      }
      numeroMesaReal = Number(mRows[0].numero);
    }

    const { rows } = await client.query(
      `UPDATE fichas
       SET etapa_funil = 'entrevista',
           mesa_alocada = $1,
           entrevistador_id = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [numeroMesaReal, entrevistadorId, id]
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

// FINALIZAÇÃO DA ENTREVISTA: FECHA A FICHA E LIBERA A MESA DE TODOS OS SÓCIOS DA EMPRESA (CNPJ)
router.post('/entrevistas/resultado', async (req, res) => {
  const client = await pool.connect();
  try {
    const id = req.body.entrevista_id || req.body.fichaId || req.body.participanteId || req.body.id || req.body.aplicacaoId;
    if (id) await exigirTurmaAtiva({ fichaId: id, turmaId: req.body.turmaId || null });
    const sociosIdsExtra = Array.isArray(req.body.sociosIds)
      ? req.body.sociosIds.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0)
      : [];
    const resString = String(req.body.resultado || '').toLowerCase();
    const userInfo = extrairUsuarioRequisicao(req);

    if (!id) {
      return res.status(400).json({ error: 'Identificador da ficha não informado.' });
    }

    const isNaoFechou =
      resString.includes('reprovado') ||
      resString.includes('sem interesse') ||
      resString.includes('não fechou') ||
      resString.includes('nao fechou');
    const isDecisaoFutura =
      resString.includes('decisão futura') ||
      resString.includes('decisao futura') ||
      resString.includes('retomada') ||
      resString.includes('follow');

    let novaEtapa = 'aguardando_aprovacao';
    if (isNaoFechou) {
      novaEtapa = 'reprovado';
    } else if (isDecisaoFutura) {
      novaEtapa = 'decisao_futura';
    }

    await client.query('BEGIN');
    await client.query("SET LOCAL app.user_role = 'SYSTEM'");

    const { rows: baseRows } = await client.query(
      `SELECT id, turma_id, empresa, COALESCE(NULLIF(TRIM(cnpj), ''), NULLIF(TRIM(cpf_cnpj), '')) AS doc_cnpj
       FROM fichas WHERE id = $1 FOR UPDATE`,
      [Number(id)]
    );

    if (baseRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: `Participante #${id} não encontrado no sistema.` });
    }

    const base = baseRows[0];
    const cnpjLimpo = String(base.doc_cnpj || '').replace(/\D/g, '');
    const empNorm = String(base.empresa || '').trim().toLowerCase();

    // Atualiza o titular e todos os sócios vinculados ao mesmo CNPJ/Empresa na turma:
    // 1) Libera a mesa física (mesa_alocada = NULL, assento_alocado = NULL)
    // 2) Encerra a ficha (ficha_fechada = true) aguardando aprovação do financeiro
    const { rows: atualizadas } = await client.query(
      `UPDATE fichas
       SET etapa_funil = $1::varchar,
           mesa_alocada = NULL,
           assento_alocado = NULL,
           ficha_fechada = true,
           fechada_em = CURRENT_TIMESTAMP,
           fechada_por = COALESCE($2::int, fechada_por),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3::int
          OR id = ANY($7::int[])
          OR (
            turma_id = $4::int
            AND (
              ($5::text <> '' AND LENGTH($5::text) >= 11 AND regexp_replace(COALESCE(cnpj, cpf_cnpj, ''), '\D', '', 'g') = $5::text)
              OR ($6::text <> '' AND $6::text NOT IN ('empresa sga', 'sem empresa', 'empresa não informada', 'empresa nao informada') AND LOWER(TRIM(COALESCE(empresa, ''))) = $6::text)
            )
          )
       RETURNING *`,
      [novaEtapa, userInfo.id, Number(id), base.turma_id, cnpjLimpo, empNorm, sociosIdsExtra]
    );

    await client.query('COMMIT');
    const titularAtualizado = atualizadas.find((r) => Number(r.id) === Number(id)) || atualizadas[0];
    res.json({
      ...titularAtualizado,
      sucesso: true,
      mesa_liberada: true,
      ficha_fechada: true,
      fichas_atualizadas: atualizadas.length
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// REABERTURA DE FICHA ENCERRADA (ADMIN) OU RETOMADA DE DECISÃO FUTURA (FOLLOW-UP)
router.post('/entrevistas/:id/reabrir', async (req, res) => {
  const client = await pool.connect();
  try {
    const userInfo = extrairUsuarioRequisicao(req);
    const isAdminUser = ['ADMIN', 'ADMINISTRADOR', 'SYSTEM'].includes(userInfo.papel);

    const id = Number(req.params.id);
    const motivo = String(req.body?.motivo || 'Reaberta para revisão/atendimento').trim();

    await client.query('BEGIN');
    await client.query("SET LOCAL app.user_role = 'SYSTEM'");

    const { rows: baseRows } = await client.query(
      `SELECT id, turma_id, empresa, etapa_funil, membro_giants, origem,
              COALESCE(NULLIF(TRIM(cnpj), ''), NULLIF(TRIM(cpf_cnpj), '')) AS doc_cnpj
       FROM fichas WHERE id = $1 FOR UPDATE`,
      [id]
    );

    if (baseRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Ficha não encontrada.' });
    }

    const base = baseRows[0];
    const ehDecisaoFutura = String(base.etapa_funil || '').trim().toLowerCase() === 'decisao_futura';

    if (!isAdminUser && !ehDecisaoFutura) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        error: 'Acesso negado: apenas usuários com perfil Administrador podem reabrir uma ficha já enviada ao Financeiro ou recusada.'
      });
    }

    const ehGiants =
      Boolean(base.membro_giants) ||
      String(base.origem || '').toUpperCase().includes('GIAN');
    const cnpjLimpo = String(base.doc_cnpj || '').replace(/\D/g, '');
    const empNorm = String(base.empresa || '').trim().toLowerCase();

    const { rows } = await client.query(
      `UPDATE fichas
       SET ficha_fechada = false,
           etapa_funil = 'em_entrevista',
           reaberta_em = CURRENT_TIMESTAMP,
           reaberta_por = $1,
           motivo_reabertura = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
          OR (
            $7::boolean = false
            AND COALESCE(membro_giants, false) = false
            AND turma_id = $4
            AND (
              ($5 <> '' AND LENGTH($5) = 14 AND regexp_replace(COALESCE(cnpj, cpf_cnpj, ''), '[^0-9]', '', 'g') = $5)
              OR ($5 = '' AND $6 <> '' AND $6 <> 'empresa sga' AND LOWER(TRIM(COALESCE(empresa, ''))) = $6)
            )
          )
       RETURNING *`,
      [userInfo.id, motivo, id, base.turma_id, cnpjLimpo, empNorm, ehGiants]
    );

    await registrarAuditoria(client, {
      turmaId: base.turma_id || 1491,
      fichaId: id,
      empresa: base.empresa,
      cnpj: base.doc_cnpj || null,
      acao: ehDecisaoFutura && !isAdminUser ? 'RETOMADA_DECISAO_FUTURA' : 'REABERTURA_FICHA_ADMIN',
      detalhes: motivo,
      req
    });

    await client.query('COMMIT');
    res.json({
      sucesso: true,
      mensagem: ehDecisaoFutura
        ? 'Atendimento de Decisão Futura retomado com sucesso.'
        : 'Ficha reaberta com sucesso pelo Administrador.',
      ficha: rows.find((r) => Number(r.id) === id) || rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});


// REABRIR FICHA DA EMPRESA (LIBERA EDIÇÃO APÓS FECHAMENTO / APROVAÇÃO)
router.post('/entrevistas/reabrir', exigirPapeis('ADMIN'), async (req, res) => {
  await exigirTurmaAtiva({ fichaId: req.body?.fichaId || null, turmaId: req.body?.turmaId || null });
  await registrarAuditoria(pool, {
    turmaId: req.body?.turmaId || 1491,
    fichaId: req.body?.fichaId || null,
    empresa: req.body?.empresa || null,
    cnpj: req.body?.cnpj || null,
    acao: 'REABERTURA_FICHA_ADMIN',
    detalhes: req.body?.motivo || 'Reabertura administrativa da ficha encerrada',
    req
  });
  const client = await pool.connect();
  try {
    const fichaId = Number(req.body.fichaId || req.body.id || 0);
    const turmaId = Number(req.body.turmaId || 1491);
    const cnpjLimpo = String(req.body.cnpj || '').replace(/\D/g, '');
    const empNorm = String(req.body.empresa || '').trim().toLowerCase();

    if (!fichaId && !cnpjLimpo && !empNorm) {
      return res.status(400).json({ error: 'Informe a empresa ou ID da ficha para reabrir.' });
    }

    await client.query('BEGIN');
    await client.query("SET LOCAL app.user_role = 'SYSTEM'");

    const { rows: baseRows } = await client.query(
      'SELECT id, turma_id, empresa, cnpj, cpf_cnpj FROM fichas WHERE id = $1::int LIMIT 1',
      [fichaId]
    );

    const base = baseRows[0] || {};
    const turmaAlvo = Number(base.turma_id || turmaId);
    const cnpjAlvo = cnpjLimpo || String(base.cnpj || base.cpf_cnpj || '').replace(/\D/g, '');
    const empAlvo = empNorm || String(base.empresa || '').trim().toLowerCase();

    const { rows: reabertas } = await client.query(
      `UPDATE fichas
       SET ficha_fechada = false,
           fechada_em = NULL,
           status_aprovacao = NULL,
           etapa_funil = 'entrevista',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::int
          OR (
            turma_id = $2::int
            AND (
              ($3::text <> '' AND LENGTH($3::text) >= 11 AND regexp_replace(COALESCE(cnpj, cpf_cnpj, ''), '\D', '', 'g') = $3::text)
              OR ($4::text <> '' AND $4::text NOT IN ('empresa sga', 'sem empresa', 'empresa não informada', 'empresa nao informada') AND LOWER(TRIM(COALESCE(empresa, ''))) = $4::text)
            )
          )
       RETURNING id, empresa, nome_participante, etapa_funil, ficha_fechada`,
      [fichaId, turmaAlvo, cnpjAlvo, empAlvo]
    );

    const idsReabertos = reabertas.map((r) => Number(r.id)).filter((n) => Number.isInteger(n) && n > 0);
    if (idsReabertos.length > 0) {
      await client.query(
        `UPDATE propostas
         SET status = 'reaberta',
             updated_at = CURRENT_TIMESTAMP
         WHERE aplicacao_id = ANY($1::int[])
           AND status IN ('aprovado', 'vendido', 'aprovada', 'aprovada_com_ressalva', 'pendente')`,
        [idsReabertos]
      ).catch(() => {});
    }

    await client.query('COMMIT');
    res.json({
      sucesso: true,
      fichasReabertas: reabertas.length,
      ids: idsReabertos
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao reabrir ficha:', err);
    res.status(500).json({ error: 'Erro ao reabrir ficha da empresa: ' + err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
