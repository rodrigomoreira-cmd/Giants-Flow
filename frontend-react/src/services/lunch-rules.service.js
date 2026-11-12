/**
 * Serviço de Regras de Negócio de Almoço e Alocação
 * Auditoria de Segurança: Isolamento de responsabilidades e propagação corporativa por CNPJ
 */

export const VALOR_MINIMO_ALMOCO = 1000;

export function validarElegibilidadeAlmoco(participante, cortesiasLocais = {}, todosParticipantes = []) {
  if (!participante) return false;

  const isMembroGiants = Boolean(participante.membro_giants);
  const empresaPagouDireto = Boolean(participante.almoco_pago) || Number(participante.valor_almoco || 0) >= VALOR_MINIMO_ALMOCO;
  const temCortesia = Boolean(cortesiasLocais[participante.id]) || Boolean(participante.cortesia_almoco || participante.cortesia);

  if (isMembroGiants || empresaPagouDireto || temCortesia) {
    return true;
  }

  // Regra Corporativa: se qualquer pessoa do mesmo CNPJ/Empresa tiver almoço liberado, todos têm direito
  if (Array.isArray(todosParticipantes) && todosParticipantes.length > 0) {
    const meuDoc = (participante.cnpj || participante.cpf_cnpj || participante.empresa || '').trim().toLowerCase();
    if (meuDoc) {
      const colegaPagou = todosParticipantes.some(p => {
        if (!p || p.id === participante.id) return false;
        const docColega = (p.cnpj || p.cpf_cnpj || p.empresa || '').trim().toLowerCase();
        return docColega === meuDoc && (
          Boolean(p.almoco_pago) || 
          Boolean(p.membro_giants) || 
          Boolean(p.cortesia_almoco) || 
          Number(p.valor_almoco || 0) >= VALOR_MINIMO_ALMOCO
        );
      });
      if (colegaPagou) return true;
    }
  }

  return false;
}

// Compatibilidade de nome com e sem acento
export const validarElegibilidadeAlmoço = validarElegibilidadeAlmoco;

export function formatarPayloadAlocacao(participanteId, mesaId) {
  return {
    aplicacaoId: Number(participanteId),
    mesaId: Number(mesaId)
  };
}
export const formatarPayloadAlocação = formatarPayloadAlocacao;
