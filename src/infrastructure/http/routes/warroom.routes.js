const express = require('express');
const router = express.Router();
const dbModule = require('../../database/connection');
const pool = dbModule.pool || dbModule;
const { verificarJWT } = require('../../security/jwt');

// Garante criação da tabela de auditoria pós-evento
pool.query(`
  CREATE TABLE IF NOT EXISTS auditoria_eventos (
    id SERIAL PRIMARY KEY,
    turma_id INTEGER,
    ficha_id INTEGER,
    empresa VARCHAR(200),
    cnpj VARCHAR(40),
    acao VARCHAR(80) NOT NULL,
    detalhes TEXT,
    usuario_id INTEGER,
    usuario_nome VARCHAR(150),
    usuario_papel VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`).catch((err) => console.warn('Aviso ao verificar tabela auditoria_eventos:', err.message));

function extrairOperador(req) {
  if (req.usuario) {
    return {
      id: req.usuario.id || null,
      nome: req.usuario.nome || req.usuario.email || 'Operador',
      papel: String(req.usuario.papel || '').toUpperCase()
    };
  }
  const authHeader = req.headers?.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (token) {
    try {
      const payload = verificarJWT(token);
      if (payload) {
        return {
          id: payload.sub || payload.userId || payload.id || null,
          nome: payload.nome || payload.email || 'Operador',
          papel: String(payload.userRole || payload.papel || '').toUpperCase()
        };
      }
    } catch (_) {}
  }
  return {
    id: null,
    nome: req.body?.usuario_nome || 'Operador Sistema',
    papel: String(req.body?.papel || req.headers['x-user-role'] || '').toUpperCase()
  };
}

