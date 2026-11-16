const { exigirPapeis } = require('../middlewares/rbac');
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const dbModule = require('../../database/connection');
const pool = dbModule.pool || dbModule;

// 5. USUÁRIOS
router.get('/usuarios', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, nome, email, papel, ativo FROM usuarios ORDER BY id ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/usuarios', exigirPapeis('ADMIN'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { nome, email, papel, senha, ativo } = req.body;
    if (!nome || !email) {
      return res.status(400).json({ error: 'Nome e e-mail são obrigatórios.' });
    }

    const papeisValidos = ['admin', 'entrevistador', 'operador', 'recepcao', 'vendedor', 'financeiro', 'aprovador'];
    const papelFinal = (papel || 'entrevistador').toLowerCase();
    const statusAtivo = ativo !== false;

    await client.query('BEGIN');

    const existe = await client.query('SELECT id FROM usuarios WHERE LOWER(email) = LOWER($1)', [email.trim()]);
    if (existe.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Já existe um usuário cadastrado com este e-mail corporativo.' });
    }

    const { rows } = await client.query(
      `INSERT INTO usuarios (nome, email, papel, senha, pin, ativo)
       VALUES ($1, $2, $3, $4, '1234', $5)
       RETURNING id, nome, email, papel, ativo`,
      [nome.trim(), email.trim().toLowerCase(), papelFinal, await bcrypt.hash(senha || '123456', 10), statusAtivo]
    );

    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Erro ao cadastrar usuário: ' + err.message });
  } finally {
    client.release();
  }
});

// ATUALIZAR DADOS COMPLETOS DO USUÁRIO COM SALVAGUARDAS
router.put('/usuarios/:id', exigirPapeis('ADMIN'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { nome, email, papel, senha, ativo } = req.body;
    await client.query('BEGIN');
    const { rows: userRows } = await client.query(
      'SELECT id, nome, papel, ativo FROM usuarios WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (userRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    const usuarioAtual = userRows[0];
    const novoPapel = papel ? papel.toLowerCase() : usuarioAtual.papel;
    const novoAtivo = typeof ativo === 'boolean' ? ativo : usuarioAtual.ativo;
    if ((usuarioAtual.papel === 'admin' && novoPapel !== 'admin') || (usuarioAtual.ativo === true && novoAtivo === false && usuarioAtual.papel === 'admin')) {
      // Trava atômica serializada no PostgreSQL para mutação de perfil admin (Lock ID: 987654321)
      await client.query('SELECT pg_advisory_xact_lock(987654321)');
      const { rows: adminsAtivos } = await client.query(
        "SELECT COUNT(*) FROM usuarios WHERE papel = 'admin' AND ativo = true"
      );
      if (parseInt(adminsAtivos[0]?.count || 0) <= 1) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Operação bloqueada: não é permitido desativar ou revogar o perfil do único administrador ativo.' });
      }
    }
    let queryUpdate = 'UPDATE usuarios SET nome = $1, email = $2, papel = $3, ativo = $4';
    let params = [
      nome ? nome.trim() : usuarioAtual.nome,
      email ? email.trim().toLowerCase() : usuarioAtual.email,
      novoPapel,
      novoAtivo
    ];
    if (senha && senha.trim()) {
      params.push(senha.trim());
      queryUpdate += ' , senha = $' + params.length;
    }
    params.push(id);
    queryUpdate += ' WHERE id = $' + params.length + ' RETURNING id, nome, email, papel, ativo';
    const { rows } = await client.query(queryUpdate, params);
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Erro ao atualizar usuário: ' + err.message });
  } finally {
    client.release();
  }
});

router.patch('/usuarios/:id/papel', exigirPapeis('ADMIN'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { papel } = req.body;

    const papeisValidos = ['admin', 'entrevistador', 'operador', 'recepcao', 'vendedor', 'financeiro'];
    if (!papel || !papeisValidos.includes(String(papel).toLowerCase())) {
      return res.status(400).json({ error: `Papel inválido. Opções válidas: ${papeisValidos.join(', ')}` });
    }

    await client.query('BEGIN');

    const { rows: userRows } = await client.query(
      'SELECT id, nome, papel, ativo FROM usuarios WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (userRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const usuarioAtual = userRows[0];

    if (usuarioAtual.papel === 'admin' && papel.toLowerCase() !== 'admin') {
      // Trava atômica serializada no PostgreSQL para mutação de perfil admin (Lock ID: 987654321)
      await client.query('SELECT pg_advisory_xact_lock(987654321)');
      const { rows: adminsAtivos } = await client.query(
        "SELECT COUNT(*) FROM usuarios WHERE papel = 'admin' AND ativo = true"
      );
      if (parseInt(adminsAtivos[0]?.count || 0) <= 1) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Operação bloqueada: não é permitido revogar o papel do último administrador ativo.' });
      }
    }

    const { rows } = await client.query(
      'UPDATE usuarios SET papel = $1 WHERE id = $2 RETURNING id, nome, email, papel, ativo',
      [papel.toLowerCase(), id]
    );

    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.patch('/usuarios/:id/status', exigirPapeis('ADMIN'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    let { ativo } = req.body;

    // Normaliza booleano com segurança (aceita boolean puro, string 'false' ou 0)
    const ativoFinal = (ativo === true || ativo === 'true' || ativo === 1 || ativo === '1');

    await client.query('BEGIN');

    const { rows: userRows } = await client.query(
      'SELECT id, nome, papel, ativo FROM usuarios WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (userRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const usuarioAtual = userRows[0];

    // Salvaguarda: impede desativar o último administrador ativo
    if (usuarioAtual.papel === 'admin' && ativoFinal === false) {
      // Trava atômica serializada no PostgreSQL para inativação de admin (Lock ID: 987654321)
      await client.query('SELECT pg_advisory_xact_lock(987654321)');
      const { rows: adminsAtivos } = await client.query(
        "SELECT COUNT(*) FROM usuarios WHERE papel = 'admin' AND ativo = true"
      );
      if (parseInt(adminsAtivos[0]?.count || 0) <= 1) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Operação bloqueada: não é permitido desativar o único administrador ativo.' });
      }
    }

    const { rows } = await client.query(
      'UPDATE usuarios SET ativo = $1 WHERE id = $2 RETURNING id, nome, email, papel, ativo',
      [ativoFinal, id]
    );

    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Erro ao persistir status: ' + err.message });
  } finally {
    client.release();
  }
});


module.exports = router;
