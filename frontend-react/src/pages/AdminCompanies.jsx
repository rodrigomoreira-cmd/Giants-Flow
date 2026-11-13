import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useTurma } from '../context/TurmaContext';

export default function AdminCompanies() {
  const { turmaSelecionada } = useTurma();
  const [empresas, setEmpresas] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    api.get(`/clientes?turmaId=${turmaSelecionada || localStorage.getItem('turma_ativa_id') || '1491'}`)
      .then(d => setEmpresas(Array.isArray(d) ? d : d.clientes || []))
      .catch(() => setEmpresas([]))
      .finally(() => setCarregando(false));
  }, [turmaSelecionada]);

  return (
    <div style={{ padding: '2rem', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#ff5722', background: '#fff7ed', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
          Administração
        </span>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a', margin: '0.25rem 0 0 0' }}>
          Gestão e Cadastro de Empresas
        </h1>
        <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0.25rem 0 0 0' }}>
          Parametrização de empresas, almoço pago (R$ 1.000) e comprovantes de referência (CV).
        </p>
      </div>

      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <tr>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>ID</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Empresa</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Empresário</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Almoço Pago</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>CV Almoço</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Carregando...</td></tr>
            ) : empresas.length === 0 ? (
              <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Nenhuma empresa cadastrada.</td></tr>
            ) : (
              empresas.map(e => (
                <tr key={e.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '1rem', fontWeight: '700', color: '#ff5722' }}>#{e.id}</td>
                  <td style={{ padding: '1rem', fontWeight: '700', color: '#0f172a' }}>{e.empresa || e.razao_social}</td>
                  <td style={{ padding: '1rem', color: '#475569' }}>{e.nome || '-'}</td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      background: e.almoco_pago ? '#dcfce7' : '#fee2e2',
                      color: e.almoco_pago ? '#16a34a' : '#ef4444'
                    }}>
                      {e.almoco_pago ? 'Sim (R$ 1.000)' : 'Não'}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', color: '#64748b', fontSize: '0.85rem' }}>{e.cv_almoco || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}