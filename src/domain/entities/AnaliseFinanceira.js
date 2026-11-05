// src/domain/entities/AnaliseFinanceira.js

class AnaliseFinanceira {
  constructor({
    id = null,
    propostaId,
    analistaId = null,
    statusSerasa = 'pendente',
    decisaoFinanceiro = 'pendente',
    parecer = null,
    analisadoEm = null,
  }) {
    if (!propostaId) {
      throw new Error('A análise financeira deve estar vinculada a uma proposta.');
    }

    this.id = id;
    this.propostaId = propostaId;
    this.analistaId = analistaId;
    this.statusSerasa = statusSerasa;
    this.decisaoFinanceiro = decisaoFinanceiro;
    this.parecer = parecer;
    this.analisadoEm = analisadoEm;
  }

  atualizarSerasa(status) {
    const permitidos = ['pendente', 'sem_restricao', 'com_restricao', 'reprovado'];
    if (!permitidos.includes(status)) {
      throw new Error(`Status de Serasa inválido: ${status}`);
    }
    this.statusSerasa = status;
  }

  aprovar(analistaId, parecer = '') {
    if (!analistaId) {
      throw new Error('É necessário informar o analista responsável pela aprovação.');
    }
    if (this.statusSerasa === 'reprovado') {
      throw new Error('Não é possível aprovar proposta com Serasa reprovado sem exceção expressa.');
    }

    this.analistaId = analistaId;
    this.decisaoFinanceiro = 'aprovado';
    this.parecer = parecer;
    this.analisadoEm = new Date();
  }

  rejeitar(analistaId, motivo) {
    if (!analistaId) {
      throw new Error('É necessário informar o analista responsável pela rejeição.');
    }
    if (!motivo || !motivo.trim()) {
      throw new Error('É obrigatório descrever o motivo da rejeição financeira.');
    }

    this.analistaId = analistaId;
    this.decisaoFinanceiro = 'rejeitado';
    this.parecer = motivo;
    this.analisadoEm = new Date();
  }

  liberaBotaoVenda() {
    return this.decisaoFinanceiro === 'aprovado';
  }
}

module.exports = AnaliseFinanceira;
