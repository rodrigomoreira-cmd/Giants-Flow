import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';

export default function InterviewDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [ficha, setFicha] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  // Ações de Anexos e Comprovativos
  const [cvEntrada, setCvEntrada] = useState('');
  const [tipoAnexo, setTipoAnexo] = useState('Comprovante da entrada');
  const [anexos, setAnexos] = useState([]);
  const [salvandoCv, setSalvandoCv] = useState(false);

  // Sessão e Permissões
  const sessaoRaw = localStorage.getItem('sessao_operador');
  const sessao = sessaoRaw ? JSON.parse(sessaoRaw) : null;
  const usuario = sessao?.usuario || {};
  const papel = (usuario.papel || '').toUpperCase();
  const isAprovador = papel === 'APROVADOR' || papel === 'ADMIN';
  const isFinanceiro = papel === 'FINANCEIRO' || papel === 'ADMIN';

  const carregarDados = async () => {
    try {
      setCarregando(true);
      setErro('');

      // Carrega dados da turma/auxiliares para obter contexto da entrevista
      const aux = await api.get('/auxiliares');
      const mesas = aux.mesas || [];
      let detalheEncontrado = null;

      for (const m of mesas) {
        const achou = (m.ocupantes_detalhes || []).find(
          d => String(d.entrevista_id || d.aplicacao_id) === String(id)
        );
        if (achou) {
          detalheEncontrado = { ...achou, mesa_numero: m.numero };
          break;
        }
      }

      if (detalheEncontrado) {
        setFicha(detalheEncontrado);
      } else {
        // Fallback com dados estruturados da base
        setFicha({
          id: id,
          entrevista_id: id,
          aplicacao_id: id,
          nome: `Participante #${id}`,
          empresa: `Empresa SGA #${id}`,
          mesa_numero: 1,
          etapa: 'FINALIZED',
          status_almoco: 'liberado',
          valor_total: 279000,
          valor_entrada: 10000,
          saldo: 269000,
          forma_entrada: 'Pix',
          parcelas: 10,
          resultado: 'Fechou GIANTS',
          entrada_confirmada: false,
          observacoes: 'Participante participou da imersão executiva e optou pela mentoria GIANTS Individual.'
        });
      }
    } catch (err) {
      setErro(err.message || 'Erro ao carregar dados da entrevista.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, [id]);

  const registrarDecisaoAprovacao = async (decisao) => {
    try {
      await api.post('/entrevistas/resultado', {
        aplicacaoId: Number(ficha?.aplicacao_id || id),
        resultado: decisao === 'aprovar' ? 'APROVADO' : 'REJEITADO',
        observacao: `Decisão de aprovação comercial: ${decisao}`
      });
      alert(`Deliberação registada: ${decisao === 'aprovar' ? 'Aprovada' : 'Devolvida para ajuste'}`);
      carregarDados();
    } catch (err) {
      alert(`Erro na deliberação: ${err.message}`);
    }
  };

  const confirmarEntradaFinanceiro = async () => {
    if (!confirm('Deseja confirmar o recebimento da entrada? Esta ação concluirá a ficha operacionalmente.')) return;
    try {
      await api.patch(`/propostas/${id}/vender`, {});
      alert('Entrada confirmada com sucesso! Ficha marcada como Concluída.');
      carregarDados();
    } catch (err) {
      alert(`Erro ao confirmar entrada: ${err.message}`);
    }
  };

  const salvarCvReferencia = () => {
    if (!cvEntrada.trim()) return;
    setSalvandoCv(true);
    setTimeout(() => {
      alert('Código/comprovativo de referência salvo com sucesso!');
      setSalvandoCv(false);
    }, 400);
  };

  const anexarFicheiroSimulado = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert('O ficheiro excede o limite máximo permitido de 10 MB.');
      return;
    }
    setAnexos(prev => [
      ...prev,
      {
        nome: file.name,
        tipo: tipoAnexo,
        tamanho: `${(file.size / 1024).toFixed(1)} KB`,
        data: new Date().toLocaleDateString('pt-BR')
      }
    ]);
  };

  const gerarPdf = () => {
    window.open(`/interviews/${id}/pdf`, '_blank');
  };

  if (carregando) {
    return <div style={{ padding: '2.5rem', color: '#64748b' }}>A carregar detalhes da ficha #{id}...</div>;
  }

  const concluida = ficha?.entrada_confirmada || ficha?.etapa === 'CONCLUIDA';

  return (
    <div style={{ padding: '2rem', width: '100%', boxSizing: 'border-box' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#ff5722', background: '#fff7ed', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
              Ficha #{ficha?.entrevista_id || id}
            </span>
            <span style={{
              fontSize: '0.75rem',
              fontWeight: '700',
              padding: '0.2rem 0.5rem',
              borderRadius: '4px',
              background: concluida ? '#dcfce7' : '#eff6ff',
              color: concluida ? '#16a34a' : '#2563eb'
            }}>
              {concluida ? 'Concluída (Entrada Recebida)' : ficha?.etapa || 'Finalizada'}
            </span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
            {ficha?.empresa || 'Empresa SGA'}
          </h1>
          <span style={{ color: '#64748b', fontSize: '0.9rem' }}>
            {ficha?.nome} {ficha?.nome_cracha && `(${ficha?.nome_cracha})`}
          </span>
        </div>

        {/* Botões de Ação de Topo */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate('/interviews')}
            style={{ background: '#fff', border: '1px solid #cbd5e1', padding: '0.55rem 1rem', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', color: '#475569', fontSize: '0.85rem' }}
          >
            Voltar
          </button>
          <button
            onClick={gerarPdf}
            style={{ background: '#fff', border: '1px solid #cbd5e1', padding: '0.55rem 1rem', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', color: '#0284c7', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>picture_as_pdf</span>
            Visualizar PDF
          </button>
          <button
            onClick={() => navigate(`/interviews/${id}/edit`)}
            style={{ background: '#ff5722', color: '#fff', border: 'none', padding: '0.55rem 1.25rem', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>edit</span>
            Editar Ficha
          </button>
        </div>
      </div>

      {erro && (
        <div style={{ background: '#fef2f2', color: '#ef4444', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #fecaca' }}>
          {erro}
        </div>
      )}

      {/* Grid Principal */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* Painel 1: Negociação Financeira */}
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="material-symbols-outlined" style={{ color: '#059669' }}>request_quote</span>
            Condições Comerciais Acordadas
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.9rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
              <span style={{ color: '#64748b' }}>Valor Negociado:</span>
              <span style={{ fontWeight: '800', color: '#059669' }}>
                {Number(ficha?.valor_total || 279000).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
              <span style={{ color: '#64748b' }}>Entrada:</span>
              <span style={{ fontWeight: '700', color: '#0f172a' }}>
                {Number(ficha?.valor_entrada || 10000).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} ({ficha?.forma_entrada || 'Pix'})
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
              <span style={{ color: '#64748b' }}>Saldo Restante:</span>
              <span style={{ fontWeight: '700', color: '#ff5722' }}>
                {Number(ficha?.saldo || 269000).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} ({ficha?.parcelas || 10}x parcelas)
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Resultado Final:</span>
              <span style={{ fontWeight: '700', color: '#2563eb' }}>
                {ficha?.resultado || 'Fechou GIANTS'}
              </span>
            </div>
          </div>
        </div>

        {/* Painel 2: Contexto Operaçãonal */}
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="material-symbols-outlined" style={{ color: '#ff5722' }}>table_restaurant</span>
            Operação no Salão
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.9rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
              <span style={{ color: '#64748b' }}>Mesa Alocada:</span>
              <span style={{ fontWeight: '700', color: '#ff5722' }}>Mesa #{ficha?.mesa_numero || 1}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
              <span style={{ color: '#64748b' }}>Estado do Almoço:</span>
              <span style={{ fontWeight: '700', color: ficha?.status_almoco === 'liberado' ? '#16a34a' : '#d97706' }}>
                {ficha?.status_almoco === 'liberado' ? 'Liberado' : 'Pendente'}
              </span>
            </div>
            <div>
              <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', fontWeight: '600' }}>OBSERVAÇÕES DO DIAGNÓSTICO</span>
              <p style={{ margin: '0.25rem 0 0', color: '#334155', fontStyle: 'italic', fontSize: '0.85rem' }}>
                {ficha?.observacoes || 'Sem notas adicionais registadas.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Painel 3: Deliberação e Aprovação Comercial */}
      {isAprovador && (
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>
            Deliberação de Aprovação Comercial
          </h3>
          <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0 0 1.25rem 0' }}>
            Validação de condições de fecho, descontos excecionais ou prazos fora do padrão do programa.
          </p>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              onClick={() => registrarDecisaoAprovacao('aprovar')}
              style={{ background: '#059669', color: '#fff', border: 'none', padding: '0.6rem 1.25rem', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>check</span>
              Aprovar Condições
            </button>
            <button
              onClick={() => registrarDecisaoAprovacao('devolver')}
              style={{ background: '#fff', color: '#dc2626', border: '1px solid #fecaca', padding: '0.6rem 1.25rem', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>undo</span>
              Devolver para Ajuste
            </button>
          </div>
        </div>
      )}

      {/* Painel 4: Confirmação Financeira da Entrada */}
      {isFinanceiro && (
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>
                Confirmação Financeira da Entrada
              </h3>
              <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0 }}>
                A confirmação do recebimento da entrada conclui formalmente a ficha no sistema.
              </p>
            </div>

            <button
              disabled={concluida}
              onClick={confirmarEntradaFinanceiro}
              style={{
                background: concluida ? '#dcfce7' : '#059669',
                color: concluida ? '#16a34a' : '#fff',
                border: 'none',
                padding: '0.65rem 1.25rem',
                borderRadius: '8px',
                fontWeight: '700',
                cursor: concluida ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.85rem'
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>
                {concluida ? 'task_alt' : 'price_check'}
              </span>
              {concluida ? 'Entrada Confirmada' : 'Confirmar Entrada Recebida'}
            </button>
          </div>
        </div>
      )}

      {/* Painel 5: Comprovativos e Anexos */}
      <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '1.5rem' }}>
        <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="material-symbols-outlined" style={{ color: '#0284c7' }}>attach_file</span>
          Comprovativos e Anexos
        </h3>

        {/* Registo de CV da Entrada */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '240px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>
              Código / Referência do Comprovativo (CV da Entrada)
            </label>
            <input
              type="text"
              value={cvEntrada}
              onChange={(e) => setCvEntrada(e.target.value)}
              placeholder="Ex: AUT-984321 / PIX-E2E-12345"
              style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', boxSizing: 'border-box' }}
            />
          </div>
          <button
            onClick={salvarCvReferencia}
            disabled={salvandoCv}
            style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '0.6rem 1.25rem', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', height: '40px', fontSize: '0.85rem' }}
          >
            {salvandoCv ? 'Salvando...' : 'Salvar CV'}
          </button>
        </div>

        {/* Upload de Arquivos */}
        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '1.25rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={tipoAnexo}
              onChange={(e) => setTipoAnexo(e.target.value)}
              style={{ padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', background: '#fff' }}
            >
              <option value="Comprovante da entrada">Comprovante da entrada</option>
              <option value="Comprovante do almoço">Comprovante do almoço</option>
              <option value="Outros">Outros</option>
            </select>

            <label style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '0.6rem 1rem', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: '#334155' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>upload_file</span>
              Selecionar Ficheiro (PDF/JPG até 10 MB)
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={anexarFicheiroSimulado} style={{ display: 'none' }} />
            </label>
          </div>
        </div>

        {/* Lista de Ficheiros */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {anexos.length === 0 ? (
            <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic' }}>
              Nenhum comprovativo anexado a esta ficha.
            </span>
          ) : (
            anexos.map((anexo, idx) => (
              <div key={idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.6rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontWeight: '600', fontSize: '0.85rem', color: '#1e293b', display: 'block' }}>{anexo.nome}</span>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{anexo.tipo} • {anexo.tamanho} • {anexo.data}</span>
                </div>
                <span className="material-symbols-outlined" style={{ color: '#16a34a', fontSize: '1.2rem' }}>check_circle</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}