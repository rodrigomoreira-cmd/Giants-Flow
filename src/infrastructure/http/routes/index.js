const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const fichasRoutes = require('./fichas.routes');
const produtosRoutes = require('./produtos.routes');
const adminRoutes = require('./admin.routes');
const operacoesRoutes = require('./operacoes.routes');

router.use('/auth', authRoutes);
router.use('/fichas', fichasRoutes);
router.use('/produtos', produtosRoutes);
router.use('/', adminRoutes);
router.use('/', operacoesRoutes); // <- O link que faltava!

module.exports = router;