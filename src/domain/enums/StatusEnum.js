// src/domain/enums/StatusEnum.js

const EtapaFunil = Object.freeze({
  FICHA_PREENCHIDA: 'ficha_preenchida',
  EM_ENTREVISTA: 'em_entrevista',
  PROPOSTA_LIBERADA: 'proposta_liberada',
  EM_ANALISE_FINANCEIRA: 'em_analise_financeira',
  APROVADO_FINANCEIRO: 'aprovado_financeiro',
  VENDIDO: 'vendido',
  REPROVADO: 'reprovado',
});

const StatusProposta = Object.freeze({
  EM_DIGITACAO: 'em_digitacao',
  ENVIADO_FINANCEIRO: 'enviado_financeiro', // Alinhado ao ENUM real do Postgres
  APROVADO: 'aprovado',
  RECUSADO: 'recusado',
  VENDIDO: 'vendido',
});

const StatusTurno = Object.freeze({
  BLOQUEADO: 'bloqueado',
  PENDENTE: 'pendente',
  APROVADO: 'aprovado',
});

module.exports = {
  EtapaFunil,
  StatusProposta,
  StatusTurno,
};
