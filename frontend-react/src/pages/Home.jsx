import { Link } from 'react-router-dom';

export default function Home() {
  const atalhos = [
    { rota: '/companies', titulo: 'Empresas', desc: '5.203 empresas importadas da base do SGA', icon: 'domain', cor: '#ff5722' },
    { rota: '/interviews', titulo: 'Entrevistas', desc: 'Conduzir entrevistas e gerar relatórios em PDF', icon: 'assignment', cor: '#0284c7' },
    { rota: '/approvals', titulo: 'Aprovações', desc: 'Fila de negociações e termos de fecho comercial', icon: 'verified', cor: '#059669' },
    { rota: '/lunch', titulo: 'Almoço de Networking', desc: 'Distribuição e assentos nas mesas por turma', icon: 'restaurant', cor: '#d97706' },
    { rota: '/reports', titulo: 'Relatórios', desc: 'Visão agregada e exportação em XLSX / PDF / CSV', icon: 'analytics', cor: '#7c3aed' },
  ];

  return (
    <div style={{ padding: '2rem', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>GIANTS Flow</h1>
        <p style={{ color: '#64748b', margin: '0.25rem 0 0' }}>Painel unificado de gestão do programa GIANTS • Grupo Acelerador</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
        {atalhos.map((item, idx) => (
          <Link
            key={idx}
            to={item.rota}
            style={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '1.5rem',
              textDecoration: 'none',
              boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease'
            }}
          >
            <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: `${item.cor}15`, color: item.cor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.5rem' }}>{item.icon}</span>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: '#0f172a' }}>{item.titulo}</h3>
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: '#64748b', lineHeight: 1.4 }}>{item.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}