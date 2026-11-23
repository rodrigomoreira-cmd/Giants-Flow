import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../services/api';

const fmtBRL = (val) =>
  Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function ProposalContractPdf() {
  const { id } = useParams();
  const [proposta, setProposta] = useState(null);
  const [cliente, setCliente] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const carregar = async () => {
      try {
        const turmaId = localStorage.getItem('turma_ativa_id') || '';
        const q = turmaId ? `?turmaId=${encodeURIComponent(turmaId)}` : '';
        const [propsRes, cliRes] = await Promise.all([
          api.get(`/financeiro/propostas${q}`),
          api.get(`/clientes${q}`)
        ]);

        const listaProps = Array.isArray(propsRes) ? propsRes : propsRes?.propostas || [];
        const listaCli = Array.isArray(cliRes) ? cliRes : cliRes?.clientes || [];

        let alvo = listaProps.find((p) => String(p.id) === String(id) || String(p.proposta_real_id) === String(id));
        if (!alvo && q) {
          const propsGeral = await api.get('/financeiro/propostas');
          const arrGeral = Array.isArray(propsGeral) ? propsGeral : propsGeral?.propostas || [];
          alvo = arrGeral.find((p) => String(p.id) === String(id) || String(p.proposta_real_id) === String(id));
        }

        if (!alvo) {
          setErro(`Proposta/Ficha #${id} não encontrada para geração do termo contratual.`);
          return;
        }

        const cliMatch = listaCli.find((c) => String(c.id) === String(alvo.id)) || alvo;
        setProposta(alvo);
        setCliente(cliMatch);
      } catch (err) {
        setErro(err.message || 'Erro ao carregar dados da proposta.');
      }
    };
    carregar();
  }, [id]);

  if (erro) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'sans-serif', color: '#b91c1c' }}>
        <h3>Não foi possível gerar o Resumo Contratual</h3>
        <p>{erro}</p>
      </div>
    );
  }

  if (!proposta) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'sans-serif', color: '#475569' }}>
        Gerando Resumo Contratual #{id}...
      </div>
    );
  }

  const dp = proposta.dados_proposta || {};
  const valorTabela = Number(dp.valorTabela ?? proposta.valor_negociado ?? 0);
  const valorNegociado = Number(proposta.valor_negociado ?? dp.valorTotal ?? proposta.proposta_valor_total ?? 0);
  const desconto = Number(proposta.desconto_concedido ?? dp.desconto ?? proposta.proposta_desconto ?? 0);
  const cashback = Number(proposta.cashback ?? dp.cashback ?? proposta.proposta_cashback ?? 0);
  const liquidoContrato = Math.max(0, valorNegociado - cashback);
  const entrada = Number(dp.valorEntrada ?? proposta.proposta_valor_entrada ?? 0);
  const entradaComp = Number(dp.entradaComplementar ?? 0);
  const dataEntradaComp = dp.dataEntradaComplementar || '';
  const permuta = Number(dp.permuta ?? 0);
  const saldoParcelar = Math.max(0, liquidoContrato - entrada - entradaComp - permuta);
  const parcelas = Number(dp.quantidadeParcelas ?? proposta.proposta_parcelas ?? 1);
  const valorParcela = Number(dp.valorParcela ?? proposta.proposta_valor_parcela ?? (saldoParcelar / Math.max(1, parcelas)));
  const pagamentosEntrada = Array.isArray(dp.pagamentosEntrada) && dp.pagamentosEntrada.length > 0
    ? dp.pagamentosEntrada
    : [{ forma: dp.formaEntrada || proposta.proposta_metodo_pagamento || 'Pix', valor: entrada, identificador: dp.identificadorPagamento || proposta.cv_cartao || '' }];

  const cnpj = [proposta.cnpj, proposta.cpf_cnpj, dp.cnpj, cliente?.cnpj]
    .find((d) => String(d || '').replace(/\D/g, '').length === 14) || 'Não informado';

  const socios = Array.isArray(dp.sociosDetalhes) && dp.sociosDetalhes.filter((s) => s.entraNoContrato).length > 0
    ? dp.sociosDetalhes.filter((s) => s.entraNoContrato)
    : [{ nome: proposta.nome_participante || cliente?.nome_participante || 'Titular', cargo: 'Sócio Titular' }];

  const statusAprov = String(proposta.status_aprovacao || 'pendente').toUpperCase();
  const dataHoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <div style={{ padding: '2rem', fontFamily: "'Segoe UI', Arial, sans-serif", maxWidth: '860px', margin: '0 auto', color: '#0f172a', background: '#ffffff' }}>
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; background: #fff; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Barra de Ações (Oculta na impressão) */}
      <div className="no-print" style={{ marginBottom: '1.5rem', padding: '0.85rem 1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
        <button
          type="button"
          onClick={() => window.close()}
          style={{ background: '#ffffff', color: '#334155', border: '1px solid #cbd5e1', padding: '0.55rem 1rem', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}
        >
          Fechar Aba
        </button>
        <div style={{ fontSize: '0.82rem', color: '#475569', fontWeight: '600' }}>
          Protocolo <strong>PROP-{String(proposta.id).padStart(3, '0')}</strong> • Pronto para assinatura ou PDF
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          style={{ background: '#059669', color: '#ffffff', border: 'none', padding: '0.6rem 1.25rem', borderRadius: '8px', fontWeight: '800', cursor: 'pointer' }}
        >
          Imprimir / Salvar PDF
        </button>
      </div>

      {/* Cabeçalho Institucional */}
      <div style={{ borderBottom: '3px solid #0f172a', paddingBottom: '1rem', marginBottom: '1.35rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#ff5722', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Grupo Acelerador • Programa GIANTS & Aceleração Empresarial
          </div>
          <h1 style={{ margin: '0.25rem 0 0', fontSize: '1.45rem', fontWeight: '900', color: '#0f172a' }}>
            RESUMO CONTRATUAL & TERMO DE ADESÃO
          </h1>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.95rem', fontWeight: '900', color: '#ff5722' }}>
            PROP-{String(proposta.id).padStart(3, '0')}
          </div>
          <div style={{ fontSize: '0.76rem', color: '#475569', marginTop: '0.15rem' }}>
            Status: <strong>{statusAprov.replace(/_/g, ' ')}</strong>
          </div>
        </div>
      </div>

      {/* 1. Identificação da Contratante */}
      <div style={{ marginBottom: '1.25rem', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ background: '#f1f5f9', padding: '0.55rem 0.9rem', fontSize: '0.78rem', fontWeight: '800', color: '#1e293b', textTransform: 'uppercase' }}>
          1. Identificação da Empresa Contratante e Participantes
        </div>
        <div style={{ padding: '0.9rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.84rem' }}>
          <div>
            <span style={{ color: '#64748b', fontSize: '0.72rem', display: 'block' }}>RAZÃO SOCIAL / EMPRESA</span>
            <strong>{proposta.empresa || cliente?.empresa || 'Não informada'}</strong>
          </div>
          <div>
            <span style={{ color: '#64748b', fontSize: '0.72rem', display: 'block' }}>CNPJ</span>
            <strong style={{ fontFamily: 'monospace' }}>{cnpj}</strong>
          </div>
          <div>
            <span style={{ color: '#64748b', fontSize: '0.72rem', display: 'block' }}>REPRESENTANTE / TITULAR</span>
            <strong>{proposta.nome_participante || cliente?.nome_participante || '-'}</strong>
          </div>
          <div>
            <span style={{ color: '#64748b', fontSize: '0.72rem', display: 'block' }}>CONTATO (TELEFONE / E-MAIL)</span>
            <strong>{cliente?.telefone || '-'} {cliente?.email ? `• ${cliente.email}` : ''}</strong>
          </div>
          <div style={{ gridColumn: '1 / -1', borderTop: '1px dashed #e2e8f0', paddingTop: '0.55rem' }}>
            <span style={{ color: '#64748b', fontSize: '0.72rem', display: 'block', marginBottom: '0.2rem' }}>
              PARTICIPANTES VINCULADOS AO CONTRATO ({socios.length})
            </span>
            <strong>{socios.map((s) => `${s.nome}${s.cargo ? ` (${s.cargo})` : ''}`).join(' • ')}</strong>
          </div>
        </div>
      </div>

      {/* 2. Objeto e Valores do Contrato */}
      <div style={{ marginBottom: '1.25rem', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ background: '#f1f5f9', padding: '0.55rem 0.9rem', fontSize: '0.78rem', fontWeight: '800', color: '#1e293b', textTransform: 'uppercase' }}>
          2. Objeto Contratado e Composição Financeira
        </div>
        <div style={{ padding: '0.9rem', fontSize: '0.84rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.55rem', borderBottom: '1px solid #e2e8f0', marginBottom: '0.55rem' }}>
            <span>Produto / Programa Selecionado:</span>
            <strong>[{dp.categoriaProduto || 'GIANTS'}] {proposta.produto_nome || dp.produtoNome || 'GIANTS'}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
            <span style={{ color: '#475569' }}>Valor Tabela / Bruto:</span>
            <span>{fmtBRL(valorTabela > 0 ? valorTabela : valorNegociado + desconto)}</span>
          </div>
          {desconto > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', color: '#b91c1c' }}>
              <span>(-) Desconto Comercial Aplicado:</span>
              <strong>- {fmtBRL(desconto)}</strong>
            </div>
          )}
          {cashback > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', color: '#15803d' }}>
              <span>(-) Crédito de Cashback CNPJ Abatido:</span>
              <strong>- {fmtBRL(cashback)}</strong>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.45rem', borderTop: '1px dashed #cbd5e1', fontSize: '0.95rem' }}>
            <strong>Valor Líquido Total do Contrato:</strong>
            <strong style={{ color: '#0f172a' }}>{fmtBRL(liquidoContrato)}</strong>
          </div>
        </div>
      </div>

      {/* 3. Condições de Pagamento e Parcelamento */}
      <div style={{ marginBottom: '1.25rem', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ background: '#f1f5f9', padding: '0.55rem 0.9rem', fontSize: '0.78rem', fontWeight: '800', color: '#1e293b', textTransform: 'uppercase' }}>
          3. Condições de Pagamento Acordadas
        </div>
        <div style={{ padding: '0.9rem', fontSize: '0.84rem' }}>
          <div style={{ fontWeight: '700', marginBottom: '0.45rem', color: '#334155' }}>
            Detalhamento da Entrada ({fmtBRL(entrada)}):
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '0.45rem 0.6rem', textAlign: 'left' }}>Meio de Pagamento</th>
                <th style={{ padding: '0.45rem 0.6rem', textAlign: 'left' }}>Comprovante / CV / NSU</th>
                <th style={{ padding: '0.45rem 0.6rem', textAlign: 'right' }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {pagamentosEntrada.map((pg, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.45rem 0.6rem', fontWeight: '700' }}>{pg.forma || 'Pix'}{pg.forma === 'Cartão de Crédito' && Number(pg.parcelasCartao || 1) > 1 ? ` (${pg.parcelasCartao}x na maquininha)` : ''}</td>
                  <td style={{ padding: '0.45rem 0.6rem', fontFamily: 'monospace' }}>{pg.identificador || '-'}</td>
                  <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontWeight: '700' }}>{fmtBRL(pg.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {entradaComp > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', color: '#0369a1' }}>
              <span>Entrada Complementar {dataEntradaComp ? `(Vencimento: ${dataEntradaComp})` : ''}:</span>
              <strong>{fmtBRL(entradaComp)}</strong>
            </div>
          )}
          {permuta > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', color: '#7e22ce' }}>
              <span>Abatimento via Permuta Acordada:</span>
              <strong>{fmtBRL(permuta)}</strong>
            </div>
          )}

          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.65rem 0.8rem', marginTop: '0.45rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.74rem', color: '#64748b' }}>SALDO REMANESCENTE A PARCELAR</div>
              <strong style={{ fontSize: '0.96rem', color: '#0f172a' }}>{fmtBRL(saldoParcelar)}</strong>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.74rem', color: '#64748b' }}>PLANO DE PARCELAMENTO</div>
              <strong style={{ fontSize: '0.96rem', color: '#ff5722' }}>
                {saldoParcelar > 0 ? `${parcelas}x de ${fmtBRL(valorParcela)} (${dp.formaRestante || 'Pix'})` : 'Quitado na Entrada'}
              </strong>
            </div>
          </div>

          {(dp.observacoes || proposta.parecer_financeiro) && (
            <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#334155', background: '#fffbeb', border: '1px solid #fde68a', padding: '0.6rem 0.8rem', borderRadius: '6px' }}>
              <strong>Observações / Condições Especiais:</strong>{' '}
              {[dp.observacoes, proposta.parecer_financeiro].filter(Boolean).join(' | ')}
            </div>
          )}
        </div>
      </div>

      {/* Declaração e Assinaturas */}
      <p style={{ fontSize: '0.75rem', color: '#475569', lineHeight: 1.45, marginBottom: '2.2rem' }}>
        As partes declaram estar de pleno acordo com os valores, prazos, créditos de cashback e condições comerciais descritos neste Resumo Contratual, que integra o instrumento definitivo de adesão ao programa contratado.
      </p>

      <div style={{ fontSize: '0.8rem', color: '#334155', marginBottom: '2.5rem' }}>
        Local e Data: _________________________________________, {dataHoje}.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2.5rem', marginTop: '1rem' }}>
        <div style={{ borderTop: '1px solid #0f172a', paddingTop: '0.45rem', textAlign: 'center', fontSize: '0.78rem' }}>
          <strong>{proposta.empresa || 'CONTRATANTE'}</strong>
          <div style={{ color: '#64748b' }}>CNPJ: {cnpj}</div>
          <div style={{ color: '#64748b' }}>{proposta.nome_participante || 'Representante Legal'}</div>
        </div>
        <div style={{ borderTop: '1px solid #0f172a', paddingTop: '0.45rem', textAlign: 'center', fontSize: '0.78rem' }}>
          <strong>GRUPO ACELERADOR</strong>
          <div style={{ color: '#64748b' }}>Validação Comercial & Financeira</div>
          <div style={{ color: '#64748b' }}>Protocolo PROP-{String(proposta.id).padStart(3, '0')}</div>
        </div>
      </div>
    </div>
  );
}