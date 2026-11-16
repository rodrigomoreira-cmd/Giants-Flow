import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../services/api';

export default function FichaPdf() {
  const { id } = useParams();
  const [ficha, setFicha] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    const buscarFicha = async () => {
      try {
        const turmaId = localStorage.getItem('turma_ativa_id') || '';
        const query = turmaId ? `?turmaId=${encodeURIComponent(turmaId)}` : '';
        const res = await api.get(`/clientes${query}`);
        const lista = Array.isArray(res) ? res : (res?.data || res?.clientes || []);
        let encontrada = lista.find((item) => String(item.id) === String(id));

        // Se não estiver na turma selecionada no filtro, busca na base geral
        if (!encontrada && query) {
          const resGeral = await api.get('/clientes');
          const listaGeral = Array.isArray(resGeral) ? resGeral : (resGeral?.data || resGeral?.clientes || []);
          encontrada = listaGeral.find((item) => String(item.id) === String(id));
        }

        if (!encontrada) {
          setErro(`Ficha #${id} não encontrada na base.`);
          return;
        }

        setFicha(encontrada);
        setTimeout(() => window.print(), 700);
      } catch (err) {
        setErro(err.message || 'Erro ao carregar dados da ficha para impressão.');
      }
    };
    buscarFicha();
  }, [id]);

  if (erro) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'sans-serif', color: '#b91c1c' }}>
        <h3>Não foi possível gerar o PDF</h3>
        <p>{erro}</p>
      </div>
    );
  }

  if (!ficha) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'sans-serif', color: '#475569' }}>
        Carregando dados da ficha #{id} para impressão...
      </div>
    );
  }

  const nomeParticipante = ficha.nome_participante || ficha.nome_completo || ficha.nome || `Participante #${id}`;
  const nomeCracha = ficha.nome_cracha ? ` (${ficha.nome_cracha})` : '';
  const statusAlmoco = ficha.almoco_pago
    ? 'PAGO'
    : ficha.cortesia_almoco
    ? 'CORTESIA'
    : ficha.membro_giants
    ? 'GIANTS'
    : 'Pendente';

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto', color: '#0f172a' }}>
      <style>{`
        @media print {
          @page { size: A4; margin: 15mm; }
          body { -webkit-print-color-adjust: exact; margin: 0; background: #fff; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="no-print" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          onClick={() => window.close()}
          style={{ background: '#e2e8f0', color: '#334155', border: 'none', padding: '0.6rem 1rem', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}
        >
          Fechar Aba
        </button>
        <button
          onClick={() => window.print()}
          style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
        >
          Imprimir / Salvar PDF
        </button>
      </div>

      <div style={{ borderBottom: '2px solid #cbd5e1', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '1.5rem', color: '#0f172a' }}>
          FICHA DE ENTREVISTA #{ficha.id}
        </h1>
        <p style={{ margin: 0, color: '#475569', fontSize: '0.9rem' }}>
          Etapa do Funil: <strong>{String(ficha.etapa_funil || 'ficha_preenchida').replace(/_/g, ' ').toUpperCase()}</strong>
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <div>
          <p style={{ margin: '0 0 0.3rem 0', fontSize: '0.8rem', color: '#64748b' }}>NOME DO PARTICIPANTE</p>
          <strong style={{ fontSize: '1.05rem' }}>{nomeParticipante}{nomeCracha}</strong>
        </div>
        <div>
          <p style={{ margin: '0 0 0.3rem 0', fontSize: '0.8rem', color: '#64748b' }}>EMPRESA</p>
          <strong style={{ fontSize: '1.05rem' }}>{ficha.empresa || 'Não informada'} {ficha.membro_giants ? '(GIANTS)' : ''}</strong>
        </div>
        <div>
          <p style={{ margin: '0 0 0.3rem 0', fontSize: '0.8rem', color: '#64748b' }}>CNPJ</p>
          <strong>{ficha.cnpj || 'Não informado'}</strong>
        </div>
        <div>
          <p style={{ margin: '0 0 0.3rem 0', fontSize: '0.8rem', color: '#64748b' }}>CARGO / ORIGEM</p>
          <strong>{ficha.cargo || '-'} / {ficha.origem || '-'}</strong>
        </div>
        <div>
          <p style={{ margin: '0 0 0.3rem 0', fontSize: '0.8rem', color: '#64748b' }}>TELEFONE</p>
          <strong>{ficha.telefone || 'Não informado'}</strong>
        </div>
        <div>
          <p style={{ margin: '0 0 0.3rem 0', fontSize: '0.8rem', color: '#64748b' }}>E-MAIL</p>
          <strong>{ficha.email || 'Não informado'}</strong>
        </div>
      </div>

      <div style={{ background: '#f8fafc', padding: '1.2rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
        <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.05rem', color: '#334155' }}>Detalhes Financeiros</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block' }}>CASHBACK DISPONÍVEL</span>
            <strong>R$ {Number(ficha.cashback || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
          </div>
          <div>
            <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block' }}>LIBERAÇÃO DO ALMOÇO</span>
            <strong>{statusAlmoco}</strong>
          </div>
        </div>
      </div>

      <div style={{ background: '#fff', padding: '1.2rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
        <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.05rem', color: '#334155' }}>Resumo da Entrevista</h3>
        <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>
          <strong>Mesa Alocada:</strong> {ficha.mesa_alocada ? `Mesa ${ficha.mesa_alocada}` : 'Não alocado'}
        </p>
        <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>
          <strong>Desfecho / Aprovação:</strong> {ficha.status_aprovacao || 'Em andamento'}
        </p>
        {(ficha.parecer_entrevistador || ficha.observacoes) && (
          <div style={{ marginTop: '1rem' }}>
            <strong>Observações / Parecer:</strong>
            <p style={{ background: '#f1f5f9', padding: '1rem', borderRadius: '6px', fontSize: '0.9rem', fontStyle: 'italic', marginTop: '0.5rem' }}>
              {ficha.parecer_entrevistador || ficha.observacoes}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
