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


function validarCnpjOficial(cnpjRaw) {
  const d = String(cnpjRaw || '').replace(/\D/g, '');
  if (d.length !== 14) return false;
  if (/^(\d)\1+$/.test(d)) return false;

  const calcDigito = (base, pesos) => {
    let soma = 0;
    for (let i = 0; i < pesos.length; i++) {
      soma += Number(base[i]) * pesos[i];
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const d1 = calcDigito(d.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calcDigito(d.slice(0, 12) + String(d1), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return Number(d[12]) === d1 && Number(d[13]) === d2;
}

function formatarCnpjMask(digits) {
  const d = String(digits || '').replace(/\D/g, '');
  if (d.length !== 14) return digits || '';
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

// AUDITORIA DE DUPLICIDADES DE CNPJ / SÓCIO NA BASE IMPORTADA
router.get('/admin/auditoria-duplicidades', exigirPapeis('ADMIN', 'FINANCEIRO', 'APROVADOR'), async (req, res) => {
  const client = await pool.connect();
  try {
    const turmaId = Number(req.query.turmaId || 1491);
    await client.query('BEGIN');
    await client.query("SET LOCAL app.user_role = 'SYSTEM'");

    const { rows } = await client.query(
      `SELECT id, turma_id, nome_participante, nome_cracha, empresa, cnpj, cpf_cnpj,
              telefone, email, origem, membro_giants, almoco_pago, cortesia_almoco,
              valor_almoco, cv_cartao, cashback_upgrade_90_pct, mesa_alocada, etapa_funil
       FROM fichas
       WHERE turma_id = $1::int
       ORDER BY id ASC`,
      [turmaId]
    );

    await client.query('COMMIT');

    const normTexto = (s) =>
      String(s || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ');

    const ignorarEmp = new Set(['', 'empresa sga', 'sem empresa', 'empresa nao informada']);

    // 1. Participantes duplicados na mesma turma (mesmo nome normalizado ou mesmo e-mail)
    const porNome = new Map();
    for (const r of rows) {
      const n = normTexto(r.nome_participante);
      if (!n || n.length < 4) continue;
      if (!porNome.has(n)) porNome.set(n, []);
      porNome.get(n).push(r);
    }

    const participantesDuplicados = [];
    for (const [nomeNorm, lista] of porNome.entries()) {
      if (lista.length > 1) {
        participantesDuplicados.push({
          chave: nomeNorm,
          nome: lista[0].nome_participante,
          registros: lista
        });
      }
    }

    // 2. Sócios da mesma empresa fragmentados (mesma razão social, mas CNPJs ausentes ou divergentes)
    const porEmpresa = new Map();
    for (const r of rows) {
      if (r.membro_giants) continue;
      const emp = normTexto(r.empresa);
      if (ignorarEmp.has(emp)) continue;
      if (!porEmpresa.has(emp)) porEmpresa.set(emp, []);
      porEmpresa.get(emp).push(r);
    }

    const empresasFragmentadas = [];
    for (const [empNorm, lista] of porEmpresa.entries()) {
      if (lista.length < 2) continue;
      const cnpjs14 = new Set();
      let temSemCnpj = false;

      for (const item of lista) {
        const c1 = String(item.cnpj || '').replace(/\D/g, '');
        const c2 = String(item.cpf_cnpj || '').replace(/\D/g, '');
        const dig = c1.length === 14 ? c1 : (c2.length === 14 ? c2 : '');
        if (dig) {
          cnpjs14.add(dig);
        } else {
          temSemCnpj = true;
        }
      }

      if (cnpjs14.size > 1 || (cnpjs14.size === 1 && temSemCnpj)) {
        const cnpjSugerido = cnpjs14.size >= 1 ? formatarCnpjMask(Array.from(cnpjs14)[0]) : '';
        empresasFragmentadas.push({
          chave: empNorm,
          empresa: lista[0].empresa,
          cnpjSugerido,
          motivo: cnpjs14.size > 1
            ? 'Mais de um CNPJ diferente cadastrado para a mesma razão social'
            : 'Um ou mais sócios da empresa vieram sem CNPJ (quebra o vínculo do almoço/cashback)',
          registros: lista
        });
      }
    }

    // 3. CNPJs com dígito verificador inválido ou compartilhados por empresas com nomes distintos
    const cnpjsInvalidos = [];
    const porCnpj = new Map();

    for (const r of rows) {
      if (r.membro_giants) continue;
      const c1 = String(r.cnpj || '').replace(/\D/g, '');
      const c2 = String(r.cpf_cnpj || '').replace(/\D/g, '');
      const dig = c1.length === 14 ? c1 : (c2.length === 14 ? c2 : '');
      if (!dig) continue;

      if (!validarCnpjOficial(dig)) {
        cnpjsInvalidos.push({
          id: r.id,
          empresa: r.empresa,
          participante: r.nome_participante,
          cnpj: r.cnpj || r.cpf_cnpj,
          motivo: 'Dígito verificador do CNPJ inválido na base importada'
        });
      }

      if (!porCnpj.has(dig)) porCnpj.set(dig, []);
      porCnpj.get(dig).push(r);
    }

    const cnpjsNomesDivergentes = [];
    for (const [dig, lista] of porCnpj.entries()) {
      const nomesEmp = new Set(lista.map((x) => normTexto(x.empresa)).filter((x) => !ignorarEmp.has(x)));
      if (nomesEmp.size > 1) {
        cnpjsNomesDivergentes.push({
          cnpj: formatarCnpjMask(dig),
          nomesEncontrados: Array.from(new Set(lista.map((x) => x.empresa).filter(Boolean))),
          registros: lista
        });
      }
    }

    return res.json({
      turmaId,
      totalFichas: rows.length,
      resumo: {
        participantesDuplicados: participantesDuplicados.length,
        empresasFragmentadas: empresasFragmentadas.length,
        cnpjsInvalidos: cnpjsInvalidos.length,
        cnpjsNomesDivergentes: cnpjsNomesDivergentes.length,
        totalPendencias:
          participantesDuplicados.length +
          empresasFragmentadas.length +
          cnpjsInvalidos.length +
          cnpjsNomesDivergentes.length
      },
      participantesDuplicados,
      empresasFragmentadas,
      cnpjsInvalidos,
      cnpjsNomesDivergentes
    });
  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// CORREÇÃO EM 1 CLIQUE DE DUPLICIDADE / UNIFICAÇÃO DE CNPJ
router.post('/admin/corrigir-duplicidade', exigirPapeis('ADMIN'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { acao, turmaId, ids, cnpjUnificado, empresaUnificada, idPrincipal, idDuplicado } = req.body;
    await client.query('BEGIN');
    await client.query("SET LOCAL app.user_role = 'SYSTEM'");

    if (acao === 'unificar_cnpj') {
      const listaIds = Array.isArray(ids) ? ids.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
      if (listaIds.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Nenhum ID selecionado para unificação.' });
      }
      await client.query(
        `UPDATE fichas
         SET cnpj = COALESCE(NULLIF($1::varchar, ''), cnpj),
             empresa = COALESCE(NULLIF($2::varchar, ''), empresa),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ANY($3::int[])`,
        [String(cnpjUnificado || '').trim(), String(empresaUnificada || '').trim(), listaIds]
      );

      await client.query(
        `INSERT INTO auditoria_eventos (turma_id, ficha_id, empresa, cnpj, acao, detalhes)
         VALUES ($1::int, $2::int, $3::varchar, $4::varchar, 'UNIFICACAO_CNPJ_IMPORTACAO', $5::text)`,
        [
          Number(turmaId || 1491),
          listaIds[0],
          String(empresaUnificada || ''),
          String(cnpjUnificado || ''),
          `Unificados ${listaIds.length} registros (IDs: ${listaIds.join(', ')}) sob o CNPJ ${cnpjUnificado}`
        ]
      );

      await client.query('COMMIT');
      return res.json({ sucesso: true, mensagem: 'CNPJ e Razão Social unificados com sucesso entre os sócios.' });
    }

    if (acao === 'mesclar_ficha_duplicada') {
      const pId = Number(idPrincipal);
      const dId = Number(idDuplicado);
      if (!pId || !dId || pId === dId) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'IDs principal e duplicado inválidos.' });
      }

      const { rows: pair } = await client.query(
        'SELECT * FROM fichas WHERE id = ANY($1::int[]) FOR UPDATE',
        [[pId, dId]]
      );
      const principal = pair.find((r) => Number(r.id) === pId);
      const duplicado = pair.find((r) => Number(r.id) === dId);
      if (!principal || !duplicado) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Um dos registros não foi encontrado.' });
      }

      // Consolida dados financeiros, almoço, CV e cashback no registro principal
      await client.query(
        `UPDATE fichas
         SET cnpj = COALESCE(NULLIF(cnpj, ''), $2::varchar),
             telefone = COALESCE(NULLIF(telefone, ''), $3::varchar),
             email = COALESCE(NULLIF(email, ''), $4::varchar),
             almoco_pago = (COALESCE(almoco_pago, false) OR COALESCE($5::boolean, false)),
             cortesia_almoco = (COALESCE(cortesia_almoco, false) OR COALESCE($6::boolean, false)),
             valor_almoco = GREATEST(COALESCE(valor_almoco, 0), COALESCE($7::numeric, 0)),
             cv_cartao = COALESCE(NULLIF(cv_cartao, ''), $8::varchar),
             cashback_upgrade_90_pct = GREATEST(COALESCE(cashback_upgrade_90_pct, 0), COALESCE($9::numeric, 0)),
             historico_produtos_elegiveis = COALESCE(NULLIF(historico_produtos_elegiveis, ''), $10::text),
             mesa_alocada = COALESCE(mesa_alocada, $11::int),
             assento_alocado = COALESCE(assento_alocado, $12::int),
             dados_proposta = COALESCE(dados_proposta, $13::jsonb),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1::int`,
        [
          pId,
          duplicado.cnpj || null,
          duplicado.telefone || null,
          duplicado.email || null,
          Boolean(duplicado.almoco_pago),
          Boolean(duplicado.cortesia_almoco),
          Number(duplicado.valor_almoco || 0),
          duplicado.cv_cartao || null,
          Number(duplicado.cashback_upgrade_90_pct || 0),
          duplicado.historico_produtos_elegiveis || null,
          duplicado.mesa_alocada || null,
          duplicado.assento_alocado || null,
          duplicado.dados_proposta ? JSON.stringify(duplicado.dados_proposta) : null
        ]
      );

      // Reaponta propostas vinculadas ao ID duplicado (se houver) antes de remover a duplicata
      await client.query('UPDATE propostas SET aplicacao_id = $1::int WHERE aplicacao_id = $2::int', [pId, dId]);
      await client.query('DELETE FROM fichas WHERE id = $1::int', [dId]);

      await client.query(
        `INSERT INTO auditoria_eventos (turma_id, ficha_id, empresa, cnpj, acao, detalhes)
         VALUES ($1::int, $2::int, $3::varchar, $4::varchar, 'MESCLAGEM_DUPLICIDADE_DB', $5::text)`,
        [
          Number(principal.turma_id || turmaId || 1491),
          pId,
          principal.empresa || duplicado.empresa || '',
          principal.cnpj || duplicado.cnpj || '',
          `Registro duplicado #${dId} (${duplicado.nome_participante}) mesclado e removido em favor do principal #${pId}`
        ]
      );

      await client.query('COMMIT');
      return res.json({ sucesso: true, mensagem: `Cadastro duplicado #${dId} mesclado com sucesso no #${pId}.` });
    }

    await client.query('ROLLBACK');
    return res.status(400).json({ error: 'Ação de correção não reconhecida.' });
  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
