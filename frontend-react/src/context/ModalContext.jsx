import React, { useState, useEffect, useCallback } from 'react';

let dispararModalGlobal = null;
let dispararToastGlobal = null;

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

export function toastSistema(mensagem, tipo = 'sucesso', duracaoMs = 3200) {
  if (typeof dispararToastGlobal === 'function') {
    dispararToastGlobal({
      id: Date.now() + Math.random(),
      mensagem: String(mensagem || ''),
      tipo,
      duracaoMs
    });
  }
}

export function alertaSistema(mensagem, opcoes = {}) {
  const cfg = inferirConfiguracao(mensagem, opcoes, false);

  // Sucessos rápidos podem opcionalmente usar toast se solicitado via { toast: true }
  if (opcoes.toast && typeof dispararToastGlobal === 'function') {
    toastSistema(cfg.mensagem, cfg.tipo, opcoes.duracaoMs || 3200);
    return Promise.resolve();
  }

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
  const [toasts, setToasts] = useState([]);

  const removerToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    dispararModalGlobal = (dados) => setModalAtual(dados);
    dispararToastGlobal = (toast) => {
      setToasts((prev) => [...prev.slice(-3), toast]);
      setTimeout(() => {
        removerToast(toast.id);
      }, toast.duracaoMs || 3200);
    };
    return () => {
      dispararModalGlobal = null;
      dispararToastGlobal = null;
    };
  }, [removerToast]);

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

      {/* PILHA DE TOASTS NÃO-INTRUSIVOS (CANTO INFERIOR DIREITO) */}
      {toasts.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: '1.25rem',
            right: '1.25rem',
            zIndex: 10050,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.55rem',
            maxWidth: '380px',
            pointerEvents: 'none'
          }}
        >
          {toasts.map((t) => {
            const isErro = t.tipo === 'erro';
            const isAviso = t.tipo === 'aviso';
            return (
              <div
                key={t.id}
                onClick={() => removerToast(t.id)}
                style={{
                  pointerEvents: 'auto',
                  cursor: 'pointer',
                  background: '#0f172a',
                  color: '#ffffff',
                  borderLeft: `4px solid ${isErro ? '#ef4444' : isAviso ? '#f59e0b' : '#22c55e'}`,
                  borderRadius: '10px',
                  padding: '0.75rem 1rem',
                  boxShadow: '0 14px 30px -6px rgba(15, 23, 42, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                  animation: 'toastSlideIn 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)'
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: '1.25rem',
                    color: isErro ? '#f87171' : isAviso ? '#fbbf24' : '#4ade80',
                    flexShrink: 0
                  }}
                >
                  {isErro ? 'error' : isAviso ? 'info' : 'check_circle'}
                </span>
                <span style={{ fontSize: '0.84rem', fontWeight: '700', lineHeight: 1.35 }}>
                  {t.mensagem}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL CENTRAL DE ALERTA E CONFIRMAÇÃO */}
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
              border: '1px solid #e2e8f0',
              animation: 'modalScaleIn 0.18s cubic-bezier(0.2, 0.8, 0.2, 1)'
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
