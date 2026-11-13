import { useState, useEffect } from 'react';
import { api } from '../services/api';

const fmtBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const unificarPorEmpresa = (lista) => {
  const mapa = new Map();
  for (const item of lista) {
    const cnpjDigits = String(item.cnpj || item.cpf_cnpj || item.dados_proposta?.cnpj || '').replace(/\D/g, '');
    const empNorm = String(item.empresa || item.cliente_empresa || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const chave =
      cnpjDigits.length >= 11
        ? `${item.turma_id || 0}:cnpj:${cnpjDigits}`
        : empNorm && empNorm !== 'empresa sga'
        ? `${item.turma_id || 0}:emp:${empNorm}`
        : `${item.turma_id || 0}:id:${item.id}`;

    const temContrato = Boolean(item.dados_proposta || item.proposta_real_id || Number(item.valor_negociado || 0) > 0);
    if (!mapa.has(chave)) {
      mapa.set(chave, item);
    } else {
      const atual = mapa.get(chave);
      const atualTemContrato = Boolean(atual.dados_proposta || atual.proposta_real_id || Number(atual.valor_negociado || 0) > 0);
      if (temContrato && !atualTemContrato) {
        mapa.set(chave, item);
      }
    }
  }
  return Array.from(mapa.values());
};

export default function Approvals() {
  const [propostas, setPropostas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState('PENDENTE');

  // Estado do Modal de Análise de Crédito & Deliberação
  const [propSelecionada, setPropSelecionada] = useState(null);
  const [erroModal, setErroModal] = useState('');
  const [modalFeedback, setModalFeedback] = useState(null);
  const [analiseCreditoStatus, setAnaliseCreditoStatus] = useState('APROVADO');
  const [statusSerasaCodigo, setStatusSerasaCodigo] = useState('sem_restricao');
  const [statusSerasaTexto, setStatusSerasaTexto] = useState('');
  const [scoreSerasa, setScoreSerasa] = useState('');
  const [condicaoEspecial, setCondicaoEspecial] = useState('');
  const [parecerFinanceiro, setParecerFinanceiro] = useState('');
  const [salvandoAnalise, setSalvandoAnalise] = useState(false);

  const carregarAprovacoes = async () => {
    try {
      setCarregando(true);
      setErro('');
      const dados = await api.get('/financeiro/propostas');
      const lista = Array.isArray(dados) ? dados : dados.propostas || [];
      setPropostas(unificarPorEmpresa(lista));
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarAprovacoes();
  }, []);

  const abrirModalAnalise = (prop) => {
    const temRestricaoPrev =
      String(prop.analise_credito_status || prop.af_decisao_financeiro || '').toUpperCase() === 'NEGADO' ||
      String(prop.status_serasa_codigo || prop.af_status_serasa || '').includes('restricao');

    setErroModal('');
    setPropSelecionada(prop);
    setAnaliseCreditoStatus(
      prop.analise_credito_status || prop.af_decisao_financeiro || (temRestricaoPrev ? 'NEGADO' : 'APROVADO')
    );
    setStatusSerasaCodigo(
      prop.status_serasa_codigo || prop.af_status_serasa || (temRestricaoPrev ? 'com_restricao' : 'sem_restricao')
    );
    setStatusSerasaTexto(
      prop.status_serasa_texto || prop.af_observacoes_auditoria || ''
    );
    setScoreSerasa(prop.af_score_serasa ? String(prop.af_score_serasa) : '');
    setCondicaoEspecial('');
    setParecerFinanceiro(prop.parecer_financeiro || prop.af_parecer || '');
  };

  const submeterDeliberacao = async (decisaoFinal) => {
    if (!propSelecionada) return;
    setErroModal('');

    if (decisaoFinal === 'recusado' && !parecerFinanceiro.trim() && !statusSerasaTexto.trim()) {
      setErroModal('Informe o parecer financeiro ou o detalhamento da restrição Serasa antes de recusar a proposta.');
      return;
    }

    if (decisaoFinal === 'aprovado_com_ressalva' && !condicaoEspecial.trim() && !parecerFinanceiro.trim()) {
      setErroModal('Informe a condição especial / garantia exigida para aprovar com ressalva.');
      return;
    }

    try {
      setSalvandoAnalise(true);
      await api.post('/financeiro/analisar', {
        fichaId: propSelecionada.id,
        proposta_id: propSelecionada.id,
        decisao: decisaoFinal,
        analise_credito_status: analiseCreditoStatus,
        status_serasa_codigo: statusSerasaCodigo,
        status_serasa_texto: statusSerasaTexto,
        score_serasa: scoreSerasa ? Number(scoreSerasa) : null,
        condicao_especial: condicaoEspecial,
        parecer: parecerFinanceiro
      });

      const empresaNome = propSelecionada.empresa || propSelecionada.nome_participante;
      const protocolo = `PROP-${String(propSelecionada.id).padStart(3, '0')}`;
      setPropSelecionada(null);
      await carregarAprovacoes();

      setModalFeedback({
        tipo: decisaoFinal === 'recusado' ? 'recusado' : decisaoFinal === 'aprovado_com_ressalva' ? 'ressalva' : 'aprovado',
        protocolo,
        empresa: empresaNome,
        titulo:
          decisaoFinal === 'recusado'
            ? 'Proposta Recusada / Negada'
            : decisaoFinal === 'aprovado_com_ressalva'
            ? 'Proposta Aprovada com Ressalva'
            : 'Proposta Aprovada com Sucesso',
        credito: analiseCreditoStatus,
        serasa: statusSerasaTexto || 'Sem restrições apontadas'
      });
    } catch (err) {
      setErroModal(`Erro ao registrar deliberação: ${err.message}`);
    } finally {
      setSalvandoAnalise(false);
    }
  };

  const propostasFiltradas = propostas.filter((p) => {
    if (filtro === 'TODOS') return true;
    const st = String(p.status_aprovacao || 'PENDENTE').toUpperCase();
    if (filtro === 'PENDENTE') return st === 'PENDENTE' || st === 'ENVIADO_FINANCEIRO';
    if (filtro === 'APROVADO') return st === 'APROVADA' || st === 'APROVADO';
    if (filtro === 'RESSALVA') return st === 'APROVADA_COM_RESSALVA';
    if (filtro === 'RECUSADO') return st === 'RECUSADA' || st === 'RECUSADO';
    return st === filtro;
  });

  const renderBadgeStatus = (prop) => {
    const st = String(prop.status_aprovacao || 'PENDENTE').toUpperCase();
    const credito = String(prop.analise_credito_status || prop.af_decisao_financeiro || '').toUpperCase();
    const serasaTxt = prop.status_serasa_texto || prop.af_observacoes_auditoria || '';

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {st === 'APROVADA' || st === 'APROVADO' ? (
          <span style={{ display: 'inline-block', width: 'fit-content', background: '#dcfce7', color: '#166534', padding: '0.18rem 0.55rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: '800' }}>
            ✔ Aprovada
          </span>
        ) : st === 'APROVADA_COM_RESSALVA' ? (
          <span style={{ display: 'inline-block', width: 'fit-content', background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', padding: '0.18rem 0.55rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: '800' }}>
            ⚠ Aprovada c/ Ressalva
          </span>
        ) : st === 'RECUSADA' || st === 'RECUSADO' ? (
          <span style={{ display: 'inline-block', width: 'fit-content', background: '#fee2e2', color: '#991b1b', padding: '0.18rem 0.55rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: '800' }}>
            ✖ Recusada / Negada
          </span>
        ) : (
          <span style={{ display: 'inline-block', width: 'fit-content', background: '#eff6ff', color: '#1d4ed8', padding: '0.18rem 0.55rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: '800' }}>
            ⏳ Aguardando Análise
          </span>
        )}

        {credito && (
          <span style={{
            fontSize: '0.7rem',
            fontWeight: '800',
            color: credito === 'NEGADO' ? '#dc2626' : '#059669'
          }}>
            Crédito: {credito}
          </span>
        )}
        {serasaTxt && (
          <span style={{ fontSize: '0.7rem', color: '#7f1d1d', background: '#fef2f2', padding: '0.15rem 0.4rem', borderRadius: '4px', maxWidth: '240px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={serasaTxt}>
            {serasaTxt}
          </span>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: '2rem', width: '100%', boxSizing: 'border-box' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
            Fila de Aprovações & Análise de Crédito
          </h1>
          <p style={{ color: '#64748b', margin: '0.25rem 0 0', fontSize: '0.9rem' }}>
            Consulta Serasa, validação de restrições financeiras, cashback por CNPJ e deliberação de contratos
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.4rem', background: '#f1f5f9', padding: '0.3rem', borderRadius: '10px', flexWrap: 'wrap' }}>
          {[
            { id: 'PENDENTE', label: 'Pendentes' },
            { id: 'APROVADO', label: 'Aprovadas' },
            { id: 'RESSALVA', label: 'Com Ressalva' },
            { id: 'RECUSADO', label: 'Recusadas' },
            { id: 'TODOS', label: 'Todas' }
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setFiltro(item.id)}
              style={{
                border: 'none',
                background: filtro === item.id ? '#ff5722' : 'transparent',
                color: filtro === item.id ? '#fff' : '#64748b',
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                fontWeight: '700',
                fontSize: '0.78rem',
                cursor: 'pointer'
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {erro && (
        <div style={{ background: '#fef2f2', color: '#ef4444', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #fecaca' }}>
          {erro}
        </div>
      )}

      {/* Tabela */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <tr>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.82rem' }}>Ref.</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.82rem' }}>Empresa / Proponente</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.82rem' }}>Produto & Sócios</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.82rem' }}>Valores & Cashback</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.82rem' }}>Crédito / Serasa</th>
              <th style={{ padding: '1rem', color: '#475569', fontSize: '0.82rem', textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr><td colSpan="6" style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>Carregando propostas e análises financeiras...</td></tr>
            ) : propostasFiltradas.length === 0 ? (
              <tr><td colSpan="6" style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>Nenhuma proposta encontrada neste filtro.</td></tr>
            ) : (
              propostasFiltradas.map((prop) => {
                const dp = prop.dados_proposta || {};
                const valorNeg = Number(prop.valor_negociado ?? dp.valorTotal ?? prop.proposta_valor_total ?? 0);
                const cbTotal = Number(prop.cashback ?? dp.cashback ?? prop.proposta_cashback ?? 0);
                const descTotal = Number(prop.desconto_concedido ?? dp.desconto ?? prop.proposta_desconto ?? 0);
                const saldoContrato = Math.max(0, valorNeg - cbTotal - descTotal);
                const entrada = Number(dp.valorEntrada ?? prop.proposta_valor_entrada ?? 0);
                const permuta = Number(dp.permuta || 0);
                const entradaComp = Number(dp.entradaComplementar || 0);
                const dataEntradaComp = dp.dataEntradaComplementar || '';
                const saldoFinal = Math.max(0, saldoContrato - entrada - permuta - entradaComp);
                const parcelas = Number(dp.quantidadeParcelas ?? prop.proposta_parcelas ?? 12);
                const valorParcela = Number(dp.valorParcela ?? prop.proposta_valor_parcela ?? 0);
                const cnpjExibir = prop.cnpj || prop.cpf_cnpj || dp.cnpj || '';
                const idPagamento = dp.identificadorPagamento || prop.cv_cartao || '';

                return (
                  <tr key={prop.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '1rem', fontWeight: '800', color: '#ff5722', fontSize: '0.88rem' }}>
                      PROP-{String(prop.id).padStart(3, '0')}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '0.9rem' }}>
                        {prop.empresa || prop.cliente_empresa || 'Empresa SGA'}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                        {prop.nome_participante || prop.cliente_nome}
                        {cnpjExibir && <span style={{ marginLeft: '0.4rem', fontFamily: 'monospace' }}>• {cnpjExibir}</span>}
                      </div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div>
                        <span style={{
                          display: 'inline-block',
                          padding: '0.18rem 0.5rem',
                          borderRadius: '6px',
                          fontSize: '0.7rem',
                          fontWeight: '800',
                          marginRight: '0.4rem',
                          background: '#ffedd5',
                          color: '#9a3412'
                        }}>
                          {dp.categoriaProduto || 'GIANTS'}
                        </span>
                        <span style={{ fontWeight: '700', color: '#0f172a', fontSize: '0.82rem' }}>
                          {prop.produto_nome || 'GIANTS'}
                        </span>
                      </div>
                      {Array.isArray(dp.sociosDetalhes) && dp.sociosDetalhes.filter((s) => s.entraNoContrato).length > 0 && (
                        <div style={{ fontSize: '0.74rem', color: '#475569', marginTop: '0.25rem' }}>
                          <strong>Sócios ({dp.sociosDetalhes.filter((s) => s.entraNoContrato).length}):</strong>{' '}
                          {dp.sociosDetalhes.filter((s) => s.entraNoContrato).map((s) => s.nome).join(', ')}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontWeight: '900', color: '#ea580c', fontSize: '0.92rem' }}>
                        Saldo Final: {fmtBRL(saldoFinal)}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#334155' }}>
                        Líquido: <strong>{fmtBRL(saldoContrato)}</strong>
                        {permuta > 0 && <span style={{ color: '#9333ea', fontWeight: '700' }}> • Permuta: -{fmtBRL(permuta)}</span>}
                        {cbTotal > 0 && <span style={{ color: '#047857', fontWeight: '700' }}> • CB: -{fmtBRL(cbTotal)}</span>}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                        (-) Entr. {fmtBRL(entrada)}{entradaComp > 0 ? ` + ${fmtBRL(entradaComp)}` : ''} • {parcelas}x {fmtBRL(valorParcela)}
                      </div>
                      {idPagamento && (
                        <div style={{ fontSize: '0.71rem', color: '#0369a1', fontWeight: '700', marginTop: '0.15rem' }}>
                          Ref./CV: {idPagamento}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      {renderBadgeStatus(prop)}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      <button
                        onClick={() => abrirModalAnalise(prop)}
                        style={{
                          background: '#ff5722',
                          color: '#fff',
                          border: 'none',
                          padding: '0.5rem 0.95rem',
                          borderRadius: '8px',
                          fontSize: '0.78rem',
                          fontWeight: '700',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem'
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>policy</span>
                        Analisar Crédito / Deliberar
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL DE ANÁLISE DE CRÉDITO, STATUS SERASA E DELIBERAÇÃO (PADRÃO DO SISTEMA) */}
      {propSelecionada && (() => {
        const dp = propSelecionada.dados_proposta || {};
        const valorNeg = Number(propSelecionada.valor_negociado ?? dp.valorTotal ?? propSelecionada.proposta_valor_total ?? 0);
        const cbTotal = Number(propSelecionada.cashback ?? dp.cashback ?? propSelecionada.proposta_cashback ?? 0);
        const descTotal = Number(propSelecionada.desconto_concedido ?? dp.desconto ?? propSelecionada.proposta_desconto ?? 0);
        const saldoContrato = Math.max(0, valorNeg - cbTotal - descTotal);
        const entrada = Number(dp.valorEntrada ?? propSelecionada.proposta_valor_entrada ?? 0);
        const permuta = Number(dp.permuta || 0);
                const entradaComp = Number(dp.entradaComplementar || 0);
                const dataEntradaComp = dp.dataEntradaComplementar || '';
                const saldoFinal = Math.max(0, saldoContrato - entrada - permuta - entradaComp);
        const parcelas = Number(dp.quantidadeParcelas ?? propSelecionada.proposta_parcelas ?? 12);
        const valorParcela = Number(dp.valorParcela ?? propSelecionada.proposta_valor_parcela ?? 0);
        const sociosContrato = Array.isArray(dp.sociosDetalhes)
          ? dp.sociosDetalhes.filter((s) => s.entraNoContrato)
          : [];

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
            <div style={{ background: '#ffffff', borderRadius: '14px', maxWidth: '800px', width: '100%', overflow: 'hidden', boxShadow: '0 20px 45px rgba(15, 23, 42, 0.22)', border: '1px solid #e2e8f0', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
              {/* Cabeçalho Limpo Padrão do Sistema */}
              <div style={{ background: '#ffffff', padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#ff5722', background: '#fff7ed', border: '1px solid #fed7aa', padding: '0.18rem 0.55rem', borderRadius: '6px' }}>
                      PROP-{String(propSelecionada.id).padStart(3, '0')}
                    </span>
                    <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#475569', background: '#f1f5f9', padding: '0.18rem 0.55rem', borderRadius: '6px' }}>
                      Mesa de Crédito & Aprovação Financeira
                    </span>
                  </div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '800', color: '#0f172a' }}>
                    {propSelecionada.empresa || propSelecionada.nome_participante}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setPropSelecionada(null)}
                  style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b', width: '34px', height: '34px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '1.15rem' }}>close</span>
                </button>
              </div>

              {/* Corpo Rolável */}
              <div style={{ padding: '1.35rem 1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.15rem', background: '#f8fafc' }}>
                {/* Resumo da Proposta & Cashback */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
                  <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.95rem' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>Empresa / CNPJ</div>
                    <div style={{ fontSize: '0.86rem', fontWeight: '700', color: '#0f172a', marginTop: '0.2rem' }}>
                      {propSelecionada.cnpj || propSelecionada.cpf_cnpj || 'CNPJ não informado'}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#475569', marginTop: '0.25rem' }}>
                      {sociosContrato.length > 0
                        ? `Sócios (${sociosContrato.length}): ${sociosContrato.map((s) => s.nome).join(', ')}`
                        : `Titular: ${propSelecionada.nome_participante}`}
                    </div>
                  </div>

                  <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.95rem' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>Composição Financeira</div>
                    <div style={{ fontSize: '0.8rem', color: '#334155', marginTop: '0.2rem' }}>
                      Negociado: <strong>{fmtBRL(valorNeg)}</strong>
                    </div>
                    {cbTotal > 0 && (
                      <div style={{ fontSize: '0.78rem', color: '#047857', fontWeight: '700' }}>
                        (-) Cashback CNPJ: -{fmtBRL(cbTotal)}
                      </div>
                    )}
                    {descTotal > 0 && (
                      <div style={{ fontSize: '0.78rem', color: '#b91c1c', fontWeight: '700' }}>
                        (-) Desconto: -{fmtBRL(descTotal)}
                      </div>
                    )}
                    <div style={{ fontSize: '0.8rem', color: '#334155' }}>
                      Líquido Contrato: <strong>{fmtBRL(saldoContrato)}</strong>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#0284c7', fontWeight: '700' }}>
                      (-) Entrada 1: -{fmtBRL(entrada)}
                    </div>
                    {entradaComp > 0 && (
                      <div style={{ fontSize: '0.78rem', color: '#0369a1', fontWeight: '700' }}>
                        (-) Entrada 2: -{fmtBRL(entradaComp)} {dataEntradaComp ? `(${dataEntradaComp})` : ''}
                      </div>
                    )}
                    {permuta > 0 && (
                      <div style={{ fontSize: '0.78rem', color: '#9333ea', fontWeight: '700' }}>
                        (-) Permuta: -{fmtBRL(permuta)}
                      </div>
                    )}
                    <div style={{ fontSize: '0.95rem', fontWeight: '900', color: '#ff5722', marginTop: '0.25rem', borderTop: '1px dashed #cbd5e1', paddingTop: '0.25rem' }}>
                      Saldo Final: {fmtBRL(saldoFinal)}
                    </div>
                  </div>

                  <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.95rem' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>Pagamento Acordado</div>
                    <div style={{ fontSize: '0.82rem', color: '#0f172a', fontWeight: '700', marginTop: '0.2rem' }}>
                      Entrada: {fmtBRL(entrada)} ({dp.formaEntrada || 'Pix'})
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#0f172a', fontWeight: '700', marginTop: '0.15rem' }}>
                      A Parcelar: {fmtBRL(saldoFinal)}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '0.15rem' }}>
                      Parcelas: {parcelas}x de {fmtBRL(valorParcela)} ({dp.formaRestante || 'Pix'})
                    </div>
                    {(dp.identificadorPagamento || propSelecionada.cv_cartao) && (
                      <div style={{ fontSize: '0.76rem', color: '#0369a1', background: '#f0f9ff', border: '1px solid #bae6fd', padding: '0.25rem 0.5rem', borderRadius: '6px', marginTop: '0.35rem', fontWeight: '700' }}>
                        CV / Link / Ref.: {dp.identificadorPagamento || propSelecionada.cv_cartao}
                      </div>
                    )}
                  </div>
                </div>

                {/* Seção 1: Análise de Crédito & Consulta Serasa */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.15rem', background: '#ffffff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.86rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span className="material-symbols-outlined" style={{ color: '#ff5722', fontSize: '1.2rem' }}>account_balance</span>
                      1. Análise de Crédito & Status Serasa (CPF / CNPJ)
                    </span>

                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setAnaliseCreditoStatus('APROVADO');
                          setStatusSerasaCodigo('sem_restricao');
                          setStatusSerasaTexto('APROVADO — SEM RESTRIÇÕES FINANCEIRAS OU PROTESTOS NO CPF/CNPJ.');
                        }}
                        style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '0.3rem 0.65rem', borderRadius: '6px', fontSize: '0.73rem', fontWeight: '700', cursor: 'pointer' }}
                      >
                        + Sem Restrição
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAnaliseCreditoStatus('NEGADO');
                          setStatusSerasaCodigo('com_restricao');
                          if (!statusSerasaTexto || statusSerasaTexto.startsWith('APROVADO')) {
                            setStatusSerasaTexto('CLIENTE POSSUI X PENDÊNCIAS FINANCEIRAS (DÍVIDA COM BANCOS) NO VALOR TOTAL DE R$ 0,00 / POSSUI TAMBÉM X PROTESTOS QUE TOTALIZAM R$ 0,00');
                          }
                        }}
                        style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '0.3rem 0.65rem', borderRadius: '6px', fontSize: '0.73rem', fontWeight: '700', cursor: 'pointer' }}
                      >
                        + Modelo Pendências / Protestos
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem', marginBottom: '0.85rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>
                        Parecer Análise de Crédito
                      </label>
                      <select
                        value={analiseCreditoStatus}
                        onChange={(e) => setAnaliseCreditoStatus(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.58rem',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontWeight: '800',
                          fontSize: '0.84rem',
                          color: analiseCreditoStatus === 'NEGADO' ? '#dc2626' : '#059669',
                          background: '#fff'
                        }}
                      >
                        <option value="APROVADO">APROVADO</option>
                        <option value="NEGADO">NEGADO (COM RESTRIÇÃO)</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>
                        Classificação Serasa
                      </label>
                      <select
                        value={statusSerasaCodigo}
                        onChange={(e) => setStatusSerasaCodigo(e.target.value)}
                        style={{ width: '100%', padding: '0.58rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.84rem', background: '#fff', color: '#0f172a' }}
                      >
                        <option value="sem_restricao">Sem Restrição</option>
                        <option value="score_alto_sem_restricao">Score Alto / Sem Restrição</option>
                        <option value="score_medio_atencao">Score Médio / Atenção</option>
                        <option value="com_restricao">Com Restrição (Pendências / Protestos)</option>
                        <option value="score_baixo_restricao_grave">Score Baixo / Restrição Grave</option>
                        <option value="restricao_impeditiva">Restrição Impeditiva</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>
                        Score Serasa (opcional)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="1000"
                        value={scoreSerasa}
                        onChange={(e) => setScoreSerasa(e.target.value)}
                        placeholder="Ex: 740"
                        style={{ width: '100%', padding: '0.58rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.84rem', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: '0.85rem' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>
                      Detalhamento STATUS SERASA (Pendências, Dívidas Bancárias, Protestos e Valores)
                    </label>
                    <textarea
                      rows={3}
                      value={statusSerasaTexto}
                      onChange={(e) => setStatusSerasaTexto(e.target.value)}
                      placeholder="Ex: CLIENTE POSSUI 3 PENDÊNCIAS FINANCEIRAS (DÍVIDA COM BANCOS) NO VALOR TOTAL DE 45.502,83 / POSSUI TAMBÉM 311 PROTESTOS QUE TOTALIZAM 7.197.788,35"
                      style={{
                        width: '100%',
                        padding: '0.65rem',
                        borderRadius: '8px',
                        border: analiseCreditoStatus === 'NEGADO' ? '1.5px solid #fca5a5' : '1px solid #cbd5e1',
                        background: analiseCreditoStatus === 'NEGADO' ? '#fef2f2' : '#fff',
                        color: analiseCreditoStatus === 'NEGADO' ? '#991b1b' : '#0f172a',
                        fontSize: '0.82rem',
                        fontWeight: '600',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.85rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>
                        Condição Especial / Garantia (se aprovar com restrição)
                      </label>
                      <input
                        type="text"
                        value={condicaoEspecial}
                        onChange={(e) => setCondicaoEspecial(e.target.value)}
                        placeholder="Ex: Aprovado mediante entrada via Pix + Cartão de terceiro / Avalista"
                        style={{ width: '100%', padding: '0.58rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#475569', marginBottom: '0.3rem' }}>
                        Parecer Geral do Financeiro
                      </label>
                      <input
                        type="text"
                        value={parecerFinanceiro}
                        onChange={(e) => setParecerFinanceiro(e.target.value)}
                        placeholder="Observação interna para auditoria e comercial..."
                        style={{ width: '100%', padding: '0.58rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Alerta orientativo quando há restrição Serasa */}
                {(analiseCreditoStatus === 'NEGADO' || statusSerasaCodigo !== 'sem_restricao') && (
                  <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '10px', padding: '0.8rem 1rem', fontSize: '0.8rem', color: '#92400e', display: 'flex', alignItems: 'flex-start', gap: '0.55rem' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '1.15rem', color: '#d97706' }}>warning</span>
                    <div>
                      <strong>Cliente com Restrição / Atenção no Serasa:</strong> Você pode <strong>Recusar</strong> a proposta ou, caso o financeiro aceite mediante garantia (entrada reforçada, cartão ou avalista), utilizar <strong>Aprovar com Ressalva</strong> para manter o histórico da restrição registrado na ficha.
                    </div>
                  </div>
                )}

                {/* Banner de Erro Interno no Padrão do Sistema (sem alert nativo) */}
                {erroModal && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '0.8rem 1rem', color: '#b91c1c', fontSize: '0.82rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '1.15rem', color: '#dc2626' }}>error</span>
                    <span>{erroModal}</span>
                  </div>
                )}
              </div>

              {/* Rodapé de Deliberação */}
              <div style={{ padding: '1rem 1.5rem', background: '#ffffff', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setPropSelecionada(null)}
                  style={{ background: '#fff', border: '1px solid #cbd5e1', color: '#475569', padding: '0.6rem 1rem', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '0.82rem' }}
                >
                  Fechar
                </button>

                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    disabled={salvandoAnalise}
                    onClick={() => submeterDeliberacao('recusado')}
                    style={{ background: '#fff', color: '#dc2626', border: '1.5px solid #fca5a5', padding: '0.6rem 1.05rem', borderRadius: '8px', fontWeight: '800', fontSize: '0.82rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>close</span>
                    Recusar Proposta
                  </button>

                  <button
                    type="button"
                    disabled={salvandoAnalise}
                    onClick={() => submeterDeliberacao('aprovado_com_ressalva')}
                    style={{ background: '#d97706', color: '#fff', border: 'none', padding: '0.6rem 1.05rem', borderRadius: '8px', fontWeight: '800', fontSize: '0.82rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>warning</span>
                    Aprovar c/ Ressalva
                  </button>

                  <button
                    type="button"
                    disabled={salvandoAnalise}
                    onClick={() => submeterDeliberacao('aprovado')}
                    style={{ background: '#059669', color: '#fff', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '8px', fontWeight: '800', fontSize: '0.82rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>check_circle</span>
                    {salvandoAnalise ? 'Gravando...' : 'Aprovar Proposta'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL DE CONFIRMAÇÃO DA DELIBERAÇÃO NO PADRÃO DO SISTEMA */}
      {modalFeedback && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '1rem' }}>
          <div style={{ background: '#ffffff', borderRadius: '14px', maxWidth: '460px', width: '100%', overflow: 'hidden', boxShadow: '0 20px 45px rgba(15, 23, 42, 0.22)', border: '1px solid #e2e8f0' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: modalFeedback.tipo === 'recusado' ? '#fef2f2' : modalFeedback.tipo === 'ressalva' ? '#fffbeb' : '#ecfdf5',
                color: modalFeedback.tipo === 'recusado' ? '#dc2626' : modalFeedback.tipo === 'ressalva' ? '#d97706' : '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1.45rem' }}>
                  {modalFeedback.tipo === 'recusado' ? 'cancel' : modalFeedback.tipo === 'ressalva' ? 'warning' : 'check_circle'}
                </span>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#ff5722' }}>{modalFeedback.protocolo}</div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>{modalFeedback.titulo}</h3>
              </div>
            </div>

            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.84rem', color: '#334155' }}>
              <div><strong>Empresa:</strong> {modalFeedback.empresa}</div>
              <div><strong>Análise de Crédito:</strong> {modalFeedback.credito}</div>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.65rem 0.8rem', fontSize: '0.78rem', color: '#475569' }}>
                <strong>Status Serasa:</strong> {modalFeedback.serasa}
              </div>
            </div>

            <div style={{ padding: '0.9rem 1.5rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setModalFeedback(null)}
                style={{ background: '#ff5722', color: '#fff', border: 'none', padding: '0.55rem 1.25rem', borderRadius: '8px', fontWeight: '700', fontSize: '0.82rem', cursor: 'pointer' }}
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
