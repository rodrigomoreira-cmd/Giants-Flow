const express = require('express');
const router = express.Router();
const dbModule = require('../../database/connection');
const pool = dbModule.pool || dbModule;
const criarPropostaUseCase = require('../../../application/use-cases/proposta/CriarPropostaUseCase');

// 4. FINANCEIRO COM IDEMPOTÃŠNCIA

// REGISTRO DE PROPOSTA COMERCIAL DA ENTREVISTA
router.post('/propostas', async (req, res) => {
  try {
    const dados = req.body;
    const aplicacaoId = dados.aplicacaoId || dados.aplicacao_id || dados.id;

    if (!aplicacaoId) {
      return res.status(400).json({ error: 'O participante (aplicacaoId) é obrigatório.' });
    }

    // 1. Executa o caso de uso oficial (salva na tabela propostas com regras e cashback)
    const propostaSalva = await criarPropostaUseCase.execute({
        aplicacaoId: Number(aplicacaoId),
        produtoId: Number(dados.produtoId || dados.produto_id || 3),
        valorTotal: dados.valorTotal ?? dados.valor_negociado,
        valorEntrada: dados.valorEntrada ?? dados.valor_entrada ?? 0,
        cashback: dados.cashback ?? 0,
        metodoPagamento: dados.metodoPagamento || dados.formaEntrada || 'Pix',
        quantidadeParcelas: dados.quantidadeParcelas || dados.parcelas || 1,
        valorParcela: dados.valorParcela
      });

      // Vincula a proposta diretamente à turma informada ou herdada
      const turmaAlvo = dados.turmaId || dados.turma_id || null;
      if (propostaSalva?.id) {
        await pool.query(`
          UPDATE propostas 
          SET turma_id = COALESCE(
            $1::INT, 
            (SELECT  turma_id FROM aplicacoes WHERE id = $2), 
            (SELECT turma_id, cashback_upgrade_90_pct, historico_produtos_elegiveis, valor_investido_pac_ae  FROM fichas WHERE id = $2), 
            1491
          )
          WHERE id = $3
        `, [turmaAlvo, Number(aplicacaoId), propostaSalva.id]);
      }

    // 2. Cadastra sócios externos adicionados na hora do fechamento na mesma empresa/turma
    const sociosDetalhes = Array.isArray(dados.sociosDetalhes) ? dados.sociosDetalhes : [];
    const { rows: fichaBaseRows } = await pool.query(
      'SELECT  turma_id, empresa, cnpj, cashback_upgrade_90_pct, historico_produtos_elegiveis, valor_investido_pac_ae  FROM fichas WHERE id = $1',
      [aplicacaoId]
    );
    const fichaBase = fichaBaseRows[0] || {};
    const empresaFinal = dados.razaoSocial || fichaBase.empresa || 'Empresa SGA';
    const cnpjFinal = dados.cnpj || fichaBase.cnpj || null;
    const turmaFinal = turmaAlvo || fichaBase.turma_id || 1491;

    for (const socio of sociosDetalhes) {
      if (socio && socio.externo && socio.entraNoContrato && socio.nome && socio.nome.trim()) {
        const { rows: jaExiste } = await pool.query(
          'SELECT  id, cashback_upgrade_90_pct, historico_produtos_elegiveis, valor_investido_pac_ae  FROM fichas WHERE turma_id = $1 AND LOWER(TRIM(nome_participante)) = LOWER(TRIM($2)) AND LOWER(TRIM(empresa)) = LOWER(TRIM($3))',
          [turmaFinal, socio.nome.trim(), empresaFinal]
        );
        if (jaExiste.length === 0) {
          const { rows: novoSocio } = await pool.query(
            `INSERT INTO fichas (turma_id, nome_participante, nome_cracha, empresa, cnpj, cpf_cnpj, telefone, cargo, origem, etapa_funil)
             VALUES ($1, $2, $2, $3, $4, $5, $6, 'Sócio Adicional', 'EVENTO', 'aguardando_aprovacao')
             RETURNING id`,
            [turmaFinal, socio.nome.trim(), empresaFinal, cnpjFinal, socio.cpf || null, socio.telefone || null]
          );
          if (novoSocio[0]) socio.id = novoSocio[0].id;
        } else {
          socio.id = jaExiste[0].id;
        }
      }
    }

    // 3. Atualiza a ficha principal com o pacote consolidado de sócios e produto
    await pool.query(
      `UPDATE fichas 
       SET empresa = COALESCE(NULLIF($4, ''), empresa),
           cnpj = COALESCE(NULLIF($5, ''), cnpj),
           valor_negociado = $1,
           etapa_funil = 'aguardando_aprovacao',
           status_aprovacao = 'pendente',
           dados_proposta = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [
        propostaSalva.valorTotal,
        JSON.stringify({
          ...propostaSalva,
          produtoNome: dados.produtoNome || dados.produto_nome || null,
          categoriaProduto: dados.categoriaProduto || dados.categoria_produto || null,
          socios: dados.socios || 1,
          sociosDetalhes,
          cnpj: cnpjFinal
        }),
        aplicacaoId,
        empresaFinal,
        cnpjFinal
      ]
    );

    res.status(201).json(propostaSalva);
  } catch (err) {
    res.status(400).json({ error: 'Erro ao emitir proposta comercial: ' + err.message });
  }
});

// APROVAÇÃO / VENDA DE PROPOSTA
router.patch('/propostas/:id/vender', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      "UPDATE fichas SET etapa_funil = 'concluido', status_aprovacao = 'aprovado', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *",
      [id]
    );
    res.json(rows[0] || { sucesso: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/financeiro/propostas', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT  f.*,
             COALESCE(
               NULLIF(f.dados_proposta->>'produtoNome', ''),
               (SELECT p.nome FROM produtos p WHERE p.id = NULLIF(f.dados_proposta->>'produtoId', '')::int),
               'GIANTS'
             ) AS produto_nome, cashback_upgrade_90_pct, historico_produtos_elegiveis, valor_investido_pac_ae 
      FROM fichas f
      ORDER BY f.id DESC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/financeiro/analisar', async (req, res) => {
  const client = await pool.connect();
  try {
    const { proposta_id, fichaId, decisao } = req.body;
    const targetId = proposta_id || fichaId;
    if (!targetId || !decisao) return res.status(400).json({ error: 'Parâmetros obrigatórios ausentes.' });

    await client.query('BEGIN');
    const { rows: atual } = await client.query('SELECT  status_aprovacao, etapa_funil, cashback_upgrade_90_pct, historico_produtos_elegiveis, valor_investido_pac_ae  FROM fichas WHERE id = $1 FOR UPDATE', [targetId]);
    if (atual.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Ficha não encontrada.' });
    }

    const novoStatus = (decisao === 'APROVAR' || decisao === 'aprovado') ? 'aprovada' : 'recusada';
    const novaEtapa = novoStatus === 'aprovada' ? 'fechamento' : 'negociacao';

    if (atual[0].status_aprovacao === novoStatus) {
      await client.query('COMMIT');
      return res.json({ mensagem: 'Operação já processada (idempotente).', status: novoStatus });
    }

    const { rows } = await client.query(
      'UPDATE fichas SET status_aprovacao = $1, etapa_funil = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
      [novoStatus, novaEtapa, targetId]
    );
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});


module.exports = router;
