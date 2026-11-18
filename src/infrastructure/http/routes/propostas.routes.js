const { exigirPapeis } = require('../middlewares/rbac');
const {
  gerarHashSha256,
  extrairIdempotencyKey,
  garantirTabelasIdempotencia,
  adquirirChaveIdempotencia,
  concluirChaveIdempotencia,
  verificarAssinaturaWebhook
} = require('../../security/idempotencia');

function sanitizarEmpresaLgpd(valor) {
  if (!valor) return valor;
  return String(valor)
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '')
    .replace(/\b\d{11}\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function extrairCnpjSomentePj(valor) {
  if (!valor) return null;
  const digits = String(valor).replace(/\D/g, '');
  return digits.length === 14 ? String(valor).trim() : null;
}

const express = require('express');
const router = express.Router();
const dbModule = require('../../database/connection');
const pool = dbModule.pool || dbModule;
const criarPropostaUseCase = require('../../../application/use-cases/proposta/CriarPropostaUseCase');
const { verificarJWT } = require('../../security/jwt');
const { exigirTurmaAtiva } = require('../../database/verificarTurmaAtiva');
const { registrarAuditoria } = require('./warroom.routes');

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


let colunasAlcadaGarantidas = false;
async function garantirColunasAlcadaComercial(executor = pool) {
  if (colunasAlcadaGarantidas) return;
  try {
    await executor.query(`
      ALTER TABLE fichas
        ADD COLUMN IF NOT EXISTS aprovacao_comercial_status VARCHAR(30) DEFAULT 'NAO_EXIGIDA',
        ADD COLUMN IF NOT EXISTS aprovacao_comercial_por INTEGER,
        ADD COLUMN IF NOT EXISTS aprovacao_comercial_por_nome VARCHAR(150),
        ADD COLUMN IF NOT EXISTS aprovacao_comercial_em TIMESTAMP,
        ADD COLUMN IF NOT EXISTS aprovacao_comercial_parecer TEXT,
        ADD COLUMN IF NOT EXISTS motivos_alcada_json JSONB DEFAULT '[]'::jsonb
    `);
    colunasAlcadaGarantidas = true;
  } catch (e) {
    // Em transação com SET LOCAL, ignora se já existir ou tenta fora
    try {
      await pool.query(`
        ALTER TABLE fichas
          ADD COLUMN IF NOT EXISTS aprovacao_comercial_status VARCHAR(30) DEFAULT 'NAO_EXIGIDA',
          ADD COLUMN IF NOT EXISTS aprovacao_comercial_por INTEGER,
          ADD COLUMN IF NOT EXISTS aprovacao_comercial_por_nome VARCHAR(150),
          ADD COLUMN IF NOT EXISTS aprovacao_comercial_em TIMESTAMP,
          ADD COLUMN IF NOT EXISTS aprovacao_comercial_parecer TEXT,
          ADD COLUMN IF NOT EXISTS motivos_alcada_json JSONB DEFAULT '[]'::jsonb
      `);
      colunasAlcadaGarantidas = true;
    } catch (_) {}
  }
}

// REGISTRO DE PROPOSTA COMERCIAL DA ENTREVISTA (COM SUPORTE A IDEMPOTENCY-KEY E TRANSAÇÃO ÚNICA)
router.post('/propostas', async (req, res) => {
  const client = await pool.connect();
  let emTransacao = false;
  try {
    const dados = req.body || {};
    const aplicacaoId = Number(dados.aplicacaoId || dados.aplicacao_id || dados.id);
    const userInfo = extrairUsuarioRequisicao(req);
    const idempotencyKey = extrairIdempotencyKey(req);

    if (!aplicacaoId) {
      return res.status(400).json({ error: 'O participante (aplicacaoId) é obrigatório.' });
    }
    await exigirTurmaAtiva({ fichaId: aplicacaoId, turmaId: dados.turmaId || dados.turma_id || null });

    await garantirColunasAlcadaComercial();
    await client.query('BEGIN');
    emTransacao = true;
    await client.query("SET LOCAL app.user_role = 'SYSTEM'");

    // 0. Trava atômica por Idempotency-Key (impede clique duplo ou retry de rede criar 2 propostas)
    const lockIdemp = await adquirirChaveIdempotencia(client, {
      escopo: 'POST:/propostas',
      key: idempotencyKey,
      payload: {
        aplicacaoId,
        produtoId: Number(dados.produtoId || dados.produto_id || 3),
        valorTotal: dados.valorTotal ?? dados.valor_negociado,
        valorEntrada: dados.valorEntrada ?? dados.valor_entrada ?? 0,
        cashback: dados.cashback ?? 0,
        desconto: dados.desconto ?? 0
      }
    });

    if (lockIdemp.conflict) {
      await client.query('ROLLBACK');
      emTransacao = false;
      return res.status(lockIdemp.statusCode).json({ error: lockIdemp.reason });
    }

    if (lockIdemp.replay) {
      await client.query('COMMIT');
      emTransacao = false;
      res.setHeader('X-Idempotent-Replay', 'true');
      return res.status(lockIdemp.statusCode).json(lockIdemp.body);
    }

    // 1. Executa o caso de uso oficial dentro da mesma transação (salva na tabela propostas com regras e cashback)
    const propostaSalva = await criarPropostaUseCase.execute(
      {
        aplicacaoId,
        produtoId: Number(dados.produtoId || dados.produto_id || 3),
        valorTotal: dados.valorTotal ?? dados.valor_negociado,
        valorEntrada: dados.valorEntrada ?? dados.valor_entrada ?? 0,
        entradaComplementar: Number(dados.entradaComplementar ?? dados.valor_entrada_complementar ?? 0),
        permuta: Number(dados.permuta ?? dados.valor_permuta ?? 0),
        cashback: dados.cashback ?? 0,
        desconto: dados.desconto ?? 0,
        valorOriginal: dados.valorOriginal ?? dados.valor_tabela ?? dados.valorTotal,
        metodoPagamento: dados.metodoPagamento || dados.formaEntrada || dados.forma_entrada || 'Pix',
        formaPagamento: dados.metodoPagamento || dados.formaPagamento || dados.forma_entrada,
        formaRestante: dados.formaRestante || dados.forma_restante || 'Pix',
        quantidadeParcelas: dados.quantidadeParcelas || dados.parcelas || 1,
        valorParcela: dados.valorParcela ?? dados.valor_parcela
      },
      client
    );

    const turmaAlvo = dados.turmaId || dados.turma_id || null;
    if (propostaSalva?.id) {
      await client.query(
        `UPDATE propostas
         SET turma_id = COALESCE(
           $1::INT,
           (SELECT turma_id FROM aplicacoes WHERE id = $2),
           (SELECT turma_id FROM fichas WHERE id = $2),
           1491
         )
         WHERE id = $3`,
        [turmaAlvo, aplicacaoId, propostaSalva.id]
      );
    }

    // 2. Cadastra sócios externos adicionados na hora do fechamento na mesma empresa/turma
    const sociosDetalhes = Array.isArray(dados.sociosDetalhes)
      ? dados.sociosDetalhes
      : Array.isArray(dados.socios_lista)
      ? dados.socios_lista
      : [];

    const { rows: fichaBaseRows } = await client.query(
      'SELECT turma_id, empresa, cnpj, cpf_cnpj FROM fichas WHERE id = $1',
      [aplicacaoId]
    );
    const fichaBase = fichaBaseRows[0] || {};
    const empresaFinal = sanitizarEmpresaLgpd(dados.razaoSocial || dados.empresa || fichaBase.empresa || 'Empresa SGA');
    const cnpjFinal = extrairCnpjSomentePj(dados.cnpj || fichaBase.cnpj || fichaBase.cpf_cnpj);
    const turmaFinal = turmaAlvo || fichaBase.turma_id || 1491;
    const cnpjLimpo = String(cnpjFinal || '').replace(/\D/g, '');
    const empNorm = String(empresaFinal || '').trim().toLowerCase();

    for (const socio of sociosDetalhes) {
      if (socio && socio.externo && socio.entraNoContrato && socio.nome && socio.nome.trim()) {
        const { rows: jaExiste } = await client.query(
          `SELECT id FROM fichas
           WHERE turma_id = $1
             AND LOWER(TRIM(nome_participante)) = LOWER(TRIM($2))
             AND LOWER(TRIM(empresa)) = LOWER(TRIM($3))`,
          [turmaFinal, socio.nome.trim(), empresaFinal]
        );
        if (jaExiste.length === 0) {
          const { rows: novoSocio } = await client.query(
            `INSERT INTO fichas (
               turma_id, nome_participante, nome_cracha, empresa, cnpj, cpf_cnpj,
               telefone, cargo, origem, etapa_funil, ficha_fechada, fechada_em
             )
             VALUES ($1, $2, $2, $3, $4, $5, $6, 'Sócio Adicional', 'EVENTO', 'aguardando_aprovacao', true, CURRENT_TIMESTAMP)
             RETURNING id`,
            [turmaFinal, socio.nome.trim(), empresaFinal, cnpjFinal, null, socio.telefone || null]
          );
          if (novoSocio[0]) socio.id = novoSocio[0].id;
        } else {
          socio.id = jaExiste[0].id;
        }
      }
    }

    const sanitizarComp = (comp) =>
      comp && typeof comp === 'object' && comp.dataUrl
        ? {
            nome: String(comp.nome || 'comprovante').slice(0, 180),
            tipo: String(comp.tipo || 'image/jpeg').slice(0, 80),
            dataUrl: String(comp.dataUrl)
          }
        : null;

    const pagamentosEntrada = Array.isArray(dados.pagamentosEntrada)
      ? dados.pagamentosEntrada
          .filter((item) => item && (Number(item.valor || 0) > 0 || String(item.identificador || '').trim() || item.comprovante))
          .map((item) => ({
            forma: String(item.forma || 'Pix').trim(),
            valor: Number(item.valor || 0),
            identificador: String(item.identificador || '').trim(),
            comprovante: sanitizarComp(item.comprovante)
          }))
      : [];

    const primeiroCompLista = pagamentosEntrada.map((p) => p.comprovante).find(Boolean) || null;
    const comprovanteEntrada = sanitizarComp(dados.comprovanteEntrada) || primeiroCompLista;

    const idsMulti = pagamentosEntrada
      .map((p) => (p.identificador ? `${p.forma}: ${p.identificador}` : ''))
      .filter(Boolean)
      .join(' | ');

    const identificadorFinal =
      dados.identificadorPagamento || dados.identificador_pagamento || dados.cvPagamento || idsMulti || null;

    const motivosAlcada = Array.isArray(propostaSalva?.avaliacaoRegras?.motivosAlcada)
      ? [...propostaSalva.avaliacaoRegras.motivosAlcada]
      : [];
    const obsComercial = String(dados.observacoes || dados.desc_dif || dados.condicoesEspeciais || '').trim();
    if (obsComercial) {
      motivosAlcada.push(`Condição especial declarada: ${obsComercial}`);
    }
    const exigeAlcadaComercial = motivosAlcada.length > 0;
    const statusAlcadaComercial = exigeAlcadaComercial ? 'PENDENTE' : 'NAO_EXIGIDA';

    const dadosPropostaJson = JSON.stringify({
      ...propostaSalva,
      propostaId: propostaSalva?.id || null,
      produtoNome: dados.produtoNome || dados.produto_nome || null,
      categoriaProduto: dados.categoriaProduto || dados.categoria_produto || null,
      valorTabela: Number(dados.valorTabela ?? dados.valor_tabela ?? propostaSalva.valorTotal) || 0,
      desconto: Number(dados.desconto ?? 0) || 0,
      cashbackAlmoco: Number(dados.cashbackAlmoco ?? 0) || 0,
      cashbackUpgrade: Number(dados.cashbackUpgrade ?? 0) || 0,
      historicoProdutosElegiveis: dados.historicoProdutosElegiveis || '',
      formaEntrada: dados.formaEntrada || dados.forma_entrada || 'Pix',
      formaRestante: dados.formaRestante || dados.forma_restante || 'Pix',
      permuta: Number(dados.permuta ?? dados.valor_permuta ?? 0),
      entradaComplementar: Number(dados.entradaComplementar ?? dados.valor_entrada_complementar ?? 0),
      dataEntradaComplementar: dados.dataEntradaComplementar || dados.data_entrada_complementar || null,
      identificadorPagamento: identificadorFinal,
      pagamentosEntrada,
      comprovanteEntrada,
      observacoes: obsComercial || null,
      exigeAlcadaComercial,
      motivosAlcada,
      socios: dados.socios || dados.socios_quantidade || 1,
      sociosDetalhes,
      cnpj: cnpjFinal
    });

    // 3. Atualiza a ficha principal com o pacote consolidado, fecha a ficha e aguarda aprovação financeira
    await client.query(
      `UPDATE fichas
       SET empresa = COALESCE(NULLIF($4, ''), empresa),
           cnpj = COALESCE(NULLIF($5, ''), cnpj),
           valor_negociado = $1,
           desconto_concedido = $6,
           cashback = $7,
           etapa_funil = 'aguardando_aprovacao',
            status_aprovacao = 'pendente',
            aprovacao_comercial_status = $10::varchar,
            aprovacao_comercial_por = NULL,
            aprovacao_comercial_por_nome = NULL,
            aprovacao_comercial_em = NULL,
            aprovacao_comercial_parecer = NULL,
            motivos_alcada_json = $11::jsonb,
            ficha_fechada = true,
           fechada_em = CURRENT_TIMESTAMP,
           fechada_por = COALESCE($8, fechada_por),
           mesa_alocada = NULL,
           assento_alocado = NULL,
           dados_proposta = $2::jsonb,
           cv_cartao = COALESCE(NULLIF($9::varchar, ''), cv_cartao),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [
        propostaSalva.valorTotal,
        dadosPropostaJson,
        aplicacaoId,
        empresaFinal,
        cnpjFinal,
        Number(dados.desconto ?? 0) || 0,
        Number(dados.cashback ?? 0) || 0,
        userInfo.id,
        identificadorFinal,
        statusAlcadaComercial,
        JSON.stringify(motivosAlcada)
      ]
    );

    // 4. Libera mesa e fecha fichas de todos os sócios do mesmo CNPJ/Empresa na turma
    await client.query(
      `UPDATE fichas
       SET mesa_alocada = NULL,
           assento_alocado = NULL,
           ficha_fechada = true,
           fechada_em = COALESCE(fechada_em, CURRENT_TIMESTAMP),
           etapa_funil = CASE
             WHEN etapa_funil IN ('novo', 'almoco', 'entrevista', 'em_entrevista') THEN 'aguardando_aprovacao'
             ELSE etapa_funil
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE turma_id = $1::int
         AND id <> $2::int
         AND (
           ($3::text <> '' AND LENGTH($3::text) >= 11 AND regexp_replace(COALESCE(cnpj, cpf_cnpj, ''), '\D', '', 'g') = $3::text)
           OR ($4::text <> '' AND $4::text NOT IN ('empresa sga', 'sem empresa', 'empresa não informada', 'empresa nao informada') AND LOWER(TRIM(COALESCE(empresa, ''))) = $4::text)
         )`,
      [turmaFinal, aplicacaoId, cnpjLimpo, empNorm]
    );

    if (!propostaSalva?.idempotentReplay) {
      await registrarAuditoria(client, {
        turmaId: turmaFinal,
        fichaId: aplicacaoId,
        empresa: empresaFinal,
        cnpj: cnpjFinal,
        acao: 'EMISSAO_PROPOSTA',
        detalhes: `Produto: ${dados.produtoNome || dados.produto_nome || dados.categoriaProduto || 'Plano'} | Negociado: R$ ${Number(propostaSalva.valorTotal || 0).toFixed(2)}${exigeAlcadaComercial ? ' | [AGUARDA GESTOR COMERCIAL: ' + motivosAlcada.join('; ') + ']' : ' | [LIBERADA P/ FINANCEIRO]'}`,
        req
      });
    }

    const statusHttp = propostaSalva?.idempotentReplay ? 200 : 201;
    const respostaPayload = {
      ...propostaSalva,
      ficha_fechada: true,
      mesa_liberada: true
    };

    await concluirChaveIdempotencia(client, lockIdemp.keyId, statusHttp, respostaPayload);

    await client.query('COMMIT');
    emTransacao = false;
    res.status(statusHttp).json(respostaPayload);
  } catch (err) {
    if (emTransacao) {
      await client.query('ROLLBACK');
    }
    res.status(400).json({ error: 'Erro ao emitir proposta comercial: ' + err.message });
  } finally {
    client.release();
  }
});

// WEBHOOK IDEMPOTENTE DE GATEWAYS DE PAGAMENTO (STRIPE / MERCADO PAGO / PIX / CARTÃO)
router.post('/webhooks/pagamentos', async (req, res) => {
  const validacaoAssinatura = verificarAssinaturaWebhook(req);
  if (!validacaoAssinatura.valido) {
    return res.status(401).json({ error: validacaoAssinatura.motivo });
  }

  const body = req.body || {};
  const payloadHash = gerarHashSha256(req.rawBody || body);
  const eventId = String(
    body.id ||
      body.event_id ||
      body.eventId ||
      req.headers?.['x-request-id'] ||
      req.headers?.['idempotency-key'] ||
      `hash_${payloadHash}`
  ).slice(0, 180);
  const eventType = String(body.type || body.action || body.event || 'payment.confirmed').slice(0, 100);
  const provider = validacaoAssinatura.provider || 'gateway';

  const client = await pool.connect();
  let emTransacao = false;
  try {
    await client.query('BEGIN');
    emTransacao = true;
    await client.query("SET LOCAL app.user_role = 'SYSTEM'");
    await garantirTabelasIdempotencia(client);

    // 1. Garantia atômica de processamento único do evento (Unique Constraint)
    const { rows: insertedEvent } = await client.query(
      `INSERT INTO webhook_events (provider, event_id, event_type, payload_hash, status, raw_payload)
       VALUES ($1, $2, $3, $4, 'PROCESSING', $5::jsonb)
       ON CONFLICT (provider, event_id) DO NOTHING
       RETURNING id`,
      [provider, eventId, eventType, payloadHash, JSON.stringify(body)]
    );

    if (insertedEvent.length === 0) {
      const { rows: jaProcessado } = await client.query(
        `SELECT id, status, resultado, processed_at
         FROM webhook_events
         WHERE provider = $1 AND event_id = $2`,
        [provider, eventId]
      );
      await client.query('COMMIT');
      emTransacao = false;
      return res.status(200).json({
        received: true,
        duplicate: true,
        eventId,
        status: jaProcessado[0]?.status || 'PROCESSED',
        resultado: jaProcessado[0]?.resultado || null
      });
    }

    const webhookRecordId = insertedEvent[0].id;
    const dataObj = body.data?.object || body.data || body;
    const metadata = dataObj.metadata || body.metadata || {};
    const fichaId = Number(metadata.fichaId || metadata.ficha_id || metadata.aplicacaoId || metadata.aplicacao_id || body.fichaId || 0) || null;
    const propostaId = Number(metadata.propostaId || metadata.proposta_id || body.propostaId || 0) || null;
    const txId = String(dataObj.id || dataObj.payment_intent || dataObj.nsu || body.transaction_id || '').trim();

    let resultadoProcessamento = {
      acao: 'evento_registrado',
      fichaId,
      propostaId,
      transactionId: txId || null
    };

    const eventosConfirmacao = new Set([
      'payment_intent.succeeded',
      'checkout.session.completed',
      'charge.succeeded',
      'payment.created',
      'payment.updated',
      'payment.confirmed',
      'pix.paid'
    ]);

    const statusPagamento = String(dataObj.status || body.status || '').toLowerCase();
    const pagoConfirmado =
      eventosConfirmacao.has(eventType.toLowerCase()) &&
      (!statusPagamento || ['succeeded', 'paid', 'approved', 'confirmed', 'completed'].includes(statusPagamento));

    if (pagoConfirmado && (fichaId || propostaId)) {
      let fichaAlvoId = fichaId;
      if (!fichaAlvoId && propostaId) {
        const { rows: pRows } = await client.query('SELECT aplicacao_id FROM propostas WHERE id = $1', [propostaId]);
        fichaAlvoId = pRows[0]?.aplicacao_id || null;
      }

      if (fichaAlvoId) {
        const { rows: fichaRows } = await client.query(
          `SELECT id, turma_id, empresa, COALESCE(NULLIF(TRIM(cnpj), ''), NULLIF(TRIM(cpf_cnpj), '')) AS doc_cnpj
           FROM fichas WHERE id = $1 FOR UPDATE`,
          [fichaAlvoId]
        );

        if (fichaRows.length > 0) {
          const base = fichaRows[0];
          const cnpjLimpo = String(base.doc_cnpj || '').replace(/\D/g, '');
          const empNorm = String(base.empresa || '').trim().toLowerCase();

          await client.query(
            `UPDATE fichas
             SET etapa_funil = 'concluido',
                 status_aprovacao = 'aprovada',
                 ficha_fechada = true,
                 cv_cartao = COALESCE(NULLIF($1::varchar, ''), cv_cartao),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
                OR (
                  turma_id = $3
                  AND (
                    ($4 <> '' AND LENGTH($4) >= 11 AND regexp_replace(COALESCE(cnpj, cpf_cnpj, ''), '\D', '', 'g') = $4)
                    OR ($4 = '' AND $5 <> '' AND $5 <> 'empresa sga' AND LOWER(TRIM(COALESCE(empresa, ''))) = $5)
                  )
                )`,
            [txId, fichaAlvoId, base.turma_id, cnpjLimpo, empNorm]
          );

          await client.query(
            `UPDATE propostas
             SET status = 'aprovado'::status_prop
             WHERE aplicacao_id = $1 AND status = 'enviado_financeiro'::status_prop`,
            [fichaAlvoId]
          );

          await registrarAuditoria(client, {
            turmaId: base.turma_id,
            fichaId: fichaAlvoId,
            empresa: base.empresa,
            cnpj: base.doc_cnpj,
            acao: 'WEBHOOK_PAGAMENTO_CONFIRMADO',
            detalhes: `Gateway: ${provider} | Evento: ${eventId} | TX: ${txId || 'N/A'}`,
            req
          });

          resultadoProcessamento = {
            acao: 'venda_confirmada_por_webhook',
            fichaId: fichaAlvoId,
            propostaId,
            transactionId: txId || null
          };
        }
      }
    }

    await client.query(
      `UPDATE webhook_events
       SET status = 'PROCESSED',
           proposta_id = $1,
           ficha_id = $2,
           resultado = $3::jsonb,
           processed_at = NOW()
       WHERE id = $4`,
      [propostaId, resultadoProcessamento.fichaId || fichaId, JSON.stringify(resultadoProcessamento), webhookRecordId]
    );

    await client.query('COMMIT');
    emTransacao = false;
    return res.status(200).json({
      received: true,
      duplicate: false,
      eventId,
      resultado: resultadoProcessamento
    });
  } catch (err) {
    if (emTransacao) {
      await client.query('ROLLBACK');
    }
    return res.status(500).json({ error: 'Falha ao processar webhook idempotente: ' + err.message });
  } finally {
    client.release();
  }
});

// APROVAÇÃO / VENDA DE PROPOSTA (UNIFICADA POR EMPRESA/CNPJ)
router.patch('/propostas/:id/vender', exigirPapeis('ADMIN', 'FINANCEIRO'), async (req, res) => {
  const client = await pool.connect();
  let emTransacao = false;
  try {
    const id = Number(req.params.id);
    const idempotencyKey = extrairIdempotencyKey(req);
    await exigirTurmaAtiva({ fichaId: id });
    await client.query('BEGIN');
    emTransacao = true;
    await client.query("SET LOCAL app.user_role = 'SYSTEM'");

    const lockIdemp = await adquirirChaveIdempotencia(client, {
      escopo: `PATCH:/propostas/${id}/vender`,
      key: idempotencyKey,
      payload: { id, body: req.body || {} }
    });

    if (lockIdemp.conflict) {
      await client.query('ROLLBACK');
      emTransacao = false;
      return res.status(lockIdemp.statusCode).json({ error: lockIdemp.reason });
    }

    if (lockIdemp.replay) {
      await client.query('COMMIT');
      emTransacao = false;
      res.setHeader('X-Idempotent-Replay', 'true');
      return res.status(lockIdemp.statusCode).json(lockIdemp.body);
    }

    const { rows: baseRows } = await client.query(
      `SELECT id, turma_id, empresa, COALESCE(NULLIF(TRIM(cnpj), ''), NULLIF(TRIM(cpf_cnpj), '')) AS doc_cnpj
       FROM fichas WHERE id = $1 FOR UPDATE`,
      [id]
    );

    if (baseRows.length === 0) {
      await client.query('ROLLBACK');
      emTransacao = false;
      return res.status(404).json({ error: 'Ficha não encontrada.' });
    }

    const base = baseRows[0];
    const cnpjLimpo = String(base.doc_cnpj || '').replace(/\D/g, '');
    const empNorm = String(base.empresa || '').trim().toLowerCase();

    const { rows } = await client.query(
      `UPDATE fichas
       SET etapa_funil = 'concluido',
           status_aprovacao = 'aprovada',
           ficha_fechada = true,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
          OR (
            turma_id = $2
            AND (
              ($3 <> '' AND LENGTH($3) >= 11 AND regexp_replace(COALESCE(cnpj, cpf_cnpj, ''), '\D', '', 'g') = $3)
              OR ($3 = '' AND $4 <> '' AND $4 <> 'empresa sga' AND LOWER(TRIM(COALESCE(empresa, ''))) = $4)
            )
          )
       RETURNING *`,
      [id, base.turma_id, cnpjLimpo, empNorm]
    );

    const resposta = rows.find((r) => Number(r.id) === id) || rows[0] || { sucesso: true };
    await concluirChaveIdempotencia(client, lockIdemp.keyId, 200, resposta);

    await client.query('COMMIT');
    emTransacao = false;
    res.json(resposta);
  } catch (err) {
    if (emTransacao) {
      await client.query('ROLLBACK');
    }
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// LISTAGEM UNIFICADA POR EMPRESA (CNPJ) PARA FILA DE APROVAÇÕES & ANÁLISE DE CRÉDITO
router.get('/financeiro/propostas', async (req, res) => {
  await garantirColunasAlcadaComercial();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL app.user_role = 'SYSTEM'");

    const turmaFiltro = req.query.turmaId ? Number(req.query.turmaId) : null;

    const { rows } = await client.query(
      `WITH base_fichas AS (
        SELECT
          f.id, f.turma_id, f.nome_participante, f.nome_cracha, f.empresa, f.cnpj, f.cpf_cnpj,
          f.telefone, f.email, f.cargo, f.origem, f.membro_giants, f.almoco_pago, f.valor_almoco,
          f.cv_cartao, f.cashback, f.desconto_concedido, f.valor_negociado, f.etapa_funil,
          f.status_aprovacao, f.analise_credito_status, f.status_serasa_codigo, f.status_serasa_texto,
          f.parecer_financeiro, f.ficha_fechada, f.updated_at,
          aprovacao_comercial_status, aprovacao_comercial_por, aprovacao_comercial_por_nome,
          aprovacao_comercial_em, aprovacao_comercial_parecer, motivos_alcada_json,
          CASE
            WHEN jsonb_typeof(f.dados_proposta->'pagamentosEntrada') = 'array' THEN
              jsonb_set(
                (f.dados_proposta - 'comprovanteEntrada'),
                '{pagamentosEntrada}',
                COALESCE(
                  (
                    SELECT jsonb_agg(
                      CASE
                        WHEN (elem ? 'comprovante') AND jsonb_typeof(elem->'comprovante') = 'object' THEN
                          (elem - 'comprovante') || jsonb_build_object(
                            'temComprovante', true,
                            'comprovanteNome', COALESCE(elem->'comprovante'->>'nome', 'comprovante')
                          )
                        ELSE elem
                      END
                    )
                    FROM jsonb_array_elements(f.dados_proposta->'pagamentosEntrada') AS elem
                  ),
                  '[]'::jsonb
                )
              )
            ELSE (f.dados_proposta - 'comprovanteEntrada')
          END AS dados_proposta,
          (f.dados_proposta ? 'comprovanteEntrada') AS tem_comprovante,
          (f.dados_proposta->'comprovanteEntrada'->>'nome') AS comprovante_nome,
          p.id AS proposta_real_id,
          p.valor_total AS proposta_valor_total,
          p.valor_entrada AS proposta_valor_entrada,
          p.cashback AS proposta_cashback,
          p.desconto_aplicado AS proposta_desconto,
          p.quantidade_parcelas AS proposta_parcelas,
          p.valor_parcela AS proposta_valor_parcela,
          p.metodo_pagamento AS proposta_metodo_pagamento,
          af.status_serasa AS af_status_serasa,
          af.decisao_financeiro AS af_decisao_financeiro,
          af.parecer AS af_parecer,
          af.score_serasa AS af_score_serasa,
          af.motivo_recusa AS af_motivo_recusa,
          af.observacoes_auditoria AS af_observacoes_auditoria,
          COALESCE(
            NULLIF(f.dados_proposta->>'produtoNome', ''),
            (SELECT pr.nome FROM produtos pr WHERE pr.id = COALESCE(p.produto_id, NULLIF(f.dados_proposta->>'produtoId', '')::int)),
            'GIANTS'
          ) AS produto_nome,
          CASE
            WHEN COALESCE(f.membro_giants, false) = true OR UPPER(TRIM(COALESCE(f.origem, ''))) = 'GIANTS'
              THEN 'giants:id:' || f.id::text
            WHEN LENGTH(regexp_replace(COALESCE(f.cnpj, f.cpf_cnpj, ''), '\D', '', 'g')) = 14
              THEN 'cnpj:' || regexp_replace(COALESCE(f.cnpj, f.cpf_cnpj, ''), '\D', '', 'g')
            WHEN LOWER(TRIM(COALESCE(f.empresa, ''))) NOT IN ('', 'empresa sga', 'sem empresa')
              THEN 'emp:' || LOWER(TRIM(f.empresa))
            ELSE 'id:' || f.id::text
          END AS chave_empresa
        FROM fichas f
        LEFT JOIN LATERAL (
          SELECT * FROM propostas pr
          WHERE pr.aplicacao_id = f.id
          ORDER BY pr.id DESC
          LIMIT 1
        ) p ON TRUE
        LEFT JOIN analises_financeiras af ON af.proposta_id = p.id
        WHERE ($1::INT IS NULL OR f.turma_id = $1::INT)
          AND f.etapa_funil NOT IN ('decisao_futura', 'nao_fechou')
          AND (
            f.dados_proposta IS NOT NULL
            OR p.id IS NOT NULL
            OR f.etapa_funil IN ('aguardando_aprovacao', 'fechamento', 'concluido')
          )
      ),
      unificadas AS (
        SELECT DISTINCT ON (COALESCE(turma_id, 0), chave_empresa)
          *
        FROM base_fichas
        ORDER BY
          COALESCE(turma_id, 0),
          chave_empresa,
          (CASE WHEN dados_proposta IS NOT NULL OR proposta_real_id IS NOT NULL THEN 0 ELSE 1 END),
          COALESCE(valor_negociado, 0) DESC,
          id ASC
      )
      SELECT u.*,
        (
          SELECT COALESCE(json_agg(json_build_object('id', s.id, 'nome', s.nome_participante, 'cargo', s.cargo) ORDER BY s.id ASC), '[]'::json)
          FROM base_fichas s
          WHERE COALESCE(s.turma_id, 0) = COALESCE(u.turma_id, 0)
            AND s.chave_empresa = u.chave_empresa
        ) AS socios_empresa
      FROM unificadas u
      ORDER BY
        CASE WHEN COALESCE(NULLIF(u.status_aprovacao, ''), 'pendente') = 'pendente' THEN 0 ELSE 1 END,
        u.updated_at DESC NULLS LAST,
        u.id DESC`,
      [turmaFiltro]
    );

    await client.query('COMMIT');
    res.json(rows);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ETAPA 1: DELIBERAÇÃO DE ALÇADA COMERCIAL (GESTOR / APROVADOR / ADMIN)
router.post('/comercial/analisar', exigirPapeis('ADMIN', 'APROVADOR'), async (req, res) => {
  await garantirColunasAlcadaComercial();
  const client = await pool.connect();
  try {
    const { proposta_id, fichaId, decisao, parecer } = req.body;
    const targetId = Number(proposta_id || fichaId);
    const userInfo = extrairUsuarioRequisicao(req);

    if (!targetId || !decisao) {
      return res.status(400).json({ error: 'Parâmetros obrigatórios ausentes (ficha/proposta e decisão comercial).' });
    }
    await exigirTurmaAtiva({ fichaId: targetId });

    const decNorm = String(decisao).trim().toLowerCase();
    const aprovouComercial = decNorm === 'aprovado' || decNorm === 'aprovada' || decNorm === 'aprovar';
    const recusouComercial = decNorm === 'recusado' || decNorm === 'recusada' || decNorm === 'recusar' || decNorm === 'negado';

    if (!aprovouComercial && !recusouComercial) {
      return res.status(400).json({ error: 'Decisão comercial inválida. Informe "aprovado" ou "recusado".' });
    }

    const parecerTexto = String(parecer || '').trim();
    if (recusouComercial && !parecerTexto) {
      return res.status(400).json({ error: 'Informe a justificativa comercial antes de recusar a condição negociada.' });
    }

    await client.query('BEGIN');
    await client.query("SET LOCAL app.user_role = 'SYSTEM'");

    const { rows: userRows } = await client.query('SELECT nome FROM usuarios WHERE id = $1', [userInfo.id]);
    const nomeAprovador = userRows[0]?.nome || req.usuario?.nome || 'Gestor Comercial';

    const { rows: atual } = await client.query(
      `SELECT id, turma_id, empresa,
              COALESCE(NULLIF(TRIM(cnpj), ''), NULLIF(TRIM(cpf_cnpj), '')) AS doc_cnpj,
              status_aprovacao, aprovacao_comercial_status
       FROM fichas WHERE id = $1 FOR UPDATE`,
      [targetId]
    );

    if (atual.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Ficha não encontrada.' });
    }

    const base = atual[0];
    const cnpjLimpo = String(base.doc_cnpj || '').replace(/\D/g, '');
    const empNorm = String(base.empresa || '').trim().toLowerCase();

    const novoComercialStatus = aprovouComercial ? 'APROVADA' : 'RECUSADA';
    const novoStatusGeral = aprovouComercial ? 'pendente' : 'recusada';
    const novaEtapa = aprovouComercial ? 'aguardando_aprovacao' : 'negociacao';

    const { rows } = await client.query(
      `UPDATE fichas
       SET aprovacao_comercial_status = $1::varchar,
           aprovacao_comercial_por = $2::int,
           aprovacao_comercial_por_nome = $3::varchar,
           aprovacao_comercial_em = CURRENT_TIMESTAMP,
           aprovacao_comercial_parecer = NULLIF($4::text, ''),
           status_aprovacao = $5::varchar,
           etapa_funil = $6::varchar,
           ficha_fechada = CASE WHEN $1::text = 'RECUSADA' THEN false ELSE ficha_fechada END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7::int
          OR (
            turma_id = $8::int
            AND (
              ($9::text <> '' AND LENGTH($9::text) >= 11 AND regexp_replace(COALESCE(cnpj, cpf_cnpj, ''), '\D', '', 'g') = $9::text)
              OR ($9::text = '' AND $10::text <> '' AND $10::text <> 'empresa sga' AND LOWER(TRIM(COALESCE(empresa, ''))) = $10::text)
            )
          )
       RETURNING *`,
      [
        novoComercialStatus,
        userInfo.id,
        nomeAprovador,
        parecerTexto,
        novoStatusGeral,
        novaEtapa,
        targetId,
        base.turma_id,
        cnpjLimpo,
        empNorm
      ]
    );

    if (recusouComercial) {
      await client.query(
        `UPDATE propostas SET status = 'recusado'::status_prop WHERE aplicacao_id = $1`,
        [targetId]
      );
    }

    await registrarAuditoria(client, {
      turmaId: base.turma_id,
      fichaId: targetId,
      empresa: base.empresa,
      cnpj: base.doc_cnpj,
      acao: aprovouComercial ? 'APROVACAO_ALCADA_COMERCIAL' : 'RECUSA_ALCADA_COMERCIAL',
      detalhes: `Gestor: ${nomeAprovador} | Decisão: ${novoComercialStatus}${parecerTexto ? ' | Obs: ' + parecerTexto : ''}`,
      req
    });

    await client.query('COMMIT');
    res.json(rows.find((r) => Number(r.id) === targetId) || rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ETAPA 2: DELIBERAÇÃO FINANCEIRA + ANÁLISE DE CRÉDITO / STATUS SERASA (FINANCEIRO / ADMIN)
router.post('/financeiro/analisar', exigirPapeis('ADMIN', 'FINANCEIRO'), async (req, res) => {
  await garantirColunasAlcadaComercial();
  const client = await pool.connect();
  try {
    const {
      proposta_id,
      fichaId,
      decisao,
      analise_credito_status,
      status_serasa_codigo,
      status_serasa_texto,
      score_serasa,
      parecer,
      condicao_especial
    } = req.body;

    const targetId = Number(proposta_id || fichaId);
    const userInfo = extrairUsuarioRequisicao(req);

    if (!targetId || !decisao) {
      return res.status(400).json({ error: 'Parâmetros obrigatórios ausentes (ficha/proposta e decisão).' });
    }
    await exigirTurmaAtiva({ fichaId: targetId });

    const decNorm = String(decisao).trim().toLowerCase();
    let novoStatus = 'aprovada';
    let novaEtapa = 'fechamento';
    let decisaoFinLabel = 'APROVADO';

    if (decNorm === 'aprovado_com_ressalva' || decNorm === 'ressalva') {
      novoStatus = 'aprovada_com_ressalva';
      novaEtapa = 'fechamento';
      decisaoFinLabel = 'APROVADO COM RESSALVA';
    } else if (decNorm === 'recusado' || decNorm === 'recusar' || decNorm === 'negado') {
      novoStatus = 'recusada';
      novaEtapa = 'negociacao';
      decisaoFinLabel = 'NEGADO';
    }

    const creditoStatusFinal = String(
      analise_credito_status || (novoStatus === 'recusada' ? 'NEGADO' : 'APROVADO')
    ).toUpperCase();

    const serasaEnumValidos = new Set([
      'pendente',
      'sem_restricao',
      'com_restricao',
      'reprovado',
      'score_alto_sem_restricao',
      'score_medio_atencao',
      'score_baixo_restricao_grave',
      'restricao_impeditiva'
    ]);
    const serasaCodigo = serasaEnumValidos.has(String(status_serasa_codigo || '').toLowerCase())
      ? String(status_serasa_codigo).toLowerCase()
      : (creditoStatusFinal === 'NEGADO' ? 'com_restricao' : 'sem_restricao');

    const serasaTextoFinal = String(status_serasa_texto || '').trim();
    const parecerFinal = [parecer, condicao_especial ? `Condição / Ressalva: ${condicao_especial}` : '']
      .filter(Boolean)
      .join(' | ')
      .trim();

    await client.query('BEGIN');
    await client.query("SET LOCAL app.user_role = 'SYSTEM'");

    const { rows: atual } = await client.query(
      `SELECT id, turma_id, empresa,
              COALESCE(NULLIF(TRIM(cnpj), ''), NULLIF(TRIM(cpf_cnpj), '')) AS doc_cnpj,
              status_aprovacao, etapa_funil, aprovacao_comercial_status
       FROM fichas WHERE id = $1 FOR UPDATE`,
      [targetId]
    );
    if (atual.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Ficha não encontrada.' });
    }

    const base = atual[0];
    if (String(base.aprovacao_comercial_status || '').toUpperCase() === 'PENDENTE' && novoStatus !== 'recusada') {
      await client.query('ROLLBACK');
      return res.status(403).json({
        error: 'Alçada Comercial Pendente: esta proposta possui exceção comercial (desconto, entrada abaixo de 1 parcela ou condição especial) e aguarda aprovação prévia do Gestor Comercial antes da liberação financeira.'
      });
    }
    const cnpjLimpo = String(base.doc_cnpj || '').replace(/\D/g, '');
    const empNorm = String(base.empresa || '').trim().toLowerCase();

    // Atualiza a ficha principal e sincroniza todos os sócios do mesmo CNPJ/Empresa na turma
    const { rows } = await client.query(
      `UPDATE fichas
       SET mesa_alocada = NULL,
           assento_alocado = NULL,
           status_aprovacao = $1::varchar,
           etapa_funil = $2::varchar,
           analise_credito_status = $3::varchar,
           status_serasa_codigo = $4::varchar,
           status_serasa_texto = NULLIF($5::text, ''),
           parecer_financeiro = NULLIF($6::text, ''),
           ficha_fechada = CASE WHEN $1::text = 'recusada' THEN false ELSE true END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7::int
          OR (
            turma_id = $8::int
            AND (
              ($9::text <> '' AND LENGTH($9::text) >= 11 AND regexp_replace(COALESCE(cnpj, cpf_cnpj, ''), '\D', '', 'g') = $9::text)
              OR ($9::text = '' AND $10::text <> '' AND $10::text <> 'empresa sga' AND LOWER(TRIM(COALESCE(empresa, ''))) = $10::text)
            )
          )
       RETURNING *`,
      [novoStatus, novaEtapa, creditoStatusFinal, serasaCodigo, serasaTextoFinal, parecerFinal, targetId, base.turma_id, cnpjLimpo, empNorm]
    );

    // Sincroniza proposta e tabela analises_financeiras
    const { rows: propRows } = await client.query(
      'SELECT id FROM propostas WHERE aplicacao_id = $1 ORDER BY id DESC LIMIT 1',
      [targetId]
    );

    if (propRows.length > 0) {
      const propId = propRows[0].id;
      const statusPropEnum = novoStatus === 'recusada' ? 'recusado' : 'aprovado';
      await client.query(
        `UPDATE propostas
         SET status = $1::status_prop,
             condicoes_especiais = COALESCE(NULLIF($2::text, ''), condicoes_especiais)
         WHERE id = $3::int`,
        [statusPropEnum, condicao_especial || parecerFinal, propId]
      );

      await client.query(
        `INSERT INTO analises_financeiras (
           proposta_id, analista_id, status_serasa, decisao_financeiro,
           parecer, analisado_em, score_serasa, aprovado, motivo_recusa, observacoes_auditoria
         ) VALUES ($1::int, $2::int, $3::status_serasa_tipo, $4::varchar, $5::text, CURRENT_TIMESTAMP, $6::int, $7::boolean, $8::text, $9::text)
         ON CONFLICT (proposta_id) DO UPDATE SET
           analista_id = COALESCE(EXCLUDED.analista_id, analises_financeiras.analista_id),
           status_serasa = EXCLUDED.status_serasa,
           decisao_financeiro = EXCLUDED.decisao_financeiro,
           parecer = EXCLUDED.parecer,
           analisado_em = CURRENT_TIMESTAMP,
           score_serasa = COALESCE(EXCLUDED.score_serasa, analises_financeiras.score_serasa),
           aprovado = EXCLUDED.aprovado,
           motivo_recusa = EXCLUDED.motivo_recusa,
           observacoes_auditoria = EXCLUDED.observacoes_auditoria`,
        [
          propId,
          userInfo.id,
          serasaCodigo,
          decisaoFinLabel,
          parecerFinal || serasaTextoFinal || decisaoFinLabel,
          score_serasa ? Number(score_serasa) : null,
          novoStatus !== 'recusada',
          novoStatus === 'recusada' ? (parecerFinal || serasaTextoFinal || 'Recusado na análise de crédito') : null,
          serasaTextoFinal || null
        ]
      );
    }

    await client.query('COMMIT');
    res.json(rows.find((r) => Number(r.id) === targetId) || rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});


// CONSULTA DE COMPROVANTE ANEXADO NA PROPOSTA
router.get('/financeiro/propostas/:id/comprovante', async (req, res) => {
  const client = await pool.connect();
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });

    await client.query('BEGIN');
    await client.query("SET LOCAL app.user_role = 'SYSTEM'");
    const indice = req.query.indice !== undefined ? parseInt(req.query.indice, 10) : null;
    const { rows } = await client.query(
      `SELECT id, empresa,
              dados_proposta->'comprovanteEntrada' AS comprovante_geral,
              dados_proposta->'pagamentosEntrada' AS pagamentos_entrada
       FROM fichas WHERE id = $1::int`,
      [id]
    );
    await client.query('COMMIT');

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Proposta não encontrada.' });
    }

    const pags = Array.isArray(rows[0].pagamentos_entrada) ? rows[0].pagamentos_entrada : [];
    let compEscolhido = null;

    if (indice !== null && !isNaN(indice) && pags[indice]?.comprovante) {
      compEscolhido = pags[indice].comprovante;
    } else {
      compEscolhido =
        rows[0].comprovante_geral ||
        pags.map((p) => p?.comprovante).find(Boolean) ||
        null;
    }

    if (!compEscolhido) {
      return res.status(404).json({ error: 'Nenhum comprovante anexado para esta forma de pagamento.' });
    }
    return res.json(compEscolhido);
  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DEVOLUÇÃO DE PROPOSTA PARA AJUSTE NA MESA (FINANCEIRO / APROVADOR / ADMIN)
router.post('/financeiro/devolver', exigirPapeis('FINANCEIRO', 'APROVADOR', 'ADMIN'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { fichaId, proposta_id, motivo } = req.body;
    const targetId = Number(fichaId || proposta_id);
    const motivoLimpo = String(motivo || '').trim();

    if (!targetId || !motivoLimpo) {
      return res.status(400).json({ error: 'Informe a proposta e o motivo da devolução para ajuste.' });
    }

    await exigirTurmaAtiva({ fichaId: targetId });
    const userInfo = extrairUsuarioRequisicao(req);

    await client.query('BEGIN');
    await client.query("SET LOCAL app.user_role = 'SYSTEM'");

    const { rows: atual } = await client.query(
      `SELECT id, turma_id, empresa,
              COALESCE(NULLIF(TRIM(cnpj), ''), NULLIF(TRIM(cpf_cnpj), '')) AS doc_cnpj
       FROM fichas WHERE id = $1::int FOR UPDATE`,
      [targetId]
    );
    if (atual.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Ficha/proposta não encontrada.' });
    }

    const base = atual[0];
    const cnpjLimpo = String(base.doc_cnpj || '').replace(/\D/g, '');
    const empNorm = String(base.empresa || '').trim().toLowerCase();

    const { rows } = await client.query(
      `UPDATE fichas
       SET status_aprovacao = 'ajuste_solicitado',
           etapa_funil = 'em_entrevista',
           ficha_fechada = false,
           parecer_financeiro = $1::text,
           dados_proposta = COALESCE(dados_proposta, '{}'::jsonb) || jsonb_build_object(
             'motivoDevolucao', $1::text,
             'devolvidoEm', CURRENT_TIMESTAMP
           ),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2::int
          OR (
            turma_id = $3::int
            AND (
              ($4::text <> '' AND LENGTH($4::text) >= 11 AND regexp_replace(COALESCE(cnpj, cpf_cnpj, ''), '\D', '', 'g') = $4::text)
              OR ($4::text = '' AND $5::text <> '' AND $5::text <> 'empresa sga' AND LOWER(TRIM(COALESCE(empresa, ''))) = $5::text)
            )
          )
       RETURNING *`,
      [motivoLimpo, targetId, base.turma_id, cnpjLimpo, empNorm]
    );

    await registrarAuditoria(client, {
      turmaId: base.turma_id,
      fichaId: targetId,
      empresa: base.empresa,
      cnpj: base.doc_cnpj,
      acao: 'DEVOLUCAO_AJUSTE',
      detalhes: `Proposta devolvida para ajuste na mesa (${userInfo.papel || 'FINANCEIRO'}): ${motivoLimpo}`,
      req
    });

    await client.query('COMMIT');
    return res.json({ sucesso: true, ficha: rows.find((r) => Number(r.id) === targetId) || rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;

