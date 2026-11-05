// src/application/use-cases/cliente/CriarClienteUseCase.js
const Cliente = require('../../../domain/entities/Cliente');
const clienteRepository = require('../../../infrastructure/database/repositories/ClienteRepository');

class CriarClienteUseCase {
  async execute(dados) {
    // Normalização defensiva antes de instanciar a entidade
    const cliente = new Cliente({
      turmaId: dados.turmaId || dados.turma_id,
      responsavelFichaId: dados.responsavelFichaId || dados.responsavel_ficha_id,
      nome: dados.nome || dados.nomeCompleto || dados.nome_completo,
      nomeCracha: dados.nomeCracha || dados.nome_cracha,
      empresa: dados.empresa,
      cnpj: dados.cnpj || dados.cpfCnpj || dados.cpf_cnpj,
      telefone: dados.telefone,
      email: dados.email,
    });

    return await clienteRepository.salvar(cliente);
  }
}

module.exports = new CriarClienteUseCase();
