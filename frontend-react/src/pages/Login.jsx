import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

export default function Login() {
  const [credenciais, setCredenciais] = useState({
    email: '',
    password: ''
  });
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const navigate = useNavigate();

  const lidarComMudanca = (e) => {
    setCredenciais({ ...credenciais, [e.target.name]: e.target.value });
  };

  const fazerLogin = async (e) => {
    e.preventDefault();
    setCarregando(true);
    setErro('');

    try {
      const res = await api.post('/auth/login', {
        email: credenciais.email,
        senha: credenciais.password
      });

      const usuario = res?.usuario;
      const token = res?.token;

      if (!token || !usuario) {
        throw new Error('Resposta de autenticação inválida do servidor.');
      }

      const papelFinal = (usuario.papel || 'USER').toUpperCase();

      const sessao = {
        token,
        expiresAt: res.expiresAt,
        nome: usuario.nome,
        email: usuario.email,
        papel: papelFinal,
        usuario: {
          id: usuario.id,
          nome: usuario.nome,
          email: usuario.email,
          papel: papelFinal,
          ativo: usuario.ativo !== false
        }
      };

      localStorage.setItem('sessao_operador', JSON.stringify(sessao));
      window.dispatchEvent(new Event('sessao_atualizada'));
      navigate('/');
    } catch (err) {
      setErro(err.message || 'Credenciais inválidas. Verifique e tente novamente.');
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
      <div style={{ background: '#fff', padding: '3rem 2rem', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', width: '100%', maxWidth: '400px', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
          <div style={{ width: '56px', height: '56px', background: 'linear-gradient(135deg, #ff5722 0%, #ff7043 100%)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 4px 10px rgba(255, 87, 34, 0.3)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '2rem' }}>filter_alt</span>
          </div>
        </div>

        <h1 style={{ fontSize: '1.5rem', color: '#0f172a', marginBottom: '0.5rem', fontWeight: '800' }}>GIANTS Flow</h1>
        <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '2rem' }}>Acesso ao painel administrativo</p>

        {erro && (
          <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.65rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem' }}>
            {erro}
          </div>
        )}

        <form onSubmit={fazerLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', textAlign: 'left' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600', color: '#334155' }}>E-mail Corporativo</label>
            <input
              type="email"
              name="email"
              placeholder="seu.nome@grupoacelerador.com.br"
              value={credenciais.email}
              onChange={lidarComMudanca}
              required
              autoComplete="username"
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box', outline: 'none' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600', color: '#334155' }}>Senha de Acesso</label>
            <input
              type="password"
              name="password"
              placeholder="••••••••"
              value={credenciais.password}
              onChange={lidarComMudanca}
              required
              autoComplete="current-password"
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box', outline: 'none' }}
            />
          </div>

          <button
            type="submit"
            disabled={carregando}
            style={{
              background: '#ff5722',
              color: '#fff',
              border: 'none',
              padding: '0.85rem',
              borderRadius: '8px',
              fontWeight: '700',
              cursor: carregando ? 'not-allowed' : 'pointer',
              marginTop: '0.5rem',
              opacity: carregando ? 0.7 : 1
            }}
          >
            {carregando ? 'Autenticando...' : 'Acessar Painel'}
          </button>
        </form>
      </div>
    </div>
  );
}

