import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';

export default function CompanyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [empresa, setEmpresa] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  
  // Gestão de Cashback (perfil Financeiro)
  const [cashbackInput, setCashbackInput] = useState('');
  const [salvandoCashback, setSalvandoCashback] = useState(false);

  // Sessão do usuário autenticado
  const sessaoRaw = localStorage.getItem('sessao_operador');
  const sessao = sessaoRaw ? JSON.parse(sessaoRaw) : null;
  const usuario = sessao?.usuario || {};
  const isFinanceiro = (usuario.papel || '').toUpperCase() === 'FINANCEIRO' || (usuario.papel || '').toUpperCase() === 'ADMIN';

  const carregarEmpresa = async () => {
    try {
      setCarregando(true);
      setErro('');
      // Obtém o catálogo de clientes/empresas da turma ativa para localizar o registro
      const dados = await api.get('/clientes?turmaId=1');
      const lista = Array.isArray(dados) ? dados : dados.clientes || [];
      const encontrada = lista.find(c => String(c.id || c.cliente_id || c.empId) === String(id));

      if (encontrada) {
        setEmpresa(encontrada);
        setCashbackInput(encontrada.cashback || '0');
      } else {
        setEmpresa({
          id: id,
          empId: id,
          empresa: `Empresa SGA #${id}`,
          nome: `Empresário #${id}`,
          cpf_cnpj: 'Não informado',
          telefone: '-',
          email: '-',
          entrevistador_nome: 'Rodrigo Moreira',
          especialista_nome: 'Equipa GIANTS',
          sdr_nome: 'Equipa Comercial',
          cashback: '0.00',
          cashback_validado: false
        });
      }
    } catch (err) {
      setErro(err.message || 'Erro ao carregar dados da empresa.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarEmpresa();
  }, [id]);

    const salvarCashback = async () => {
    try {
      setSalvandoCashback(true);
      const valorLimpo = String(cashbackInput).trim().replace(',', '.');
      const valorNumerico = parseFloat(valorLimpo);

      if (isNaN(valorNumerico)) {
        alert('Informe um valor numérico válido para o cashback.');
        return;
      }
      if (valorNumerico < 0) {
        alert('O cashback não pode ser um valor negativo.');
        return;
      }
      if (valorNumerico > 50000) {
        alert('O cashback ultrapassa o limite teto permitido (R$ 50.000,00).');
        return;
      }

      await api.put(`/clientes/${id}`, {
        ...empresa,
        cashback: valorNumerico
      });

      alert('Cashback atualizado e validado com sucesso!');
      carregarEmpresa();
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Erro ao validar cashback';
      alert(`Erro ao validar cashback: ${msg}`);
    } finally {
      setSalvandoCashback(false);
    }
  };;

  const iniciarEntrevista = () => {
    // Encaminha diretamente para o assistente de condução da entrevista
    navigate(`/interviews/${id}/edit`);
  };

  if (carregando) {
    return <div style={{ padding: '2.5rem', color: '#64748b' }}>Carregando cadastro da empresa #{id}...</div>;
  }

  return (
    <div style={{ padding: '2rem', width: '100%', boxSizing: 'border-box' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#ff5722', background: '#fff7ed', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
              empId #{empresa?.empId || empresa?.id}
            </span>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>• Base SGA</span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
            {empresa?.empresa || empresa?.razao_social || 'Empresa'}
          </h1>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={() => navigate('/companies')}
            style={{ background: '#fff', border: '1px solid #cbd5e1', padding: '0.55rem 1rem', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', color: '#475569', fontSize: '0.85rem' }}
          >
            Voltar Ã  Base
          </button>
          <button
            onClick={iniciarEntrevista}
            style={{ background: '#ff5722', color: '#fff', border: 'none', padding: '0.55rem 1.25rem', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>play_arrow</span>
            Iniciar / Continuar Entrevista
          </button>
        </div>
      </div>

      {erro && (
        <div style={{ background: '#fef2f2', color: '#ef4444', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #fecaca' }}>
          {erro}
        </div>
      )}

      {/* Grid Superior: Dados Cadastrais e Atribuições */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* Bloco 1: Informações da Empresa */}
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="material-symbols-outlined" style={{ color: '#ff5722' }}>domain</span>
            Dados Cadastrais
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.9rem' }}>
            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', fontWeight: '600' }}>EMPRESÁRIO / SÓCIO</span>
              <span style={{ fontWeight: '600', color: '#1e293b' }}>{empresa?.nome || empresa?.nome_completo || '-'}</span>
            </div>
            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', fontWeight: '600' }}>CNPJ / CPF</span>
              <span style={{ color: '#334155' }}>{empresa?.cpf_cnpj || '-'}</span>
            </div>
            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', fontWeight: '600' }}>CONTACTO</span>
              <span style={{ color: '#334155' }}>{empresa?.telefone || empresa?.whatsapp || '-'} {empresa?.email ? `• ${empresa.email}` : ''}</span>
            </div>
          </div>
        </div>

        {/* Bloco 2: Atribuições da Equipa */}
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="material-symbols-outlined" style={{ color: '#0284c7' }}>badge</span>
            Responsáveis Atribuídos
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.9rem' }}>
            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', fontWeight: '600' }}>ENTREVISTADOR</span>
              <span style={{ fontWeight: '600', color: '#1e293b' }}>{empresa?.entrevistador_nome || 'Rodrigo Moreira'}</span>
            </div>
            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', fontWeight: '600' }}>ESPECIALISTA</span>
              <span style={{ color: '#334155' }}>{empresa?.especialista_nome || 'Equipa GIANTS'}</span>
            </div>
            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', fontWeight: '600' }}>SDR</span>
              <span style={{ color: '#334155' }}>{empresa?.sdr_nome || 'Equipa Comercial'}</span>
            </div>
          </div>
        </div>

        {/* Bloco 3: Gestão de Cashback (Financeiro) */}
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="material-symbols-outlined" style={{ color: '#059669' }}>payments</span>
            Cashback & Créditos
          </h3>

          <div style={{ marginBottom: '1rem' }}>
            <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', fontWeight: '600' }}>ESTADO DE VALIDAÇÃO</span>
            <span style={{
              display: 'inline-block',
              marginTop: '0.2rem',
              padding: '0.2rem 0.5rem',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: '700',
              background: empresa?.cashback_validado ? '#dcfce7' : '#fef3c7',
              color: empresa?.cashback_validado ? '#16a34a' : '#d97706'
            }}>
              {empresa?.cashback_validado ? 'Confirmado pelo Financeiro' : 'Pendente de Confirmação'}
            </span>
          </div>

          {isFinanceiro ? (
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>
                Valor de Cashback (R$)
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={cashbackInput}
                  onChange={(e) => setCashbackInput(e.target.value)}
                  placeholder="0,00"
                  style={{ width: '100%', padding: '0.55rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                />
                <button
                  disabled={salvandoCashback}
                  onClick={salvarCashback}
                  style={{ background: '#059669', color: '#fff', border: 'none', padding: '0.55rem 0.9rem', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                >
                  {salvandoCashback ? '...' : 'Validar'}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', fontWeight: '600' }}>VALOR DISPONÃVEL</span>
              <span style={{ fontSize: '1.25rem', fontWeight: '800', color: '#059669' }}>
                R$ {Number(empresa?.cashback || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Histórico e Vínculos */}
      <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.5rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: '#1e293b' }}>
            Vínculos com Turmas do Evento
          </h3>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.85rem' }}>
              <th style={{ padding: '1rem' }}>Turma</th>
              <th style={{ padding: '1rem' }}>Perfil GIANTS</th>
              <th style={{ padding: '1rem' }}>Aplicou para GIANTS</th>
              <th style={{ padding: '1rem' }}>Momento da Aplicação</th>
              <th style={{ padding: '1rem', textAlign: 'right' }}>Ação</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '1rem', fontWeight: '600', color: '#0f172a' }}>
                Imersão Executiva - Edição Oficial (EVENTO-2026-1)
              </td>
              <td style={{ padding: '1rem' }}>
                <span style={{ background: '#e0f2fe', color: '#0284c7', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '700' }}>
                  Sim
                </span>
              </td>
              <td style={{ padding: '1rem' }}>
                <span style={{ background: '#dcfce7', color: '#16a34a', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '700' }}>
                  Sim
                </span>
              </td>
              <td style={{ padding: '1rem', color: '#64748b', fontSize: '0.85rem' }}>
                Próximo ao Almoço
              </td>
              <td style={{ padding: '1rem', textAlign: 'right' }}>
                <button
                  onClick={iniciarEntrevista}
                  style={{ background: '#f8fafc', border: '1px solid #cbd5e1', color: '#ff5722', padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '700', cursor: 'pointer' }}
                >
                  Abrir Ficha
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}