import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useNavigate } from 'react-router-dom';

export default function Companies() {
  const [empresas, setEmpresas] = useState([]);
  const [mesasCadastradas, setMesasCadastradas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const itensPorPagina = 60;
  const navigate = useNavigate();

  // 1. Modal Validador de Almoço
  const [modalAlmocoAberto, setModalAlmocoAberto] = useState(false);
  const [clienteAlvoAlmoco, setClienteAlvoAlmoco] = useState(null);
  const [tipoAlmoco, setTipoAlmoco] = useState('pago');
  const [cvCartao, setCvCartao] = useState('');
  const [salvandoAlmoco, setSalvandoAlmoco] = useState(false);

  // 2. Modal de Alocação Rápida de Mesa
  const [modalMesaAberto, setModalMesaAberto] = useState(false);
  const [clienteAlvoMesa, setClienteAlvoMesa] = useState(null);
  const [mesaSelecionada, setMesaSelecionada] = useState(1);
  const [assentoSelecionado, setAssentoSelecionado] = useState(1);
  const [salvandoMesa, setSalvandoMesa] = useState(false);

  const carregarDados = async () => {
    try {
      setCarregando(true);
      setErro('');
      const [dados, aux] = await Promise.all([
        api.get('/clientes?turmaId=1'),
        api.get('/auxiliares')
      ]);

      const lista = Array.isArray(dados) ? dados : dados.clientes || [];
      setEmpresas(lista);

      const mesasReais = Array.isArray(aux?.mesas) ? aux.mesas : [];
      setMesasCadastradas(mesasReais);
    } catch (err) {
      setErro(err.message || 'Erro ao carregar dados de empresas e mesas.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, []);

  const empresasFiltradas = empresas.filter((emp) => {
    const termo = busca.toLowerCase();
    const nome = (emp.nome || emp.nome_participante || emp.nome_completo || '').toLowerCase();
    const razaoSocial = (emp.empresa || '').toLowerCase();
    const doc = (emp.cpf_cnpj || emp.cnpj || '').toLowerCase();
    const empId = String(emp.empId || emp.id || '');
    return nome.includes(termo) || razaoSocial.includes(termo) || doc.includes(termo) || empId.includes(termo);
  });

  const totalPaginas = Math.ceil(empresasFiltradas.length / itensPorPagina) || 1;
  const indiceInicial = (pagina - 1) * itensPorPagina;
  const empresasExibidas = empresasFiltradas.slice(indiceInicial, indiceInicial + itensPorPagina);

  // Funções do Modal de Almoço
  const abrirValidadorAlmoco = (emp) => {
    setClienteAlvoAlmoco(emp);
    if (emp.membro_giants) {
      setTipoAlmoco('giants');
    } else if (emp.cortesia_almoco) {
      setTipoAlmoco('cortesia');
    } else {
      setTipoAlmoco('pago');
    }
    setCvCartao(emp.cv_cartao || '');
    setModalAlmocoAberto(true);
  };

  const salvarValidadorAlmoco = async (e) => {
    e.preventDefault();
    if (!clienteAlvoAlmoco) return;
    try {
      setSalvandoAlmoco(true);
      const res = await api.patch(`/clientes/${clienteAlvoAlmoco.id}/almoco`, {
        tipo: tipoAlmoco,
        cv_cartao: tipoAlmoco === 'pago' ? cvCartao : null
      });

      setEmpresas(prev => prev.map(item => item.id === clienteAlvoAlmoco.id ? {
        ...item,
        almoco_pago: res.almoco_pago,
        cortesia_almoco: res.cortesia_almoco,
        membro_giants: res.membro_giants,
        cv_cartao: res.cv_cartao
      } : item));

      setModalAlmocoAberto(false);
    } catch (err) {
      alert('Erro ao salvar validação de almoço: ' + err.message);
    } finally {
      setSalvandoAlmoco(false);
    }
  };

  // Funções do Modal de Mesa Dinâmica
  const abrirModalMesa = (emp) => {
    setClienteAlvoMesa(emp);
    const mesaPadrao = emp.mesa_alocada || (mesasCadastradas.length > 0 ? (mesasCadastradas[0].numero || mesasCadastradas[0].id) : 1);
    setMesaSelecionada(mesaPadrao);
    setAssentoSelecionado(emp.assento_alocado || 1);
    setModalMesaAberto(true);
  };

  const mesaAtualObj = mesasCadastradas.find(m => Number(m.numero) === Number(mesaSelecionada) || Number(m.id) === Number(mesaSelecionada)) || mesasCadastradas[0];
  const capacidadeMesaAtual = Number(mesaAtualObj?.capacidade_total || 5);

  const salvarAlocacaoMesa = async (e) => {
    e.preventDefault();
    if (!clienteAlvoMesa) return;
    try {
      setSalvandoMesa(true);
      const res = await api.patch(`/clientes/${clienteAlvoMesa.id}/mesa`, {
        mesa: Number(mesaSelecionada),
        assento: Number(assentoSelecionado)
      });

      setEmpresas(prev => prev.map(item => item.id === clienteAlvoMesa.id ? {
        ...item,
        mesa_alocada: res.mesa_alocada,
        assento_alocado: res.assento_alocado
      } : item));

      setModalMesaAberto(false);
    } catch (err) {
      alert('Erro ao alocar mesa: ' + err.message);
    } finally {
      setSalvandoMesa(false);
    }
  };

  const desalocarMesa = async () => {
    if (!clienteAlvoMesa) return;
    if (!window.confirm(`Deseja remover ${clienteAlvoMesa.nome_participante || clienteAlvoMesa.empresa} da Mesa ${clienteAlvoMesa.mesa_alocada}?`)) return;
    try {
      setSalvandoMesa(true);
      await api.patch(`/clientes/${clienteAlvoMesa.id}/mesa`, {
        mesa: null,
        assento: null
      });

      setEmpresas(prev => prev.map(item => item.id === clienteAlvoMesa.id ? {
        ...item,
        mesa_alocada: null,
        assento_alocado: null
      } : item));

      setModalMesaAberto(false);
    } catch (err) {
      alert('Erro ao desalocar mesa: ' + err.message);
    } finally {
      setSalvandoMesa(false);
    }
  };

  const obterEstagio = (emp) => {
    const temAlmoco = Boolean(emp.membro_giants || emp.cortesia_almoco || emp.almoco_pago);
    const temMesa = Boolean(emp.mesa_alocada);

    if (!temAlmoco) {
      return {
        passo: 1,
        rotuloAlmoco: '⚠️ Almoço Pendente',
        bgAlmoco: '#fef3c7',
        corAlmoco: '#b45309',
        rotuloMesa: 'Bloqueado',
        bgMesa: '#f1f5f9',
        corMesa: '#94a3b8',
        podeEntrevista: false
      };
    }

    let rotuloAlmoco = '● Pago R$ 1.000';
    let corAlmoco = '#15803d';
    let bgAlmoco = '#dcfce7';

    if (emp.membro_giants) {
      rotuloAlmoco = '● GIANTS';
      corAlmoco = '#7e22ce';
      bgAlmoco = '#f3e8ff';
    } else if (emp.cortesia_almoco) {
      rotuloAlmoco = '● Cortesia';
      corAlmoco = '#0369a1';
      bgAlmoco = '#e0f2fe';
    } else if (emp.cv_cartao) {
      rotuloAlmoco = `● Pago (${emp.cv_cartao})`;
    }

    if (!temMesa) {
      return {
        passo: 2,
        rotuloAlmoco,
        bgAlmoco,
        corAlmoco,
        rotuloMesa: '⚠️ Alocar Lunch',
        bgMesa: '#fff7ed',
        corMesa: '#c2410c',
        podeEntrevista: false
      };
    }

    return {
      passo: 3,
      rotuloAlmoco,
      bgAlmoco,
      corAlmoco,
      rotuloMesa: `Mesa ${emp.mesa_alocada}${emp.assento_alocado ? ` • Cadeira ${emp.assento_alocado}` : ''}`,
      bgMesa: '#eff6ff',
      corMesa: '#1d4ed8',
      podeEntrevista: true
    };
  };

  return (
    <div style={{ padding: '2rem', width: '100%', boxSizing: 'border-box' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
            Base de Empresas — Fluxo Pré-Entrevista
          </h1>
          <p style={{ color: '#64748b', margin: '0.25rem 0 0', fontSize: '0.9rem' }}>
            1. Validar Almoço → 2. Alocar na Mesa → 3. Iniciar Entrevista Comercial
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span style={{ background: '#e0f2fe', color: '#0284c7', padding: '0.45rem 0.85rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: '700' }}>
            {empresasFiltradas.length} Empresas
          </span>
          <button
            onClick={() => navigate('/lunch')}
            style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#0284c7' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>restaurant</span>
            Ver Salão de Lunch
          </button>
          <button
            onClick={carregarDados}
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
          placeholder="Pesquisar por Razão Social, Nome do Sócio, CNPJ ou ID..."
          style={{ width: '100%', border: 'none', outline: 'none', fontSize: '0.95rem', color: '#1e293b' }}
        />
      </div>

      {/* Tabela de Empresas */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <tr>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem', width: '70px' }}>ID</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Empresa / Representante</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>Documento</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>1. Almoço</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem' }}>2. Mesa Lunch</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.85rem', textAlign: 'right' }}>3. Entrevista</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr><td colSpan="6" style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>Carregando participantes...</td></tr>
            ) : empresasExibidas.length === 0 ? (
              <tr><td colSpan="6" style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>Nenhum participante encontrado.</td></tr>
            ) : (
              empresasExibidas.map((emp) => {
                const estagio = obterEstagio(emp);
                return (
                  <tr key={emp.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '1rem', fontWeight: '700', color: '#ff5722' }}>
                      #{emp.empId || emp.id}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontWeight: '700', color: '#0f172a' }}>{emp.empresa || 'Empresa não informada'}</div>
                      <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{emp.nome || emp.nome_participante || emp.nome_completo || '-'}</div>
                    </td>
                    <td style={{ padding: '1rem', color: '#64748b', fontSize: '0.85rem' }}>
                      {emp.cpf_cnpj || emp.cnpj || '-'}
                    </td>

                    {/* 1. Almoço */}
                    <td style={{ padding: '1rem' }}>
                      <button
                        onClick={() => abrirValidadorAlmoco(emp)}
                        style={{
                          background: estagio.bgAlmoco,
                          color: estagio.corAlmoco,
                          border: 'none',
                          padding: '0.35rem 0.75rem',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          fontWeight: '700',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem'
                        }}
                        title="Clique para validar ou alterar pagamento de almoço"
                      >
                        {estagio.rotuloAlmoco}
                        <span className="material-symbols-outlined" style={{ fontSize: '0.85rem' }}>edit</span>
                      </button>
                    </td>

                    {/* 2. Mesa (Modal com Mesas Reais) */}
                    <td style={{ padding: '1rem' }}>
                      {estagio.passo === 1 ? (
                        <button
                          onClick={() => abrirValidadorAlmoco(emp)}
                          style={{
                            background: '#f8fafc',
                            color: '#94a3b8',
                            border: '1px dashed #cbd5e1',
                            padding: '0.35rem 0.75rem',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: '600',
                            cursor: 'pointer'
                          }}
                        >
                          Aguardando Almoço
                        </button>
                      ) : (
                        <button
                          onClick={() => abrirModalMesa(emp)}
                          style={{
                            background: estagio.bgMesa,
                            color: estagio.corMesa,
                            border: '1px solid #cbd5e1',
                            padding: '0.35rem 0.75rem',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: '700',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem'
                          }}
                          title="Clique para alocar ou alterar a mesa diretamente"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>table_restaurant</span>
                          {estagio.rotuloMesa}
                          <span className="material-symbols-outlined" style={{ fontSize: '0.85rem' }}>edit</span>
                        </button>
                      )}
                    </td>

                    {/* 3. Ação de Entrevista */}
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      {emp.membro_giants ? (
                        <button
                          disabled
                          style={{
                            background: '#faf5ff',
                            color: '#7e22ce',
                            border: '1px solid #e9d5ff',
                            padding: '0.45rem 0.9rem',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: '700',
                            cursor: 'not-allowed',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem'
                          }}
                          title="Membros GIANTS não passam por nova triagem comercial."
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>workspace_premium</span>
                          Isento (GIANTS)
                        </button>
                      ) : estagio.podeEntrevista ? (
                        <button
                          onClick={() => navigate(`/interviews?clienteId=${emp.id}`)}
                          style={{
                            background: '#16a34a',
                            color: '#fff',
                            border: 'none',
                            padding: '0.45rem 0.9rem',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: '700',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem'
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>check_circle</span>
                          Habilitar Entrevista
                        </button>
                      ) : estagio.passo === 2 ? (
                        <button
                          onClick={() => abrirModalMesa(emp)}
                          style={{
                            background: '#fff7ed',
                            color: '#c2410c',
                            border: '1px solid #fdba74',
                            padding: '0.45rem 0.9rem',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: '700',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem'
                          }}
                          title="Clique para escolher a mesa e liberar a entrevista"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>lock</span>
                          Aguardando Mesa
                        </button>
                      ) : (
                        <button
                          onClick={() => abrirValidadorAlmoco(emp)}
                          style={{
                            background: '#f1f5f9',
                            color: '#94a3b8',
                            border: '1px solid #cbd5e1',
                            padding: '0.45rem 0.9rem',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: '700',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem'
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: '#eab308' }}>lock</span>
                          Aguardando Almoço
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Paginação */}
        {!carregando && totalPaginas > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
              Mostrando {indiceInicial + 1} a {Math.min(indiceInicial + itensPorPagina, empresasFiltradas.length)} de {empresasFiltradas.length} empresas
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
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL 1: VALIDADOR DE ALMOÇO */}
      {modalAlmocoAberto && clienteAlvoAlmoco && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '520px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)', overflow: 'hidden' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a', fontWeight: '800' }}>Passo 1 — Validador de Almoço</h3>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{clienteAlvoAlmoco.empresa} • {clienteAlvoAlmoco.nome || clienteAlvoAlmoco.nome_participante}</span>
              </div>
              <button onClick={() => setModalAlmocoAberto(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={salvarValidadorAlmoco} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#334155', marginBottom: '0.75rem' }}>
                  Forma de Liberação da Refeição:
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: '8px', border: tipoAlmoco === 'pago' ? '2px solid #16a34a' : '1px solid #e2e8f0', background: tipoAlmoco === 'pago' ? '#f0fdf4' : '#fff', cursor: 'pointer' }}>
                    <input type="radio" name="tipoAlmoco" value="pago" checked={tipoAlmoco === 'pago'} onChange={() => setTipoAlmoco('pago')} />
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '0.9rem', color: '#16a34a' }}>● Pago (R$ 1.000,00)</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Taxa de almoço quitada (Cartão, PIX ou Dinheiro)</div>
                    </div>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: '8px', border: tipoAlmoco === 'cortesia' ? '2px solid #0284c7' : '1px solid #e2e8f0', background: tipoAlmoco === 'cortesia' ? '#f0f9ff' : '#fff', cursor: 'pointer' }}>
                    <input type="radio" name="tipoAlmoco" value="cortesia" checked={tipoAlmoco === 'cortesia'} onChange={() => setTipoAlmoco('cortesia')} />
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '0.9rem', color: '#0284c7' }}>● Cortesia</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Isenão autorizada pela diretoria comercial</div>
                    </div>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: '8px', border: tipoAlmoco === 'giants' ? '2px solid #9333ea' : '1px solid #e2e8f0', background: tipoAlmoco === 'giants' ? '#faf5ff' : '#fff', cursor: 'pointer' }}>
                    <input type="radio" name="tipoAlmoco" value="giants" checked={tipoAlmoco === 'giants'} onChange={() => setTipoAlmoco('giants')} />
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '0.9rem', color: '#9333ea' }}>● Membro GIANTS</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Membro da rede GIANTS com refeição inclusa</div>
                    </div>
                  </label>
                </div>
              </div>

              {tipoAlmoco === 'pago' && (
                <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>
                    CV / NSU / Comprovante Cartão (Opcional):
                  </label>
                  <input
                    type="text"
                    value={cvCartao}
                    onChange={(e) => setCvCartao(e.target.value)}
                    placeholder="Ex: CV-849201"
                    style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', boxSizing: 'border-box' }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" onClick={() => setModalAlmocoAberto(false)} style={{ padding: '0.6rem 1.1rem', background: '#f1f5f9', border: 'none', borderRadius: '8px', color: '#475569', fontWeight: '600', cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" disabled={salvandoAlmoco} style={{ padding: '0.6rem 1.25rem', background: '#0284c7', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: '700', cursor: 'pointer', opacity: salvandoAlmoco ? 0.7 : 1 }}>
                  {salvandoAlmoco ? 'Salvando...' : 'Confirmar Pagamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ALOCAÇÃO RÁPIDA DE MESA (DINÂMICO COM AS MESAS REAIS DO SISTEMA) */}
      {modalMesaAberto && clienteAlvoMesa && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '480px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)', overflow: 'hidden' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a', fontWeight: '800' }}>Passo 2 — Alocação no Salão de Lunch</h3>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{clienteAlvoMesa.empresa} • {clienteAlvoMesa.nome || clienteAlvoMesa.nome_participante}</span>
              </div>
              <button onClick={() => setModalMesaAberto(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={salvarAlocacaoMesa} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>Mesa:</label>
                  <select
                    value={mesaSelecionada}
                    onChange={(e) => {
                      const novaMesa = Number(e.target.value);
                      setMesaSelecionada(novaMesa);
                      const mObj = mesasCadastradas.find(m => Number(m.numero) === novaMesa || Number(m.id) === novaMesa);
                      const cap = Number(mObj?.capacidade_total || 5);
                      if (assentoSelecionado > cap) setAssentoSelecionado(1);
                    }}
                    style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.95rem', fontWeight: '600' }}
                  >
                    {mesasCadastradas.length === 0 ? (
                      <option value="1">Mesa 1</option>
                    ) : (
                      mesasCadastradas.map(m => {
                        const num = m.numero || m.id;
                        return (
                          <option key={m.id || num} value={num}>
                            Mesa {num} ({m.capacidade_total || 5} lugares)
                          </option>
                        );
                      })
                    )}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>Cadeira / Assento:</label>
                  <select
                    value={assentoSelecionado}
                    onChange={(e) => setAssentoSelecionado(Number(e.target.value))}
                    style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.95rem', fontWeight: '600' }}
                  >
                    {Array.from({ length: capacidadeMesaAtual }, (_, i) => i + 1).map(c => (
                      <option key={c} value={c}>Cadeira {c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {clienteAlvoMesa.mesa_alocada && (
                <div style={{ background: '#f0f9ff', padding: '0.85rem', borderRadius: '8px', border: '1px solid #bae6fd', fontSize: '0.85rem', color: '#0369a1' }}>
                  Atualmente alocado na <strong>Mesa {clienteAlvoMesa.mesa_alocada} (Cadeira {clienteAlvoMesa.assento_alocado || 1})</strong>.
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                {clienteAlvoMesa.mesa_alocada ? (
                  <button
                    type="button"
                    onClick={desalocarMesa}
                    disabled={salvandoMesa}
                    style={{ background: '#fee2e2', color: '#b91c1c', border: 'none', padding: '0.6rem 1rem', borderRadius: '8px', fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer' }}
                  >
                    Desalocar Mesa
                  </button>
                ) : <div />}

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" onClick={() => setModalMesaAberto(false)} style={{ padding: '0.6rem 1rem', background: '#f1f5f9', border: 'none', borderRadius: '8px', color: '#475569', fontWeight: '600', cursor: 'pointer' }}>
                    Cancelar
                  </button>
                  <button type="submit" disabled={salvandoMesa} style={{ padding: '0.6rem 1.25rem', background: '#0284c7', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: '700', cursor: 'pointer', opacity: salvandoMesa ? 0.7 : 1 }}>
                    {salvandoMesa ? 'Alocando...' : 'Salvar Mesa'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}