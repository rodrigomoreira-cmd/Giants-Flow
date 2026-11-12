// src/application/use-cases/proposta/CriarPropostaUseCase.js
const { EtapaFunil, StatusProposta } = require('../../../domain/enums/StatusEnum');
const Proposta = require('../../../domain/entities/Proposta');
const propostaRepository = require('../../../infrastructure/database/repositories/PropostaRepository');
const { pool } = require('../../../infrastructure/database/connection');

class CriarPropostaUseCase {
  async execute(dados) {
    const aplicacaoId = dados.aplicacaoId || dados.aplicacao_id || dados.clienteId || dados.cliente_id;
    const produtoId = dados.produtoId || dados.produto_id;

    if (!aplicacaoId) {
      throw new Error('O participante (aplicacaoId) é obrigatório para emissão da proposta.');
    }
    if (!produtoId) {
      throw new Error('O produto selecionado é obrigatório.');
    }

    const idNum = Number(aplicacaoId);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL app.user_role = 'SYSTEM'");

      // 1. Busca o participante em fichas (base operacional atual) e em aplicacoes (legado/FK)
      const { rows: fichaRows } = await client.query(
        `SELECT id, turma_id, nome_participante, nome_cracha, empresa, nome_fantasia,
                COALESCE(NULLIF(TRIM(cnpj), ''), NULLIF(TRIM(cpf_cnpj), '')) AS doc_cnpj,
                COALESCE(NULLIF(TRIM(telefone), ''), NULLIF(TRIM(whatsapp), ''), 'Não informado') AS tel_contato,
                email, etapa_funil, cashback, valor_negociado, desconto_concedido
         FROM fichas
         WHERE id = $1
         FOR UPDATE`,
        [idNum]
      );

      const { rows: appRows } = await client.query(
        'SELECT id, etapa_atual, nome_completo FROM aplicacoes WHERE id = $1 FOR UPDATE',
        [idNum]
      );

      if (fichaRows.length === 0 && appRows.length === 0) {
        throw new Error(`Participante #${aplicacaoId} não encontrado no sistema.`);
      }

      const etapaFicha = String(fichaRows[0]?.etapa_funil || '').toLowerCase();
      const etapaApp = String(appRows[0]?.etapa_atual || '').toLowerCase();
      if (etapaFicha === 'reprovado' || etapaApp === EtapaFunil.REPROVADO) {
        throw new Error('Ação bloqueada: não é permitido emitir proposta comercial para um participante reprovado.');
      }

      // 2. Sincroniza registro em aplicacoes com o mesmo ID para satisfazer FK propostas_aplicacao_id_fkey e JOIN do Financeiro
      let turmaValida = null;
      if (fichaRows.length > 0) {
        const f = fichaRows[0];
        if (f.turma_id) {
          const { rows: tRows } = await client.query('SELECT id FROM turmas WHERE id = $1', [f.turma_id]);
          if (tRows.length > 0) turmaValida = f.turma_id;
        }

        const nomeCompleto = String(f.nome_participante || 'Participante').slice(0, 150);
        const nomeCracha = f.nome_cracha ? String(f.nome_cracha).slice(0, 80) : null;
        const empresaNome = String(f.empresa || f.nome_fantasia || nomeCompleto).slice(0, 150);
        const cnpjLimpo = f.doc_cnpj ? String(f.doc_cnpj).slice(0, 18) : null;
        const telefoneStr = String(f.tel_contato || 'Não informado').slice(0, 25);
        const emailStr = f.email ? String(f.email).slice(0, 150) : null;

        await client.query(
          `INSERT INTO aplicacoes (
             id, turma_id, nome_completo, nome_cracha, empresa, cnpj, telefone, email, etapa_atual, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
           ON CONFLICT (id) DO UPDATE SET
             turma_id = COALESCE(EXCLUDED.turma_id, aplicacoes.turma_id),
             nome_completo = EXCLUDED.nome_completo,
             nome_cracha = COALESCE(EXCLUDED.nome_cracha, aplicacoes.nome_cracha),
             empresa = EXCLUDED.empresa,
             cnpj = COALESCE(EXCLUDED.cnpj, aplicacoes.cnpj),
             telefone = COALESCE(NULLIF(EXCLUDED.telefone, 'Não informado'), aplicacoes.telefone),
             email = COALESCE(EXCLUDED.email, aplicacoes.email),
             etapa_atual = $9,
             updated_at = NOW()`,
          [
            idNum,
            turmaValida,
            nomeCompleto,
            nomeCracha,
            empresaNome,
            cnpjLimpo,
            telefoneStr,
            emailStr,
            EtapaFunil.EM_ANALISE_FINANCEIRA,
          ]
        );

        await client.query(
          `SELECT setval(
             pg_get_serial_sequence('aplicacoes', 'id'),
             GREATEST(COALESCE((SELECT MAX(id) FROM aplicacoes), 1), $1)
           )`,
          [idNum]
        );
      }

      // 3. Cálculo atômico garantido do saldo devedor e parcelas (abatendo entrada, cashback e desconto)
      const vTotal = Number(dados.valorTotal ?? dados.valor_total) || 0;
      const vEntrada = Number(dados.valorEntrada ?? dados.valor_entrada) || 0;
      const cashback = Number(dados.cashback) || 0;
      const desconto = Number(
        dados.desconto ?? dados.descontoAplicado ?? dados.desconto_aplicado ?? dados.desconto_concedido
      ) || 0;
      const qtdParcelas = Math.max(
        1,
        Number(dados.quantidadeParcelas ?? dados.quantidade_parcelas ?? dados.parcelas) || 1
      );
      const saldoDevedor = Math.max(0, vTotal - vEntrada - cashback - desconto);
      const valorParcelaCalculado = dados.valorParcela
        ? Number(dados.valorParcela)
        : Number((saldoDevedor / qtdParcelas).toFixed(2));

      const proposta = new Proposta({
        aplicacaoId: idNum,
        produtoId: Number(produtoId),
        valorTotal: vTotal,
        valorEntrada: vEntrada,
        cashback,
        metodoPagamento: dados.metodoPagamento ?? dados.metodo_pagamento ?? 'Pix',
        quantidadeParcelas: qtdParcelas,
        valorParcela: valorParcelaCalculado,
        status: StatusProposta.ENVIADO_FINANCEIRO,
        podeCriarProposta: true,
      });

      const propostaSalva = await propostaRepository.salvar(proposta, client);

      if (propostaSalva && propostaSalva.id) {
        await client.query(
          `UPDATE propostas
           SET turma_id = COALESCE($1, turma_id),
               desconto_aplicado = $2,
               valor_original = $3,
               forma_pagamento = COALESCE($4, metodo_pagamento)
           WHERE id = $5`,
          [
            turmaValida,
            desconto,
            Number(dados.valorOriginal ?? dados.valor_original ?? vTotal) || vTotal,
            dados.formaPagamento ?? dados.forma_pagamento ?? dados.metodoPagamento ?? dados.metodo_pagamento ?? 'Pix',
            propostaSalva.id,
          ]
        );
      }

      // 4. Transiciona etapa em aplicacoes e fichas mantendo a transação aberta
      await client.query(
        'UPDATE aplicacoes SET etapa_atual = $1, updated_at = NOW() WHERE id = $2',
        [EtapaFunil.EM_ANALISE_FINANCEIRA, idNum]
      );

      if (fichaRows.length > 0) {
        await client.query(
          `UPDATE fichas
           SET etapa_funil = 'aguardando_aprovacao',
               status_aprovacao = COALESCE(NULLIF(status_aprovacao, ''), 'pendente'),
               cashback = $1,
               valor_negociado = CASE WHEN $2 > 0 THEN $2 ELSE valor_negociado END,
               desconto_concedido = CASE WHEN $3 > 0 THEN $3 ELSE desconto_concedido END,
               updated_at = NOW()
           WHERE id = $4`,
          [cashback, vTotal, desconto, idNum]
        );
      }

      await client.query('COMMIT');
      return propostaSalva;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = new CriarPropostaUseCase();
module.exports.CriarPropostaUseCase = CriarPropostaUseCase;
