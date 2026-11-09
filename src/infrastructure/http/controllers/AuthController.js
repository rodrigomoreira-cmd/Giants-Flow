const usuarioRepository = require('../../database/repositories/UsuarioRepository');

class AuthController {
  async login(req, res) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    try {
      const email = req.body.email;
      const senha = req.body.senha || req.body.password;

      if (!email || !senha) {
        return res.status(400).json({ erro: 'E-mail e senha são obrigatórios.' });
      }

      const usuario = await usuarioRepository.buscarPorEmail(email.trim().toLowerCase());

      if (!usuario || usuario.senha !== senha) {
        return res.status(401).json({ erro: 'Credenciais inválidas.' });
      }

      return res.status(200).json({
        token: `jwt-session-${usuario.id}-${Date.now()}`,
        usuario: {
          id: usuario.id,
          nome: usuario.nome,
          email: usuario.email,
          papel: usuario.papel
        }
      });
    } catch (error) {
      console.error('Erro no login:', error);
      return res.status(500).json({ erro: 'Erro interno ao autenticar usuário.' });
    }
  }
}

module.exports = new AuthController();