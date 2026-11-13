const express = require('express');
const router = express.Router();
const dbModule = require('../../database/connection');
const pool = dbModule.pool || dbModule;
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
    const mesa = b.mesaId || b.mesa_id || b.mesa;
    const entrevistadorId = b.entrevistador_id
      ? Number(b.entrevistador_id)
      : (b.entrevistadores_ids?.[0] ? Number(b.entrevistadores_ids[0]) : null);

    if (!id || !mesa) return res.status(400).json({ error: 'ID do participante ou Mesa não fornecidos.' });

    await client.query('BEGIN');
    await client.query("SET LOCAL app.user_role = 'SYSTEM'");

    const { rows: clienteRows } = await client.query(
      'SELECT almoco_pago, cortesia_almoco, membro_giants, ficha_fechada FROM fichas WHERE id = $1 FOR UPDATE',
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

    const liberadoAlmoco = Boolean(c.membro_giants) || Boolean(c.almoco_pago) || Boolean(c.cortesia_almoco);
    if (!liberadoAlmoco) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Acesso negado: participante não possui almoço pago nem cortesia ativa.' });
    }

    const { rows } = await client.query(
      `UPDATE fichas
       SET etapa_funil = 'entrevista',
           mesa_alocada = $1,
           entrevistador_id = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [mesa, entrevistadorId, id]
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
    const sociosIdsExtra = Array.isArray(req.body.sociosIds)
      ? req.body.sociosIds.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0)
      : [];
    const resString = String(req.body.resultado || '').toLowerCase();
    const userInfo = extrairUsuarioRequisicao(req);

    if (!id) {
      return res.status(400).json({ error: 'Identificador da ficha não informado.' });
    }

    let novaEtapa = 'aguardando_aprovacao';
    if (resString.includes('reprovado') || resString.includes('sem interesse') || resString.includes('não fechou')) {
      novaEtapa = 'reprovado';
    } else if (resString.includes('retomada') || resString.includes('follow')) {
      novaEtapa = 'aguardando_aprovacao';
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

// REABERTURA DE FICHA ENCERRADA (EXCLUSIVO ADMINISTRADOR)
router.post('/entrevistas/:id/reabrir', async (req, res) => {
  const client = await pool.connect();
  try {
    const userInfo = extrairUsuarioRequisicao(req);
    if (!['ADMIN', 'ADMINISTRADOR', 'SYSTEM'].includes(userInfo.papel)) {
      return res.status(403).json({
        error: 'Acesso negado: apenas usuários com perfil Administrador podem reabrir uma ficha encerrada.'
      });
    }

    const id = Number(req.params.id);
    const motivo = String(req.body?.motivo || 'Reaberta pelo Administrador para revisão/ajuste').trim();

    await client.query('BEGIN');
    await client.query("SET LOCAL app.user_role = 'SYSTEM'");

    const { rows: baseRows } = await client.query(
      `SELECT id, turma_id, empresa, COALESCE(NULLIF(TRIM(cnpj), ''), NULLIF(TRIM(cpf_cnpj), '')) AS doc_cnpj
       FROM fichas WHERE id = $1 FOR UPDATE`,
      [id]
    );

    if (baseRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Ficha não encontrada.' });
    }

    const base = baseRows[0];
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
            turma_id = $4
            AND (
              ($5 <> '' AND LENGTH($5) >= 11 AND regexp_replace(COALESCE(cnpj, cpf_cnpj, ''), '\D', '', 'g') = $5)
              OR ($5 = '' AND $6 <> '' AND $6 <> 'empresa sga' AND LOWER(TRIM(COALESCE(empresa, ''))) = $6)
            )
          )
       RETURNING *`,
      [userInfo.id, motivo, id, base.turma_id, cnpjLimpo, empNorm]
    );

    await client.query('COMMIT');
    res.json({
      sucesso: true,
      mensagem: 'Ficha reaberta com sucesso pelo Administrador.',
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
router.post('/entrevistas/reabrir', async (req, res) => {
  const roleHeader = String(req.user?.papel || req.user?.role || req.user?.perfil || req.body?.papel || req.headers['x-user-role'] || '').trim().toLowerCase();
  if (roleHeader && !['admin', 'administrador', 'superadmin', 'master', 'system', 'diretor'].includes(roleHeader)) {
    return res.status(403).json({ error: 'Acesso negado: somente administradores podem reabrir fichas encerradas.' });
  }
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
