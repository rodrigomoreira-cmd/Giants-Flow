import { useState, useEffect } from 'react';
import { api } from '../services/api';

export default function AdminCohorts() {
  const [turmas, setTurmas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [nome, setNome] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregarTurmas = async () => {
    try {
      setCarregando(true);
      const dados = await api.get('/turmas');
      setTurmas(Array.isArray(dados) ? dados : []);
    } catch (err) {
      // Fallback auxiliares
      try {
        const aux = await api.get('/auxiliares');
        setTurmas(aux.turmas || []);
      } catch (e) {
        setTurmas([]);
      }
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarTurmas();
  }, []);

  const criarTurma = async (e) => {
    e.preventDefault();
    if (!codigo.trim() || !nome.trim()) return;

    try {
      setSalvando(true);
      await api.post('/turmas', { codigo, nome, ativa: true });
      setCodigo('');
      setNome('');
      setModalAberto(false);
      carregarTurmas();
    } catch (err) {
      alert('Erro ao criar turma: ' + err.message);
    } finally {
      setSalvando(false);
    }
  };

  const alternarStatus = async (t) => {
    try {
      await api.patch(`/turmas/${t.id}/status`, { ativa: !t.ativa });
      setTurmas(prev => prev.map(item => item.id === t.id ? { ...item, ativa: !t.ativa } : item));
    } catch (err) {
      setTurmas(prev => prev.map(item => item.id === t.id ? { ...item, ativa: !t.ativa } : item));
    }
  };

  const excluirTurma = async (t) => {
    if (!confirm(`Deseja remover a turma ${t.codigo} - ${t.nome}?`)) return;
    try {
      await api.delete(`/turmas/${t.id}`);
      setTurmas(prev => prev.filter(item => item.id !== t.id));
    } catch (err) {
      setTurmas(prev => prev.filter(item => item.id !== t.id));
    }
  };

  return (
    <div style={{ padding: '2rem', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#ff5722', background: '#fff7ed', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
            Administração Geral
          </span>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a', margin: '0.25rem 0 0 0' }}>
            Gestão de Turmas & Edições
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0.25rem 0 0 0' }}>
            Controle das edições presenciais do Programa GIANTS, turmas ativas e histórico.
          </p>
        </div>

        <button
          onClick={() => setModalAberto(true)}
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
            boxShadow: '0 2px 6px rgba(255,87,34,0.3)'
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>add_circle</span>
          Nova Turma
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {carregando ? (
          <div style={{ padding: '2rem', color: '#94a3b8' }}>Carregando turmas...</div>
        ) : turmas.length === 0 ? (
          <div style={{ padding: '2rem', color: '#94a3b8' }}>Nenhuma turma cadastrada.</div>
        ) : (
          turmas.map(t => (
            <div key={t.id} style={{ background: '#fff', padding: '1.5rem', borderRadius: '14px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#ff5722', background: '#fff7ed', padding: '0.25rem 0.6rem', borderRadius: '6px' }}>
                    {t.codigo}
                  </span>
                  <button
                    onClick={() => alternarStatus(t)}
                    style={{
                      border: 'none',
                      background: t.ativa ? '#dcfce7' : '#f1f5f9',
                      color: t.ativa ? '#16a34a' : '#64748b',
                      fontSize: '0.75rem',
                      fontWeight: '800',
                      padding: '0.25rem 0.6rem',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    {t.ativa ? '● Ativa' : '○ Inativa'}
                  </button>
                </div>
                <h3 style={{ margin: '1rem 0 0.5rem 0', fontSize: '1.15rem', fontWeight: '800', color: '#0f172a' }}>
                  {t.nome}
                </h3>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem', borderTop: '1px solid #f8fafc', paddingTop: '0.75rem' }}>
                <button
                  onClick={() => excluirTurma(t)}
                  style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>delete</span>
                  Excluir
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {modalAberto && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }} onClick={() => setModalAberto(false)}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '440px', padding: '1.75rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.2rem', fontWeight: '800', color: '#0f172a' }}>Nova Turma / Edição</h3>
            <form onSubmit={criarTurma} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>Código da Turma *</label>
                <input type="text" required value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="Ex: G12" style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>Nome da Edição *</label>
                <input type="text" required value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Turma G12 - Imersão Janeiro" style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setModalAberto(false)} style={{ background: '#fff', border: '1px solid #cbd5e1', padding: '0.55rem 1rem', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', color: '#475569' }}>Cancelar</button>
                <button type="submit" disabled={salvando} style={{ background: '#ff5722', color: '#fff', border: 'none', padding: '0.55rem 1.25rem', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}>{salvando ? 'Salvando...' : 'Criar Turma'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}