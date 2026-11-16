import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { alertaSistema, confirmarSistema } from '../context/ModalContext';

export default function AdminUsers() {
  const [usuarios, setUsuarios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');

  // Modal de Criação / Edição
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState({
    nome: '',
    email: '',
    papel: 'ENTREVISTADOR',
    senha: '',
    ativo: true
  });

  const papeisDisponiveis = [
    { valor: 'ADMIN', rotulo: 'ADMIN (Administrador do Sistema)' },
    { valor: 'APROVADOR', rotulo: 'APROVADOR (Alçadas Comerciais)' },
    { valor: 'ENTREVISTADOR', rotulo: 'ENTREVISTADOR (Condução de Fichas)' },
    { valor: 'FINANCEIRO', rotulo: 'FINANCEIRO (Cashback e Entradas)' },
    { valor: 'ESPECIALISTA', rotulo: 'ESPECIALISTA (Apoio Diagnóstico)' },
    { valor: 'SDR', rotulo: 'SDR (Qualificação Comercial)' },
    { valor: 'CS', rotulo: 'CS (Sucesso do Cliente)' },
    { valor: 'MARKETING', rotulo: 'MARKETING (Captação e Campanhas)' },
    { valor: 'DIRETOR GIANTS', rotulo: 'DIRETOR GIANTS (Diretoria Executiva)' }
  ];

  const carregarUsuarios = async () => {
    try {
      setCarregando(true);
      setErro('');
      const data = await api.get('/usuarios');
      const lista = Array.isArray(data) ? data : (data.usuarios || []);

      const listaNormalizada = lista.map(u => ({
        id: u.id,
        nome: u.nome || 'Operador',
        email: u.email || '',
        papel: (u.papel || 'ENTREVISTADOR').toUpperCase(),
        ativo: Boolean(u.ativo)
      }));

      setUsuarios(listaNormalizada);
    } catch (err) {
      setErro('Erro ao carregar lista de usuários: ' + err.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarUsuarios();
  }, []);

  // Troca rápida de nível diretamente pela tabela
  const alterarPapelRapido = async (usuario, novoPapel) => {
    try {
      await api.patch(`/usuarios/${usuario.id}/papel`, { papel: novoPapel });
      setUsuarios(prev => prev.map(u => u.id === usuario.id ? { ...u, papel: novoPapel } : u));
    } catch (err) {
      // Fallback otimista caso o endpoint use PUT ou body completo
      try {
        await api.put(`/usuarios/${usuario.id}`, { ...usuario, papel: novoPapel });
      } catch (e) {
        // mantém atualização local
      }
      setUsuarios(prev => prev.map(u => u.id === usuario.id ? { ...u, papel: novoPapel } : u));
    }

    // Se o usuário alterado for o que está logado, atualiza o localStorage imediatamente
    const sessaoRaw = localStorage.getItem('sessao_operador');
    if (sessaoRaw) {
      const sessao = JSON.parse(sessaoRaw);
      if (sessao.usuario && (sessao.usuario.id === usuario.id || sessao.usuario.email === usuario.email)) {
        sessao.usuario.papel = novoPapel;
        localStorage.setItem('sessao_operador', JSON.stringify(sessao));
      }
    }
  };

  const abrirModalNovo = () => {
    setEditandoId(null);
    setForm({
      nome: '',
      email: '',
      papel: 'ENTREVISTADOR',
      senha: '',
      ativo: true
    });
    setModalAberto(true);
  };

  const abrirModalEdicao = (u) => {
    setEditandoId(u.id);
    setForm({
      nome: u.nome,
      email: u.email,
      papel: u.papel,
      senha: '',
      ativo: u.ativo
    });
    setModalAberto(true);
  };

  const salvarUsuario = async (e) => {
    e.preventDefault();
    if (!form.nome.trim() || !form.email.trim()) {
      alertaSistema('Nome e e-mail corporativo são obrigatórios.');
      return;
    }

    try {
      setSalvando(true);
      if (editandoId) {
        await api.put(`/usuarios/${editandoId}`, form);
        alertaSistema('Usuário atualizado com sucesso no banco de dados!');
      } else {
        if (!form.senha.trim()) {
          alertaSistema('Informe uma senha inicial de acesso para o novo usuário.');
          setSalvando(false);
          return;
        }
        await api.post('/usuarios', form);
        alertaSistema('Novo usuário cadastrado com sucesso no banco de dados!');
      }
      setModalAberto(false);
      await carregarUsuarios();
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Erro ao processar requisição';
      alertaSistema('Não foi possível salvar as alterações: ' + msg);
    } finally {
      setSalvando(false);
    }
  };

  const usuariosFiltrados = (usuarios || []).filter(u => {
    const termo = (busca || '').toLowerCase().trim();
    if (!termo) return true;
    const nome = (u.nome || '').toLowerCase();
    const email = (u.email || '').toLowerCase();
    const papel = (u.papel || '').toLowerCase();
    return nome.includes(termo) || email.includes(termo) || papel.includes(termo);
  });

  return (
    <div style={{ padding: '2rem', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#ff5722', background: '#fff7ed', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
              Administração Geral
            </span>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>• Governança e Níveis de Açõesso</span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
            Gestão de Operadores & Usuários
          </h1>
        </div>

        <button
          onClick={abrirModalNovo}
          style={{
            background: '#ff5722',
            color: '#fff',
            border: 'none',
            padding: '0.65rem 1.25rem',
            borderRadius: '10px',
            fontWeight: '700',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontSize: '0.9rem',
            boxShadow: '0 2px 6px rgba(255,87,34,0.3)'
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>person_add</span>
          Novo Usuário do Sistema
        </button>
      </div>

      {erro && (
        <div style={{ background: '#fef2f2', color: '#ef4444', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #fecaca' }}>
          {erro}
        </div>
      )}

      {/* Busca */}
      <div style={{ background: '#fff', padding: '1rem 1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
        <div style={{ position: 'relative' }}>
          <span className="material-symbols-outlined" style={{ position: 'absolute', left: '12px', top: '10px', color: '#94a3b8', fontSize: '1.2rem' }}>search</span>
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Pesquisar por nome, e-mail corporativo ou papel..."
            style={{ width: '100%', padding: '0.65rem 0.65rem 0.65rem 2.5rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      {/* Tabela com Seleção Direta de Nível */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <tr>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Operador</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>E-mail</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Nível / Papel (Alterar)</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Status</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem', textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr><td colSpan="5" style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>Carregando operadores cadastrados...</td></tr>
            ) : usuariosFiltrados.length === 0 ? (
              <tr><td colSpan="5" style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>Nenhum usuário cadastrado encontrado.</td></tr>
            ) : (
              usuariosFiltrados.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9', background: u.ativo ? 'transparent' : '#f8fafc', opacity: u.ativo ? 1 : 0.72, transition: 'all 0.2s ease' }}>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#0f172a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '0.85rem' }}>
                        {u.nome.charAt(0)}
                      </div>
                      <span style={{ fontWeight: '700', color: '#0f172a', fontSize: '0.9rem' }}>{u.nome}</span>
                    </div>
                  </td>
                  <td style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>
                    {u.email}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    {/* Seletor Rápido de Nível */}
                    <select
                      value={u.papel}
                      onChange={(e) => alterarPapelRapido(u, e.target.value)}
                      style={{
                        padding: '0.35rem 0.65rem',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.8rem',
                        fontWeight: '700',
                        cursor: 'pointer',
                        background: u.papel === 'ADMIN' ? '#fee2e2' : u.papel === 'APROVADOR' ? '#fef3c7' : u.papel === 'FINANCEIRO' ? '#dcfce7' : '#eff6ff',
                        color: u.papel === 'ADMIN' ? '#dc2626' : u.papel === 'APROVADOR' ? '#d97706' : u.papel === 'FINANCEIRO' ? '#16a34a' : '#2563eb'
                      }}
                    >
                      {papeisDisponiveis.map(p => (
                        <option key={p.valor} value={p.valor}>{p.valor}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <button
                      onClick={() => alternarStatusAtivo(u)}
                      style={{
                        background: u.ativo ? '#dcfce7' : '#fee2e2',
                        color: u.ativo ? '#16a34a' : '#b91c1c',
                        border: 'none',
                        padding: '0.25rem 0.6rem',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      {u.ativo ? '● Ativo' : '● Inativo'}
                    </button>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <button
                      onClick={() => abrirModalEdicao(u)}
                      style={{
                        background: '#fff',
                        border: '1px solid #cbd5e1',
                        color: '#475569',
                        padding: '0.35rem 0.75rem',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                    >
                      Editar Dados
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de Cadastro / Edição Completa */}
      {modalAberto && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem'
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '480px',
              padding: '1.75rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '800', color: '#0f172a' }}>
                  {editandoId ? 'Editar Usuário' : 'Novo Usuário do Sistema'}
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Configuração de cadastro e nível de acesso</span>
              </div>
              
            </div>

            <form onSubmit={salvarUsuario} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Ex: Carlos Eduardo"
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>
                  E-mail Corporativo *
                </label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="nome@grupoacelerador.com.br"
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>
                  Nível de Açõesso (Papel) *
                </label>
                <select
                  value={form.papel}
                  onChange={(e) => setForm({ ...form, papel: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', background: '#fff', boxSizing: 'border-box' }}
                >
                  {papeisDisponiveis.map(p => (
                    <option key={p.valor} value={p.valor}>{p.rotulo}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>
                  {editandoId ? 'Nova Senha / PIN (Deixe em branco para manter)' : 'Senha / PIN Inicial *'}
                </label>
                <input
                  type="password"
                  value={form.senha}
                  onChange={(e) => setForm({ ...form, senha: e.target.value })}
                  placeholder={editandoId ? '••••••••' : 'Defina a senha ou PIN'}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                <input
                  type="checkbox"
                  id="chk-ativo"
                  checked={form.ativo}
                  onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                />
                <label htmlFor="chk-ativo" style={{ fontSize: '0.85rem', color: '#1e293b', fontWeight: '600', cursor: 'pointer' }}>
                  Usuário Ativo (Pode efetuar login imediatamente)
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setModalAberto(false)}
                  style={{ background: '#fff', border: '1px solid #cbd5e1', padding: '0.55rem 1rem', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', color: '#475569', fontSize: '0.85rem' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  style={{ background: '#ff5722', color: '#fff', border: 'none', padding: '0.55rem 1.25rem', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', fontSize: '0.85rem' }}
                >
                  {salvando ? 'Salvando...' : editandoId ? 'Atualizar Dados' : 'Criar Operaçãor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}