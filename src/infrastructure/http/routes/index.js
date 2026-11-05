// src/infrastructure/http/routes/index.js
const { Router } = require('express');
const controller = require('../controllers/ApiController');
const produtosRoutes = require('./produtos.routes');

const routes = Router();

// Autentica??o
routes.post('/auth/login', (req, res) => controller.login(req, res));

// Apoio
routes.get('/auxiliares', (req, res) => controller.carregarDadosIniciais(req, res));

// Cat?logo de Produtos
routes.use('/produtos', produtosRoutes);

// Gest?o de Utilizadores
routes.get('/usuarios', (req, res) => controller.listarUsuarios(req, res));
routes.post('/usuarios', (req, res) => controller.criarUsuario(req, res));
routes.put('/usuarios/:id', (req, res) => controller.editarUsuario(req, res));
routes.patch('/usuarios/:id/status', (req, res) => controller.alternarStatusUsuario(req, res));
routes.delete('/usuarios/:id', (req, res) => controller.removerUsuario(req, res));

// Pitch (Controle de Palco e Libera??o de Pre?o)
routes.get('/pitch/produtos', (req, res) => controller.listarProdutosPitch(req, res));
routes.put('/pitch/produtos/:id', (req, res) => controller.salvarDadosPitch(req, res));
routes.post('/pitch/produtos/:id/liberar', (req, res) => controller.liberarValorPitch(req, res));

// Mesas e Cadeiras
routes.post('/mesas', (req, res) => controller.criarMesa(req, res));
routes.delete('/mesas/:id', (req, res) => controller.removerMesa(req, res));
routes.patch('/mesas/:id/capacidade', (req, res) => controller.alterarCapacidadeMesa(req, res));
routes.patch('/mesas/:id/entrevistador', (req, res) =>
  controller.alternarEntrevistadorMesa(req, res)
);
routes.delete('/mesas/cadeiras/:entrevistaId', (req, res) => controller.desalocarCadeira(req, res));

// Fichas
routes.post('/clientes', (req, res) => controller.criarFicha(req, res));
routes.get('/clientes', (req, res) => controller.listarClientes(req, res));
routes.put('/clientes/:id', (req, res) => controller.editarCliente(req, res));

// Entrevistas
routes.post('/entrevistas/agendar', (req, res) => controller.agendarEntrevista(req, res));
routes.post('/entrevistas/resultado', (req, res) =>
  controller.registrarResultadoEntrevista(req, res)
);

// Propostas
routes.get('/propostas', (req, res) => controller.listarPropostas(req, res));
routes.post('/propostas', (req, res) => controller.criarProposta(req, res));
routes.patch('/propostas/:id/vender', (req, res) => controller.marcarVendido(req, res));

// Financeiro
routes.get('/financeiro/propostas', (req, res) => controller.listarPropostasFinanceiro(req, res));
routes.post('/financeiro/analisar', (req, res) => controller.analisarFinanceiro(req, res));

// Cockpit Hub
routes.get('/hub/metricas', (req, res) => controller.obterMetricasHub(req, res));
routes.get('/hub/busca', (req, res) => controller.buscarParticipanteHub(req, res));

module.exports = routes;

