const express = require('express');
const router = express.Router();
const dbModule = require('../../database/connection');
const pool = dbModule.pool || dbModule;
const criarPropostaUseCase = require('../../../application/use-cases/proposta/CriarPropostaUseCase');
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

// REGISTRO DE PROPOSTA COMERCIAL DA ENTREVISTA
router.post('/propostas', async (req, res) => {
  const client = await pool.connect();
  try {
    const dados = req.body;
    const aplicacaoId = Number(dados.aplicacaoId || dados.aplicacao_id || dados.id);
    const userInfo = extrairUsuarioRequisicao(req);

    if (!aplicacaoId) {
      return res.status(400).json({ error: 'O participante (aplicacaoId) é obrigatório.' });
    }

    // 1. Executa o caso de uso oficial (salva na tabela propostas com regras e cashback)
    const propostaSalva = await criarPropostaUseCase.execute({
      aplicacaoId,
      produtoId: Number(dados.produtoId || dados.produto_id || 3),
      valorTotal: dados.valorTotal ?? dados.valor_negociado,
      valorEntrada: dados.valorEntrada ?? dados.valor_entrada ?? 0,
      cashback: dados.cashback ?? 0,
      desconto: dados.desconto ?? 0,
      valorOriginal: dados.valorOriginal ?? dados.valor_tabela ?? dados.valorTotal,
      metodoPagamento: dados.metodoPagamento || dados.formaEntrada || dados.forma_entrada || 'Pix',
      formaPagamento: dados.metodoPagamento || dados.formaPagamento || dados.forma_entrada,
      quantidadeParcelas: dados.quantidadeParcelas || dados.parcelas || 1,
      valorParcela: dados.valorParcela ?? dados.valor_parcela
    });

    await client.query('BEGIN');
    await client.query("SET LOCAL app.user_role = 'SYSTEM'");

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
    const empresaFinal = dados.razaoSocial || dados.empresa || fichaBase.empresa || 'Empresa SGA';
    const cnpjFinal = dados.cnpj || fichaBase.cnpj || fichaBase.cpf_cnpj || null;
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
            [turmaFinal, socio.nome.trim(), empresaFinal, cnpjFinal, socio.cpf || null, socio.telefone || null]
          );
          if (novoSocio[0]) socio.id = novoSocio[0].id;
        } else {
          socio.id = jaExiste[0].id;
        }
      }
    }

    const identificadorFinal =
      dados.identificadorPagamento || dados.identificador_pagamento || dados.cvPagamento || null;

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
        identificadorFinal
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

    await client.query('COMMIT');
    res.status(201).json({
      ...propostaSalva,
      ficha_fechada: true,
      mesa_liberada: true
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: 'Erro ao emitir proposta comercial: ' + err.message });
  } finally {
    client.release();
  }
});

// APROVAÇÃO / VENDA DE PROPOSTA (UNIFICADA POR EMPRESA/CNPJ)
router.patch('/propostas/:id/vender', async (req, res) => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
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

    await client.query('COMMIT');
    res.json(rows.find((r) => Number(r.id) === id) || rows[0] || { sucesso: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// LISTAGEM UNIFICADA POR EMPRESA (CNPJ) PARA FILA DE APROVAÇÕES & ANÁLISE DE CRÉDITO
router.get('/financeiro/propostas', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL app.user_role = 'SYSTEM'");

    const turmaFiltro = req.query.turmaId ? Number(req.query.turmaId) : null;

    const { rows } = await client.query(
      `WITH base_fichas AS (
        SELECT
          f.*,
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
            WHEN LENGTH(regexp_replace(COALESCE(f.cnpj, f.cpf_cnpj, ''), '\D', '', 'g')) >= 11
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
          AND (
            f.dados_proposta IS NOT NULL
            OR p.id IS NOT NULL
            OR f.etapa_funil IN ('aguardando_aprovacao', 'fechamento', 'concluido')
            OR COALESCE(f.status_aprovacao, '') <> ''
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

// DELIBERAÇÃO FINANCEIRA + ANÁLISE DE CRÉDITO / STATUS SERASA (PROPAGADA PARA TODOS OS SÓCIOS DO CNPJ)
router.post('/financeiro/analisar', async (req, res) => {
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
              status_aprovacao, etapa_funil
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

module.exports = router;
