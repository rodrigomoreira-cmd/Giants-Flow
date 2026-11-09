/**
 * Serviço de Regras de Negócio de Almoço e Alocação
 * Auditoria de Segurança: Extraído para isolamento de responsabilidades
 */

export const VALOR_MINIMO_ALMOCO = 1000;

export function validarElegibilidadeAlmoço(participante, cortesiasLocais = {}) {
  if (!participante) return false;

  const isMembroGiants = Boolean(participante.membro_giants);
  const empresaPagou = Boolean(participante.almoco_pago) || Number(participante.valor_almoco || 0) >= VALOR_MINIMO_ALMOCO;
  const temCortesia = Boolean(cortesiasLocais[participante.id]) || Boolean(participante.cortesia_almoco || participante.cortesia);

  return isMembroGiants || empresaPagou || temCortesia;
}

export function formatarPayloadAlocação(participanteId, mesaId) {
  return {
    aplicacaoId: Number(participanteId),
    mesaId: Number(mesaId)
  };
}