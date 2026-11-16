
function sanitizarEmpresaLgpd(valor) {
  if (!valor) return valor;
  return String(valor)
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '')
    .replace(/\b\d{11}\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function extrairCnpjSomentePj(valor) {
  if (!valor) return null;
  const digits = String(valor).replace(/\D/g, '');
  return digits.length === 14 ? String(valor).trim() : null;
}

﻿// src/infrastructure/http/controllers/ApiController.js
const { pool } = require('../../database/connection');
const criarClienteUseCase = require('../../../application/use-cases/cliente/CriarClienteUseCase');
const agendarEntrevistaUseCase = require('../../../application/use-cases/entrevista/AgendarEntrevistaUseCase');
const registrarResultadoEntrevistaUseCase = require('../../../application/use-cases/entrevista/RegistrarResultadoEntrevistaUseCase');
const criarPropostaUseCase = require('../../../application/use-cases/proposta/CriarPropostaUseCase');
const processarAnaliseFinanceiraUseCase = require('../../../application/use-cases/financeiro/ProcessarAnaliseFinanceiraUseCase');
const propostaRepository = require('../../database/repositories/PropostaRepository');
const clienteRepository = require('../../database/repositories/ClienteRepository');
const entrevistaRepository = require('../../database/repositories/EntrevistaRepository');

class ApiController {
  // =========================================================================
  // AUTENTICA????O COM E-MAIL E SENHA
  // =========================================================================
  async login(req, res) {
    try {
      const { email, senha } = req.body;
      if (!email || !senha) {
        return res.status(400).json({ erro: 'E-mail e senha s??o obrigat??rios.' });
      }

      const query = `
        SELECT id, nome, email, papel, COALESCE(senha, pin, '1234') AS senha,
               COALESCE(ativo, true) AS ativo
        FROM usuarios
        WHERE LOWER(email) = LOWER($1);
      `;
      const { rows } = await pool.query(query, [String(email).trim()]);

      if (rows.length === 0) {
        return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
      }

      const usuario = rows[0];
      if (!usuario.ativo) {
        return res.status(403).json({ erro: 'Este operador est?? inativo no sistema.' });
      }

      if (usuario.senha !== String(senha).trim()) {
        return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
      }

      return res.status(200).json({
        usuario: {
          id: usuario.id,
          nome: usuario.nome,
          email: usuario.email,
          papel: usuario.papel,
        },
      });
    } catch (error) {
      console.error('???? Erro no login:', error);
      return res.status(500).json({ erro: 'Falha interna ao autenticar.' });
    }
  }

  // =========================================================================
  // GEST??O DE USU??RIOS
  // =========================================================================
  async listarUsuarios(_req, res) {
    try {
      const query = `
        SELECT id, nome, email, papel, COALESCE(ativo, true) AS ativo, foto
        FROM usuarios
        ORDER BY id ASC;
      `;
      const { rows } = await pool.query(query);
      return res.status(200).json(rows);
    } catch (error) {
      return res.status(500).json({ erro: error.message });
    }
  }

  async criarUsuario(req, res) {
    try {
      const { nome, email, papel, senha } = req.body;
      if (!nome || !email || !papel || !senha) {
        return res.status(400).json({ erro: 'Nome, E-mail, Papel e Senha s??o obrigat??rios.' });
      }

      const emailCheck = await pool.query(
        'SELECT id FROM usuarios WHERE LOWER(email) = LOWER($1);',
        [String(email).trim()]
      );
      if (emailCheck.rows.length > 0) {
        return res.status(400).json({ erro: 'J?? existe um operador com este e-mail cadastrado.' });
      }

      const query = `
        INSERT INTO usuarios (nome, email, papel, senha, pin, ativo)
        VALUES ($1, $2, $3, $4, $4, true)
        RETURNING id, nome, email, papel, ativo;
      `;
      const { rows } = await pool.query(query, [
        String(nome).trim(),
        String(email).trim(),
        String(papel).trim(),
        String(senha).trim(),
      ]);
      return res.status(201).json(rows[0]);
    } catch (error) {
      return res.status(400).json({ erro: error.message });
    }
  }

  async editarUsuario(req, res) {
    try {
      const { id } = req.params;
      const { nome, email, papel, senha } = req.body;

      if (!nome || !email || !papel) {
        return res.status(400).json({ erro: 'Nome, E-mail e Papel s??o obrigat??rios.' });
      }

      const emailCheck = await pool.query(
        'SELECT id FROM usuarios WHERE LOWER(email) = LOWER($1) AND id != $2;',
        [String(email).trim(), Number(id)]
      );
      if (emailCheck.rows.length > 0) {
        return res
          .status(400)
          .json({ erro: 'J?? existe outro operador com este e-mail cadastrado.' });
      }

      let query, params;
      if (senha && String(senha).trim()) {
        query = `
          UPDATE usuarios
          SET nome = $1, email = $2, papel = $3, senha = $4, pin = $4
          WHERE id = $5
          RETURNING id, nome, email, papel, ativo;
        `;
        params = [
          String(nome).trim(),
          String(email).trim(),
          String(papel).trim(),
          String(senha).trim(),
          Number(id),
        ];
      } else {
        query = `
          UPDATE usuarios
          SET nome = $1, email = $2, papel = $3
          WHERE id = $4
          RETURNING id, nome, email, papel, ativo;
        `;
        params = [String(nome).trim(), String(email).trim(), String(papel).trim(), Number(id)];
      }

      const { rows } = await pool.query(query, params);
      if (rows.length === 0) return res.status(404).json({ erro: 'Utilizador n??o encontrado.' });

      return res.status(200).json(rows[0]);
    } catch (error) {
      return res.status(400).json({ erro: error.message });
    }
  }

  async alternarStatusUsuario(req, res) {
    try {
      const { id } = req.params;
      const { rows } = await pool.query(
        'UPDATE usuarios SET ativo = NOT COALESCE(ativo, true) WHERE id = $1 RETURNING *;',
        [Number(id)]
      );
      if (rows.length === 0) return res.status(404).json({ erro: 'Utilizador n??o encontrado.' });
      return res.status(200).json(rows[0]);
    } catch (error) {
      return res.status(400).json({ erro: error.message });
    }
  }

  async removerUsuario(req, res) {
    try {
      const { id } = req.params;
      const checagemFichas = await pool.query(
        'SELECT COUNT(*)::INT AS total FROM aplicacoes WHERE responsavel_ficha_id = $1;',
        [Number(id)]
      );
      if (checagemFichas.rows[0].total > 0) {
        return res
          .status(400)
          .json({ erro: 'N??o ?? poss??vel remover: operador possui fichas vinculadas. Desative-o.' });
      }

      const checagemEntrevistas = await pool.query(
        'SELECT COUNT(*)::INT AS total FROM entrevistas WHERE entrevistador_id = $1;',
        [Number(id)]
      );
      if (checagemEntrevistas.rows[0].total > 0) {
        return res
          .status(400)
          .json({ erro: 'N??o ?? poss??vel remover: operador realizou entrevistas. Desative-o.' });
      }

      const { rows } = await pool.query('DELETE FROM usuarios WHERE id = $1 RETURNING *;', [
        Number(id),
      ]);
      if (rows.length === 0) return res.status(404).json({ erro: 'Utilizador n??o encontrado.' });
      return res.status(200).json({ sucesso: true });
    } catch (error) {
      return res.status(400).json({ erro: error.message });
    }
  }

  // =========================================================================
  // M??DULO PITCH (OFERTA MANUAL E UPLOAD DE IMAGEM DO SLIDE)
  // =========================================================================
  async listarProdutosPitch(_req, res) {
    try {
      const query = `
        SELECT id, nome, COALESCE(valor_base, 0) AS valor_base, COALESCE(condicoes_palco, '') AS condicoes_palco,
               COALESCE(bonus_anunciados, '') AS bonus_anunciados, COALESCE(imagem_pitch, '') AS imagem_pitch,
               COALESCE(status_pitch, 'aguardando') AS status_pitch, COALESCE(pitch_liberado, false) AS pitch_liberado,
               liberado_em
        FROM produtos WHERE ativo = true ORDER BY id ASC;
      `;
      const { rows } = await pool.query(query);
      return res.status(200).json(rows);
    } catch (error) {
      return res.status(500).json({ erro: error.message });
    }
  }

  async salvarDadosPitch(req, res) {
    try {
      const { id } = req.params;
      const { condicoesPalco, bonusAnunciados, valorBase, imagemPitch } = req.body;
      const query = `
        UPDATE produtos
        SET condicoes_palco = $1, bonus_anunciados = $2, valor_base = $3, imagem_pitch = COALESCE($4, imagem_pitch)
        WHERE id = $5 RETURNING *;
      `;
      const { rows } = await pool.query(query, [
        String(condicoesPalco || ''),
        String(bonusAnunciados || ''),
        valorBase ? Number(valorBase) : 0,
        imagemPitch || null,
        Number(id),
      ]);
      if (rows.length === 0) return res.status(404).json({ erro: 'Produto n??o encontrado.' });
      return res.status(200).json(rows[0]);
    } catch (error) {
      return res.status(400).json({ erro: error.message });
    }
  }

  async liberarValorPitch(req, res) {
    try {
      const { id } = req.params;
      const { valorAnunciado, condicoesPalco, bonusAnunciados, imagemPitch } = req.body;
      if (!valorAnunciado || Number(valorAnunciado) <= 0) {
        return res.status(400).json({ erro: 'Informe o valor oficial da oferta.' });
      }

      const query = `
        UPDATE produtos
        SET valor_base = $1, condicoes_palco = $2, bonus_anunciados = $3, imagem_pitch = COALESCE($4, imagem_pitch),
            status_pitch = 'liberado', pitch_liberado = true, liberado_em = NOW()
        WHERE id = $5 RETURNING *;
      `;
      const { rows } = await pool.query(query, [
        Number(valorAnunciado),
        String(condicoesPalco || ''),
        String(bonusAnunciados || ''),
        imagemPitch || null,
        Number(id),
      ]);
      if (rows.length === 0) return res.status(404).json({ erro: 'Produto n??o encontrado.' });
      return res.status(200).json(rows[0]);
    } catch (error) {
      return res.status(400).json({ erro: error.message });
    }
  }

  // =========================================================================
  // COCKPIT DO HUB (M??TRICAS & BUSCA GLOBAL)
  // =========================================================================
  async obterMetricasHub(_req, res) {
    try {
      const fatRes = await pool
        .query(
          "SELECT COALESCE(SUM(valor_total), 0)::FLOAT AS faturamento, COUNT(*)::INT AS vendas FROM propostas WHERE status = 'vendido';"
        )
        .catch(() => ({ rows: [] }));
      const fichasRes = await pool
        .query('SELECT COUNT(*)::INT AS total FROM aplicacoes;')
        .catch(() => ({ rows: [] }));
      const mixRes = await pool
        .query(
          `SELECT p.nome, COUNT(pr.id)::INT AS quantidade FROM produtos p
           LEFT JOIN propostas pr ON pr.produto_id = p.id AND pr.status = 'vendido'
           WHERE p.ativo = true GROUP BY p.id, p.nome ORDER BY p.id ASC;`
        )
        .catch(() => ({ rows: [] }));

      const faturamentoTotal = fatRes.rows[0]?.faturamento || 0;
      const totalVendas = fatRes.rows[0]?.vendas || 0;
      const totalFichas = fichasRes.rows[0]?.total || 0;
      const taxaConversao =
        totalFichas > 0 ? Number(((totalVendas / totalFichas) * 100).toFixed(1)) : 0;
      const mixProdutos = (mixRes.rows || []).map((item) => ({
        nome: item.nome,
        quantidade: item.quantidade,
        percentual: totalVendas > 0 ? Math.round((item.quantidade / totalVendas) * 100) : 0,
      }));

      let ultimasVendas = [];
      try {
        const feedRes = await pool.query(`
          SELECT pr.id, COALESCE(a.nome_completo, 'Participante') AS cliente_nome, COALESCE(a.empresa, '') AS cliente_empresa,
                 p.nome AS produto_nome, pr.valor_total, TO_CHAR(NOW(), 'HH24:MI') AS hora_venda
          FROM propostas pr
          LEFT JOIN aplicacoes a ON a.id = pr.aplicacao_id LEFT JOIN produtos p ON p.id = pr.produto_id
          WHERE pr.status = 'vendido' ORDER BY pr.id DESC LIMIT 5;
        `);
        ultimasVendas = feedRes.rows;
      } catch (err) {}

      return res.status(200).json({
        faturamentoTotal,
        totalVendas,
        totalFichas,
        taxaConversao,
        mixProdutos,
        ultimasVendas,
      });
    } catch (error) {
      return res.status(500).json({ erro: error.message });
    }
  }

  async buscarParticipanteHub(req, res) {
    try {
      const { termo } = req.query;
      if (!termo || String(termo).trim().length < 2) return res.status(200).json([]);
      const query = `
        SELECT a.id, a.nome_completo, a.nome_cracha, a.empresa, a.etapa_atual, u.nome AS captador_nome, m.numero AS mesa_numero
        FROM aplicacoes a LEFT JOIN usuarios u ON u.id = a.responsavel_ficha_id
        LEFT JOIN entrevistas e ON e.aplicacao_id = a.id LEFT JOIN mesas m ON m.id = e.mesa_id
        WHERE LOWER(a.nome_completo) LIKE LOWER($1) OR LOWER(a.empresa) LIKE LOWER($1) OR LOWER(COALESCE(a.nome_cracha, '')) LIKE LOWER($1) LIMIT 6;
      `;
      const { rows } = await pool.query(query, [`%${String(termo).trim()}%`]);
      return res.status(200).json(rows);
    } catch (error) {
      return res.status(500).json({ erro: error.message });
    }
  }

  // =========================================================================
  // APOIO / CARGA INICIAL (BLINDAGEM CONTRA OCUPANTES ANTIGOS)
  // =========================================================================
  async carregarDadosIniciais(_req, res) {
    try {
      const [turmasRes, usuariosRes, mesasRes, produtosRes] = await Promise.all([
        pool
          .query('SELECT id, codigo, nome, ativa FROM turmas ORDER BY ativa DESC, nome ASC;')
          .catch(() => pool.query('SELECT * FROM turmas;')),
        pool.query('SELECT id, nome, papel FROM usuarios WHERE ativo = true ORDER BY nome;'),
        pool.query(`
          SELECT 
            m.id, 
            m.numero, 
            m.capacidade_total, 
            COALESCE(m.tem_entrevistador, true) AS tem_entrevistador, 
            COUNT(e.id) FILTER (WHERE a.etapa_atual = 'em_entrevista')::INT AS ocupantes,
            COALESCE(
              json_agg(
                json_build_object(
                  'entrevista_id', e.id, 
                  'aplicacao_id', a.id, 
                  'nome', a.nome_completo, 
                  'nome_cracha', a.nome_cracha,
                  'empresa', a.empresa, 
                  'etapa', a.etapa_atual, 
                  'status_almoco', e.status_almoco, 
                  'status_jantar', e.status_jantar, 
                  'observacoes', e.observacoes
                )
              ) FILTER (WHERE e.id IS NOT NULL AND a.etapa_atual = 'em_entrevista'), 
              '[]'
            ) AS ocupantes_detalhes
          FROM mesas m 
          LEFT JOIN entrevistas e ON e.mesa_id = m.id 
          LEFT JOIN aplicacoes a ON a.id = e.aplicacao_id
          GROUP BY m.id, m.numero, m.capacidade_total, m.tem_entrevistador 
          ORDER BY m.numero;
        `),
        pool
          .query('SELECT id, nome, valor_base FROM produtos ORDER BY valor_base;')
          .catch(() => pool.query('SELECT * FROM produtos;')),
      ]);

      const usuarios = usuariosRes.rows || [];
      const captadores = usuarios.filter((u) =>
        ['comercial', 'captador', 'admin'].includes(u.papel)
      );
      const entrevistadores = usuarios.filter((u) =>
        ['comercial', 'entrevistador', 'admin'].includes(u.papel)
      );

      return res.status(200).json({
        turmas: turmasRes.rows || [],
        entrevistadores,
        captadores,
        mesas: (mesasRes.rows || []).map((m) => ({
          ...m,
          formato: 'redonda',
          tem_entrevistador: m.tem_entrevistador !== false,
        })),
        produtos: produtosRes.rows || [],
      });
    } catch (error) {
      return res.status(500).json({ erro: error.message });
    }
  }

  // =========================================================================
  // MESAS E CADEIRAS
  // =========================================================================
  async criarMesa(req, res) {
    try {
      const { numero, capacidadeTotal } = req.body;
      const { rows } = await pool.query(
        'INSERT INTO mesas (numero, capacidade_total, tem_entrevistador) VALUES ($1, $2, true) RETURNING *;',
        [Number(numero), Number(capacidadeTotal) || 4]
      );
      return res.status(201).json({ ...rows[0], formato: 'redonda' });
    } catch (error) {
      return res.status(400).json({ erro: error.message });
    }
  }

  async alterarCapacidadeMesa(req, res) {
    try {
      const { id } = req.params;
      const { delta } = req.body;
      const { rows } = await pool.query(
        'UPDATE mesas SET capacidade_total = GREATEST(1, capacidade_total + $1) WHERE id = $2 RETURNING *;',
        [Number(delta), Number(id)]
      );
      return res.status(200).json({ ...rows[0], formato: 'redonda' });
    } catch (error) {
      return res.status(400).json({ erro: error.message });
    }
  }

  async alternarEntrevistadorMesa(req, res) {
    try {
      const { id } = req.params;
      const { rows } = await pool.query(
        'UPDATE mesas SET tem_entrevistador = NOT COALESCE(tem_entrevistador, true) WHERE id = $1 RETURNING *;',
        [Number(id)]
      );
      return res.status(200).json(rows[0]);
    } catch (error) {
      return res.status(400).json({ erro: error.message });
    }
  }

  async removerMesa(req, res) {
    try {
      const { id } = req.params;
      const checagem = await pool.query(
        `SELECT COUNT(e.id)::INT AS total 
         FROM entrevistas e 
         JOIN aplicacoes a ON a.id = e.aplicacao_id 
         WHERE e.mesa_id = $1 AND a.etapa_atual = 'em_entrevista';`,
        [Number(id)]
      );
      if (checagem.rows[0].total > 0) {
        return res
          .status(400)
          .json({ erro: 'N??o ?? poss??vel remover mesa com participantes sentados ativamente.' });
      }
      const resultado = await pool.query('DELETE FROM mesas WHERE id = $1 RETURNING *;', [
        Number(id),
      ]);
      return res.status(200).json({ sucesso: true, mesaRemovida: resultado.rows[0] });
    } catch (error) {
      return res.status(400).json({ erro: error.message });
    }
  }

  async desalocarCadeira(req, res) {
    try {
      const { entrevistaId } = req.params;
      const busca = await pool.query('SELECT aplicacao_id FROM entrevistas WHERE id = $1', [
        Number(entrevistaId),
      ]);
      if (busca.rows.length > 0) {
        const aplicacaoId = busca.rows[0].aplicacao_id;
        await entrevistaRepository.desvincularMesa(aplicacaoId);
        await clienteRepository.atualizarEtapa(aplicacaoId, 'ficha_preenchida');
      }
      return res.status(200).json({ sucesso: true });
    } catch (error) {
      return res.status(400).json({ erro: error.message });
    }
  }

  // =========================================================================
  // FICHAS DE CLIENTES
  // =========================================================================
  async criarFicha(req, res) {
    try {
      const p = req.body;
      const dadosCliente = {
        turmaId: p.turmaId || p.turma_id,
        responsavelFichaId: p.responsavelFichaId || p.responsavel_ficha_id,
        nome: p.nome || p.nomeCompleto || p.nome_completo,
        nomeCracha: p.nomeCracha || p.nome_cracha,
        empresa: sanitizarEmpresaLgpd(p.empresa),
        cnpj: extrairCnpjSomentePj(p.cnpj || p.cpfCnpj || p.cpf_cnpj),
        telefone: p.telefone,
        email: p.email,
      };

      const cliente = await criarClienteUseCase.execute(dadosCliente);
      return res.status(201).json(cliente);
    } catch (error) {
      console.error('???? [criarFicha] Erro disparado pelo UseCase:', error.message);
      return res.status(400).json({ erro: error.message });
    }
  }

  async listarClientes(req, res) {
    try {
      const { turmaId, etapa } = req.query;
      if (!turmaId) return res.status(400).json({ erro: 'turmaId ?? obrigat??rio' });

      let query = `
        SELECT 
          a.id, a.nome_completo, a.nome_cracha, a.empresa, a.telefone,
          a.email, a.cnpj, a.responsavel_ficha_id, a.etapa_atual,
          u.nome AS captador_nome,
          p.id AS proposta_id,
          p.status AS proposta_status
        FROM aplicacoes a
        LEFT JOIN usuarios u ON u.id = a.responsavel_ficha_id
        LEFT JOIN (
          SELECT id, aplicacao_id, status,
                 ROW_NUMBER() OVER(PARTITION BY aplicacao_id ORDER BY id DESC) as rn
          FROM propostas
        ) p ON p.aplicacao_id = a.id AND p.rn = 1
        WHERE a.turma_id = $1
      `;
      const params = [Number(turmaId)];

      if (etapa) {
        query += ' AND a.etapa_atual = $2';
        params.push(String(etapa));
      }

      query += ' ORDER BY a.id DESC;';

      const { rows } = await pool.query(query, params);
      return res.status(200).json(rows);
    } catch (error) {
      return res.status(500).json({ erro: error.message });
    }
  }

  async listarFilaEntrevistas(req, res) {
    try {
      const { turmaId } = req.query;
      const turma = turmaId ? Number(turmaId) : 1;
      const fila = await clienteRepository.listarPendentesEntrevista(turma);
      return res.status(200).json(fila);
    } catch (error) {
      return res.status(500).json({ erro: error.message });
    }
  }

  async editarCliente(req, res) {
    try {
      const { id } = req.params;
      const p = req.body;

      const nomeFinal = p.nome || p.nomeCompleto || p.nome_completo;
      const empresaFinal = sanitizarEmpresaLgpd(p.empresa);
      const telefoneFinal = p.telefone;
      const crachaFinal = p.nomeCracha || p.nome_cracha || null;
      const cnpjFinal = extrairCnpjSomentePj(p.cnpj || p.cpfCnpj || p.cpf_cnpj);
      const emailFinal = p.email || null;
      const responsavelFinal = p.responsavelFichaId || p.responsavel_ficha_id || null;

      if (!nomeFinal || !empresaFinal || !telefoneFinal) {
        return res.status(400).json({ erro: 'Nome, empresa e telefone s??o campos obrigat??rios.' });
      }

      const query = `
        UPDATE aplicacoes
        SET nome_completo = $1, nome_cracha = $2, empresa = $3, cnpj = $4,
            telefone = $5, email = $6, responsavel_ficha_id = COALESCE($7, responsavel_ficha_id),
            updated_at = NOW()
        WHERE id = $8 RETURNING *;
      `;

      const { rows } = await pool.query(query, [
        String(nomeFinal).trim(),
        crachaFinal ? String(crachaFinal).trim() : null,
        String(empresaFinal).trim(),
        cnpjFinal ? String(cnpjFinal).trim() : null,
        String(telefoneFinal).trim(),
        emailFinal ? String(emailFinal).trim() : null,
        responsavelFinal ? Number(responsavelFinal) : null,
        Number(id),
      ]);

      if (rows.length === 0) return res.status(404).json({ erro: 'Participante n??o encontrado.' });
      return res.status(200).json(rows[0]);
    } catch (error) {
      return res.status(500).json({ erro: error.message });
    }
  }

  // =========================================================================
  // ENTREVISTAS
  // =========================================================================
  async agendarEntrevista(req, res) {
    try {
      const p = req.body;
      const aplicacaoId = p.aplicacaoId || p.aplicacao_id || p.clienteId || p.cliente_id;
      const mesaId = p.mesaId || p.mesa_id;
      const entrevistadorId = p.entrevistadorId || p.entrevistador_id;

      if (!aplicacaoId || !mesaId) {
        return res.status(400).json({
          erro: 'Identificadores da aplica????o (participante) e da mesa s??o obrigat??rios.',
        });
      }

      const entrevista = await agendarEntrevistaUseCase.execute({
        aplicacaoId: Number(aplicacaoId),
        mesaId: Number(mesaId),
        entrevistadorId: entrevistadorId ? Number(entrevistadorId) : null,
      });

      return res.status(201).json(entrevista);
    } catch (error) {
      console.error('???? [agendarEntrevista] Erro disparado pelo UseCase:', error.message);
      return res.status(400).json({ erro: error.message });
    }
  }

  async registrarResultadoEntrevista(req, res) {
    try {
      const { aplicacaoId, turno, resultado, observacao } = req.body;
      const resposta = await registrarResultadoEntrevistaUseCase.execute({
        aplicacaoId: Number(aplicacaoId),
        turno,
        resultado,
        observacao,
      });

      return res.status(200).json(resposta);
    } catch (error) {
      console.error('???? [registrarResultadoEntrevista] Erro:', error.message);
      return res.status(400).json({ erro: error.message });
    }
  }

  // =========================================================================
  // PROPOSTAS
  // =========================================================================
  async criarProposta(req, res) {
    try {
      const p = req.body;
      const dadosProposta = {
        aplicacaoId: p.aplicacaoId || p.aplicacao_id,
        produtoId: p.produtoId || p.produto_id,
        valorTotal: p.valorTotal || p.valor_total,
        valorEntrada: p.valorEntrada || p.valor_entrada,
        cashback: p.cashback,
        metodoPagamento: p.metodoPagamento || p.metodo_pagamento,
        quantidadeParcelas: p.quantidadeParcelas || p.quantidade_parcelas,
        valorParcela: p.valorParcela || p.valor_parcela,
      };

      const proposta = await criarPropostaUseCase.execute(dadosProposta);
      return res.status(201).json(proposta);
    } catch (error) {
      console.error('???? [criarProposta] Erro no UseCase:', error.message);
      return res.status(400).json({ erro: error.message });
    }
  }

    async listarPropostas(_req, res) {
    try {
      const propostas = await propostaRepository.listarParaFinanceiro();
      return res.status(200).json(propostas);
    } catch (error) {
      return res.status(500).json({ erro: error.message });
    }
  }

  async marcarVendido(req, res) {
    try {
      const { id } = req.params;
      const proposta = await processarAnaliseFinanceiraUseCase.concretizarVenda(Number(id));
      return res.status(200).json(proposta);
    } catch (error) {
      return res.status(400).json({ erro: error.message });
    }
  }

  // =========================================================================
  // FINANCEIRO
  // =========================================================================
  async listarPropostasFinanceiro(_req, res) {
    try {
      const propostas = await propostaRepository.listarParaFinanceiro();
      return res.status(200).json(propostas);
    } catch (error) {
      return res.status(500).json({ erro: error.message });
    }
  }

  async analisarFinanceiro(req, res) {
    try {
      const { propostaId, analistaId, statusSerasa, decisao, parecer } = req.body;
      if (!propostaId || !analistaId) {
        return res
          .status(400)
          .json({ erro: 'Identificadores da proposta e do analista s??o obrigat??rios.' });
      }

      const analise = await processarAnaliseFinanceiraUseCase.execute({
        propostaId: Number(propostaId),
        analistaId: Number(analistaId),
        statusSerasa,
        decisao,
        parecer,
      });
      return res.status(200).json(analise);
    } catch (error) {
      return res.status(400).json({ erro: error.message });
    }
  }
}

module.exports = new ApiController();

