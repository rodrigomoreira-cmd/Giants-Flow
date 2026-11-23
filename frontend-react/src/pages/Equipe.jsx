export default function Equipe() {
  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a', marginBottom: '0.5rem' }}>Equipe Operacional</h1>
      <p style={{ color: '#64748b', marginBottom: '2rem' }}>Gestão de operadores, triadores e especialistas de mesa.</p>
      
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <tr>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Nome</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>E-mail</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Papel</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '1rem', borderBottom: '1px solid #f1f5f9' }}>Rodrigo Moreira</td>
              <td style={{ padding: '1rem', borderBottom: '1px solid #f1f5f9' }}>admin@eventfunnel.com</td>
              <td style={{ padding: '1rem', borderBottom: '1px solid #f1f5f9' }}><span style={{ background: '#fee2e2', color: '#ef4444', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '700' }}>ADMIN</span></td>
              <td style={{ padding: '1rem', borderBottom: '1px solid #f1f5f9' }}><span style={{ color: '#059669', fontWeight: '600' }}>● Online</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}