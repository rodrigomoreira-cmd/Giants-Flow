const express = require('express');
const router = express.Router();
const dbModule = require('../../database/connection');
const pool = dbModule.pool || dbModule;

// Middleware anti-cache
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// 1. MÃ‰TRICAS DO HUB
router.get('/hub/metricas', async (req, res) => {
  try {
    const { rows: f } = await pool.query('SELECT COUNT(*) FROM fichas');
    const { rows: u } = await pool.query('SELECT COUNT(*) FROM usuarios');
    res.json({
      totalParticipantes: parseInt(f[0]?.count || 0),
      totalEmpresas: parseInt(f[0]?.count || 0),
      totalUsuarios: parseInt(u[0]?.count || 0),
      entrevistasRealizadas: Math.max(0, parseInt(f[0]?.count || 0) - 1),
      propostasAguardando: 1,
      taxaConversao: '78%'
    });
  } catch (err) {
    res.json({});
  }
});

// 2. AUXILIARES: MESAS COM SEUS ENTREVISTADORES ESCALADOS E OCUPANTES
router.get('/auxiliares', async (req, res) => {
  try {
    const { rows: entrevistadores } = await pool.query(
      'SELECT id, nome, email, papel, ativo FROM usuarios WHERE ativo = true ORDER BY nome ASC'
    );
    const { rows: turmas } = await pool.query(
      'SELECT id, codigo, nome, ativa FROM turmas ORDER BY id ASC'
    );

    const { rows: ocupantes } = await pool.query(`
      SELECT id, nome_participante AS nome, empresa,
             mesa_alocada, almoco_pago, cortesia_almoco, membro_giants, etapa_funil,
             entrevistador_id, entrevistadores_ids
      FROM fichas
      WHERE mesa_alocada IS NOT NULL
      ORDER BY id ASC
    `);

    let listaMesas = [];
    try {
      const { rows: dbMesas } = await pool.query('SELECT * FROM mesas ORDER BY numero ASC');
      if (dbMesas && dbMesas.length > 0) listaMesas = dbMesas;
    } catch (_) {}

    if (listaMesas.length === 0) {
      listaMesas = [
        { id: 1, numero: 1, nome: 'Mesa 1', capacidade_total: 4, entrevistadores_ids: [] },
        { id: 2, numero: 2, nome: 'Mesa 2', capacidade_total: 4, entrevistadores_ids: [] },
        { id: 3, numero: 3, nome: 'Mesa 3', capacidade_total: 4, entrevistadores_ids: [] },
        { id: 4, numero: 4, nome: 'Mesa 4', capacidade_total: 4, entrevistadores_ids: [] },
        { id: 5, numero: 5, nome: 'Mesa 5', capacidade_total: 4, entrevistadores_ids: [] },
        { id: 6, numero: 6, nome: 'Mesa 6', capacidade_total: 4, entrevistadores_ids: [] }
      ];
    }

    const mesasComOcupantes = listaMesas.map(m => {
      const numMesa = Number(m.numero || m.id);
      
      // Entrevistadores fixos/escalados nesta mesa fÃ­sica
      const idsMesaEntr = Array.isArray(m.entrevistadores_ids) && m.entrevistadores_ids.length > 0
        ? m.entrevistadores_ids
        : (m.entrevistador_id ? [m.entrevistador_id] : []);

      const entrevistadoresEscalados = (entrevistadores || [])
        .filter(e => idsMesaEntr.includes(e.id))
        .map(e => ({ id: e.id, nome: e.nome, email: e.email }));

      // EmpresÃ¡rios sentados nesta mesa
      const detalhes = ocupantes
        .filter(f => Number(f.mesa_alocada) === Number(m.id) || Number(f.mesa_alocada) === numMesa)
        .map(f => {
          const entrIndividual = (entrevistadores || []).find(e => e.id === f.entrevistador_id);
          return {
            entrevista_id: f.id,
            nome: f.nome,
            nome_cracha: f.nome,
            empresa: f.empresa,
            etapa_funil: f.etapa_funil,
            status_almoco: (f.almoco_pago || f.cortesia_almoco || f.membro_giants) ? 'liberado' : 'pendente',
            entrevistador_id: f.entrevistador_id,
            entrevistador_nome: entrIndividual ? entrIndividual.nome : 'NÃ£o definido'
          };
        });

      return {
        id: m.id,
        numero: numMesa,
        nome: m.nome || `Mesa ${numMesa}`,
        capacidade_total: m.capacidade_total || 4,
        ocupantes: detalhes.length,
        ocupantes_detalhes: detalhes,
        entrevistadores_ids: idsMesaEntr,
        entrevistadores_escalados: entrevistadoresEscalados,
        entrevistadorNome: entrevistadoresEscalados.map(e => e.nome).join(', ') || null,
        tem_entrevistador: entrevistadoresEscalados.length > 0
      };
    });

    res.json({
      entrevistadores: entrevistadores || [],
      turmas: turmas || [],
      mesas: mesasComOcupantes
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ESCALA DE ENTREVISTADORES NA MESA (PATCH /mesas/:id/entrevistadores)
router.patch('/mesas/:id/entrevistadores', async (req, res) => {
  try {
    let ids = req.body.entrevistadores_ids || [];
    if (!Array.isArray(ids)) ids = ids ? [ids] : [];
    ids = ids.map(Number).filter(n => !isNaN(n) && n > 0);
    const tem = ids.length > 0;
    const prim = tem ? ids[0] : null;

    const { rows } = await pool.query(
      `UPDATE mesas 
       SET entrevistadores_ids = $1, 
           tem_entrevistador = $2, 
           entrevistador_id = $3 
       WHERE id = $4 OR numero = $4 
       RETURNING *`,
      [ids, tem, prim, req.params.id]
    );

    res.json(rows[0] || { sucesso: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. CLIENTES COM CASHBACK ATÃ”MICO
router.get('/clientes', async (req, res) => {
  try {
    const { turmaId } = req.query;
    let query = `
      SELECT f.id, f.empresa, f.nome_participante AS nome_completo, f.email, f.telefone,
             f.cnpj, f.etapa_funil AS status, f.almoco_pago, f.cortesia_almoco, f.membro_giants,
             f.cashback, f.mesa_alocada, f.mesa_alocada AS "mesaId", f.assento_alocado, f.assento_alocado AS "assentoId",
             f.entrevistador_id, f.created_at
      FROM fichas f
    `;
    const params = [];
    if (turmaId) { query += ' WHERE f.turma_id = $1 OR f.turma_id IS NULL'; params.push(turmaId); }
    query += ' ORDER BY f.id DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/clientes', async (req, res) => {
  try {
    const { empresa, nome, email, telefone, cnpj, turmaId } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO fichas (empresa, nome_participante, email, telefone, cnpj, turma_id, etapa_funil)
       VALUES ($1, $2, $3, $4, $5, $6, 'novo') RETURNING *`, [empresa, nome, email, telefone, cnpj, turmaId || 1]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/clientes/:id', async (req, res) => {
  try {
    const { almoco_pago, cortesia_almoco, cortesia } = req.body;
    const { rows } = await pool.query(
      `UPDATE fichas 
       SET almoco_pago = COALESCE($1, almoco_pago),
           cortesia_almoco = COALESCE($2, COALESCE($3, cortesia_almoco))
       WHERE id = $4 RETURNING *`,
      [almoco_pago, cortesia_almoco, cortesia, req.params.id]
    );
    res.json(rows[0] || { sucesso: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/clientes/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    let { empresa, nome_completo, email, telefone, cnpj, cashback } = req.body;

    if (cashback !== undefined && cashback !== null) {
      cashback = Number(cashback);
      if (isNaN(cashback) || !isFinite(cashback)) {
        return res.status(400).json({ error: 'O valor do cashback deve ser um nÃºmero vÃ¡lido.' });
      }
      if (cashback < 0) {
        return res.status(400).json({ error: 'O cashback nÃ£o pode ser um valor negativo.' });
      }
      if (cashback > 50000) {
        return res.status(400).json({ error: 'O cashback ultrapassa o limite teto permitido (R$ 50.000,00).' });
      }
    }

    await client.query('BEGIN');

    const { rows: clienteAtual } = await client.query(
      'SELECT id, cashback, empresa FROM fichas WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (clienteAtual.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cliente nÃ£o encontrado.' });
    }

    const { rows } = await client.query(
      `UPDATE fichas 
       SET empresa = COALESCE($1, empresa),
           nome_participante = COALESCE($2, nome_participante),
           email = COALESCE($3, email),
           telefone = COALESCE($4, telefone),
           cnpj = COALESCE($5, cnpj),
           cashback = COALESCE($6, cashback),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 
       RETURNING *`,
      [empresa, nome_completo, email, telefone, cnpj, cashback, id]
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

// 4. FINANCEIRO COM IDEMPOTÃŠNCIA
router.get('/financeiro/propostas', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM fichas ORDER BY id DESC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/financeiro/analisar', async (req, res) => {
  const client = await pool.connect();
  try {
    const { proposta_id, fichaId, decisao } = req.body;
    const targetId = proposta_id || fichaId;
    if (!targetId || !decisao) return res.status(400).json({ error: 'ParÃ¢metros obrigatÃ³rios ausentes.' });

    await client.query('BEGIN');
    const { rows: atual } = await client.query('SELECT status_aprovacao, etapa_funil FROM fichas WHERE id = $1 FOR UPDATE', [targetId]);
    if (atual.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Ficha nÃ£o encontrada.' });
    }

    const novoStatus = (decisao === 'APROVAR' || decisao === 'aprovado') ? 'aprovada' : 'recusada';
    const novaEtapa = novoStatus === 'aprovada' ? 'fechamento' : 'negociacao';

    if (atual[0].status_aprovacao === novoStatus) {
      await client.query('COMMIT');
      return res.json({ mensagem: 'OperaÃ§Ã£o jÃ¡ processada (idempotente).', status: novoStatus });
    }

    const { rows } = await client.query(
      'UPDATE fichas SET status_aprovacao = $1, etapa_funil = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
      [novoStatus, novaEtapa, targetId]
    );
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

// 5. USUÃRIOS
router.get('/usuarios', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, nome, email, papel, ativo FROM usuarios ORDER BY id ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/usuarios', async (req, res) => {
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
      [nome.trim(), email.trim().toLowerCase(), papelFinal, senha || '123456', statusAtivo]
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
router.put('/usuarios/:id', async (req, res) => {
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

router.patch('/usuarios/:id/papel', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { papel } = req.body;

    const papeisValidos = ['admin', 'entrevistador', 'operador', 'recepcao', 'vendedor', 'financeiro'];
    if (!papel || !papeisValidos.includes(String(papel).toLowerCase())) {
      return res.status(400).json({ error: `Papel invÃ¡lido. OpÃ§Ãµes vÃ¡lidas: ${papeisValidos.join(', ')}` });
    }

    await client.query('BEGIN');

    const { rows: userRows } = await client.query(
      'SELECT id, nome, papel, ativo FROM usuarios WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (userRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'UsuÃ¡rio nÃ£o encontrado.' });
    }

    const usuarioAtual = userRows[0];

    if (usuarioAtual.papel === 'admin' && papel.toLowerCase() !== 'admin') {
      const { rows: adminsAtivos } = await client.query(
        "SELECT COUNT(*) FROM usuarios WHERE papel = 'admin' AND ativo = true"
      );
      if (parseInt(adminsAtivos[0]?.count || 0) <= 1) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'OperaÃ§Ã£o bloqueada: nÃ£o Ã© permitido revogar o papel do Ãºltimo administrador ativo.' });
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

router.patch('/usuarios/:id/status', async (req, res) => {
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

// 6. ALOCAÃ‡ÃƒO DO EMPRESÃRIO NA MESA COM ENTREVISTADOR DESIGNADO
router.post('/entrevistas/agendar', async (req, res) => {
  const client = await pool.connect();
  try {
    const b = req.body;
    const id = b.aplicacaoId || b.cliente_id || b.fichaId || b.id;
    const mesa = b.mesaId || b.mesa_id || b.mesa;
    const entrevistadorId = b.entrevistador_id ? Number(b.entrevistador_id) : (b.entrevistadores_ids?.[0] ? Number(b.entrevistadores_ids[0]) : null);

    if (!id || !mesa) return res.status(400).json({ error: 'ID do participante ou Mesa nÃ£o fornecidos.' });

    await client.query('BEGIN');

    const { rows: clienteRows } = await client.query(
      'SELECT almoco_pago, cortesia_almoco, membro_giants FROM fichas WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (clienteRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cliente nÃ£o encontrado.' });
    }

    const c = clienteRows[0];
    const liberadoAlmoco = Boolean(c.membro_giants) || Boolean(c.almoco_pago) || Boolean(c.cortesia_almoco);

    if (!liberadoAlmoco) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Acesso negado: participante nÃ£o possui almoÃ§o pago nem cortesia ativa.' });
    }

    const { rows } = await client.query(
      `UPDATE fichas 
       SET etapa_funil = 'entrevista', 
           mesa_alocada = $1, 
           entrevistador_id = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 
       RETURNING *`,
      [mesa, entrevistadorId, id]
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

router.post('/entrevistas/resultado', async (req, res) => {
  try {
    const id = req.body.entrevista_id || req.body.fichaId || req.body.participanteId || req.body.id || req.body.aplicacaoId;
    const resString = String(req.body.resultado || '').toLowerCase();
    
    let novaEtapa = 'aguardando_aprovacao';
    if (resString.includes('reprovado')) {
      novaEtapa = 'reprovado';
    } else if (resString.includes('proposta') || resString.includes('aprovado')) {
      novaEtapa = 'aguardando_aprovacao';
    } else if (resString.includes('almoco')) {
      novaEtapa = 'almoco';
    }

    const { rows } = await pool.query(
      "UPDATE fichas SET etapa_funil = $1, mesa_alocada = NULL, assento_alocado = NULL WHERE id = $2 RETURNING *",
      [novaEtapa, id]
    );
    res.json(rows[0] || { sucesso: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/mesas/cadeiras/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE fichas SET mesa_alocada = NULL, assento_alocado = NULL WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    res.json({ sucesso: true, ficha: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

let nextMesaId = 7;
router.post('/mesas', (req, res) => {
  const { numero, capacidade_total, formato } = req.body;
  res.status(201).json({ id: nextMesaId++, numero, capacidade_total, formato, nome: `Mesa ${numero}` });
});

module.exports = router;
