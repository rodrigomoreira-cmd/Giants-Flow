import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

export default function Entrevistas() {
  const [dadosAux, setDadosAux] = useState({ entrevistadores: [], turmas: [], mesas: [] });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  
  // Estado para escalar entrevistador na mesa
  const [mesaParaEscalar, setMesaParaEscalar] = useState(null);

  // Formulário para alocar empresário
  const [formAgendamento, setFormAgendamento] = useState({
    cliente_id: '',
    mesa_id: '',
    entrevistador_id: ''
  });

  const carregarDados = async () => {
    try {
      setCarregando(true);
      setErro('');
      const dados = await api.get('/auxiliares');
      setDadosAux(dados);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, []);

  // Ao mudar a mesa selecionada no form, pré-seleciona o primeiro entrevistador daquela mesa
  const handleMesaChange = (mesaId) => {
    const mesaEncontrada = dadosAux?.mesas?.find(m => String(m.id) === String(mesaId));
    const primeiroEntrevistador = mesaEncontrada?.entrevistadores_ids?.[0] || '';
    setFormAgendamento(prev => ({
      ...prev,
      mesa_id: mesaId,
      entrevistador_id: primeiroEntrevistador ? String(primeiroEntrevistador) : ''
    }));
  };

  // Alterna a escala de um entrevistador na mesa física
  const alternarEscalaEntrevistador = async (mesaId, entrevistadorId) => {
    const mesa = dadosAux?.mesas?.find(m => m.id === mesaId);
    if (!mesa) return;

    const idsAtuais = mesa.entrevistadores_ids || [];
    const jaEscalado = idsAtuais.includes(entrevistadorId);
    const novosIds = jaEscalado 
      ? idsAtuais.filter(id => id !== entrevistadorId) 
      : [...idsAtuais, entrevistadorId];

    try {
      await api.patch(`/mesas/${mesaId}/entrevistadores`, { entrevistadores_ids: novosIds });
      carregarDados();
    } catch (err) {
      alert(`Erro ao atualizar escala da mesa: ${err.message}`);
    }
  };

  const agendarEntrevista = async (e) => {
    e.preventDefault();
    if (!formAgendamento.cliente_id || !formAgendamento.mesa_id) {
      alert('Selecione o participante e a mesa.');
      return;
    }

    try {
      await api.post('/entrevistas/agendar', {
        cliente_id: Number(formAgendamento.cliente_id),
        mesa_id: Number(formAgendamento.mesa_id),
        entrevistador_id: formAgendamento.entrevistador_id ? Number(formAgendamento.entrevistador_id) : null
      });
      alert('Empresário alocado com sucesso na mesa!');
      setFormAgendamento({ cliente_id: '', mesa_id: '', entrevistador_id: '' });
      carregarDados();
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Erro ao agendar';
      alert(`Erro ao agendar: ${msg}`);
    }
  };

  const registrarResultado = async (entrevistaId, resultado) => {
    try {
      await api.post('/entrevistas/resultado', {
        entrevista_id: entrevistaId,
        resultado: resultado
      });
      alert(`Etapa atualizada com sucesso (${resultado})!`);
      carregarDados();
    } catch (err) {
      alert(`Erro ao atualizar resultado: ${err.message}`);
    }
  };

  const desalocarParticipante = async (entrevistaId) => {
    if (!window.confirm('Deseja realmente liberar este assento e desalocar o participante da mesa?')) return;
    try {
      await api.delete(`/mesas/cadeiras/${entrevistaId}`);
      alert('Assento liberado com sucesso!');
      carregarDados();
    } catch (err) {
      alert(`Erro ao desalocar participante: ${err.message}`);
    }
  };

  const mesaSelecionadaObj = dadosAux?.mesas?.find(m => String(m.id) === String(formAgendamento.mesa_id));
  const entrevistadoresDaMesaSelecionada = mesaSelecionadaObj?.entrevistadores_escalados || [];

  return (
    <div style={{ padding: '2rem', maxWidth: '1440px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>Gestão de Mesas & Entrevistas</h1>
          <p style={{ color: '#64748b', margin: '0.3rem 0 0 0', fontSize: '0.9rem' }}>
            Escalação de múltiplos entrevistadores por mesa e alocação 1 a 1 de empresários por assento.
          </p>
        </div>
        <button 
          onClick={carregarDados}
          style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '0.55rem 1.1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', color: '#334155' }}
        >
          Atualizar Dados
        </button>
      </div>

      {erro && (
        <div style={{ background: '#fee2e2', border: '1px solid #f87171', color: '#b91c1c', padding: '0.85rem 1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
          {erro}
        </div>
      )}

      {/* BLOCO 1: GESTÃO DAS MESAS FÍSICAS E ESCALA DE ENTREVISTADORES */}
      <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '14px', border: '1px solid #e2e8f0', marginBottom: '2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
        <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: '700', color: '#1e293b' }}>
          Estações de Atendimento (Mesas Físicas)
        </h3>
        <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0 0 1.25rem 0' }}>
          Defina quais entrevistadores estão escalados para atender em cada mesa física:
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
          {dadosAux?.mesas?.map(m => {
            const ocupacao = m.ocupantes || 0;
            const capacidade = m.capacidade_total || 4;
            const estaCheia = ocupacao >= capacidade;

            return (
              <div 
                key={m.id}
                style={{ 
                  border: '1px solid #e2e8f0', 
                  borderRadius: '10px', 
                  padding: '1rem', 
                  background: '#f8fafc',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <span style={{ fontWeight: '800', color: '#0f172a', fontSize: '1rem' }}>
                      Mesa #{m.numero}
                    </span>
                    <span style={{ 
                      fontSize: '0.75rem', 
                      fontWeight: '700', 
                      padding: '0.2rem 0.55rem', 
                      borderRadius: '12px',
                      background: estaCheia ? '#fee2e2' : '#dcfce7',
                      color: estaCheia ? '#dc2626' : '#16a34a'
                    }}>
                      {ocupacao}/{capacidade} cadeiras ocupadas
                    </span>
                  </div>

                  <div style={{ marginBottom: '0.75rem' }}>
                    <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#64748b', marginBottom: '0.35rem' }}>
                      ENTREVISTADORES ESCALADOS NESTA MESA:
                    </span>
                    {m.entrevistadores_escalados && m.entrevistadores_escalados.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                        {m.entrevistadores_escalados.map(ent => (
                          <span 
                            key={ent.id} 
                            style={{ 
                              background: '#eff6ff', 
                              color: '#1d4ed8', 
                              border: '1px solid #bfdbfe', 
                              padding: '0.2rem 0.5rem', 
                              borderRadius: '6px', 
                              fontSize: '0.75rem', 
                              fontWeight: '600',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem'
                            }}
                          >
                            🎤 {ent.nome}
                            <button 
                              onClick={() => alternarEscalaEntrevistador(m.id, ent.id)}
                              title="Remover entrevistador da mesa"
                              style={{ background: 'transparent', border: 'none', color: '#93c5fd', cursor: 'pointer', padding: 0, fontSize: '0.8rem', fontWeight: 'bold' }}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>
                        Nenhum entrevistador escalado
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem', marginTop: '0.5rem' }}>
                  <button
                    onClick={() => setMesaParaEscalar(mesaParaEscalar === m.id ? null : m.id)}
                    style={{
                      background: '#fff',
                      border: '1px solid #cbd5e1',
                      padding: '0.35rem 0.75rem',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      color: '#475569',
                      cursor: 'pointer',
                      width: '100%'
                    }}
                  >
                    {mesaParaEscalar === m.id ? 'Fechar Escala ▲' : '+ Escalar Entrevistadores ▼'}
                  </button>

                  {mesaParaEscalar === m.id && (
                    <div style={{ marginTop: '0.75rem', background: '#fff', padding: '0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                      <span style={{ display: 'block', fontSize: '0.7rem', fontWeight: '700', color: '#475569', marginBottom: '0.5rem' }}>
                        Clique para adicionar ou remover da Mesa #{m.numero}:
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                        {dadosAux?.entrevistadores?.map(e => {
                          const escalado = (m.entrevistadores_ids || []).includes(e.id);
                          return (
                            <button
                              key={e.id}
                              onClick={() => alternarEscalaEntrevistador(m.id, e.id)}
                              style={{
                                padding: '0.3rem 0.6rem',
                                borderRadius: '14px',
                                border: escalado ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                                background: escalado ? '#dbeafe' : '#f8fafc',
                                color: escalado ? '#1e40af' : '#475569',
                                fontSize: '0.72rem',
                                fontWeight: escalado ? '700' : '500',
                                cursor: 'pointer'
                              }}
                            >
                              {escalado ? '✓ ' : '+ '} {e.nome}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* BLOCO 2: FORMULÁRIO DE ALOCAÇÃO DO EMPRESÁRIO */}
      <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '14px', border: '1px solid #e2e8f0', marginBottom: '2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
        <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: '700', color: '#1e293b' }}>
          Alocar Empresário em uma Mesa & Designar Entrevistador
        </h3>
        
        <form onSubmit={agendarEntrevista}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>
                ID do Participante / Ficha *
              </label>
              <input 
                type="number"
                placeholder="Ex: 1"
                value={formAgendamento.cliente_id}
                onChange={(e) => setFormAgendamento({ ...formAgendamento, cliente_id: e.target.value })}
                style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>
                Mesa de Destino *
              </label>
              <select 
                value={formAgendamento.mesa_id}
                onChange={(e) => handleMesaChange(e.target.value)}
                style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', boxSizing: 'border-box' }}
                required
              >
                <option value="">Selecione a mesa...</option>
                {dadosAux?.mesas?.map(m => (
                  <option key={m.id} value={m.id}>
                    Mesa #{m.numero} ({m.ocupantes}/{m.capacidade_total} cadeiras ocupadas) {m.entrevistadorNome ? `[Entrevistadores: ${m.entrevistadorNome}]` : '[Sem entrevistador]'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.35rem' }}>
                Entrevistador Designado para Este Empresário
              </label>
              <select 
                value={formAgendamento.entrevistador_id}
                onChange={(e) => setFormAgendamento({ ...formAgendamento, entrevistador_id: e.target.value })}
                style={{ width: '100%', padding: '0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', boxSizing: 'border-box' }}
              >
                <option value="">
                  {entrevistadoresDaMesaSelecionada.length > 0 ? 'Selecione quem fará o atendimento...' : 'Nenhum entrevistador na mesa (escolha geral)'}
                </option>
                {entrevistadoresDaMesaSelecionada.length > 0 ? (
                  entrevistadoresDaMesaSelecionada.map(ent => (
                    <option key={ent.id} value={ent.id}>🎤 {ent.nome}</option>
                  ))
                ) : (
                  dadosAux?.entrevistadores?.map(ent => (
                    <option key={ent.id} value={ent.id}>{ent.nome}</option>
                  ))
                )}
              </select>
            </div>
          </div>

          <button 
            type="submit" 
            style={{ 
              background: '#ff5722', 
              color: '#fff', 
              border: 'none', 
              padding: '0.75rem 1.8rem', 
              borderRadius: '8px', 
              fontWeight: '700', 
              cursor: 'pointer', 
              fontSize: '0.9rem' 
            }}
          >
            Alocar Empresário no Assento
          </button>
        </form>
      </div>

      {/* BLOCO 3: TABELA DE ATENDIMENTOS EM ANDAMENTO */}
      <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
        <div style={{ padding: '1.1rem 1.5rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#1e293b' }}>
            Empresários em Atendimento nas Mesas
          </h3>
        </div>
        
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.85rem', background: '#f8fafc' }}>
              <th style={{ padding: '1rem' }}>Mesa</th>
              <th style={{ padding: '1rem' }}>Empresário</th>
              <th style={{ padding: '1rem' }}>Empresa</th>
              <th style={{ padding: '1rem' }}>Entrevistador Designado</th>
              <th style={{ padding: '1rem' }}>Almoço</th>
              <th style={{ padding: '1rem', textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr><td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Carregando dados...</td></tr>
            ) : (
              dadosAux?.mesas?.flatMap(m => (m.ocupantes_detalhes || []).map(det => ({ ...det, mesaNumero: m.numero, mesaId: m.id }))).length === 0 ? (
                <tr><td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Nenhum participante em entrevista no momento.</td></tr>
              ) : (
                dadosAux?.mesas?.flatMap(m => (m.ocupantes_detalhes || []).map(det => ({ ...det, mesaNumero: m.numero, mesaId: m.id }))).map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '1rem', fontWeight: '700', color: '#ff5722' }}>
                      Mesa #{item.mesaNumero}
                    </td>
                    <td style={{ padding: '1rem', fontWeight: '600', color: '#1e293b' }}>
                      {item.nome || 'Participante'}
                    </td>
                    <td style={{ padding: '1rem', color: '#64748b' }}>{item.empresa || '-'}</td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{ fontSize: '0.8rem', background: '#eff6ff', color: '#1d4ed8', padding: '0.25rem 0.6rem', borderRadius: '6px', fontWeight: '600', border: '1px solid #bfdbfe' }}>
                        🎤 {item.entrevistador_nome || 'Não definido'}
                      </span>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{ fontSize: '0.75rem', background: item.status_almoco === 'liberado' ? '#dcfce7' : '#fee2e2', color: item.status_almoco === 'liberado' ? '#16a34a' : '#ef4444', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: '700' }}>
                        {item.status_almoco === 'liberado' ? 'Liberado' : 'Pendente'}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button 
                          onClick={() => registrarResultado(item.entrevista_id, 'aprovado_proposta')}
                          style={{ background: '#059669', color: '#fff', border: 'none', padding: '0.45rem 0.85rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer' }}
                        >
                          Aprovar Proposta
                        </button>
                        <button 
                          onClick={() => desalocarParticipante(item.entrevista_id)}
                          style={{ background: '#f8fafc', color: '#dc2626', border: '1px solid #fca5a5', padding: '0.45rem 0.75rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer' }}
                        >
                          Liberar Assento
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}