import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useNavigate } from 'react-router-dom';

export default function Companies() {
  const [empresas, setEmpresas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const itensPorPagina = 60;
  const navigate = useNavigate();

  const carregarEmpresas = async () => {
    try {
      setCarregando(true);
      setErro('');
      // Consulta a base de clientes/empresas vinculada à turma ativa
      const dados = await api.get('/clientes?turmaId=1');
      const lista = Array.isArray(dados) ? dados : dados.clientes || [];
      setEmpresas(lista);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarEmpresas();
  }, []);

  const empresasFiltradas = empresas.filter((emp) => {
    const termo = busca.toLowerCase();
    const nome = (emp.nome || emp.nome_completo || '').toLowerCase();
    const razaoSocial = (emp.empresa || '').toLowerCase();
    const doc = (emp.cpf_cnpj || '').toLowerCase();
    const empId = String(emp.empId || emp.id || '');
    return nome.includes(termo) || razaoSocial.includes(termo) || doc.includes(termo) || empId.includes(termo);
  });

  const totalPaginas = Math.ceil(empresasFiltradas.length / itensPorPagina) || 1;
  const indiceInicial = (pagina - 1) * itensPorPagina;
  const empresasExibidas = empresasFiltradas.slice(indiceInicial, indiceInicial + itensPorPagina);

  return (
    <div style={{ padding: '2rem', width: '100%', boxSizing: 'border-box' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
            Base de Empresas (SGA)
          </h1>
          <p style={{ color: '#64748b', margin: '0.25rem 0 0', fontSize: '0.9rem' }}>
            Catálogo de empresas, histórico cadastral e início de entrevistas
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span style={{ background: '#e0f2fe', color: '#0284c7', padding: '0.45rem 0.85rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: '700' }}>
            {empresasFiltradas.length} Empresas
          </span>
          <button
            onClick={carregarEmpresas}
            style={{ background: '#fff', border: '1px solid #cbd5e1', padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#334155' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>refresh</span>
            Atualizar
          </button>
        </div>
      </div>

      {erro && (
        <div style={{ background: '#fef2f2', color: '#ef4444', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #fecaca' }}>
          {erro}
        </div>
      )}

      {/* Barra de Pesquisa */}
      <div style={{ background: '#fff', padding: '1rem 1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span className="material-symbols-outlined" style={{ color: '#94a3b8' }}>search</span>
        <input
          type="text"
          value={busca}
          onChange={(e) => { setBusca(e.target.value); setPagina(1); }}
          placeholder="Pesquisar por Razão Social, Nome do Sócio, CNPJ ou empId original..."
          style={{ width: '100%', border: 'none', outline: 'none', fontSize: '0.95rem', color: '#1e293b' }}
        />
      </div>

      {/* Tabela de Empresas */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <tr>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem', width: '90px' }}>empId</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Empresa / Razão Social</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Sócio / Representante</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>CNPJ / Documento</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Contacto</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem', textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr><td colSpan="6" style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>A carregar base de empresas...</td></tr>
            ) : empresasExibidas.length === 0 ? (
              <tr><td colSpan="6" style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>Nenhuma empresa encontrada para os termos pesquisados.</td></tr>
            ) : (
              empresasExibidas.map((emp) => (
                <tr key={emp.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '1rem', fontWeight: '700', color: '#ff5722' }}>
                    #{emp.empId || emp.id}
                  </td>
                  <td style={{ padding: '1rem', fontWeight: '600', color: '#0f172a' }}>
                    {emp.empresa || 'Empresa não informada'}
                  </td>
                  <td style={{ padding: '1rem', color: '#334155' }}>
                    {emp.nome || emp.nome_completo || '-'}
                  </td>
                  <td style={{ padding: '1rem', color: '#64748b', fontSize: '0.85rem' }}>
                    {emp.cpf_cnpj || '-'}
                  </td>
                  <td style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>
                    {emp.telefone || emp.whatsapp || emp.email || '-'}
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <button
                      onClick={() => navigate('/interviews')}
                      style={{ background: '#f8fafc', border: '1px solid #cbd5e1', color: '#0284c7', padding: '0.4rem 0.8rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '700', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>assignment</span>
                      Entrevista
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Paginação (60 itens/página) */}
        {!carregando && totalPaginas > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
              A mostrar {indiceInicial + 1} a {Math.min(indiceInicial + itensPorPagina, empresasFiltradas.length)} de {empresasFiltradas.length} empresas
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                disabled={pagina === 1}
                onClick={() => setPagina(p => Math.max(p - 1, 1))}
                style={{ padding: '0.4rem 0.8rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: pagina === 1 ? 'not-allowed' : 'pointer', opacity: pagina === 1 ? 0.5 : 1, fontSize: '0.85rem' }}
              >
                Anterior
              </button>
              <span style={{ display: 'flex', alignItems: 'center', padding: '0 0.5rem', fontSize: '0.85rem', fontWeight: '600', color: '#334155' }}>
                Página {pagina} de {totalPaginas}
              </span>
              <button
                disabled={pagina === totalPaginas}
                onClick={() => setPagina(p => Math.min(p + 1, totalPaginas))}
                style={{ padding: '0.4rem 0.8rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: pagina === totalPaginas ? 'not-allowed' : 'pointer', opacity: pagina === totalPaginas ? 0.5 : 1, fontSize: '0.85rem' }}
              >
                Seguinte
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}