const fichaRepository = require('../../database/repositories/FichaRepository');

class FichaController {
  async listar(req, res) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    try {
      const fichas = await fichaRepository.listarTodas();
      return res.status(200).json(fichas);
    } catch (error) {
      console.error('Erro ao listar fichas:', error);
      return res.status(500).json({ erro: 'Falha ao obter fichas da base de dados.' });
    }
  }

  async criar(req, res) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    try {
      const { nome, telefone } = req.body;

      if (!nome || !telefone) {
        return res.status(400).json({ erro: 'Nome e WhatsApp/Telefone são obrigatórios.' });
      }

      const novaFicha = await fichaRepository.criar(req.body);
      return res.status(201).json(novaFicha);
    } catch (error) {
      console.error('Erro ao registar ficha:', error);
      return res.status(500).json({ erro: 'Falha ao guardar a ficha no banco de dados.' });
    }
  }
}

module.exports = new FichaController();