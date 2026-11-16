import React, { useState, useEffect } from 'react';

let dispararModalGlobal = null;

function inferirConfiguracao(mensagem, opcoes = {}, ehConfirmacao = false) {
  const texto = String(mensagem || '');
  const lower = texto.toLowerCase();

  let tipo = opcoes.tipo;
  if (!tipo) {
    if (
      lower.includes('erro') ||
      lower.includes('falha') ||
      lower.includes('não foi possível') ||
      lower.includes('excluir') ||
      lower.includes('excede') ||
      lower.includes('negativo') ||
      lower.includes('ultrapassa')
    ) {
      tipo = 'erro';
    } else if (
      !ehConfirmacao &&
      (lower.includes('sucesso') ||
        lower.includes('atualizad') ||
        lower.includes('cadastrad') ||
        lower.includes('confirmad') ||
        lower.includes('registad') ||
        lower.includes('alterada') ||
        lower.includes('liberad'))
    ) {
      tipo = 'sucesso';
    } else {
      tipo = 'aviso';
    }
  }

  let titulo = opcoes.titulo;
  if (!titulo) {
    if (ehConfirmacao) {
      titulo = 'Confirmação Necessária';
    } else if (tipo === 'erro') {
      titulo = 'Atenção • Não Foi Possível Concluir';
    } else if (tipo === 'sucesso') {
      titulo = 'Operação Concluída';
    } else {
      titulo = 'Aviso do Sistema';
    }
  }

  return {
    tipo,
    titulo,
    mensagem: texto,
    ehConfirmacao,
    textoConfirmar: opcoes.textoConfirmar || 'Confirmar',
    textoCancelar: opcoes.textoCancelar || 'Cancelar',
    corConfirmar: opcoes.corConfirmar || (tipo === 'erro' ? '#dc2626' : '#ff5722')
  };
}

export function alertaSistema(mensagem, opcoes = {}) {
  const cfg = inferirConfiguracao(mensagem, opcoes, false);
  if (typeof dispararModalGlobal === 'function') {
    return new Promise((resolve) => {
      dispararModalGlobal({ ...cfg, resolve });
    });
  }
  return Promise.resolve();
}

export function confirmarSistema(mensagem, opcoes = {}) {
  const cfg = inferirConfiguracao(mensagem, opcoes, true);
  if (typeof dispararModalGlobal === 'function') {
    return new Promise((resolve) => {
      dispararModalGlobal({ ...cfg, resolve });
    });
  }
  return Promise.resolve(false);
}

export function SystemModalProvider({ children }) {
  const [modalAtual, setModalAtual] = useState(null);

  useEffect(() => {
    dispararModalGlobal = (dados) => setModalAtual(dados);
    return () => {
      dispararModalGlobal = null;
    };
  }, []);

  const fecharComResposta = (resposta) => {
    if (modalAtual?.resolve) {
      modalAtual.resolve(resposta);
    }
    setModalAtual(null);
  };

  useEffect(() => {
    if (!modalAtual) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        fecharComResposta(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modalAtual]);

  return (
    <>
      {children}

      {modalAtual && (
        <div
          onClick={() => fecharComResposta(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '460px',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.35)',
              border: '1px solid #e2e8f0'
            }}
          >
            <div
              style={{
                padding: '1.1rem 1.35rem',
                background:
                  modalAtual.tipo === 'erro'
                    ? '#fef2f2'
                    : modalAtual.tipo === 'sucesso'
                    ? '#f0fdf4'
                    : '#fffbeb',
                borderBottom:
                  modalAtual.tipo === 'erro'
                    ? '1px solid #fecaca'
                    : modalAtual.tipo === 'sucesso'
                    ? '1px solid #bbf7d0'
                    : '1px solid #fde68a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: '1.35rem',
                    color:
                      modalAtual.tipo === 'erro'
                        ? '#dc2626'
                        : modalAtual.tipo === 'sucesso'
                        ? '#16a34a'
                        : '#d97706'
                  }}
                >
                  {modalAtual.tipo === 'erro'
                    ? 'error'
                    : modalAtual.tipo === 'sucesso'
                    ? 'check_circle'
                    : 'warning'}
                </span>
                <h3
                  style={{
                    margin: 0,
                    fontSize: '1rem',
                    fontWeight: '800',
                    color:
                      modalAtual.tipo === 'erro'
                        ? '#991b1b'
                        : modalAtual.tipo === 'sucesso'
                        ? '#166534'
                        : '#92400e'
                  }}
                >
                  {modalAtual.titulo}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => fecharComResposta(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  fontSize: '1.1rem',
                  fontWeight: '800'
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                padding: '1.3rem 1.35rem',
                fontSize: '0.9rem',
                color: '#334155',
                lineHeight: 1.55,
                whiteSpace: 'pre-line'
              }}
            >
              {modalAtual.mensagem}
            </div>

            <div
              style={{
                padding: '0.9rem 1.35rem',
                background: '#f8fafc',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.6rem'
              }}
            >
              {modalAtual.ehConfirmacao ? (
                <>
                  <button
                    type="button"
                    onClick={() => fecharComResposta(false)}
                    style={{
                      background: '#ffffff',
                      color: '#475569',
                      border: '1px solid #cbd5e1',
                      padding: '0.55rem 1.1rem',
                      borderRadius: '8px',
                      fontWeight: '700',
                      fontSize: '0.84rem',
                      cursor: 'pointer'
                    }}
                  >
                    {modalAtual.textoCancelar}
                  </button>
                  <button
                    type="button"
                    onClick={() => fecharComResposta(true)}
                    style={{
                      background: modalAtual.corConfirmar,
                      color: '#ffffff',
                      border: 'none',
                      padding: '0.55rem 1.2rem',
                      borderRadius: '8px',
                      fontWeight: '800',
                      fontSize: '0.84rem',
                      cursor: 'pointer'
                    }}
                  >
                    {modalAtual.textoConfirmar}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => fecharComResposta(true)}
                  style={{
                    background: '#0f172a',
                    color: '#ffffff',
                    border: 'none',
                    padding: '0.55rem 1.3rem',
                    borderRadius: '8px',
                    fontWeight: '800',
                    fontSize: '0.84rem',
                    cursor: 'pointer'
                  }}
                >
                  Entendi
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
