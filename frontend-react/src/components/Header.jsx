import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTurma } from '../context/TurmaContext';
import { useMenu } from '../context/MenuContext';
import NotificationBell from './NotificationBell';

export default function Header() {
  const navigate = useNavigate();
  const { toggleMenu } = useMenu();
  const { turmasVisiveis, turmaSelecionada, turmaAtual, turmaEncerrada, isAdmin, mudarTurma, carregandoTurmas } = useTurma();

  return (
    <header
      style={{
        background: '#ffffff',
        borderBottom: turmaEncerrada ? '2px solid #f59e0b' : '1px solid #e2e8f0',
        padding: '0.75rem 2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        flexWrap: 'wrap',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
        <button className="hamburger-btn" onClick={toggleMenu} title="Menu Principal">
          <span className="material-symbols-outlined" style={{ fontSize: '1.5rem' }}>menu</span>
        </button>
        <span
          style={{
            fontSize: '0.8rem',
            fontWeight: 700,
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}
        >
          Turma Operacional:
        </span>
        <select
          value={String(turmaSelecionada || '')}
          onChange={(e) => mudarTurma(e.target.value)}
          disabled={carregandoTurmas || turmasVisiveis.length === 0}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            border: turmaEncerrada ? '1.5px solid #f59e0b' : '1px solid #cbd5e1',
            background: turmaEncerrada ? '#fffbeb' : '#f8fafc',
            color: '#0f172a',
            fontWeight: 600,
            fontSize: '0.88rem',
            outline: 'none',
            cursor: 'pointer',
            minWidth: '340px'
          }}
        >
          {turmasVisiveis.map((t) => (
            <option key={t.id} value={String(t.id)}>
              {t.ativa ? '🟢 ' : '⚪ [ENCERRADA] '}
              {t.codigo ? `[${t.codigo}] ` : ''}
              {t.nome}
            </option>
          ))}
        </select>

        {turmaEncerrada && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: '#fef3c7',
              border: '1px solid #f59e0b',
              color: '#92400e',
              padding: '0.32rem 0.7rem',
              borderRadius: '8px',
              fontSize: '0.76rem',
              fontWeight: '800'
            }}
          >
            <span>🔒 Turma Desativada (Somente Consulta)</span>
            {isAdmin && (
              <button
                type="button"
                onClick={() => navigate('/admin/cohorts')}
                style={{
                  background: '#92400e',
                  color: '#ffffff',
                  border: 'none',
                  padding: '0.18rem 0.5rem',
                  borderRadius: '5px',
                  fontSize: '0.7rem',
                  fontWeight: '800',
                  cursor: 'pointer'
                }}
              >
                Gerenciar
              </button>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <NotificationBell />
        {turmaAtual?.codigo && (
          <span
            style={{
              background: '#fff7ed',
              color: '#c2410c',
              border: '1px solid #fed7aa',
              padding: '0.28rem 0.65rem',
              borderRadius: '999px',
              fontSize: '0.74rem',
              fontWeight: 800
            }}
          >
            ID #{turmaAtual.id}
          </span>
        )}
        <span
          style={{
            background: '#f1f5f9',
            color: '#475569',
            padding: '0.3rem 0.75rem',
            borderRadius: '999px',
            fontSize: '0.75rem',
            fontWeight: 600
          }}
        >
          Ambiente Local (PostgreSQL)
        </span>
      </div>
    </header>
  );
}
