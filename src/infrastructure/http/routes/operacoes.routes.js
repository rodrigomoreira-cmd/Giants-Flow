const express = require('express');
const router = express.Router();

// Middleware global anti-cache para todas as operações
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Submódulos desacoplados
router.use(require('./metricas.routes'));
router.use(require('./mesas.routes'));
router.use(require('./clientes.routes'));
router.use(require('./propostas.routes'));
router.use(require('./usuarios.routes'));
router.use(require('./entrevistas.routes'));
router.use(require('./warroom.routes'));

module.exports = router;
