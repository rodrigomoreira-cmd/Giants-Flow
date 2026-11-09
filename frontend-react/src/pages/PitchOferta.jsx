export default function PitchOferta() {
  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a', marginBottom: '0.5rem' }}>Pitch / Oferta</h1>
      <p style={{ color: '#64748b', marginBottom: '2rem' }}>Apresentação comercial e condições especiais para fecho no evento.</p>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
        <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#ff5722', textTransform: 'uppercase' }}>Oferta Principal</span>
          <h3 style={{ fontSize: '1.25rem', marginTop: '0.5rem', color: '#1e293b' }}>Mentoria Black Event</h3>
          <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0.75rem 0' }}>Condição exclusiva de balcão: entrada + 12x sem juros.</p>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#0f172a' }}>R$ 15.000,00</div>
        </div>
      </div>
    </div>
  );
}