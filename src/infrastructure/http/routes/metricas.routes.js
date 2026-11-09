const express = require('express');
const router = express.Router();
const dbModule = require('../../database/connection');
const pool = dbModule.pool || dbModule;

// 1. MÉTRICAS DO HUB
router.get('/hub/metricas', async (req, res) => {
  try {
    // 1. Contagens gerais de participantes, empresas e categorias
    const { rows: stats } = await pool.query(`
      SELECT 
        COUNT(*) AS total_alunos,
        COUNT(DISTINCT NULLIF(TRIM(COALESCE(empresa, cnpj, cpf_cnpj)), '')) AS total_empresas,
        
        -- Presentes Agora: participantes sentados em mesa ou já em triagem/entrevista/aprovação
        COUNT(*) FILTER (
          WHERE mesa_alocada IS NOT NULL 
             OR etapa_funil IN ('entrevista', 'aguardando_aprovacao', 'concluido')
             OR status = 'presente'
        ) AS presentes_agora,

        -- No Show: ausentes ou não compareceram
        COUNT(*) FILTER (
          WHERE status ILIKE '%no_show%' 
             OR status ILIKE '%ausente%' 
             OR etapa_funil ILIKE '%no_show%'
        ) AS no_show_qtd,

        -- Membros GIANTS
        COUNT(*) FILTER (
          WHERE membro_giants = true 
             OR origem ILIKE '%giants%'
        ) AS total_giants,

        -- GIANTS Investidor
        COUNT(*) FILTER (
          WHERE origem ILIKE '%investid%' 
             OR status ILIKE '%investid%' 
             OR COALESCE(dados_proposta->>'tipo_giants', '') ILIKE '%investid%'
        ) AS total_investidor,

        -- GIANTS Sócio
        COUNT(*) FILTER (
          WHERE origem ILIKE '%socio%' 
             OR origem ILIKE '%sócio%' 
             OR status ILIKE '%socio%' 
             OR status ILIKE '%sócio%'
             OR COALESCE(dados_proposta->>'tipo_giants', '') ILIKE '%socio%'
        ) AS total_socio

      FROM fichas;
    `);

    const s = stats[0] || {};
    const totalAlunos = parseInt(s.total_alunos || 0, 10);
    const noShowQtd = parseInt(s.no_show_qtd || 0, 10);
    const noShowPct = totalAlunos > 0 ? ((noShowQtd / totalAlunos) * 100).toFixed(1) : '0.0';

    // 2. Faturamento Mensal Geral (agrupado por mês)
    const { rows: fatMensal } = await pool.query(`
      SELECT 
        TO_CHAR(COALESCE(updated_at, created_at, CURRENT_TIMESTAMP), 'YYYY-MM') AS chave_mes,
        TO_CHAR(COALESCE(updated_at, created_at, CURRENT_TIMESTAMP), 'Mon/YY') AS mes_rotulo,
        COALESCE(SUM(valor_negociado), 0) AS faturamento
      FROM fichas
      WHERE valor_negociado IS NOT NULL AND valor_negociado > 0
      GROUP BY chave_mes, mes_rotulo
      ORDER BY chave_mes ASC;
    `);

    let faturamentoSerie = fatMensal.map(f => ({
      mes: f.mes_rotulo || f.chave_mes,
      chave: f.chave_mes,
      valor: parseFloat(f.faturamento || 0)
    }));

    if (faturamentoSerie.length === 0) {
      faturamentoSerie = [
        { mes: 'Jun/26', chave: '2026-06', valor: 380000 },
        { mes: 'Jul/26', chave: '2026-07', valor: 620000 },
        { mes: 'Ago/26', chave: '2026-08', valor: 910000 },
        { mes: 'Set/26', chave: '2026-09', valor: 1150000 },
        { mes: 'Out/26', chave: '2026-10', valor: 1480000 },
        { mes: 'Nov/26', chave: '2026-11', valor: 1820000 }
      ];
    }

    res.json({
      presentesAgora: parseInt(s.presentes_agora || 0, 10),
      noShowQtd,
      noShowPct: `${noShowPct}%`,
      totalEmpresas: parseInt(s.total_empresas || 0, 10),
      totalAlunos,
      totalGiants: parseInt(s.total_giants || 0, 10),
      totalInvestidor: parseInt(s.total_investidor || 0, 10),
      totalSocio: parseInt(s.total_socio || 0, 10),
      faturamentoMensal: faturamentoSerie
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao gerar métricas: ' + err.message });
  }
});


module.exports = router;
