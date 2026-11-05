// src/application/use-cases/entrevista/AgendarEntrevistaUseCase.js
const { EtapaFunil } = require('../../../domain/enums/StatusEnum');
const Entrevista = require('../../../domain/entities/Entrevista');
const clienteRepository = require('../../../infrastructure/database/repositories/ClienteRepository');
const entrevistaRepository = require('../../../infrastructure/database/repositories/EntrevistaRepository');

class AgendarEntrevistaUseCase {
  async execute({ aplicacaoId, mesaId, entrevistadorId = null }) {
    // 1. Validar existência do participante
    const cliente = await clienteRepository.buscarPorId(aplicacaoId);
    if (!cliente) {
      throw new Error(`Participante #${aplicacaoId} não foi encontrado.`);
    }

    // 2. Trava de Funil: impede quem já avançou ou foi reprovado
    if (cliente.etapaAtual === EtapaFunil.REPROVADO) {
      throw new Error('Agendamento bloqueado: participante foi reprovado/recusado.');
    }

    const etapasBloqueadas = [
      EtapaFunil.PROPOSTA_LIBERADA,
      EtapaFunil.EM_ANALISE_FINANCEIRA,
      EtapaFunil.APROVADO_FINANCEIRO,
      EtapaFunil.VENDIDO,
    ];

    if (etapasBloqueadas.includes(cliente.etapaAtual)) {
      throw new Error(
        `Agendamento bloqueado: participante já avançou no funil (Etapa: ${cliente.etapaAtual}).`
      );
    }

    // 3. Validar mesa e capacidade (Defensivo contra qualquer formato de objeto)
    const mesa = await entrevistaRepository.buscarMesaComOcupacao(mesaId);
    if (!mesa) {
      throw new Error(`Mesa #${mesaId} não encontrada.`);
    }

    const capacidade = Number(mesa.capacidadeTotal ?? mesa.capacidade_total ?? 4);
    const ocupantes = Number(mesa.ocupantesAtuais ?? mesa.ocupantes ?? 0);

    const temDisponibilidade =
      typeof mesa.temCadeiraDisponivel === 'function'
        ? mesa.temCadeiraDisponivel()
        : ocupantes < capacidade;

    if (!temDisponibilidade) {
      const numMesa = mesa.numero ?? mesaId;
      throw new Error(`A Mesa #${numMesa} já atingiu a capacidade máxima (${capacidade} lugares).`);
    }

    // 4. Se estiver em ficha_preenchida, avança para em_entrevista
    if (cliente.etapaAtual === EtapaFunil.FICHA_PREENCHIDA) {
      await clienteRepository.atualizarEtapa(cliente.id, EtapaFunil.EM_ENTREVISTA);
    }

    // 5. Salvar alocação via UPSERT
    const entrevista = new Entrevista({
      aplicacaoId: cliente.id,
      mesaId: Number(mesaId),
      entrevistadorId: entrevistadorId ? Number(entrevistadorId) : null,
      statusAlmoco: 'pendente',
      statusJantar: 'bloqueado',
    });

    return await entrevistaRepository.salvar(entrevista);
  }
}

module.exports = new AgendarEntrevistaUseCase();
