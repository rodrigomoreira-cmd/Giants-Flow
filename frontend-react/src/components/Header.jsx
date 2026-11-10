import React from 'react';
import { useTurma } from '../context/TurmaContext';

export default function Header() {
  const { turmas, turmaSelecionada, mudarTurma, carregandoTurmas } = useTurma();

  return (
    <header style={{
      background: '#ffffff',
      borderBottom: '1px solid #e2e8f0',
      padding: '0.75rem 2rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 10,
      boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <span style={{ 
          fontSize: '0.8rem', 
          fontWeight: 700, 
          color: '#64748b', 
          textTransform: 'uppercase', 
          letterSpacing: '0.05em' 
        }}>
          Turma Operacional:
        </span>
        <select
          value={String(turmaSelecionada || "")}
          onChange={(e) => mudarTurma(e.target.value)}
          disabled={carregandoTurmas || turmas.length === 0}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            border: '1px solid #cbd5e1',
            background: '#f8fafc',
            color: '#0f172a',
            fontWeight: 600,
            fontSize: '0.88rem',
            outline: 'none',
            cursor: 'pointer',
            minWidth: '340px'
          }}
        >
          {turmas.map(t => (
            <option key={t.id} value={String(t.id)}>
              {t.ativa ? '🟢 ' : '⚪ '} {t.codigo ? `[${t.codigo}] ` : ''}{t.nome}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span style={{
          background: '#f1f5f9',
          color: '#475569',
          padding: '0.3rem 0.75rem',
          borderRadius: '999px',
          fontSize: '0.75rem',
          fontWeight: 600
        }}>
          Ambiente Local (PostgreSQL)
        </span>
      </div>
    </header>
  );
}