import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useTurma } from '../context/TurmaContext';
import { alertaSistema, confirmarSistema } from '../context/ModalContext';

export default function Fichas() {
  const [fichas, setFichas] = useState([]);
  const [auxiliares, setAuxiliares] = useState(null);
  const { turmaSelecionada: turmaGlobal, mudarTurma } = useTurma();
  const [turmaSelecionada, setTurmaSelecionada] = useState(() => Number(turmaGlobal || localStorage.getItem('turma_ativa_id') || 1491));
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  
  const [form, setForm] = useState({
    nome_completo: '',
    nome_cracha: '',
    empresa: '',
    cpf_cnpj: '',
    telefone: '',
    email: '',
    captador_id: 7
  });

  const carregarDados = async (turmaId = turmaSelecionada) => {
    try {
      setCarregando(true);
      setErro('');
      
      const aux = await api.get('/auxiliares');
      setAuxiliares(aux);
      
      const tId = Number(turmaGlobal || turmaId || aux.turmas?.[0]?.id || 1491);
      setTurmaSelecionada(tId);

      const dados = await api.get(`/clientes?turmaId=${tId}`);
      setFichas(Array.isArray(dados) ? dados : dados.clientes || []);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    const idAlvo = Number(turmaGlobal || localStorage.getItem('turma_ativa_id') || 1491);
    setTurmaSelecionada(idAlvo);
    carregarDados(idAlvo);
  }, [turmaGlobal]);

  const lidarComTrocaTurma = (e) => {
    const novoId = Number(e.target.value);
    setTurmaSelecionada(novoId);
    mudarTurma(novoId);
    carregarDados(novoId);
  };

  const submeterFicha = async (e) => {
    e.preventDefault();
    if (!form.nome_completo.trim() || !form.telefone.trim()) {
      alertaSistema('Nome e Telefone/WhatsApp são obrigatórios.');
      return;
    }

    try {
      await api.post('/clientes', {
        ...form,
        turma_id: turmaSelecionada,
        captador_id: Number(form.captador_id) || 7
      });

      setForm({
        nome_completo: '',
        nome_cracha: '',
        empresa: '',
        cpf_cnpj: '',
        telefone: '',
        email: '',
        captador_id: form.captador_id
      });

      const dados = await api.get(`/clientes?turmaId=${turmaSelecionada}`);
      setFichas(Array.isArray(dados) ? dados : dados.clientes || []);
    } catch (err) {
      alertaSistema(`Erro ao cadastrar ficha: ${err.message}`);
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>Fichas de Aplicação</h1>
          <p style={{ color: '#64748b', margin: '0.25rem 0 0' }}>Cadastro e triagem de participantes para as mesas de fecho</p>
        </div>

        {/* Seletor de Turma */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: '600', color: '#475569' }}>Turma:</label>
          <select 
            value={turmaSelecionada} 
            onChange={lidarComTrocaTurma}
            style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontWeight: '600', color: '#0f172a' }}
          >
            {auxiliares?.turmas?.map(t => (
              <option key={t.id} value={t.id}>{t.nome || t.codigo}</option>
            ))}
          </select>
          <span style={{ background: '#e0f2fe', color: '#0284c7', padding: '0.45rem 0.8rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: '700' }}>
            {fichas.length} Fichas
          </span>
        </div>
      </div>

      {erro && (
        <div style={{ background: '#fef2f2', color: '#ef4444', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #fecaca' }}>
          {erro}
        </div>
      )}

      {/* Formulário com todos os campos oficiais */}
      <div style={{ background: '#fff', padding: '1.75rem', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#1e293b', marginBottom: '1.25rem' }}>Novo Registro</h3>
        
        <form onSubmit={submeterFicha}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>Nome Completo *</label>
              <input 
                type="text" 
                value={form.nome_completo} 
                onChange={(e) => setForm({ ...form, nome_completo: e.target.value })} 
                required 
                placeholder="Ex: Carlos Albuquerque"
                style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>Nome no Crachá</label>
              <input 
                type="text" 
                value={form.nome_cracha} 
                onChange={(e) => setForm({ ...form, nome_cracha: e.target.value })} 
                placeholder="Ex: Carlos"
                style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>WhatsApp / Celular *</label>
              <input 
                type="text" 
                value={form.telefone} 
                onChange={(e) => setForm({ ...form, telefone: e.target.value })} 
                required 
                placeholder="(11) 99999-9999"
                style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>Empresa / Negócio</label>
              <input 
                type="text" 
                value={form.empresa} 
                onChange={(e) => setForm({ ...form, empresa: e.target.value })} 
                placeholder="Ex: Albuquerque Tech"
                style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>E-mail</label>
              <input 
                type="email" 
                value={form.email} 
                onChange={(e) => setForm({ ...form, email: e.target.value })} 
                placeholder="carlos@empresa.com"
                style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>CNPJ da Empresa</label>
              <input 
                type="text" 
                value={form.cpf_cnpj} 
                onChange={(e) => setForm({ ...form, cpf_cnpj: e.target.value })} 
                placeholder="00.000.000/0000-00 (14 dígitos)"
                style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#334155', marginBottom: '0.35rem' }}>Captador Responsável</label>
              <select 
                value={form.captador_id} 
                onChange={(e) => setForm({ ...form, captador_id: e.target.value })}
                style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', boxSizing: 'border-box' }}
              >
                {auxiliares?.captadores?.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button 
              type="submit" 
              style={{ background: '#ff5722', color: '#fff', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 2px 6px rgba(255,87,34,0.3)' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>person_add</span>
              Salvar Ficha de Aplicação
            </button>
          </div>
        </form>
      </div>

      {/* Tabela de Fichas */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <tr>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>ID</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Nome Completo</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Empresa</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>WhatsApp / Telefone</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Captador</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Etapa Atual</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr><td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Carregando fichas...</td></tr>
            ) : fichas.length === 0 ? (
              <tr><td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Nenhuma ficha registada nesta turma.</td></tr>
            ) : (
              fichas.map((f) => (
                <tr key={f.id || f.cliente_id}>
                  <td style={{ padding: '1rem', borderBottom: '1px solid #f1f5f9', color: '#64748b' }}>#{f.id || f.cliente_id}</td>
                  <td style={{ padding: '1rem', borderBottom: '1px solid #f1f5f9', fontWeight: '600', color: '#1e293b' }}>
                    {f.nome || f.nome_completo}
                    {f.nome_cracha && <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', background: '#f1f5f9', padding: '0.2rem 0.4rem', borderRadius: '4px', color: '#475569' }}>({f.nome_cracha})</span>}
                  </td>
                  <td style={{ padding: '1rem', borderBottom: '1px solid #f1f5f9', color: '#475569' }}>{f.empresa || '-'}</td>
                  <td style={{ padding: '1rem', borderBottom: '1px solid #f1f5f9', color: '#475569' }}>{f.telefone || f.whatsapp || '-'}</td>
                  <td style={{ padding: '1rem', borderBottom: '1px solid #f1f5f9', color: '#64748b', fontSize: '0.9rem' }}>{f.captador_nome || 'Rodrigo Moreira'}</td>
                  <td style={{ padding: '1rem', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ background: '#eff6ff', color: '#2563eb', padding: '0.25rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700' }}>
                      {f.etapa_atual || f.etapa || 'AGUARDANDO_TRIAGEM'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}