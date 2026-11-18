import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useTurma } from '../context/TurmaContext';

const isMembroGiants = (emp) =>
  Boolean(emp?.membro_giants) || String(emp?.origem || '').toUpperCase().includes('GIAN');

const extrairCnpjEmpresa = (emp) => {
  const cnpjCol = String(emp?.cnpj || '').replace(/\D/g, '');
  if (cnpjCol.length === 14) {
    return cnpjCol.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  const docCol = String(emp?.cpf_cnpj || '').replace(/\D/g, '');
  if (docCol.length === 14) {
    return docCol.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  return '';
};

const normalizarChaveEmpresa = (emp) => {
  if (isMembroGiants(emp)) {
    return `giants:id:${emp.id}`;
  }
  const cnpjDigits = extrairCnpjEmpresa(emp).replace(/\D/g, '');
  if (cnpjDigits.length === 14) return `cnpj:${cnpjDigits}`;

  const empNorm = String(emp.empresa || emp.razao_social || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (empNorm && !['empresa sga', 'sem empresa', 'empresa não informada', 'empresa nao informada'].includes(empNorm)) {
    return `emp:${empNorm}`;
  }
  return `id:${emp.id}`;
};

const fmtBRL = (val) =>
  Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function CashbackCompanies() {
  const navigate = useNavigate();
  const { turmaSelecionada, turmaAtual } = useTurma();

  const [participantes, setParticipantes] = useState([]);
  const [propostas, setPropostas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos'); // todos | com_cashback | almoco | upgrade | abatido | cortesia
  const [detalheHistorico, setDetalheHistorico] = useState(null);

  const carregarDados = useCallback(async () => {
    try {
      setCarregando(true);
      setErro('');
      const tId = turmaSelecionada || localStorage.getItem('turma_ativa_id') || '1491';
      const [cliRes, propRes] = await Promise.all([
        api.get(`/clientes?turmaId=${tId}`),
        api.get(`/financeiro/propostas?turmaId=${tId}`).catch(() => [])
      ]);
      setParticipantes(Array.isArray(cliRes) ? cliRes : cliRes?.clientes || []);
      setPropostas(Array.isArray(propRes) ? propRes : propRes?.propostas || []);
    } catch (err) {
      setErro(err.message || 'Erro ao carregar consulta de cashback por empresa.');
    } finally {
      setCarregando(false);
    }
  }, [turmaSelecionada]);

  useEffect(() => {
    if (turmaSelecionada) {
      carregarDados();
    }
  }, [turmaSelecionada, carregarDados]);

  const empresasCashback = useMemo(() => {
    const propPorChave = new Map();
    for (const p of propostas) {
      const chave = normalizarChaveEmpresa(p);
      propPorChave.set(chave, p);
    }

    const mapa = new Map();
    for (const p of participantes) {
      if (isMembroGiants(p)) continue;

      const chave = normalizarChaveEmpresa(p);
      if (!mapa.has(chave)) {
        mapa.set(chave, {
          chave,
          idPrincipal: p.id,
          empresa: p.empresa || 'Empresa sem nome',
          cnpj: extrairCnpjEmpresa(p),
          origem: p.origem || 'AE / PAC',
          membros: [],
          almocoPago: false,
          cortesia: false,
          semAlmoco: false,
          valorAlmocoTotal: 0,
          cvCartao: '',
          cashbackUpgrade: 0,
          historicoElegivel: ''
        });
      }

      const g = mapa.get(chave);
      g.membros.push(p);
      if (Boolean(p.almoco_pago) || Number(p.valor_almoco || 0) > 0) g.almocoPago = true;
      if (Boolean(p.cortesia_almoco)) g.cortesia = true;
      if (Boolean(p.atendimento_sem_almoco)) g.semAlmoco = true;
      g.valorAlmocoTotal += Number(p.valor_almoco || 0);
      if (p.cv_cartao && !g.cvCartao) g.cvCartao = p.cv_cartao;
      const upVal = Number(p.cashback_upgrade_90_pct || 0);
      if (upVal > g.cashbackUpgrade) g.cashbackUpgrade = upVal;
      if (p.historico_produtos_elegiveis && !g.historicoElegivel) {
        g.historicoElegivel = p.historico_produtos_elegiveis;
      }
    }

    return Array.from(mapa.values())
      .map((g) => {
        const cashbackAlmoco = g.almocoPago ? 1000 : 0;
        const cashbackTotal = cashbackAlmoco + g.cashbackUpgrade;

        const prop = propPorChave.get(g.chave) || null;
        let cashbackAbatido = 0;
        let produtoProposta = '';
        let statusProposta = '';

        if (prop) {
          let dp = prop.dados_proposta || {};
          if (typeof dp === 'string') {
            try {
              dp = JSON.parse(dp);
            } catch (_) {
              dp = {};
            }
          }
          cashbackAbatido = Number(
            prop.proposta_cashback ?? prop.cashback ?? dp.cashback ?? 0
          );
          produtoProposta = prop.produto_nome || dp.produtoNome || '';
          statusProposta = String(prop.status_aprovacao || 'pendente').toLowerCase();
        }

        const isPacProposta = String(produtoProposta).toUpperCase().includes('PAC');
        const saldoNaoUtilizado = Math.max(0, cashbackTotal - cashbackAbatido);

        return {
          ...g,
          cashbackAlmoco,
          cashbackTotal,
          prop,
          cashbackAbatido,
          produtoProposta,
          statusProposta,
          isPacProposta,
          saldoNaoUtilizado
        };
      })
      .sort((a, b) => {
        if (b.cashbackTotal !== a.cashbackTotal) return b.cashbackTotal - a.cashbackTotal;
        return String(a.empresa).localeCompare(String(b.empresa), 'pt-BR');
      });
  }, [participantes, propostas]);

  const totais = useMemo(() => {
    return empresasCashback.reduce(
      (acc, e) => {
        if (e.cashbackTotal > 0) acc.qtdComCashback += 1;
        acc.totalAlmoco += e.cashbackAlmoco;
        acc.totalUpgrade += e.cashbackUpgrade;
        acc.totalGeral += e.cashbackTotal;
        acc.totalAbatido += e.cashbackAbatido;
        return acc;
      },
      { qtdComCashback: 0, totalAlmoco: 0, totalUpgrade: 0, totalGeral: 0, totalAbatido: 0 }
    );
  }, [empresasCashback]);

  const listaFiltrada = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');

    return empresasCashback.filter((e) => {
      if (filtroTipo === 'com_cashback' && e.cashbackTotal <= 0) return false;
      if (filtroTipo === 'almoco' && e.cashbackAlmoco <= 0) return false;
      if (filtroTipo === 'upgrade' && e.cashbackUpgrade <= 0) return false;
      if (filtroTipo === 'abatido' && e.cashbackAbatido <= 0) return false;
      if (filtroTipo === 'cortesia' && !e.cortesia) return false;

      if (!q) return true;
      const matchEmp = String(e.empresa || '').toLowerCase().includes(q);
      const matchCnpj = qDigits.length >= 3 && String(e.cnpj || '').replace(/\D/g, '').includes(qDigits);
      const matchSocio = e.membros.some((m) =>
        String(m.nome_participante || m.nome || '').toLowerCase().includes(q)
      );
      return matchEmp || matchCnpj || matchSocio;
    });
  }, [empresasCashback, busca, filtroTipo]);

  const exportarCsv = () => {
    const cabecalho = [
      'Empresa',
      'CNPJ',
      'Participantes',
      'Status Almoco',
      'CV Cartao',
      'Cashback Almoco (R$)',
      'Cashback Upgrade (R$)',
      'Historico Elegivel',
      'Cashback Total Disponivel (R$)',
      'Produto Proposta',
      'Cashback Abatido Proposta (R$)',
      'Status Aprovacao'
    ];

    const linhas = listaFiltrada.map((e) => [
      `"${String(e.empresa || '').replace(/"/g, '""')}"`,
      `"${e.cnpj || ''}"`,
      `"${e.membros.map((m) => m.nome_participante || m.nome).join(' / ').replace(/"/g, '""')}"`,
      e.almocoPago ? 'Almoco Pago' : e.cortesia ? 'Cortesia' : e.semAlmoco ? 'Sem Almoco' : 'Pendente',
      `"${e.cvCartao || ''}"`,
      e.cashbackAlmoco.toFixed(2).replace('.', ','),
      e.cashbackUpgrade.toFixed(2).replace('.', ','),
      `"${String(e.historicoElegivel || '').replace(/"/g, '""')}"`,
      e.cashbackTotal.toFixed(2).replace('.', ','),
      `"${String(e.produtoProposta || '').replace(/"/g, '""')}"`,
      e.cashbackAbatido.toFixed(2).replace('.', ','),
      e.statusProposta || 'Sem proposta'
    ]);

    const csv = '\uFEFF' + [cabecalho.join(';'), ...linhas.map((l) => l.join(';'))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cashback-empresas-turma-${turmaSelecionada || 'ativa'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: '1.75rem 2rem', width: '100%', boxSizing: 'border-box' }}>
      {/* CABEÇALHO */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.35rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ background: '#dcfce7', color: '#166534', padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '800', textTransform: 'uppercase' }}>
              Auditoria & Créditos CNPJ
            </span>
            {turmaAtual?.codigo && (
              <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#64748b' }}>
                {turmaAtual.codigo} • {turmaAtual.nome}
              </span>
            )}
          </div>
          <h1 style={{ margin: '0.35rem 0 0', fontSize: '1.55rem', fontWeight: '900', color: '#0f172a' }}>
            Consulta de Cashback por Empresa
          </h1>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.84rem', color: '#475569' }}>
            Visão consolidada por CNPJ dos créditos de almoço pago (R$ 1.000), upgrade elegível (90% PAC / 100% AE) e valores abatidos nas propostas comerciais.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <button
            type="button"
            onClick={carregarDados}
            style={{
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              color: '#334155',
              padding: '0.55rem 0.9rem',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: '700',
              cursor: 'pointer'
            }}
          >
            Atualizar
          </button>
          <button
            type="button"
            onClick={exportarCsv}
            style={{
              background: '#0f172a',
              border: 'none',
              color: '#ffffff',
              padding: '0.58rem 1rem',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: '800',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1.05rem' }}>download</span>
            Exportar CSV
          </button>
        </div>
      </div>

      {/* CARDS DE RESUMO FINANCEIRO */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem', marginBottom: '1.4rem' }}>
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '13px', padding: '1.1rem' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>
            Empresas com Crédito
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: '900', color: '#0f172a', marginTop: '0.25rem' }}>
            {carregando ? '...' : totais.qtdComCashback}
            <span style={{ fontSize: '0.88rem', fontWeight: '700', color: '#64748b' }}> / {empresasCashback.length}</span>
          </div>
          <div style={{ fontSize: '0.74rem', color: '#475569', marginTop: '0.15rem' }}>
            CNPJs com almoço pago ou upgrade
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '13px', padding: '1.1rem' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#0369a1', textTransform: 'uppercase' }}>
            Crédito Almoço Pago
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: '900', color: '#0369a1', marginTop: '0.25rem' }}>
            {carregando ? '...' : fmtBRL(totais.totalAlmoco)}
          </div>
          <div style={{ fontSize: '0.74rem', color: '#475569', marginTop: '0.15rem' }}>
            R$ 1.000,00 por CNPJ pagante
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '13px', padding: '1.1rem' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#7c3aed', textTransform: 'uppercase' }}>
            Crédito Upgrade (90% / 100%)
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: '900', color: '#7c3aed', marginTop: '0.25rem' }}>
            {carregando ? '...' : fmtBRL(totais.totalUpgrade)}
          </div>
          <div style={{ fontSize: '0.74rem', color: '#475569', marginTop: '0.15rem' }}>
            Histórico elegível PAC / AE
          </div>
        </div>

        <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: '13px', padding: '1.1rem' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#166534', textTransform: 'uppercase' }}>
            Abatido em Propostas
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: '900', color: '#15803d', marginTop: '0.25rem' }}>
            {carregando ? '...' : fmtBRL(totais.totalAbatido)}
          </div>
          <div style={{ fontSize: '0.74rem', color: '#166534', marginTop: '0.15rem', fontWeight: '600' }}>
            De {fmtBRL(totais.totalGeral)} disponíveis
          </div>
        </div>
      </div>

      {/* BARRA DE BUSCA E FILTROS */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '13px', padding: '1rem 1.15rem', marginBottom: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        <div style={{ position: 'relative' }}>
          <span className="material-symbols-outlined" style={{ position: 'absolute', left: '12px', top: '10px', color: '#94a3b8', fontSize: '1.2rem' }}>
            search
          </span>
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por empresa, CNPJ ou nome do sócio/participante..."
            style={{
              width: '100%',
              padding: '0.62rem 1rem 0.62rem 2.45rem',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '0.88rem',
              boxSizing: 'border-box',
              outline: 'none'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          {[
            { id: 'todos', label: `Todas (${empresasCashback.length})` },
            { id: 'com_cashback', label: `Com Cashback (${totais.qtdComCashback})` },
            { id: 'almoco', label: 'Almoço Pago (R$ 1.000)' },
            { id: 'upgrade', label: 'Upgrade 90% / 100%' },
            { id: 'abatido', label: 'Abatido em Proposta' },
            { id: 'cortesia', label: 'Cortesia (Isento)' }
          ].map((tab) => {
            const ativo = filtroTipo === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFiltroTipo(tab.id)}
                style={{
                  background: ativo ? '#0f172a' : '#f1f5f9',
                  color: ativo ? '#ffffff' : '#334155',
                  border: 'none',
                  padding: '0.38rem 0.8rem',
                  borderRadius: '999px',
                  fontSize: '0.76rem',
                  fontWeight: '800',
                  cursor: 'pointer'
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {erro && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '0.85rem 1rem', borderRadius: '10px', marginBottom: '1rem', fontWeight: '600' }}>
          {erro}
        </div>
      )}

      {/* TABELA CONSOLIDADA DE CASHBACK POR EMPRESA */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.83rem' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '0.73rem', textTransform: 'uppercase' }}>
              <th style={{ padding: '0.85rem 1rem' }}>Empresa / CNPJ</th>
              <th style={{ padding: '0.85rem 0.75rem' }}>Almoço / CV</th>
              <th style={{ padding: '0.85rem 0.75rem', textAlign: 'right' }}>CB Almoço</th>
              <th style={{ padding: '0.85rem 0.75rem', textAlign: 'right' }}>CB Upgrade</th>
              <th style={{ padding: '0.85rem 0.75rem', textAlign: 'right' }}>Total Disponível</th>
              <th style={{ padding: '0.85rem 0.75rem', textAlign: 'right' }}>Abatido Proposta</th>
              <th style={{ padding: '0.85rem 1rem' }}>Situação / Proposta</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr>
                <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontWeight: '700' }}>
                  Carregando créditos de cashback da turma...
                </td>
              </tr>
            ) : listaFiltrada.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                  Nenhuma empresa encontrada com os filtros selecionados.
                </td>
              </tr>
            ) : (
              listaFiltrada.map((e) => (
                <tr key={e.chave} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ fontWeight: '800', color: '#0f172a', fontSize: '0.88rem' }}>{e.empresa}</div>
                    <div style={{ fontSize: '0.73rem', color: '#64748b', fontFamily: 'monospace', marginTop: '0.1rem' }}>
                      {e.cnpj || 'CNPJ não informado'}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#475569', marginTop: '0.18rem' }}>
                      {e.membros.map((m) => m.nome_participante || m.nome).join(' • ')}
                    </div>
                  </td>

                  <td style={{ padding: '0.85rem 0.75rem' }}>
                    {e.almocoPago ? (
                      <span style={{ background: '#dcfce7', color: '#166534', padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '800', display: 'inline-block' }}>
                        ✔ Pago (R$ 1.000)
                      </span>
                    ) : e.cortesia ? (
                      <span style={{ background: '#fef3c7', color: '#92400e', padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '800', display: 'inline-block' }}>
                        Cortesia (Sem CB)
                      </span>
                    ) : e.semAlmoco ? (
                      <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '800', display: 'inline-block' }}>
                        Sem Almoço
                      </span>
                    ) : (
                      <span style={{ background: '#f1f5f9', color: '#64748b', padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '700', display: 'inline-block' }}>
                        Pendente
                      </span>
                    )}
                    {e.cvCartao && (
                      <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.2rem', fontFamily: 'monospace' }}>
                        CV: {e.cvCartao}
                      </div>
                    )}
                  </td>

                  <td style={{ padding: '0.85rem 0.75rem', textAlign: 'right', fontWeight: '700', color: e.cashbackAlmoco > 0 ? '#0369a1' : '#94a3b8' }}>
                    {fmtBRL(e.cashbackAlmoco)}
                  </td>

                  <td style={{ padding: '0.85rem 0.75rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ fontWeight: '700', color: e.cashbackUpgrade > 0 ? '#7c3aed' : '#94a3b8' }}>
                      {fmtBRL(e.cashbackUpgrade)}
                    </div>
                    {e.historicoElegivel && (() => {
                      const itens = String(e.historicoElegivel)
                        .split('+')
                        .map((s) => s.trim())
                        .filter(Boolean);
                      const labelResumo = itens.length > 1
                        ? `${itens.length} produtos elegíveis`
                        : itens[0];
                      return (
                        <button
                          type="button"
                          onClick={() => setDetalheHistorico({ empresa: e.empresa, cnpj: e.cnpj, valor: e.cashbackUpgrade, itens })}
                          title={e.historicoElegivel}
                          style={{
                            marginTop: '0.22rem',
                            display: 'inline-block',
                            maxWidth: '165px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            background: '#f5f3ff',
                            color: '#6d28d9',
                            border: '1px solid #ddd6fe',
                            borderRadius: '6px',
                            padding: '0.14rem 0.45rem',
                            fontSize: '0.68rem',
                            fontWeight: '700',
                            cursor: 'pointer'
                          }}
                        >
                          {labelResumo}
                        </button>
                      );
                    })()}
                  </td>

                  <td style={{ padding: '0.85rem 0.75rem', textAlign: 'right', fontWeight: '900', fontSize: '0.9rem', color: e.cashbackTotal > 0 ? '#0f172a' : '#94a3b8' }}>
                    {fmtBRL(e.cashbackTotal)}
                  </td>

                  <td style={{ padding: '0.85rem 0.75rem', textAlign: 'right', fontWeight: '800', color: e.cashbackAbatido > 0 ? '#15803d' : '#94a3b8' }}>
                    {fmtBRL(e.cashbackAbatido)}
                  </td>

                  <td style={{ padding: '0.85rem 1rem' }}>
                    {e.prop ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
                        <span style={{ fontSize: '0.74rem', fontWeight: '800', color: '#0f172a' }}>
                          {e.produtoProposta || 'Proposta Emitida'}
                        </span>
                        <span
                          style={{
                            fontSize: '0.69rem',
                            fontWeight: '800',
                            padding: '0.16rem 0.5rem',
                            borderRadius: '5px',
                            background: ['aprovada', 'aprovado', 'aprovada_com_ressalva'].includes(e.statusProposta)
                              ? '#dcfce7'
                              : ['recusada', 'recusado'].includes(e.statusProposta)
                              ? '#fee2e2'
                              : '#fef3c7',
                            color: ['aprovada', 'aprovado', 'aprovada_com_ressalva'].includes(e.statusProposta)
                              ? '#166534'
                              : ['recusada', 'recusado'].includes(e.statusProposta)
                              ? '#b91c1c'
                              : '#92400e'
                          }}
                        >
                          {e.statusProposta.toUpperCase()}
                        </span>
                        <button
                          type="button"
                          onClick={() => navigate('/approvals')}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            padding: 0,
                            color: '#2563eb',
                            fontSize: '0.72rem',
                            fontWeight: '800',
                            cursor: 'pointer',
                            textDecoration: 'underline'
                          }}
                        >
                          Ver em Aprovações →
                        </button>
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>Sem proposta emitida</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {/* MODAL DE DETALHE DOS PRODUTOS ELEGÍVEIS */}
      {detalheHistorico && (
        <div
          onClick={() => setDetalheHistorico(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 9999
          }}
        >
          <div
            onClick={(ev) => ev.stopPropagation()}
            style={{
              background: '#ffffff',
              borderRadius: '14px',
              width: '100%',
              maxWidth: '520px',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 20px 45px rgba(15, 23, 42, 0.25)'
            }}
          >
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#7c3aed', textTransform: 'uppercase' }}>
                  Histórico Elegível de Upgrade ({detalheHistorico.itens.length})
                </div>
                <div style={{ fontSize: '0.98rem', fontWeight: '800', color: '#0f172a', marginTop: '0.15rem' }}>
                  {detalheHistorico.empresa}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetalheHistorico(null)}
                style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '0.35rem 0.6rem', fontWeight: '800', color: '#475569', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: '1rem 1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {detalheHistorico.itens.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '0.55rem 0.75rem',
                    fontSize: '0.8rem',
                    color: '#1e293b',
                    fontWeight: '600'
                  }}
                >
                  {item}
                </div>
              ))}
            </div>
            <div style={{ padding: '0.85rem 1.25rem', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: '700' }}>Crédito Total Upgrade:</span>
              <span style={{ fontSize: '0.95rem', color: '#7c3aed', fontWeight: '900' }}>{fmtBRL(detalheHistorico.valor)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
