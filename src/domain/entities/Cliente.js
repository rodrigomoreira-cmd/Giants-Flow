// src/domain/entities/Cliente.js
const { EtapaFunil } = require('../enums/StatusEnum');

class Cliente {
  constructor({
    id = null,
    turmaId,
    turma_id,
    responsavelFichaId,
    responsavel_ficha_id,
    nome,
    nomeCompleto,
    nome_completo,
    nomeCracha = null,
    nome_cracha = null,
    empresa,
    cnpj = null,
    cpfCnpj = null,
    cpf_cnpj = null,
    telefone,
    email = null,
    etapaAtual = EtapaFunil.FICHA_PREENCHIDA,
    etapa_atual = null,
  }) {
    this.id = id;
    this.turmaId = turmaId || turma_id ? Number(turmaId || turma_id) : null;
    this.responsavelFichaId =
      responsavelFichaId || responsavel_ficha_id
        ? Number(responsavelFichaId || responsavel_ficha_id)
        : null;

    // Suporte universal a camelCase e snake_case
    const nomeRecebido = nome || nomeCompleto || nome_completo;
    this.nome = nomeRecebido ? String(nomeRecebido).trim() : null;

    const crachaRecebido = nomeCracha || nome_cracha;
    this.nomeCracha = crachaRecebido ? String(crachaRecebido).trim() : null;

    this.empresa = empresa ? String(empresa).replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '').replace(/\b\d{11}\b/g, '').replace(/\s{2,}/g, ' ').trim() : null;

    const documentoRecebido = cnpj || cpfCnpj || cpf_cnpj;
    this.cnpj = documentoRecebido ? this.formatarCNPJ(documentoRecebido) : null;

    this.telefone = telefone ? String(telefone).trim() : null;
    this.email = email ? String(email).trim() : null;
    this.etapaAtual = etapaAtual || etapa_atual || EtapaFunil.FICHA_PREENCHIDA;

    this.validarFicha();
  }

  formatarCNPJ(cnpj) {
    const digits = String(cnpj).replace(/\D/g, '');
    return digits.length === 14 ? digits : null;
  }

  validarFicha() {
    if (!this.turmaId) throw new Error('A Turma (imersão) é obrigatória.');
    if (!this.responsavelFichaId) throw new Error('O Responsável pela ficha é obrigatório.');
    if (!this.nome || this.nome === '') throw new Error('O Nome do cliente é obrigatório.');
    if (!this.empresa || this.empresa === '') throw new Error('A Empresa é obrigatória.');
    if (!this.telefone || this.telefone === '')
      throw new Error('O Telefone de contato é obrigatório.');
  }

  avancarParaEntrevista() {
    if (this.etapaAtual !== EtapaFunil.FICHA_PREENCHIDA) {
      throw new Error(`Ação bloqueada. O cliente encontra-se na etapa: ${this.etapaAtual}`);
    }
    this.etapaAtual = EtapaFunil.EM_ENTREVISTA;
  }
}

module.exports = Cliente;
module.exports.Cliente = Cliente;
