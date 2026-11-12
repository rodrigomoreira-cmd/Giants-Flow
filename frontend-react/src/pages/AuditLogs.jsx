import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [filtroTabela, setFiltroTabela] = useState('');
  const [filtroOperacao, setFiltroOperacao] = useState('');
  const [busca, setBusca] = useState('');
  const [limite, setLimite] = useState(50);
  const [expandidoId, setExpandidoId] = useState(null);

  const carregarLogs = async () => {
    try {
      setCarregando(true);
      setErro('');
      const params = new URLSearchParams();
      if (filtroTabela) params.set('tabela', filtroTabela);
      params.set('limit', String(limite));

      const data = await api.get(`/auditoria?${params.toString()}`);
      setLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      setErro(err.message || 'Falha ao carregar trilha de auditoria.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarLogs();
  }, [filtroTabela, limite]);

  const logsFiltrados = useMemo(() => {
    return logs.filter((item) => {
      if (filtroOperacao && item.operacao !== filtroOperacao) return false;
      if (!busca.trim()) return true;
      const termo = busca.toLowerCase();
      const texto = [
        item.tabela,
        item.operacao,
        item.registro_id,
        item.usuario_nome,
        item.usuario_papel,
        JSON.stringify(item.dados_anteriores || {}),
        JSON.stringify(item.dados_novos || {})
      ]
        .join(' ')
        .toLowerCase();
      return texto.includes(termo);
    });
  }, [logs, filtroOperacao, busca]);

  const calcularCamposAlterados = (anterior, novo) => {
    if (!anterior || !novo) return [];
    const chaves = new Set([...Object.keys(anterior), ...Object.keys(novo)]);
    const ignorar = new Set(['updated_at', 'criado_em', 'created_at']);
    const alterados = [];
    chaves.forEach((k) => {
      if (ignorar.has(k)) return;
      if (JSON.stringify(anterior[k]) !== JSON.stringify(novo[k])) {
        alterados.push(k);
      }
    });
    return alterados;
  };

  const badgeOperacao = (op) => {
    const estilos = {
      INSERT: { bg: '#dcfce7', color: '#166534', border: '#bbf7d0' },
      UPDATE: { bg: '#fef3c7', color: '#92400e', border: '#fde68a' },
      DELETE: { bg: '#fee2e2', color: '#991b1b', border: '#fecaca' }
    };
    const st = estilos[op] || { bg: '#f1f5f9', color: '#334155', border: '#e2e8f0' };
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '0.2rem 0.55rem',
          borderRadius: '6px',
          fontSize: '0.72rem',
          fontWeight: '800',
          background: st.bg,
          color: st.color,
          border: `1px solid ${st.border}`
        }}
      >
        {op}
      </span>
    );
  };

  const formatarData = (iso) => {
    if (!iso) return '-';
    try {
      return new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return iso;
    }
  };

  return (
    <div style={{ padding: '1.75rem', maxWidth: '1400px', width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span className="material-symbols-outlined" style={{ color: '#ff5722', fontSize: '1.6rem' }}>history_edu</span>
            <h1 style={{ margin: 0, fontSize: '1.45rem', fontWeight: '800', color: '#0f172a' }}>
              Trilha de Auditoria & Segurança
            </h1>
          </div>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.88rem', color: '#64748b' }}>
            Histórico imutável (append-only) de operações críticas capturadas automaticamente via triggers PostgreSQL.
          </p>
        </div>

        <button
          onClick={carregarLogs}
          disabled={carregando}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            padding: '0.6rem 1.1rem',
            borderRadius: '8px',
            border: 'none',
            background: '#ff5722',
            color: '#fff',
            fontWeight: '700',
            fontSize: '0.85rem',
            cursor: carregando ? 'not-allowed' : 'pointer',
            opacity: carregando ? 0.7 : 1
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>refresh</span>
          {carregando ? 'Sincronizando...' : 'Atualizar Logs'}
        </button>
      </div>

      {/* Barra de Filtros */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '1rem 1.25rem',
          marginBottom: '1.25rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '0.85rem',
          alignItems: 'end'
        }}
      >
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.35rem' }}>
            Entidade / Tabela
          </label>
          <select
            value={filtroTabela}
            onChange={(e) => setFiltroTabela(e.target.value)}
            style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', background: '#fff' }}
          >
            <option value="">Todas as tabelas auditadas</option>
            <option value="propostas">Propostas Comerciais (propostas)</option>
            <option value="fichas">Fichas & Assentos (fichas)</option>
            <option value="regras_comerciais">Regras Comerciais (regras_comerciais)</option>
            <option value="usuarios">Usuários & Permissões (usuarios)</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.35rem' }}>
            Tipo de Operação
          </label>
          <select
            value={filtroOperacao}
            onChange={(e) => setFiltroOperacao(e.target.value)}
            style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', background: '#fff' }}
          >
            <option value="">Todas (INSERT, UPDATE, DELETE)</option>
            <option value="INSERT">INSERT (Criação)</option>
            <option value="UPDATE">UPDATE (Alteração)</option>
            <option value="DELETE">DELETE (Exclusão)</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.35rem' }}>
            Busca Rápida (Operador, ID ou Conteúdo)
          </label>
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Ex: Rodrigo, aprovado, 1491..."
            style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.35rem' }}>
            Limite de Eventos
          </label>
          <select
            value={limite}
            onChange={(e) => setLimite(Number(e.target.value))}
            style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', background: '#fff' }}
          >
            <option value={50}>Últimos 50 eventos</option>
            <option value={100}>Últimos 100 eventos</option>
            <option value={200}>Últimos 200 eventos</option>
          </select>
        </div>
      </div>

      {erro && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '0.9rem 1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.88rem', fontWeight: '600' }}>
          {erro}
        </div>
      )}

      {/* Tabela de Eventos */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '0.85rem 1rem' }}>Data / Hora</th>
                <th style={{ padding: '0.85rem 1rem' }}>Operador</th>
                <th style={{ padding: '0.85rem 1rem' }}>Tabela</th>
                <th style={{ padding: '0.85rem 1rem' }}>Ação</th>
                <th style={{ padding: '0.85rem 1rem' }}>Registro</th>
                <th style={{ padding: '0.85rem 1rem' }}>Campos Modificados</th>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Inspeção</th>
              </tr>
            </thead>
            <tbody>
              {carregando ? (
                <tr>
                  <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                    Carregando trilha de auditoria...
                  </td>
                </tr>
              ) : logsFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                    Nenhum evento de auditoria encontrado para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                logsFiltrados.map((log) => {
                  const alterado = log.operacao === 'UPDATE' ? calcularCamposAlterados(log.dados_anteriores, log.dados_novos) : [];
                  const aberto = expandidoId === log.id;
                  return (
                    <React.Fragment key={log.id}>
                      <tr style={{ borderBottom: '1px solid #f1f5f9', background: aberto ? '#fff7ed' : '#fff' }}>
                        <td style={{ padding: '0.8rem 1rem', whiteSpace: 'nowrap', color: '#334155', fontWeight: '600' }}>
                          {formatarData(log.criado_em)}
                        </td>
                        <td style={{ padding: '0.8rem 1rem' }}>
                          <div style={{ fontWeight: '700', color: '#0f172a' }}>
                            {log.usuario_nome || (log.usuario_id ? `Operador #${log.usuario_id}` : 'Sistema / Automação')}
                          </div>
                          <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#64748b' }}>
                            {log.usuario_papel || 'SYSTEM'} {log.usuario_id ? `(ID ${log.usuario_id})` : ''}
                          </span>
                        </td>
                        <td style={{ padding: '0.8rem 1rem', fontFamily: 'monospace', fontWeight: '700', color: '#1e293b' }}>
                          {log.tabela}
                        </td>
                        <td style={{ padding: '0.8rem 1rem' }}>{badgeOperacao(log.operacao)}</td>
                        <td style={{ padding: '0.8rem 1rem', fontFamily: 'monospace', color: '#475569' }}>
                          #{log.registro_id || '-'}
                        </td>
                        <td style={{ padding: '0.8rem 1rem', maxWidth: '320px' }}>
                          {log.operacao === 'UPDATE' ? (
                            alterado.length > 0 ? (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                                {alterado.map((campo) => (
                                  <span
                                    key={campo}
                                    style={{
                                      background: '#f1f5f9',
                                      color: '#0f172a',
                                      padding: '0.15rem 0.45rem',
                                      borderRadius: '4px',
                                      fontSize: '0.72rem',
                                      fontFamily: 'monospace',
                                      fontWeight: '600'
                                    }}
                                  >
                                    {campo}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>Metadados atualizados</span>
                            )
                          ) : (
                            <span style={{ color: '#64748b', fontSize: '0.78rem' }}>
                              {log.operacao === 'INSERT' ? 'Registro criado' : 'Registro removido'}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '0.8rem 1rem', textAlign: 'right' }}>
                          <button
                            onClick={() => setExpandidoId(aberto ? null : log.id)}
                            style={{
                              padding: '0.35rem 0.7rem',
                              borderRadius: '6px',
                              border: '1px solid #cbd5e1',
                              background: aberto ? '#0f172a' : '#fff',
                              color: aberto ? '#fff' : '#334155',
                              fontSize: '0.75rem',
                              fontWeight: '700',
                              cursor: 'pointer'
                            }}
                          >
                            {aberto ? 'Ocultar Diff' : 'Ver Diff JSON'}
                          </button>
                        </td>
                      </tr>

                      {aberto && (
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                          <td colSpan={7} style={{ padding: '1rem 1.25rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
                              <div>
                                <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#991b1b', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                                  Estado Anterior (BEFORE)
                                </div>
                                <pre
                                  style={{
                                    margin: 0,
                                    padding: '0.85rem',
                                    borderRadius: '8px',
                                    background: '#0f172a',
                                    color: '#f8fafc',
                                    fontSize: '0.75rem',
                                    maxHeight: '260px',
                                    overflow: 'auto'
                                  }}
                                >
                                  {log.dados_anteriores ? JSON.stringify(log.dados_anteriores, null, 2) : '// Sem estado anterior (INSERT)'}
                                </pre>
                              </div>
                              <div>
                                <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#166534', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                                  Estado Novo (AFTER)
                                </div>
                                <pre
                                  style={{
                                    margin: 0,
                                    padding: '0.85rem',
                                    borderRadius: '8px',
                                    background: '#0f172a',
                                    color: '#86efac',
                                    fontSize: '0.75rem',
                                    maxHeight: '260px',
                                    overflow: 'auto'
                                  }}
                                >
                                  {log.dados_novos ? JSON.stringify(log.dados_novos, null, 2) : '// Registro excluído (DELETE)'}
                                </pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}