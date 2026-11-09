import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

export default function Interviews() {
  const navigate = useNavigate();
  const [sessoes, setSessoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState('');

  const carregarSessoes = async () => {
    try {
      setCarregando(true);
      setErro('');
      const aux = await api.get('/auxiliares');
      const mesas = aux.mesas || [];
      const listaSessoes = [];

      mesas.forEach(m => {
        (m.ocupantes_detalhes || []).forEach((det, idx) => {
          let nome = 'Participante';
          let nomeCracha = '';
          let entrevistaId = idx + 1;
          let empresa = 'Empresa SGA';
          let statusAlmoço = 'Pendente';
          let etapa = 'em_entrevista';

          if (typeof det === 'string') {
            const mNome = det.match(/nome=([^;]+)/);
            const mCracha = det.match(/nome_cracha=([^;]+)/);
            const mId = det.match(/entrevista_id=([^;]+)/);
            const mEmp = det.match(/empresa=([^;]+)/);
            if (mNome) nome = mNome[1].trim();
            if (mCracha && mCracha[1].trim()) nomeCracha = mCracha[1].trim();
            if (mId) entrevistaId = mId[1].trim();
            if (mEmp) empresa = mEmp[1].trim();
          } else if (typeof det === 'object') {
            nome = det.nome || det.cliente_nome || nome;
            nomeCracha = det.nome_cracha || '';
            entrevistaId = det.entrevista_id || det.id || entrevistaId;
            empresa = det.empresa || empresa;
            etapa = det.etapa || etapa;
            statusAlmoço = det.status_almoco || statusAlmoço;
          }

          listaSessoes.push({
            id: entrevistaId,
            mesaNumero: m.numero,
            nome,
            nomeCracha,
            empresa,
            etapa,
            statusAlmoço
          });
        });
      });

      setSessoes(listaSessoes);
    } catch (err) {
      setErro(err.message || 'Erro ao carregar sessões de entrevistas.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarSessoes();
  }, []);

  const sessoesFiltradas = sessoes.filter(s =>
    s.nome.toLowerCase().includes(busca.toLowerCase()) ||
    s.empresa.toLowerCase().includes(busca.toLowerCase()) ||
    String(s.mesaNumero).includes(busca) ||
    String(s.id).includes(busca)
  );

  return (
    <div style={{ padding: '2rem', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
            Entrevistas Realizadas & Em Curso
          </h1>
          <p style={{ color: '#64748b', margin: '0.25rem 0 0', fontSize: '0.9rem' }}>
            Acompanhamento das reuniões diagnósticas e preenchimento das 6 etapas
          </p>
        </div>

        <button
          onClick={carregarSessoes}
          style={{ background: '#fff', border: '1px solid #cbd5e1', padding: '0.55rem 1rem', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#334155', fontSize: '0.85rem' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>refresh</span>
          Atualizar Sessões
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
            placeholder="Pesquisar por participante, empresa ou número de mesa..."
            style={{ width: '100%', padding: '0.65rem 0.65rem 0.65rem 2.5rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      {/* Tabela */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <tr>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Sessão</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Mesa</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Empresa / Participante</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Etapa</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Almoço</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem', textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr><td colSpan="6" style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>Carregando entrevistas...</td></tr>
            ) : sessoesFiltradas.length === 0 ? (
              <tr><td colSpan="6" style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>Nenhuma entrevista encontrada.</td></tr>
            ) : (
              sessoesFiltradas.map((s) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '1rem' }}>
                    <span
                      onClick={() => navigate(`/interviews/${s.id}`)}
                      title="Ver detalhes da ficha"
                      style={{ fontWeight: '800', color: '#ff5722', cursor: 'pointer' }}
                    >
                      #{s.id}
                    </span>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{ background: '#fff7ed', color: '#ea580c', border: '1px solid #fed7aa', padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700' }}>
                      Mesa {s.mesaNumero}
                    </span>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <div
                      onClick={() => navigate(`/interviews/${s.id}/edit`)}
                      title="Clique para preencher as etapas"
                      style={{ fontWeight: '700', color: '#0f172a', fontSize: '0.9rem', cursor: 'pointer' }}
                    >
                      {s.empresa}
                    </div>
                    <div style={{ color: '#64748b', fontSize: '0.8rem' }}>
                      {s.nome} {s.nomeCracha && `(${s.nomeCracha})`}
                    </div>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{ background: '#eff6ff', color: '#2563eb', padding: '0.2rem 0.55rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '700' }}>
                      {s.etapa}
                    </span>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{ background: '#fee2e2', color: '#ef4444', padding: '0.2rem 0.55rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '700' }}>
                      {s.statusAlmoço}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                      <button
                        onClick={() => navigate(`/interviews/${s.id}/edit`)}
                        title="Preencher as 6 etapas da entrevista"
                        style={{
                          background: '#ff5722',
                          color: '#fff',
                          border: 'none',
                          padding: '0.4rem 0.8rem',
                          borderRadius: '6px',
                          fontSize: '0.78rem',
                          fontWeight: '700',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem'
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>edit_note</span>
                        Preencher Ficha
                      </button>

                      <button
                        onClick={() => window.open(`/interviews/${s.id}/pdf`, '_blank')}
                        style={{
                          background: '#fff',
                          border: '1px solid #cbd5e1',
                          color: '#475569',
                          padding: '0.4rem 0.7rem',
                          borderRadius: '6px',
                          fontSize: '0.78rem',
                          fontWeight: '700',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem'
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>picture_as_pdf</span>
                        PDF
                      </button>
                    </div>
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