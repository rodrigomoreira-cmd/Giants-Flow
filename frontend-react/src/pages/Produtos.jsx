export default function Produtos() {
  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a', marginBottom: '0.5rem' }}>Catálogo de Produtos</h1>
      <p style={{ color: '#64748b', marginBottom: '2rem' }}>Gestão de planos, produtos e valores negociáveis.</p>
      
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <tr>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Produto</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Preço de Tabela</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Preço no Evento</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '1rem', borderBottom: '1px solid #f1f5f9', fontWeight: '600' }}>Mentoria Premium</td>
              <td style={{ padding: '1rem', borderBottom: '1px solid #f1f5f9' }}>R$ 20.000,00</td>
              <td style={{ padding: '1rem', borderBottom: '1px solid #f1f5f9', color: '#ff5722', fontWeight: '700' }}>R$ 15.000,00</td>
              <td style={{ padding: '1rem', borderBottom: '1px solid #f1f5f9' }}><span style={{ background: '#dcfce7', color: '#16a34a', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '700' }}>ATIVO</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}