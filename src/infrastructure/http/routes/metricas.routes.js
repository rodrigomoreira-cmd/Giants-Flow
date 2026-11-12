const express = require('express');
const router = express.Router();
const dbModule = require('../../database/connection');
const pool = dbModule.pool || dbModule;

// ROTA DE MÉTRICAS EXECUTIVAS — FILTRO POR TURMA ESTREITO
router.get('/hub/metricas', async (req, res) => {
  try {
    const rawTurma = req.query.turma_id || req.query.turmaId || '';
    const digits = String(rawTurma).replace(/\D/g, '');
    const turmaFiltro = digits ? parseInt(digits, 10) : 1491;

    // 1. ESTATÍSTICAS DA TABELA FICHAS (TURMA ESPECÍFICA)
    const statsQuery = `
      SELECT 
        COUNT(*)::INT AS total_alunos,
        COUNT(DISTINCT NULLIF(TRIM(COALESCE(cnpj, cpf_cnpj, empresa)), ''))::INT AS total_empresas,
        COUNT(DISTINCT NULLIF(TRIM(COALESCE(cnpj, cpf_cnpj, empresa)), '')) FILTER (WHERE valor_almoco >= 1000.00)::INT AS empresas_pagantes_almoco,
        COALESCE(SUM(valor_almoco) FILTER (WHERE valor_almoco >= 1000.00), 0)::FLOAT AS valor_almoco,
        COUNT(DISTINCT NULLIF(TRIM(COALESCE(cnpj, cpf_cnpj, empresa)), '')) FILTER (WHERE valor_almoco >= 1000.00)::INT AS fichas_preenchidas,
        COUNT(*) FILTER (
          WHERE mesa_alocada IS NOT NULL 
             OR etapa_funil IN ('entrevista', 'aguardando_aprovacao', 'concluido')
             OR status = 'presente'
        )::INT AS presentes_agora,
        COUNT(*) FILTER (
          WHERE status ILIKE '%no_show%' 
             OR status ILIKE '%ausente%' 
             OR etapa_funil ILIKE '%no_show%'
        )::INT AS no_show_qtd
      FROM fichas
      WHERE ($1::INT IS NULL OR turma_id = $1::INT);
`;
    const { rows: stats } = await pool.query(statsQuery, [turmaFiltro]);
    const s = stats[0] || {};

    const totalAlunos = parseInt(s.total_alunos || 0, 10);
    const totalEmpresas = parseInt(s.total_empresas || 0, 10);
    const empresasPagantesAlmoco = parseInt(s.empresas_pagantes_almoco || 0, 10);
    const fichasPreenchidas = parseInt(s.fichas_preenchidas || 0, 10);
    const valorAlmoco = parseFloat(s.valor_almoco || 0);
    const presentesAgora = parseInt(s.presentes_agora || 0, 10);
    const noShowQtd = parseInt(s.no_show_qtd || 0, 10);
    const noShowPct = totalAlunos > 0 ? ((noShowQtd / totalAlunos) * 100).toFixed(1) : '0.0';

    // 2. PROPOSTAS COMERCIAIS FECHADAS (GIANTS & PAC)
    const fechamentoQuery = `
      SELECT 
        p.id AS proposta_id,
        COALESCE(p.turma_id, a.turma_id, f.turma_id) AS turma_id,
        p.status,
        COALESCE(p.valor_total, 0)::FLOAT AS valor_total,
        COALESCE(p.valor_entrada, 0)::FLOAT AS valor_entrada,
        p.condicoes_especiais,
        pr.nome AS produto_nome,
        COALESCE(e.resultado, '') AS entrevista_resultado,
        COALESCE(NULLIF(TRIM(a.cnpj), ''), NULLIF(TRIM(f.cnpj), ''), NULLIF(TRIM(f.cpf_cnpj), ''), a.empresa, f.empresa) AS chave_empresa,
        COALESCE(a.empresa, f.empresa) AS empresa,
        f.cargo,
        a.dados_diagnostico
      FROM propostas p
      LEFT JOIN produtos pr ON pr.id = p.produto_id
      LEFT JOIN aplicacoes a ON a.id = p.aplicacao_id
      LEFT JOIN fichas f ON f.id = p.aplicacao_id OR f.id = a.responsavel_ficha_id
      LEFT JOIN entrevistas e ON e.aplicacao_id = p.aplicacao_id
      WHERE (p.status = 'vendido' OR p.status = 'aprovado')
        AND ($1::INT IS NULL OR COALESCE(p.turma_id, a.turma_id, f.turma_id) = $1::INT);
    `;
    const { rows: propostasFechadas } = await pool.query(fechamentoQuery, [turmaFiltro]).catch(() => ({ rows: [] }));

    // Separação PAC vs GIANTS
    const propostasPAC = propostasFechadas.filter(p => 
      (p.entrevista_resultado || '').includes('PAC') ||
      (p.produto_nome || '').toUpperCase().includes('PAC') || 
      (p.condicoes_especiais || '').toUpperCase().includes('PAC')
    );
    const propostasGIANTS = propostasFechadas.filter(p => !propostasPAC.includes(p));

    // Indicadores PAC
    const empresasPAC = new Set(propostasPAC.map(p => p.chave_empresa).filter(Boolean));
    const caixaPAC = propostasPAC.reduce((acc, cur) => acc + (cur.valor_entrada || 0), 0);
    const competenciaPAC = propostasPAC.reduce((acc, cur) => acc + (cur.valor_total || 0), 0);

    // Indicadores GIANTS
    const empresasGIANTS = new Set(propostasGIANTS.map(p => p.chave_empresa).filter(Boolean));
    const chavesGiants = Array.from(empresasGIANTS);
    let totalPessoasGIANTS = propostasGIANTS.length;
    let empresasComSocioGIANTS = 0;

    if (chavesGiants.length > 0) {
      const pessoasQuery = `
        SELECT 
          COALESCE(NULLIF(TRIM(cnpj), ''), NULLIF(TRIM(cpf_cnpj), ''), empresa) AS empresa_chave,
          COUNT(*) AS total_pessoas,
          COUNT(*) FILTER (WHERE cargo ILIKE '%socio%' OR cargo ILIKE '%sócio%' OR cargo ILIKE '%propriet%' OR cargo ILIKE '%fundad%') AS qtd_socios
        FROM fichas
        WHERE ($1::INT IS NULL OR turma_id = $1::INT)
          AND COALESCE(NULLIF(TRIM(cnpj), ''), NULLIF(TRIM(cpf_cnpj), ''), empresa) = ANY($2::TEXT[])
        GROUP BY empresa_chave;
      `;
      const { rows: pessoasRows } = await pool.query(pessoasQuery, [turmaFiltro, chavesGiants]).catch(() => ({ rows: [] }));
      totalPessoasGIANTS = pessoasRows.reduce((acc, cur) => acc + parseInt(cur.total_pessoas || 1, 10), 0);
      empresasComSocioGIANTS = pessoasRows.filter(r => parseInt(r.total_pessoas || 0, 10) > 1 || parseInt(r.qtd_socios || 0, 10) > 0).length;
    }

    const caixaGIANTS = propostasGIANTS.reduce((acc, cur) => acc + (cur.valor_entrada || 0), 0);
    const competenciaGIANTS = propostasGIANTS.reduce((acc, cur) => acc + (cur.valor_total || 0), 0);

    const valorFechados = competenciaGIANTS + competenciaPAC;
    const valorTotal = valorAlmoco + valorFechados;

    // 3. SÉRIE DE FATURAMENTO MENSAL DO EVENTO
    const fatQuery = `
      SELECT 
        TO_CHAR(COALESCE(fechado_em, created_at, CURRENT_TIMESTAMP), 'YYYY-MM') AS chave_mes,
        TO_CHAR(COALESCE(fechado_em, created_at, CURRENT_TIMESTAMP), 'Mon/YY') AS mes_rotulo,
        COALESCE(SUM(valor_total), 0) AS faturamento
      FROM propostas
      WHERE status IN ('vendido', 'aprovado')
        AND ($1::INT IS NULL OR turma_id = $1::INT)
      GROUP BY chave_mes, mes_rotulo
      ORDER BY chave_mes ASC;
    `;
    const { rows: fatMensal } = await pool.query(fatQuery, [turmaFiltro]).catch(() => ({ rows: [] }));

    let faturamentoSerie = fatMensal.map(f => ({
      mes: f.mes_rotulo,
      chave: f.chave_mes,
      valor: parseFloat(f.faturamento || 0)
    }));

    if (faturamentoSerie.length === 0) {
      faturamentoSerie = [
        { mes: 'Nov/26', chave: '2026-11', valor: valorTotal }
      ];
    }

    res.json({
      totalAlunos,
      totalEmpresas,
      empresasPagantesAlmoco,
      fichasPreenchidas,
      valorAlmoco,
      valorFechados,
      valorTotal,
      presentesAgora,
      noShowQtd,
      noShowPct,
      resumoFechamento: {
        giants: {
          totalEmpresas: empresasGIANTS.size,
          totalPessoas: Math.max(totalPessoasGIANTS, empresasGIANTS.size),
          empresasComSocio: empresasComSocioGIANTS,
          caixa: caixaGIANTS,
          competencia: competenciaGIANTS
        },
        pac: {
          totalEmpresas: empresasPAC.size,
          caixa: caixaPAC,
          competencia: competenciaPAC
        },
        total: {
          caixa: caixaGIANTS + caixaPAC,
          competencia: competenciaGIANTS + competenciaPAC
        }
      },
      faturamentoMensal: faturamentoSerie
    });
  } catch (err) {
    console.error('Erro ao calcular métricas:', err);
    res.status(500).json({ error: 'Erro interno ao processar indicadores: ' + err.message });
  }
});

module.exports = router;
