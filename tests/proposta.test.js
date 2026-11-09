const { describe, it, after } = require('node:test');
const assert = require('node:assert');
const dbModule = require('../src/infrastructure/database/connection.js');
const pool = dbModule.pool || dbModule;

const criarPropostaUseCase = require('../src/application/use-cases/proposta/CriarPropostaUseCase.js');
const { EtapaFunil, StatusProposta } = require('../src/domain/enums/StatusEnum.js');

describe('Fluxo Crítico: Proposta Comercial & Cashback Almoço', () => {
  after(async () => {
    if (pool.end) await pool.end();
  });

  it('Deve registrar proposta com abatimento de R$ 1.000 de cashback e parcelas recalculadas', async () => {
    const emailTeste = 'empresario.teste@cashback.com';

    // 1. Limpeza preventiva de execuções anteriores
    await pool.query(
      `DELETE FROM propostas WHERE aplicacao_id IN (SELECT id FROM aplicacoes WHERE email = $1)`,
      [emailTeste]
    );
    await pool.query('DELETE FROM aplicacoes WHERE email = $1', [emailTeste]);

    // 2. Obtém FKs obrigatórias existentes (turma, produto e usuário responsável)
    const turmaRes = await pool.query('SELECT id FROM turmas ORDER BY id ASC LIMIT 1');
    assert.ok(turmaRes.rows.length > 0, 'Deve existir ao menos uma turma cadastrada');
    const turmaId = turmaRes.rows[0].id;

    const userRes = await pool.query('SELECT id FROM usuarios ORDER BY id ASC LIMIT 1');
    assert.ok(userRes.rows.length > 0, 'Deve existir ao menos um usuário responsável cadastrado');
    const responsavelId = userRes.rows[0].id;

    const prodRes = await pool.query('SELECT id FROM produtos WHERE id = 3');
    const produtoId = prodRes.rows[0] ? prodRes.rows[0].id : (await pool.query('SELECT id FROM produtos LIMIT 1')).rows[0]?.id || 3;

    // 3. Insere aplicação com responsavel_ficha_id e etapa 'em_entrevista'
    const appRes = await pool.query(
      `INSERT INTO aplicacoes (
        turma_id, responsavel_ficha_id, nome_completo, nome_cracha, empresa, telefone, email, etapa_atual
      ) VALUES ($1, $2, 'Empresário Teste Cashback', 'Empresário Cashback', 'Empresa Teste S/A', '11977770001', $3, $4)
      RETURNING id`,
      [turmaId, responsavelId, emailTeste, EtapaFunil.EM_ENTREVISTA]
    );
    const aplicacaoId = appRes.rows[0].id;

    // 4. Emissão da proposta via caso de uso oficial com R$ 1.000 de cashback
    const dadosProposta = {
      aplicacaoId,
      produtoId,
      valorTotal: 279000,
      valorEntrada: 10000,
      cashback: 1000,
      quantidadeParcelas: 10,
      metodoPagamento: 'Pix + 10x Boleto'
    };

    const propostaCriada = await criarPropostaUseCase.execute(dadosProposta);

    // Validações na entidade resultante
    assert.ok(propostaCriada.id, 'Proposta deve retornar ID persistido');
    assert.strictEqual(Number(propostaCriada.cashback), 1000);
    assert.strictEqual(Number(propostaCriada.valorEntrada), 10000);
    assert.strictEqual(Number(propostaCriada.valorTotal), 279000);

    // Abatimento: 279.000 - 10.000 (entrada) - 1.000 (cashback) = 268.000 -> 10x de 26.800,00
    assert.strictEqual(Number(propostaCriada.valorParcela), 26800.00);

    // 5. Verificação direta na tabela propostas do PostgreSQL
    const { rows } = await pool.query(
      `SELECT id, aplicacao_id, produto_id, valor_total, valor_entrada, cashback, 
              metodo_pagamento, quantidade_parcelas, valor_parcela, status 
       FROM propostas WHERE id = $1`,
      [propostaCriada.id]
    );

    assert.strictEqual(rows.length, 1);
    const pBanco = rows[0];

    assert.strictEqual(Number(pBanco.aplicacao_id), aplicacaoId);
    assert.strictEqual(Number(pBanco.valor_total), 279000.00);
    assert.strictEqual(Number(pBanco.valor_entrada), 10000.00);
    assert.strictEqual(Number(pBanco.cashback), 1000.00);
    assert.strictEqual(Number(pBanco.quantidade_parcelas), 10);
    assert.strictEqual(Number(pBanco.valor_parcela), 26800.00);
    assert.strictEqual(pBanco.status, StatusProposta.ENVIADO_FINANCEIRO);

    // 6. Validação do avanço da etapa no funil
    const appAtualizada = await pool.query('SELECT etapa_atual FROM aplicacoes WHERE id = $1', [aplicacaoId]);
    assert.strictEqual(appAtualizada.rows[0].etapa_atual, EtapaFunil.EM_ANALISE_FINANCEIRA);

    // 7. Limpeza atômica
    await pool.query('DELETE FROM propostas WHERE id = $1', [propostaCriada.id]);
    await pool.query('DELETE FROM aplicacoes WHERE id = $1', [aplicacaoId]);
  });
});