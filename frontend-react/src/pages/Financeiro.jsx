export default function Financeiro() {
  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a', marginBottom: '0.5rem' }}>Financeiro</h1>
      <p style={{ color: '#64748b', marginBottom: '2rem' }}>Controlo de pagamentos, entradas em caixa e conciliação.</p>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Faturado Total</span>
          <h2 style={{ fontSize: '1.75rem', color: '#059669', margin: '0.5rem 0 0' }}>R$ 0,00</h2>
        </div>
        <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Em Aprovação</span>
          <h2 style={{ fontSize: '1.75rem', color: '#d97706', margin: '0.5rem 0 0' }}>R$ 0,00</h2>
        </div>
        <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Recusados / Cancelados</span>
          <h2 style={{ fontSize: '1.75rem', color: '#dc2626', margin: '0.5rem 0 0' }}>R$ 0,00</h2>
        </div>
      </div>
    </div>
  );
}