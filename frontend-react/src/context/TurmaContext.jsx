import React, { createContext, useContext, useState, useEffect } from 'react';
import apiDefault, { api as apiNamed } from '../services/api';
const api = apiNamed || apiDefault;

const TurmaContext = createContext();

export function TurmaProvider({ children }) {
  const [turmas, setTurmas] = useState([]);
  const [turmaSelecionada, setTurmaSelecionada] = useState(() => {
    return localStorage.getItem('turma_ativa_id') || '';
  });
  const [carregandoTurmas, setCarregandoTurmas] = useState(true);

  const carregarTurmas = async () => {
    try {
      setCarregandoTurmas(true);
      const res = await api.get('/turmas');
      const lista = Array.isArray(res) ? res : (res?.turmas || []);
      setTurmas(lista);

      // 1. Respeita a seleção já salva se ainda for válida
      const salva = localStorage.getItem('turma_ativa_id');
      const existeSalva = lista.some(t => String(t.id) === String(salva));

      if (salva && existeSalva) {
        setTurmaSelecionada(salva);
      } else {
        // 2. Senão, seleciona a turma ativa (ex: AE #86 - ID 1491) ou a primeira disponível
        const padrao = lista.find(t => t.ativa) || lista[0];
        if (padrao) {
          const idStr = String(padrao.id);
          setTurmaSelecionada(idStr);
          localStorage.setItem('turma_ativa_id', idStr);
        }
      }
    } catch (err) {
      console.error('Falha ao carregar turmas:', err);
    } finally {
      setCarregandoTurmas(false);
    }
  };

  useEffect(() => {
    carregarTurmas();
  }, []);

  const mudarTurma = (novoId) => {
    const idStr = String(novoId);
    setTurmaSelecionada(idStr);
    localStorage.setItem('turma_ativa_id', idStr);
  };

  const turmaAtual = turmas.find(t => String(t.id) === String(turmaSelecionada)) || null;

  return (
    <TurmaContext.Provider value={{
      turmas,
      turmaSelecionada,
      turmaAtual,
      mudarTurma,
      carregandoTurmas,
      recarregarTurmas: carregarTurmas
    }}>
      {children}
    </TurmaContext.Provider>
  );
}

export function useTurma() {
  const ctx = useContext(TurmaContext);
  if (!ctx) {
    throw new Error('useTurma deve ser utilizado dentro de um TurmaProvider');
  }
  return ctx;
}