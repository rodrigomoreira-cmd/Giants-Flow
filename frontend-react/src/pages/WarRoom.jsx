import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

const fmtBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const BADGE_ACAO = {
  CORTESIA_ALMOCO: { label: 'Cortesia Almoço', bg: '#fef3c7', color: '#92400e' },
  EDICAO_CASHBACK: { label: 'Edição Cashback', bg: '#e0f2fe', color: '#0369a1' },
  REABERTURA_FICHA_ADMIN: { label: 'Reabertura Admin', bg: '#fee2e2', color: '#b91c1c' },
  EMISSAO_PROPOSTA: { label: 'Fechamento / Proposta', bg: '#dcfce7', color: '#166534' },
  EXPORTACAO_CSV_FINANCEIRO: { label: 'Exportação CSV', bg: '#f1f5f9', color: '#334155' }
};

export default function WarRoom() {
  const [turmaId, setTurmaId] = useState(() => localStorage.getItem('turma_ativa_id') || '1491');
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [exportandoCsv, setExportandoCsv] = useState(false);

  const carregarResumo = useCallback(async (silencioso = false) => {
    try {
      if (!silencioso) setCarregando(true);
      setErro('');
      const resp = await api.get(`/war-room/resumo?turmaId=${turmaId}`);
      setDados(resp);
    } catch (err) {
      setErro(err.message || 'Não foi possível carregar os indicadores do War Room.');
    } finally {
      if (!silencioso) setCarregando(false);
    }
  }, [turmaId]);

  useEffect(() => {
    carregarResumo(false);
  }, [carregarResumo]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      carregarResumo(true);
    }, 12000);
    return () => clearInterval(interval);
  }, [autoRefresh, carregarResumo]);

  const baixarPlanilhaCsv = async () => {
    try {
      setExportandoCsv(true);
      const token =
        localStorage.getItem('token') ||
        localStorage.getItem('auth_token') ||
        (() => {
          try {
            const s = JSON.parse(localStorage.getItem('sessao_operador') || 'null');
            return s?.token || '';
          } catch (_) {
            return '';
          }
        })();

      const baseUrl = import.meta.env.VITE_API_URL || '/api';
      const response = await fetch(`${baseUrl}/financeiro/exportar-csv?turmaId=${turmaId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (!response.ok) {
        throw new Error('Falha ao gerar arquivo CSV no servidor.');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `fechamento-financeiro-turma-${turmaId}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      carregarResumo(true);
    } catch (err) {
      alert(err.message || 'Erro ao exportar planilha.');
    } finally {
      setExportandoCsv(false);
    }
  };

  const kpis = dados?.kpis || {};
  const funil = dados?.funil || {};
  const statusFin = dados?.statusFinanceiro || {};

  return (
    <div style={{ padding: '1.5rem 2rem', maxWidth: '1480px', margin: '0 auto', boxSizing: 'border-box' }}>
      {/* CABEÇALHO EXECUTIVO */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ background: '#0f172a', color: '#fb923c', padding: '0.22rem 0.65rem', borderRadius: '6px', fontSize: '0.74rem', fontWeight: '800', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              War Room • Tempo Real
            </span>
            {dados?.atualizadoEm && (
              <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: '600' }}>
                Atualizado às {new Date(dados.atualizadoEm).toLocaleTimeString('pt-BR')}
              </span>
            )}
          </div>
          <h1 style={{ margin: '0.3rem 0 0', fontSize: '1.65rem', fontWeight: '800', color: '#0f172a' }}>
            Painel Executivo & Fechamento do Evento
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.35rem 0.65rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#475569' }}>Turma:</span>
            <input
              type="text"
              value={turmaId}
              onChange={(e) => setTurmaId(e.target.value.replace(/\D/g, ''))}
              style={{ width: '64px', border: 'none', fontWeight: '800', color: '#0f172a', fontSize: '0.86rem', outline: 'none' }}
            />
          </div>

          <button
            type="button"
            onClick={() => setAutoRefresh((v) => !v)}
            style={{
              background: autoRefresh ? '#f0fdf4' : '#f8fafc',
              color: autoRefresh ? '#166534' : '#475569',
              border: autoRefresh ? '1px solid #86efac' : '1px solid #cbd5e1',
              padding: '0.55rem 0.9rem',
              borderRadius: '8px',
              fontWeight: '700',
              fontSize: '0.8rem',
              cursor: 'pointer'
            }}
          >
            {autoRefresh ? '● Ao vivo (12s)' : '○ Pausado'}
          </button>

          <button
            type="button"
            onClick={() => carregarResumo(false)}
            style={{ background: '#fff', color: '#0f172a', border: '1px solid #cbd5e1', padding: '0.55rem 0.95rem', borderRadius: '8px', fontWeight: '700', fontSize: '0.8rem', cursor: 'pointer' }}
          >
            Atualizar
          </button>

          <button
            type="button"
            disabled={exportandoCsv}
            onClick={baixarPlanilhaCsv}
            style={{
              background: '#059669',
              color: '#ffffff',
              border: 'none',
              padding: '0.58rem 1.1rem',
              borderRadius: '8px',
              fontWeight: '800',
              fontSize: '0.82rem',
              cursor: exportandoCsv ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.05rem' }}>download</span>
            {exportandoCsv ? 'Gerando Excel/CSV...' : 'Exportar Consolidado (Excel/CSV)'}
          </button>
        </div>
      </div>

      {erro && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '0.9rem 1rem', borderRadius: '10px', marginBottom: '1.25rem', fontWeight: '600' }}>
          {erro}
        </div>
      )}

      {carregando && !dados ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b', fontWeight: '700' }}>
          Consolidando indicadores comerciais e financeiros...
        </div>
      ) : (
        <>
          {/* 4 KPIs PRINCIPAIS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ background: '#0f172a', color: '#fff', borderRadius: '14px', padding: '1.25rem' }}>
              <div style={{ fontSize: '0.74rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase' }}>
                Faturamento Líquido Contratos
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: '900', color: '#fb923c', marginTop: '0.35rem' }}>
                {fmtBRL(kpis.faturamentoLiquido)}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#cbd5e1', marginTop: '0.3rem' }}>
                Bruto: {fmtBRL(kpis.faturamentoBruto)} • <strong>{kpis.contratosFechados || 0} contratos</strong>
              </div>
            </div>

            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1.25rem' }}>
              <div style={{ fontSize: '0.74rem', fontWeight: '800', color: '#047857', textTransform: 'uppercase' }}>
                Caixa Imediato no Evento
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: '900', color: '#059669', marginTop: '0.35rem' }}>
                {fmtBRL(kpis.caixaImediatoEvento)}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '0.3rem' }}>
                Entradas: <strong>{fmtBRL(kpis.entradasImediatas)}</strong> + Almoço: <strong>{fmtBRL(kpis.almocoArrecadado)}</strong>
              </div>
            </div>

            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1.25rem' }}>
              <div style={{ fontSize: '0.74rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>
                Cashback, Descontos & Permuta
              </div>
              <div style={{ fontSize: '1.55rem', fontWeight: '900', color: '#0f172a', marginTop: '0.35rem' }}>
                {fmtBRL((kpis.totalCashback || 0) + (kpis.totalDescontos || 0) + (kpis.totalPermuta || 0))}
              </div>
              <div style={{ fontSize: '0.76rem', color: '#475569', marginTop: '0.3rem' }}>
                Cashback: <strong>{fmtBRL(kpis.totalCashback)}</strong> • Permuta: <strong>{fmtBRL(kpis.totalPermuta)}</strong>
              </div>
            </div>

            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1.25rem' }}>
              <div style={{ fontSize: '0.74rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>
                Conversão & Ocupação do Salão
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: '900', color: '#0369a1', marginTop: '0.35rem' }}>
                {kpis.taxaConversao || 0}%
              </div>
              <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '0.3rem' }}>
                Em mesa agora: <strong>{funil.emMesaAgora || 0}</strong> • Encerradas: <strong>{funil.encerradasTotal || 0}</strong>
              </div>
            </div>
          </div>

          {/* PLACAR POR LINHA DE PRODUTO + STATUS FINANCEIRO */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
            <div style={{ gridColumn: 'span 2', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1.35rem', overflowX: 'auto' }}>
              <h3 style={{ margin: '0 0 1rem', fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>
                Desempenho por Linha de Produto
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}>
                    <th style={{ padding: '0.65rem' }}>Linha</th>
                    <th style={{ padding: '0.65rem' }}>Contratos</th>
                    <th style={{ padding: '0.65rem' }}>Bruto</th>
                    <th style={{ padding: '0.65rem' }}>Cashback</th>
                    <th style={{ padding: '0.65rem' }}>Permuta</th>
                    <th style={{ padding: '0.65rem' }}>Líquido</th>
                    <th style={{ padding: '0.65rem' }}>Entradas</th>
                  </tr>
                </thead>
                <tbody>
                  {(dados?.porLinha || []).map((item) => (
                    <tr key={item.linha} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.7rem 0.65rem', fontWeight: '800', color: '#0f172a' }}>{item.linha}</td>
                      <td style={{ padding: '0.7rem 0.65rem', fontWeight: '700' }}>{item.contratos}</td>
                      <td style={{ padding: '0.7rem 0.65rem' }}>{fmtBRL(item.bruto)}</td>
                      <td style={{ padding: '0.7rem 0.65rem', color: '#047857' }}>- {fmtBRL(item.cashback)}</td>
                      <td style={{ padding: '0.7rem 0.65rem', color: '#7e22ce' }}>- {fmtBRL(item.permuta)}</td>
                      <td style={{ padding: '0.7rem 0.65rem', fontWeight: '800', color: '#ea580c' }}>{fmtBRL(item.liquido)}</td>
                      <td style={{ padding: '0.7rem 0.65rem', fontWeight: '700', color: '#059669' }}>{fmtBRL(item.entradas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1.35rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>
                Entradas & Status Financeiro
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', textAlign: 'center' }}>
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '0.6rem' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#166534' }}>{statusFin.aprovadas || 0}</div>
                  <div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#15803d' }}>Aprovadas</div>
                </div>
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '0.6rem' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#b45309' }}>{statusFin.pendentes || 0}</div>
                  <div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#92400e' }}>Em Análise</div>
                </div>
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.6rem' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#b91c1c' }}>{statusFin.recusadas || 0}</div>
                  <div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#991b1b' }}>Recusadas</div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                <div style={{ fontSize: '0.76rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>
                  Entradas por Forma de Pagamento
                </div>
                {(dados?.formasEntrada || []).length === 0 ? (
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Nenhuma entrada registrada ainda.</span>
                ) : (
                  (dados?.formasEntrada || []).map((f) => (
                    <div key={f.forma} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', background: '#f8fafc', padding: '0.45rem 0.65rem', borderRadius: '6px' }}>
                      <span style={{ fontWeight: '600', color: '#334155' }}>{f.forma}</span>
                      <strong style={{ color: '#0f172a' }}>{fmtBRL(f.valor)}</strong>
                    </div>
                  ))
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', background: '#fff7ed', padding: '0.45rem 0.65rem', borderRadius: '6px', color: '#9a3412' }}>
                  <span>Almoços Pagos ({kpis.qtdAlmocoPago || 0}) • Cortesias ({kpis.qtdCortesias || 0})</span>
                  <strong>{fmtBRL(kpis.almocoArrecadado)}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* ÚLTIMOS FECHAMENTOS + TRILHA DE AUDITORIA */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem' }}>
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1.35rem' }}>
              <h3 style={{ margin: '0 0 0.9rem', fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>
                Últimos Fechamentos da Turma
              </h3>
              {(dados?.ultimosFechamentos || []).length === 0 ? (
                <p style={{ fontSize: '0.84rem', color: '#64748b' }}>Nenhum contrato fechado nesta turma até o momento.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {(dados?.ultimosFechamentos || []).map((item) => (
                    <div key={item.id} style={{ border: '1px solid #e2e8f0', borderRadius: '9px', padding: '0.75rem 0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontWeight: '800', color: '#0f172a', fontSize: '0.9rem' }}>{item.empresa}</div>
                        <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
                          {item.produto} • Entr. {fmtBRL(item.entrada1)} ({item.formaEntrada})
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: '900', color: '#059669', fontSize: '0.95rem' }}>{fmtBRL(item.valorLiquido)}</div>
                        <span style={{ fontSize: '0.7rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748b' }}>
                          {item.statusAprovacao}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1.35rem' }}>
              <h3 style={{ margin: '0 0 0.9rem', fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>
                Trilha de Auditoria (Cortesias, Cashback & Reaberturas)
              </h3>
              {(dados?.auditoria || []).length === 0 ? (
                <p style={{ fontSize: '0.84rem', color: '#64748b' }}>
                  Nenhuma ação crítica registrada ainda. Cortesias de almoço, edições de cashback, emissões de proposta e reaberturas por Admin aparecerão aqui automaticamente.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', maxHeight: '420px', overflowY: 'auto' }}>
                  {(dados?.auditoria || []).map((log) => {
                    const badge = BADGE_ACAO[log.acao] || { label: log.acao, bg: '#f1f5f9', color: '#334155' };
                    return (
                      <div key={log.id} style={{ border: '1px solid #f1f5f9', background: '#f8fafc', borderRadius: '8px', padding: '0.65rem 0.85rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                          <span style={{ background: badge.bg, color: badge.color, padding: '0.15rem 0.5rem', borderRadius: '5px', fontSize: '0.7rem', fontWeight: '800' }}>
                            {badge.label}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                            {new Date(log.created_at).toLocaleString('pt-BR')} • <strong>{log.usuario_nome || 'Operador'}</strong>
                          </span>
                        </div>
                        {log.empresa && (
                          <div style={{ fontSize: '0.8rem', fontWeight: '800', color: '#0f172a' }}>
                            {log.empresa} {log.cnpj ? `(${log.cnpj})` : ''}
                          </div>
                        )}
                        {log.detalhes && (
                          <div style={{ fontSize: '0.76rem', color: '#475569', marginTop: '0.15rem' }}>{log.detalhes}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