async function registrarAuditoria(runner, { turmaId, fichaId, empresa, cnpj, acao, detalhes, req }) {
  try {
    const op = req ? extrairOperador(req) : { id: null, nome: 'Sistema', papel: 'SYSTEM' };
    await runner.query(
      `INSERT INTO auditoria_eventos (
         turma_id, ficha_id, empresa, cnpj, acao, detalhes, usuario_id, usuario_nome, usuario_papel
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        turmaId ? Number(turmaId) : null,
        fichaId ? Number(fichaId) : null,
        empresa || null,
        cnpj || null,
        acao,
        detalhes || null,
        op.id ? Number(op.id) : null,
        op.nome,
        op.papel || 'OPERADOR'
      ]
    );
  } catch (err) {
    console.warn('Falha não-bloqueante ao gravar auditoria:', err.message);
  }
}

router.registrarAuditoria = registrarAuditoria;

// 1. ENDPOINT EXECUTIVO DO WAR ROOM (TEMPO REAL)
router.get('/war-room/resumo', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL app.user_role = 'SYSTEM'");

    const rawTurma = req.query.turmaId || req.query.turma_id || '';
    const digits = String(rawTurma).replace(/\D/g, '');
    const turmaId = digits ? parseInt(digits, 10) : 1491;

    // Fichas consolidadas por empresa/CNPJ na turma
    const { rows: fichasRows } = await client.query(
      `SELECT
         f.id,
         f.turma_id,
         f.nome_participante,
         f.empresa,
         COALESCE(NULLIF(TRIM(f.cnpj), ''), NULLIF(TRIM(f.cpf_cnpj), '')) AS cnpj_doc,
         f.almoco_pago,
         f.cortesia_almoco,
         f.membro_giants,
         COALESCE(f.valor_almoco, 0) AS valor_almoco,
         f.mesa_alocada,
         f.assento_alocado,
         f.etapa_funil,
         f.status_aprovacao,
         f.ficha_fechada,
         COALESCE(f.valor_negociado, 0) AS valor_negociado,
         COALESCE(f.desconto_concedido, 0) AS desconto_concedido,
         COALESCE(f.cashback, 0) AS cashback,
         f.dados_proposta,
         f.updated_at,
         p.id AS proposta_id,
         COALESCE(p.valor_total, f.valor_negociado, 0) AS prop_valor_total,
         COALESCE(p.valor_entrada, 0) AS prop_valor_entrada,
         COALESCE(p.cashback, f.cashback, 0) AS prop_cashback,
         COALESCE(p.desconto_aplicado, f.desconto_concedido, 0) AS prop_desconto,
         COALESCE(p.quantidade_parcelas, 1) AS prop_parcelas,
         COALESCE(p.valor_parcela, 0) AS prop_valor_parcela,
         p.metodo_pagamento AS prop_metodo_pagamento,
         p.status AS prop_status,
         pr.nome AS prod_nome_tabela,
         pr.categoria AS prod_categoria_tabela
       FROM fichas f
       LEFT JOIN LATERAL (
         SELECT * FROM propostas prx
         WHERE prx.aplicacao_id = f.id
         ORDER BY prx.id DESC
         LIMIT 1
       ) p ON TRUE
       LEFT JOIN produtos pr ON pr.id = p.produto_id
       WHERE f.turma_id = $1::int
       ORDER BY f.id ASC`,
      [turmaId]
    );

    // Agrupa por CNPJ ou Empresa normalizada (ignorando membros GIANTS já veteranos para conversão comercial)
    const gruposMap = new Map();
    let totalAlmocoArrecadado = 0;
    let qtdAlmocoPago = 0;
    let qtdCortesias = 0;

    for (const r of fichasRows) {
      totalAlmocoArrecadado += Number(r.valor_almoco || 0);
      if (r.almoco_pago || Number(r.valor_almoco || 0) > 0) qtdAlmocoPago += 1;
      if (r.cortesia_almoco) qtdCortesias += 1;

      if (r.membro_giants) continue;

      const cnpjLimpo = String(r.cnpj_doc || '').replace(/\D/g, '');
      const empNorm = String(r.empresa || '').trim().toLowerCase();
      const chave =
        cnpjLimpo.length >= 11
          ? `cnpj:${cnpjLimpo}`
          : empNorm && !['empresa sga', 'sem empresa', 'empresa não informada', 'empresa nao informada'].includes(empNorm)
          ? `emp:${empNorm}`
          : `id:${r.id}`;

      if (!gruposMap.has(chave)) {
        gruposMap.set(chave, []);
      }
      gruposMap.get(chave).push(r);
    }

    const linhasProduto = {
      GIANTS: { linha: 'GIANTS', contratos: 0, bruto: 0, descontos: 0, cashback: 0, permuta: 0, liquido: 0, entradas: 0 },
      PAC: { linha: 'PAC', contratos: 0, bruto: 0, descontos: 0, cashback: 0, permuta: 0, liquido: 0, entradas: 0 },
      AE: { linha: 'AE', contratos: 0, bruto: 0, descontos: 0, cashback: 0, permuta: 0, liquido: 0, entradas: 0 }
    };

    const formasEntradaMap = new Map();
    const statusFinanceiro = { aprovadas: 0, pendentes: 0, recusadas: 0 };
    const funil = {
      totalEmpresas: gruposMap.size,
      aptasAlmoco: 0,
      emMesaAgora: 0,
      encerradasTotal: 0,
      fechamentos: 0,
      naoFechouOuFuturo: 0
    };

    const ultimosFechamentos = [];

    for (const membros of gruposMap.values()) {
      const temAlmoco = membros.some((m) => m.almoco_pago || m.cortesia_almoco || Number(m.valor_almoco || 0) > 0);
      if (temAlmoco) funil.aptasAlmoco += 1;

      const emMesa = membros.some((m) => m.mesa_alocada !== null && m.mesa_alocada !== undefined);
      if (emMesa) funil.emMesaAgora += 1;

      // Escolhe o registro titular/principal da empresa (prioriza quem tem proposta ou dados_proposta)
      const principal =
        membros.find((m) => m.dados_proposta || m.proposta_id) ||
        membros.find((m) => m.ficha_fechada) ||
        membros[0];

      const encerrada = membros.some(
        (m) =>
          Boolean(m.ficha_fechada) ||
          ['aguardando_aprovacao', 'fechamento', 'concluido', 'reprovado'].includes(
            String(m.etapa_funil || '').toLowerCase()
          )
      );
      if (encerrada) funil.encerradasTotal += 1;

      const dp = principal.dados_proposta && typeof principal.dados_proposta === 'object' ? principal.dados_proposta : null;
      const gerouVenda = Boolean(dp || principal.proposta_id || Number(principal.prop_valor_total || 0) > 0);

      if (gerouVenda) {
        funil.fechamentos += 1;

        const catRaw = String(
          dp?.categoriaProduto || principal.prod_categoria_tabela || dp?.produtoNome || principal.prod_nome_tabela || 'GIANTS'
        ).toUpperCase();
        const cat = catRaw.includes('PAC') ? 'PAC' : catRaw.includes('AE') || catRaw.includes('ACELERADOR') ? 'AE' : 'GIANTS';

        const valorNegociado = Number(principal.prop_valor_total || dp?.valorTotal || principal.valor_negociado || 0);
        const desconto = Number(dp?.desconto ?? principal.prop_desconto ?? 0);
        const valorTabela = Number(dp?.valorTabela || valorNegociado + desconto);
        const cashback = cat === 'PAC' ? 0 : Number(dp?.cashback ?? principal.prop_cashback ?? 0);
        const permuta = Number(dp?.permuta || 0);
        const valorLiquido = Math.max(0, valorNegociado - cashback - permuta);
        const entrada1 = Number(dp?.valorEntrada ?? principal.prop_valor_entrada ?? 0);
        const entrada2 = Number(dp?.entradaComplementar || 0);
        const formaEnt = String(dp?.formaEntrada || principal.prop_metodo_pagamento || 'Pix').trim();

        linhasProduto[cat].contratos += 1;
        linhasProduto[cat].bruto += valorTabela;
        linhasProduto[cat].descontos += desconto;
        linhasProduto[cat].cashback += cashback;
        linhasProduto[cat].permuta += permuta;
        linhasProduto[cat].liquido += valorLiquido;
        linhasProduto[cat].entradas += entrada1;

        formasEntradaMap.set(formaEnt, (formasEntradaMap.get(formaEnt) || 0) + entrada1);

        const stAprov = String(principal.status_aprovacao || 'pendente').toLowerCase();
        if (['aprovada', 'aprovado', 'aprovada_com_ressalva'].includes(stAprov)) {
          statusFinanceiro.aprovadas += 1;
        } else if (['recusada', 'recusado', 'negado'].includes(stAprov)) {
          statusFinanceiro.recusadas += 1;
        } else {
          statusFinanceiro.pendentes += 1;
        }

        ultimosFechamentos.push({
          id: principal.id,
          empresa: principal.empresa,
          cnpj: principal.cnpj_doc || '',
          titular: principal.nome_participante,
          linha: cat,
          produto: dp?.produtoNome || principal.prod_nome_tabela || cat,
          valorLiquido,
          entrada1,
          entrada2,
          formaEntrada: formaEnt,
          parcelas: Number(dp?.quantidadeParcelas || principal.prop_parcelas || 1),
          statusAprovacao: stAprov,
          updatedAt: principal.updated_at
        });
      } else if (encerrada) {
        funil.naoFechouOuFuturo += 1;
      }
    }

    ultimosFechamentos.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

    const totais = Object.values(linhasProduto).reduce(
      (acc, item) => ({
        contratos: acc.contratos + item.contratos,
        bruto: acc.bruto + item.bruto,
        descontos: acc.descontos + item.descontos,
        cashback: acc.cashback + item.cashback,
        permuta: acc.permuta + item.permuta,
        liquido: acc.liquido + item.liquido,
        entradas: acc.entradas + item.entradas
      }),
      { contratos: 0, bruto: 0, descontos: 0, cashback: 0, permuta: 0, liquido: 0, entradas: 0 }
    );

    const { rows: logsAuditoria } = await client.query(
      `SELECT id, turma_id, ficha_id, empresa, cnpj, acao, detalhes, usuario_nome, usuario_papel, created_at
       FROM auditoria_eventos
       WHERE turma_id = $1::int OR turma_id IS NULL
       ORDER BY created_at DESC, id DESC
       LIMIT 40`,
      [turmaId]
    );

    await client.query('COMMIT');

    const baseConversao = funil.encerradasTotal > 0 ? funil.encerradasTotal : funil.aptasAlmoco;
    const taxaConversao = baseConversao > 0 ? Number(((funil.fechamentos / baseConversao) * 100).toFixed(1)) : 0;

    res.json({
      turmaId,
      atualizadoEm: new Date().toISOString(),
      kpis: {
        faturamentoBruto: totais.bruto,
        faturamentoLiquido: totais.liquido,
        totalDescontos: totais.descontos,
        totalCashback: totais.cashback,
        totalPermuta: totais.permuta,
        entradasImediatas: totais.entradas,
        almocoArrecadado: totalAlmocoArrecadado,
        caixaImediatoEvento: totais.entradas + totalAlmocoArrecadado,
        qtdAlmocoPago,
        qtdCortesias,
        contratosFechados: totais.contratos,
        taxaConversao
      },
      porLinha: Object.values(linhasProduto),
      formasEntrada: Array.from(formasEntradaMap.entries()).map(([forma, valor]) => ({ forma, valor })),
      statusFinanceiro,
      funil,
      ultimosFechamentos: ultimosFechamentos.slice(0, 15),
      auditoria: logsAuditoria
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Erro ao carregar resumo do War Room: ' + err.message });
  } finally {
    client.release();
  }
});

// 2. LISTAGEM DE LOGS DE AUDITORIA
router.get('/auditoria', async (req, res) => {
  try {
    const rawTurma = req.query.turmaId || req.query.turma_id || '';
    const digits = String(rawTurma).replace(/\D/g, '');
    const turmaId = digits ? parseInt(digits, 10) : null;

    const { rows } = await pool.query(
      `SELECT id, turma_id, ficha_id, empresa, cnpj, acao, detalhes, usuario_nome, usuario_papel, created_at
       FROM auditoria_eventos
       WHERE ($1::int IS NULL OR turma_id = $1::int OR turma_id IS NULL)
       ORDER BY created_at DESC, id DESC
       LIMIT 100`,
      [turmaId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. EXPORTAÇÃO CONSOLIDADA EM CSV (COMPATÍVEL COM EXCEL PT-BR)
router.get('/financeiro/exportar-csv', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL app.user_role = 'SYSTEM'");

    const rawTurma = req.query.turmaId || req.query.turma_id || '';
    const digits = String(rawTurma).replace(/\D/g, '');
    const turmaId = digits ? parseInt(digits, 10) : 1491;

    const { rows } = await client.query(
      `SELECT
         f.id,
         f.turma_id,
         f.empresa,
         COALESCE(NULLIF(TRIM(f.cnpj), ''), NULLIF(TRIM(f.cpf_cnpj), ''), '') AS cnpj,
         f.nome_participante,
         f.telefone,
         f.email,
         f.almoco_pago,
         f.cortesia_almoco,
         COALESCE(f.valor_almoco, 0) AS valor_almoco,
         f.etapa_funil,
         f.status_aprovacao,
         f.analise_credito_status,
         f.status_serasa_codigo,
         f.status_serasa_texto,
         f.parecer_financeiro,
         COALESCE(f.valor_negociado, 0) AS valor_negociado,
         COALESCE(f.desconto_concedido, 0) AS desconto_concedido,
         COALESCE(f.cashback, 0) AS cashback,
         f.cv_cartao,
         f.dados_proposta,
         f.updated_at,
         p.valor_total AS prop_valor_total,
         p.valor_entrada AS prop_valor_entrada,
         p.quantidade_parcelas AS prop_parcelas,
         p.valor_parcela AS prop_valor_parcela,
         p.metodo_pagamento AS prop_metodo_pagamento,
         pr.nome AS prod_nome_tabela
       FROM fichas f
       LEFT JOIN LATERAL (
         SELECT * FROM propostas prx
         WHERE prx.aplicacao_id = f.id
         ORDER BY prx.id DESC
         LIMIT 1
       ) p ON TRUE
       LEFT JOIN produtos pr ON pr.id = p.produto_id
       WHERE f.turma_id = $1::int
         AND COALESCE(f.membro_giants, false) = false
       ORDER BY f.empresa ASC, f.id ASC`,
      [turmaId]
    );

    await registrarAuditoria(client, {
      turmaId,
      acao: 'EXPORTACAO_CSV_FINANCEIRO',
      detalhes: `Exportou planilha consolidada da turma ${turmaId} (${rows.length} registros)`,
      req
    });

    await client.query('COMMIT');

    const esc = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val).replace(/\r?\n|\r/g, ' ').trim();
      if (str.includes(';') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const numBR = (v) => Number(v || 0).toFixed(2).replace('.', ',');

    const cabecalho = [
      'ID Ficha',
      'Turma',
      'Empresa',
      'CNPJ',
      'Participante',
      'Telefone',
      'Email',
      'Almoco Pago (R$)',
      'Cortesia Almoco',
      'Etapa Funil',
      'Status Aprovacao',
      'Credito',
      'Status Serasa',
      'Produto / Plano',
      'Valor Tabela (R$)',
      'Desconto (R$)',
      'Cashback Abatido (R$)',
      'Permuta (R$)',
      'Valor Liquido (R$)',
      'Entrada 1 (R$)',
      'Forma Entrada 1',
      'Entrada 2 (R$)',
      'Data Entrada 2',
      'Identificador (CV/Link)',
      'Parcelas Restante',
      'Valor Parcela (R$)',
      'Forma Restante',
      'Socios no Contrato',
      'Parecer Financeiro',
      'Atualizado Em'
    ];

    const linhasCsv = [cabecalho.join(';')];

    for (const r of rows) {
      const dp = r.dados_proposta && typeof r.dados_proposta === 'object' ? r.dados_proposta : {};
      const valorNeg = Number(r.prop_valor_total || dp.valorTotal || r.valor_negociado || 0);
      const desc = Number(dp.desconto ?? r.desconto_concedido ?? 0);
      const valTab = Number(dp.valorTabela || (valorNeg > 0 ? valorNeg + desc : 0));
      const cb = Number(dp.cashback ?? r.cashback ?? 0);
      const perm = Number(dp.permuta || 0);
      const valLiq = Math.max(0, valorNeg - cb - perm);
      const ent1 = Number(dp.valorEntrada ?? r.prop_valor_entrada ?? 0);
      const ent2 = Number(dp.entradaComplementar || 0);
      const sociosNomes = Array.isArray(dp.sociosDetalhes)
        ? dp.sociosDetalhes.filter((s) => s.entraNoContrato).map((s) => s.nome).join(' | ')
        : '';

      linhasCsv.push(
        [
          r.id,
          r.turma_id,
          r.empresa,
          r.cnpj,
          r.nome_participante,
          r.telefone,
          r.email,
          numBR(r.valor_almoco),
          r.cortesia_almoco ? 'Sim' : 'Nao',
          r.etapa_funil || '',
          r.status_aprovacao || '',
          r.analise_credito_status || '',
          r.status_serasa_texto || r.status_serasa_codigo || '',
          dp.produtoNome || r.prod_nome_tabela || '',
          numBR(valTab),
          numBR(desc),
          numBR(cb),
          numBR(perm),
          numBR(valLiq),
          numBR(ent1),
          dp.formaEntrada || r.prop_metodo_pagamento || '',
          numBR(ent2),
          dp.dataEntradaComplementar || '',
          dp.identificadorPagamento || r.cv_cartao || '',
          dp.quantidadeParcelas || r.prop_parcelas || '',
          numBR(dp.valorParcela || r.prop_valor_parcela || 0),
          dp.formaRestante || '',
          sociosNomes,
          r.parecer_financeiro || '',
          r.updated_at ? new Date(r.updated_at).toLocaleString('pt-BR') : ''
        ]
          .map(esc)
          .join(';')
      );
    }

    const csvFinal = '\uFEFF' + linhasCsv.join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="fechamento-turma-${turmaId}.csv"`);
    res.send(csvFinal);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Erro ao exportar CSV: ' + err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
