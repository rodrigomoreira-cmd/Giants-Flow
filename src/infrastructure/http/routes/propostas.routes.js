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
            (SELECT turma_id FROM aplicacoes WHERE id = $2), 
            (SELECT turma_id FROM fichas WHERE id = $2), 
            1491
          )
          WHERE id = $3
        `, [turmaAlvo, Number(aplicacaoId), propostaSalva.id]);
      }

    // 2. Mantém a redundância operacional na tabela fichas para retrocompatibilidade
    await pool.query(
      `UPDATE fichas 
        SET valor_negociado = $1,
            etapa_funil = 'aguardando_aprovacao',
            status_aprovacao = 'pendente',
            dados_proposta = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3`,
      [
        propostaSalva.valorTotal,
        JSON.stringify(propostaSalva),
        aplicacaoId
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
    const { rows } = await pool.query('SELECT * FROM fichas ORDER BY id DESC');
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
    const { rows: atual } = await client.query('SELECT status_aprovacao, etapa_funil FROM fichas WHERE id = $1 FOR UPDATE', [targetId]);
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
