// src/application/use-cases/entrevista/RegistrarResultadoEntrevistaUseCase.js
const Entrevista = require('../../../domain/entities/Entrevista');
const clienteRepository = require('../../../infrastructure/database/repositories/ClienteRepository');
const entrevistaRepository = require('../../../infrastructure/database/repositories/EntrevistaRepository');

class RegistrarResultadoEntrevistaUseCase {
  async execute({ aplicacaoId, turno = 'almoco', resultado, observacao = '' }) {
    const idApp = Number(aplicacaoId);
    if (!idApp) {
      throw new Error('O identificador do participante é obrigatório.');
    }

    if (!resultado) {
      throw new Error('O parecer de resultado (aprovado/reprovado) é obrigatório.');
    }

    const resultadoSanitizado = String(resultado).trim().toLowerCase();
    const turnoNormalizado = String(turno).trim().toLowerCase() === 'jantar' ? 'jantar' : 'almoco';

    // 1. Validar existência do participante na base
    const cliente = await clienteRepository.buscarPorId(idApp);
    if (!cliente) {
      throw new Error(`Participante #${idApp} não encontrado no sistema.`);
    }

    // 2. Recuperar registo de entrevista existente
    const entrevistaBruta = await entrevistaRepository.buscarPorAplicacaoId(idApp);
    if (!entrevistaBruta) {
      throw new Error(
        `Registo de alocação de entrevista não encontrado para o participante #${idApp}.`
      );
    }

    // Re-hidratação garantida da Entidade (evita erros caso o repositório devolva um POJO simples)
    const EntrevistaClass = Entrevista.Entrevista || Entrevista;
    let entrevista =
      entrevistaBruta instanceof EntrevistaClass
        ? entrevistaBruta
        : new EntrevistaClass(entrevistaBruta);

    let novaEtapaParticipante;

    // 3. Processamento de aprovação/reprovação com verificação defensiva de protótipo
    if (['aprovado', 'liberado', 'proposta_liberada', 'aprovada'].includes(resultadoSanitizado)) {
      if (typeof entrevista.aprovarParaProposta === 'function') {
        entrevista.aprovarParaProposta(turnoNormalizado, observacao);
      } else {
        // Fallback defensivo imediato
        if (turnoNormalizado === 'almoco') {
          entrevista.statusAlmoco = 'aprovado';
        } else {
          entrevista.statusJantar = 'aprovado';
        }
        entrevista.liberarProposta = true;
        if (observacao) {
          entrevista.observacoes = entrevista.observacoes
            ? `${entrevista.observacoes} | ${String(observacao).trim()}`
            : String(observacao).trim();
        }
        entrevista.mesaId = null;
      }
      novaEtapaParticipante = 'proposta_liberada';
    } else if (
      ['reprovado', 'recusado', 'reprovada', 'desqualificado'].includes(resultadoSanitizado)
    ) {
      if (typeof entrevista.reprovar === 'function') {
        entrevista.reprovar(turnoNormalizado, observacao);
      } else {
        // Fallback defensivo imediato
        if (turnoNormalizado === 'almoco') {
          entrevista.statusAlmoco = 'bloqueado';
        } else {
          entrevista.statusJantar = 'bloqueado';
        }
        entrevista.liberarProposta = false;
        if (observacao) {
          entrevista.observacoes = entrevista.observacoes
            ? `${entrevista.observacoes} | [Reprovado] ${String(observacao).trim()}`
            : `[Reprovado] ${String(observacao).trim()}`;
        }
        entrevista.mesaId = null;
      }
      novaEtapaParticipante = 'reprovado';
    } else {
      throw new Error(`Resultado inválido: "${resultado}". Utilize "aprovado" ou "reprovado".`);
    }

    // 4. Atualizar o registo da entrevista no banco de dados
    const entrevistaAtualizada = await entrevistaRepository.atualizarStatusTurnos(entrevista);

    // 5. Atualizar a etapa do participante na tabela aplicacoes
    await clienteRepository.atualizarEtapa(idApp, novaEtapaParticipante);

    // 6. Desvincular assento físico na mesa para anular contagens fantasma no salão
    await entrevistaRepository.desvincularMesa(idApp);

    return {
      sucesso: true,
      entrevista: entrevistaAtualizada,
      etapaAtual: novaEtapaParticipante,
      mesaLiberada: true,
    };
  }
}

module.exports = new RegistrarResultadoEntrevistaUseCase();
module.exports.RegistrarResultadoEntrevistaUseCase = RegistrarResultadoEntrevistaUseCase;
