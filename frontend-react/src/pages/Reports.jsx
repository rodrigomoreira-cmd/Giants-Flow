import { useState, useEffect } from 'react';
import { api } from '../services/api';

export default function Reports() {
  const [metricas, setMetricas] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [abaAtiva, setAbaAtiva] = useState('dashboard'); // 'dashboard' | 'export'

  useEffect(() => {
    async function carregarDados() {
      try {
        setCarregando(true);
        setErro('');
        const dados = await api.get('/hub/metricas');
        setMetricas(dados);
      } catch (err) {
        setErro(err.message);
      } finally {
        setCarregando(false);
      }
    }
    carregarDados();
  }, []);

  // Exportação nativa para formato CSV
  const exportarCsv = () => {
    if (!metricas?.ultimasVendas || metricas.ultimasVendas.length === 0) {
      alert('Sem dados disponíveis para exportação.');
      return;
    }

    const cabecalho = ['ID;Participante;Empresa;Produto;Valor;Hora'];
    const linhas = metricas.ultimasVendas.map(v => 
      `${v.id};"${v.cliente_nome}";"${v.cliente_empresa || '-'}";"${v.produto_nome}";"${v.valor_total}";"${v.hora_venda}"`
    );

    const conteudoCsv = [cabecalho, ...linhas].join('\r\n');
    const blob = new Blob(["\ufeff" + conteudoCsv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `relatorio_giants_flow_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Exportação em formato de folha de cálculo compatível (TSV / Formato Tabela Excel)
  const exportarXlsx = () => {
    if (!metricas?.ultimasVendas || metricas.ultimasVendas.length === 0) {
      alert('Sem dados disponíveis para exportação.');
      return;
    }

    const cabecalho = ['ID\tParticipante\tEmpresa\tProduto\tValor (R$)\tHora'];
    const linhas = metricas.ultimasVendas.map(v => 
      `${v.id}\t${v.cliente_nome}\t${v.cliente_empresa || '-'}\t${v.produto_nome}\t${v.valor_total}\t${v.hora_venda}`
    );

    const conteudo = [cabecalho, ...linhas].join('\r\n');
    const blob = new Blob(["\ufeff" + conteudo], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `relatorio_giants_flow_${new Date().toISOString().slice(0, 10)}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Geração de Relatório Analítico Executivo em PDF
  const exportarPdf = () => {
    const janela = window.open('', '_blank');
    const conteudoHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Relatório Executivo - GIANTS Flow</title>
          <style>
            body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 2.5rem; color: #0f172a; line-height: 1.5; }
            .header { border-bottom: 2px solid #ff5722; padding-bottom: 1rem; margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: flex-end; }
            .header h1 { margin: 0; color: #ff5722; font-size: 1.8rem; }
            .header span { color: #64748b; font-size: 0.9rem; }
            .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 2rem; }
            .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem; }
            .kpi-title { font-size: 0.75rem; font-weight: bold; color: #64748b; text-transform: uppercase; }
            .kpi-val { font-size: 1.5rem; font-weight: bold; margin-top: 0.25rem; color: #0f172a; }
            table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
            th { background: #f1f5f9; padding: 0.6rem; text-align: left; font-size: 0.8rem; color: #475569; }
            td { padding: 0.6rem; border-bottom: 1px solid #e2e8f0; font-size: 0.85rem; }
            .footer { margin-top: 3rem; border-top: 1px solid #cbd5e1; padding-top: 1rem; font-size: 0.8rem; color: #94a3b8; text-align: center; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>GIANTS Flow</h1>
              <span>Grupo Acelerador • Relatório Consolidado de Desempenho</span>
            </div>
            <div>
              <span style="font-size: 0.8rem; color: #64748b;">Emitido em: ${new Date().toLocaleDateString('pt-BR')}</span>
            </div>
          </div>

          <div class="kpi-grid">
            <div class="kpi-card">
              <div class="kpi-title">Faturamento Total</div>
              <div class="kpi-val" style="color: #059669;">R$ ${Number(metricas?.faturamentoTotal || 0).toLocaleString('pt-BR')}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-title">Total de Vendas</div>
              <div class="kpi-val" style="color: #ff5722;">${metricas?.totalVendas || 0}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-title">Fichas / Empresas</div>
              <div class="kpi-val" style="color: #2563eb;">${metricas?.totalFichas || 0}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-title">Conversão</div>
              <div class="kpi-val" style="color: #7c3aed;">${metricas?.taxaConversao || 0}%</div>
            </div>
          </div>

          <h3 style="margin-bottom: 0.5rem; font-size: 1.1rem;">Vendas Realizadas na Turma Ativa</h3>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Participante</th>
                <th>Empresa</th>
                <th>Produto</th>
                <th>Valor</th>
                <th>Hora</th>
              </tr>
            </thead>
            <tbody>
              ${(metricas?.ultimasVendas || []).map(v => `
                <tr>
                  <td>#${v.id}</td>
                  <td><strong>${v.cliente_nome}</strong></td>
                  <td>${v.cliente_empresa || '-'}</td>
                  <td>${v.produto_nome}</td>
                  <td style="font-weight: bold; color: #059669;">R$ ${Number(v.valor_total).toLocaleString('pt-BR')}</td>
                  <td>${v.hora_venda}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="footer">
            Documento analítico oficial GIANTS Flow • Confidencial
          </div>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `;
    janela.document.write(conteudoHtml);
    janela.document.close();
  };

  return (
    <div style={{ padding: '2rem', width: '100%', boxSizing: 'border-box' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
            Relatórios e Indicadores
          </h1>
          <p style={{ color: '#64748b', margin: '0.25rem 0 0', fontSize: '0.9rem' }}>
            Consolidação de resultados, funil de conversão e exportação de dados
          </p>
        </div>

        {/* Abas */}
        <div style={{ display: 'flex', gap: '0.5rem', background: '#f1f5f9', padding: '0.25rem', borderRadius: '10px' }}>
          <button
            onClick={() => setAbaAtiva('dashboard')}
            style={{
              border: 'none',
              background: abaAtiva === 'dashboard' ? '#ff5722' : 'transparent',
              color: abaAtiva === 'dashboard' ? '#fff' : '#64748b',
              padding: '0.45rem 1rem',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>monitoring</span>
            Painel Geral
          </button>
          <button
            onClick={() => setAbaAtiva('export')}
            style={{
              border: 'none',
              background: abaAtiva === 'export' ? '#ff5722' : 'transparent',
              color: abaAtiva === 'export' ? '#fff' : '#64748b',
              padding: '0.45rem 1rem',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>download</span>
            Exportações
          </button>
        </div>
      </div>

      {erro && (
        <div style={{ background: '#fef2f2', color: '#ef4444', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #fecaca' }}>
          {erro}
        </div>
      )}

      {/* ABA 1: PAINEL */}
      {abaAtiva === 'dashboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Métricas Principais */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
            <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
              <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Faturamento Acumulado</span>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#059669', marginTop: '0.4rem' }}>
                {Number(metricas?.faturamentoTotal || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </div>
            </div>

            <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
              <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Contratos Fechados</span>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#ff5722', marginTop: '0.4rem' }}>
                {metricas?.totalVendas || 0}
              </div>
            </div>

            <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
              <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Fichas Processadas</span>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#2563eb', marginTop: '0.4rem' }}>
                {metricas?.totalFichas || 0}
              </div>
            </div>

            <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
              <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Taxa de Conversão</span>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#7c3aed', marginTop: '0.4rem' }}>
                {metricas?.taxaConversao || 0}%
              </div>
            </div>
          </div>

          {/* Mix de Produtos e Desempenho */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '1.5rem' }}>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.05rem', color: '#0f172a' }}>Mix de Produtos Vendidos</h3>
              {(metricas?.mixProdutos || []).map((item, idx) => (
                <div key={idx} style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', fontSize: '0.85rem' }}>
                    <span style={{ fontWeight: '600', color: '#1e293b' }}>{item.nome}</span>
                    <span style={{ color: '#64748b', fontWeight: '700' }}>{item.quantidade} vendas ({item.percentual}%)</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${item.percentual}%`, height: '100%', background: '#ff5722' }}></div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '1.5rem' }}>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.05rem', color: '#0f172a' }}>Últimas Operações Registadas</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {(metricas?.ultimasVendas || []).slice(0, 4).map((venda) => (
                  <div key={venda.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid #f1f5f9' }}>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '0.9rem', color: '#1e293b' }}>{venda.cliente_nome}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{venda.produto_nome} • {venda.hora_venda}</div>
                    </div>
                    <span style={{ fontWeight: '700', color: '#059669', fontSize: '0.9rem' }}>
                      {Number(venda.valor_total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ABA 2: EXPORTAÇÕES */}
      {abaAtiva === 'export' && (
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', margin: '0 0 0.5rem 0' }}>
            Central de Exportação de Dados
          </h2>
          <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '2rem' }}>
            Descarregue os registos operacionais da turma selecionada em formatos compatíveis para auditoria e conferência.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem' }}>
            {/* Opção CSV */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', background: '#fafbfc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-outlined">table_view</span>
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1rem', color: '#0f172a' }}>Exportar em CSV</h4>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Texto delimitado padrão</span>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', lineHeight: 1.4 }}>
                Ficheiro com codificação UTF-8 compatível com bases de dados e importadores externos.
              </p>
              <button
                onClick={exportarCsv}
                style={{ marginTop: 'auto', background: '#0284c7', color: '#fff', border: 'none', padding: '0.65rem 1rem', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>download</span>
                Descarregar CSV
              </button>
            </div>

            {/* Opção XLSX / Excel */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', background: '#fafbfc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-outlined">border_all</span>
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1rem', color: '#0f172a' }}>Folha de Cálculo (XLS)</h4>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Formato Microsoft Excel</span>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', lineHeight: 1.4 }}>
                Estrutura tabular otimizada para análise financeira e conciliação em programas de folha de cálculo.
              </p>
              <button
                onClick={exportarXlsx}
                style={{ marginTop: 'auto', background: '#16a34a', color: '#fff', border: 'none', padding: '0.65rem 1rem', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>download</span>
                Descarregar Excel
              </button>
            </div>

            {/* Opção PDF */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', background: '#fafbfc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#fee2e2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-outlined">picture_as_pdf</span>
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1rem', color: '#0f172a' }}>Relatório em PDF</h4>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Documento paginado e formatado</span>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', lineHeight: 1.4 }}>
                Visão consolidada pronta para impressão ou envio por e-mail à diretoria com a marca GIANTS.
              </p>
              <button
                onClick={exportarPdf}
                style={{ marginTop: 'auto', background: '#ef4444', color: '#fff', border: 'none', padding: '0.65rem 1rem', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>print</span>
                Imprimir / Salvar PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}