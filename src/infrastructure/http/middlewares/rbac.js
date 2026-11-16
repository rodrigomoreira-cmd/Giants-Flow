const { verificarJWT } = require('../../security/jwt');

function normalizarPapel(papelRaw) {
  const p = String(papelRaw || '').trim().toUpperCase();
  if (['ADMINISTRADOR', 'SUPERADMIN', 'MASTER', 'SYSTEM', 'DIRETOR'].includes(p)) {
    return 'ADMIN';
  }
  return p;
}

function obterUsuarioAutenticado(req) {
  if (req.usuario && req.usuario.id) {
    return {
      id: Number(req.usuario.id),
      nome: req.usuario.nome || '',
      email: req.usuario.email || '',
      papel: normalizarPapel(req.usuario.papel)
    };
  }

  const authHeader = req.headers?.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (token) {
    const payload = verificarJWT(token);
    if (payload && payload.sub) {
      return {
        id: Number(payload.sub),
        nome: '',
        email: '',
        papel: normalizarPapel(payload.role)
      };
    }
  }

  return null;
}

function obterPapelUsuario(req) {
  const user = obterUsuarioAutenticado(req);
  return user ? user.papel : '';
}

function exigirAutenticacao(req, res, next) {
  const user = obterUsuarioAutenticado(req);
  if (!user || !user.id) {
    return res.status(401).json({
      error: 'Autenticação obrigatória. Faça login novamente para continuar.'
    });
  }
  req.usuarioAutenticado = user;
  return next();
}

function exigirPapeis(...papeisPermitidos) {
  const permitidos = new Set(papeisPermitidos.map((p) => normalizarPapel(p)));

  return (req, res, next) => {
    const user = obterUsuarioAutenticado(req);
    if (!user || !user.id) {
      return res.status(401).json({
        error: 'Autenticação obrigatória. Faça login novamente para continuar.'
      });
    }

    if (!permitidos.has(user.papel)) {
      return res.status(403).json({
        error: `Acesso negado (RBAC): seu perfil (${user.papel || 'SEM_PERFIL'}) não possui permissão para executar esta operação.`
      });
    }

    req.usuarioAutenticado = user;
    return next();
  };
}

module.exports = {
  normalizarPapel,
  obterUsuarioAutenticado,
  obterPapelUsuario,
  exigirAutenticacao,
  exigirPapeis
};
