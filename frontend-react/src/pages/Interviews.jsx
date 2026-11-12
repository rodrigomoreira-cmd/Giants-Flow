import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

const normalizarChaveEmpresa = (empresa, cnpj, fallbackId) => {
  const cnpjDigits = String(cnpj || '').replace(/\D/g, '');
  if (cnpjDigits.length >= 11) return `cnpj:${cnpjDigits}`;
  const empNorm = String(empresa || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (empNorm && empNorm !== 'empresa sga' && empNorm !== 'sem empresa') {
    return `emp:${empNorm}`;
  }
  return `id:${fallbackId}`;
};

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
      const turmaAtiva = localStorage.getItem('turma_ativa_id') || '1491';
      const [aux, clientes] = await Promise.all([
        api.get('/auxiliares'),
        api.get(`/clientes?turmaId=${turmaAtiva}`).catch(() => [])
      ]);
      const listaClientes = Array.isArray(clientes) ? clientes : (clientes?.data || []);
      const mesas = aux.mesas || [];
      const gruposPorEmpresa = new Map();

      mesas.forEach((m) => {
        (m.ocupantes_detalhes || []).forEach((det, idx) => {
          let nome = 'Participante';
          let nomeCracha = '';
          let entrevistaId = idx + 1;
          let empresa = 'Empresa SGA';
          let statusAlmoco = 'Pendente';
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
          } else if (typeof det === 'object' && det !== null) {
            nome = det.nome || det.cliente_nome || nome;
            nomeCracha = det.nome_cracha || '';
            entrevistaId = det.entrevista_id || det.id || entrevistaId;
            statusAlmoco = det.status_almoco || statusAlmoco;
            if (det.empresa) empresa = det.empresa;
          }

          const cliRef = listaClientes.find(
            (c) =>
              String(c.id) === String(entrevistaId) ||
              (c.nome_participante && c.nome_participante.toLowerCase() === nome.toLowerCase()) ||
              (c.empresa && c.empresa.toLowerCase() === empresa.toLowerCase() && c.nome_participante && c.nome_participante.toLowerCase().includes(nome.toLowerCase()))
          );

          const isGiants =
            (typeof det === 'string' && (det.toUpperCase().includes('GIAN') || det.includes('membro_giants=t'))) ||
            Boolean(det?.membro_giants) ||
            String(det?.origem || '').toUpperCase().includes('GIAN') ||
            Boolean(cliRef?.membro_giants) ||
            String(cliRef?.origem || '').toUpperCase().includes('GIAN');

          if (isGiants) return;

          const cnpjReal = cliRef?.cnpj || cliRef?.cpf_cnpj || '';
          const empresaReal = cliRef?.empresa || empresa;
          const almocoLiberado = Boolean(cliRef?.almoco_pago || cliRef?.cortesia_almoco) ? 'Pago / Liberado' : statusAlmoco;
          const chave = normalizarChaveEmpresa(empresaReal, cnpjReal, entrevistaId);

          if (!gruposPorEmpresa.has(chave)) {
            // Busca todos os sócios da mesma empresa na turma (mesmo que não estejam na mesma mesa)
            const todosSociosTurma = listaClientes
              .filter((c) => !c.membro_giants && normalizarChaveEmpresa(c.empresa, c.cnpj || c.cpf_cnpj, c.id) === chave)
              .map((c) => ({
                id: c.id,
                nome: c.nome_participante || c.nome_cracha || 'Sócio',
                cargo: c.cargo || 'Sócio'
              }));

            gruposPorEmpresa.set(chave, {
              id: entrevistaId,
              mesaNumero: m.numero,
              empresa: empresaReal,
              cnpj: cnpjReal,
              titularNome: nome,
              titularCracha: nomeCracha,
              etapa,
              statusAlmoco: almocoLiberado,
              sociosMesa: [{ id: entrevistaId, nome, nomeCracha }],
              todosSociosTurma
            });
          } else {
            const grupo = gruposPorEmpresa.get(chave);
            if (!grupo.sociosMesa.some((s) => String(s.id) === String(entrevistaId))) {
              grupo.sociosMesa.push({ id: entrevistaId, nome, nomeCracha });
            }
            if (almocoLiberado === 'Pago / Liberado') {
              grupo.statusAlmoco = 'Pago / Liberado';
            }
          }
        });
      });

      setSessoes(Array.from(gruposPorEmpresa.values()));
    } catch (err) {
      setErro(err.message || 'Erro ao carregar sessões de entrevistas.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarSessoes();
  }, []);

  const sessoesFiltradas = sessoes.filter((s) => {
    const q = busca.toLowerCase();
    const matchSocio =
      s.sociosMesa.some((soc) => soc.nome.toLowerCase().includes(q)) ||
      s.todosSociosTurma.some((soc) => soc.nome.toLowerCase().includes(q));
    return (
      matchSocio ||
      s.empresa.toLowerCase().includes(q) ||
      String(s.cnpj || '').toLowerCase().includes(q) ||
      String(s.mesaNumero).includes(q) ||
      String(s.id).includes(q)
    );
  });

  return (
    <div style={{ padding: '2rem', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
            Entrevistas por Empresa (CNPJ)
          </h1>
          <p style={{ color: '#64748b', margin: '0.25rem 0 0', fontSize: '0.9rem' }}>
            Ficha única consolidada por CNPJ — sócios da mesma empresa são gerenciados dentro do contrato
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
            placeholder="Pesquisar por empresa, CNPJ, sócio ou número de mesa..."
            style={{ width: '100%', padding: '0.65rem 0.65rem 0.65rem 2.5rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      {/* Tabela */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <tr>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Ficha CNPJ</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Mesa</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Empresa / Sócios Vinculados</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Etapa</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Almoço</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem', textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr><td colSpan="6" style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>Carregando empresas em entrevista...</td></tr>
            ) : sessoesFiltradas.length === 0 ? (
              <tr><td colSpan="6" style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>Nenhuma empresa em entrevista encontrada.</td></tr>
            ) : (
              sessoesFiltradas.map((s) => {
                const outrosSocios = (s.todosSociosTurma.length > 0 ? s.todosSociosTurma : s.sociosMesa)
                  .filter((soc) => String(soc.id) !== String(s.id));
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '1rem' }}>
                      <span
                        onClick={() => navigate(`/interviews/${s.id}`)}
                        title="Ver detalhes da ficha da empresa"
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span
                          onClick={() => navigate(`/interviews/${s.id}/edit`)}
                          style={{ fontWeight: '800', color: '#0f172a', fontSize: '0.92rem', cursor: 'pointer' }}
                        >
                          {s.empresa}
                        </span>
                        {s.cnpj && (
                          <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', background: '#f1f5f9', color: '#475569', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                            CNPJ: {s.cnpj}
                          </span>
                        )}
                        {outrosSocios.length > 0 && (
                          <span style={{ fontSize: '0.72rem', fontWeight: '700', background: '#e0e7ff', color: '#3730a3', padding: '0.15rem 0.5rem', borderRadius: '999px' }}>
                            +{outrosSocios.length} {outrosSocios.length === 1 ? 'sócio' : 'sócios'}
                          </span>
                        )}
                      </div>
                      <div style={{ color: '#475569', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                        <strong>Titular:</strong> {s.titularNome}
                        {outrosSocios.length > 0 && (
                          <span style={{ color: '#64748b' }}>
                            {' '}• <strong>Sócios na turma:</strong> {outrosSocios.map((o) => o.nome).join(', ')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{ background: '#eff6ff', color: '#2563eb', padding: '0.2rem 0.55rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '700' }}>
                        {s.etapa}
                      </span>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span
                        style={{
                          background: s.statusAlmoco === 'Pago / Liberado' ? '#dcfce7' : '#fee2e2',
                          color: s.statusAlmoco === 'Pago / Liberado' ? '#166534' : '#ef4444',
                          padding: '0.2rem 0.55rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: '700'
                        }}
                      >
                        {s.statusAlmoco}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                        <button
                          onClick={() => navigate(`/interviews/${s.id}/edit`)}
                          title="Abrir ficha única da empresa"
                          style={{
                            background: '#ff5722',
                            color: '#fff',
                            border: 'none',
                            padding: '0.45rem 0.85rem',
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                            fontWeight: '700',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem'
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>business</span>
                          Ficha da Empresa
                        </button>

                        <button
                          onClick={() => window.open(`/interviews/${s.id}/pdf`, '_blank')}
                          style={{
                            background: '#fff',
                            border: '1px solid #cbd5e1',
                            color: '#475569',
                            padding: '0.42rem 0.7rem',
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
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}