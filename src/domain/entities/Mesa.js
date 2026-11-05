// src/domain/entities/Mesa.js

class Mesa {
  constructor({
    id = null,
    numero,
    capacidadeTotal = 4,
    capacidade_total,
    ocupantesAtuais = 0,
    ocupantes_atuais,
    temEntrevistador = true,
    tem_entrevistador,
  } = {}) {
    this.id = id ? Number(id) : null;
    this.numero = Number(numero);
    this.capacidadeTotal = Number(capacidadeTotal ?? capacidade_total ?? 4);
    this.ocupantesAtuais = Number(ocupantesAtuais ?? ocupantes_atuais ?? 0);
    this.temEntrevistador =
      temEntrevistador !== undefined
        ? Boolean(temEntrevistador)
        : tem_entrevistador !== undefined
          ? Boolean(tem_entrevistador)
          : true;
  }

  temCadeiraDisponivel() {
    return this.ocupantesAtuais < this.capacidadeTotal;
  }

  temVaga() {
    return this.temCadeiraDisponivel();
  }

  temCadeirasDisponiveis() {
    return this.temCadeiraDisponivel();
  }

  ocuparCadeira() {
    if (!this.temCadeiraDisponivel()) {
      throw new Error(
        `A Mesa #${this.numero} já atingiu a capacidade máxima de ${this.capacidadeTotal} lugares.`
      );
    }
    this.ocupantesAtuais += 1;
  }

  liberarCadeira() {
    if (this.ocupantesAtuais > 0) {
      this.ocupantesAtuais -= 1;
    }
  }
}

module.exports = Mesa;
module.exports.Mesa = Mesa;
