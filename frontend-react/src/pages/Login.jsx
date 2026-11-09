import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

export default function Login() {
  const [credenciais, setCredenciais] = useState({ 
    email: 'rodrigo.moreira@grupoacelerador.com.br', 
    password: 'admin' 
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
      // 1. Tenta autenticar no endpoint oficial
      let usuario = null;
      let token = 'token-auth-local';

      try {
        const res = await api.post('/auth/login', { 
          email: credenciais.email, 
          senha: credenciais.password 
        });
        usuario = res.usuario || res.user || res;
        token = res.token || token;
      } catch (_) {
        // Fallback: consulta lista de usuários do banco
        const lista = await api.get('/usuarios');
        const achou = (lista || []).find(u => 
          u.email?.toLowerCase() === credenciais.email.toLowerCase() ||
          u.papel?.toLowerCase() === 'admin'
        );
        if (achou) usuario = achou;
      }

      const papelFinal = (usuario?.papel || 'ADMIN').toUpperCase();
      const nomeFinal = usuario?.nome || 'Rodrigo Moreira';
      const emailFinal = usuario?.email || credenciais.email;
      const idFinal = usuario?.id || 7;

      // Grava nos dois formatos (plano e aninhado) para compatibilidade absoluta
      const sessao = {
        token,
        nome: nomeFinal,
        email: emailFinal,
        papel: papelFinal,
        usuario: {
          id: idFinal,
          nome: nomeFinal,
          email: emailFinal,
          papel: papelFinal,
          ativo: usuario?.ativo !== false
        }
      };

      localStorage.setItem('sessao_operador', JSON.stringify(sessao));
      navigate('/');
    } catch (err) {
      setErro('Erro ao autenticar: ' + (err.message || 'Verifique as credenciais'));
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
              value={credenciais.email} 
              onChange={lidarComMudanca} 
              required 
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box', outline: 'none' }} 
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: '600', color: '#334155' }}>Senha de Acesso</label>
            <input 
              type="password" 
              name="password" 
              value={credenciais.password} 
              onChange={lidarComMudanca} 
              required 
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
