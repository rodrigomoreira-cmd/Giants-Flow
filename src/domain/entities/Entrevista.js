// src/domain/entities/Entrevista.js

class Entrevista {
  constructor({
    id = null,
    aplicacaoId,
    aplicacao_id,
    mesaId = null,
    mesa_id = null,
    entrevistadorId = null,
    entrevistador_id = null,
    statusAlmoco = 'pendente',
    status_almoco = null,
    statusJantar = 'bloqueado',
    status_jantar = null,
    liberarProposta = false,
    liberar_proposta = false,
    observacoes = '',
  } = {}) {
    this.id = id ? Number(id) : null;

    const appId = aplicacaoId ?? aplicacao_id;
    if (!appId) {
      throw new Error('O identificador do participante (aplicacaoId) é obrigatório.');
    }
    this.aplicacaoId = Number(appId);

    const mId = mesaId !== undefined ? mesaId : mesa_id;
    this.mesaId = mId !== null && mId !== undefined && mId !== '' ? Number(mId) : null;

    const entId = entrevistadorId !== undefined ? entrevistadorId : entrevistador_id;
    this.entrevistadorId =
      entId !== null && entId !== undefined && entId !== '' ? Number(entId) : null;

    this.statusAlmoco = statusAlmoco || status_almoco || 'pendente';
    this.statusJantar = statusJantar || status_jantar || 'bloqueado';
    this.liberarProposta = Boolean(liberarProposta ?? liberar_proposta);
    this.observacoes = String(observacoes || '').trim();
  }

  desvincularMesa() {
    this.mesaId = null;
  }

  aprovarParaProposta(turno = 'almoco', observacao = '') {
    const turnoNormalizado =
      String(turno || '')
        .trim()
        .toLowerCase() === 'jantar'
        ? 'jantar'
        : 'almoco';
    if (turnoNormalizado === 'almoco') {
      this.statusAlmoco = 'aprovado';
    } else {
      this.statusJantar = 'aprovado';
    }
    this.liberarProposta = true;
    if (observacao) {
      this.observacoes = this.observacoes
        ? `${this.observacoes} | ${String(observacao).trim()}`
        : String(observacao).trim();
    }
    this.desvincularMesa();
  }

  reprovar(turno = 'almoco', observacao = '') {
    const turnoNormalizado =
      String(turno || '')
        .trim()
        .toLowerCase() === 'jantar'
        ? 'jantar'
        : 'almoco';
    if (turnoNormalizado === 'almoco') {
      this.statusAlmoco = 'bloqueado';
    } else {
      this.statusJantar = 'bloqueado';
    }
    this.liberarProposta = false;
    if (observacao) {
      this.observacoes = this.observacoes
        ? `${this.observacoes} | [Reprovado] ${String(observacao).trim()}`
        : `[Reprovado] ${String(observacao).trim()}`;
    }
    this.desvincularMesa();
  }

  // Aliases defensivos adicionais
  aprovar(turno, obs) {
    this.aprovarParaProposta(turno, obs);
  }

  recusar(turno, obs) {
    this.reprovar(turno, obs);
  }
}

// Duplo export mandatório para neutralizar divergências de require
module.exports = Entrevista;
module.exports.Entrevista = Entrevista;
