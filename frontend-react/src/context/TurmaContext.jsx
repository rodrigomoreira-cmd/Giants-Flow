import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiDefault, { api as apiNamed } from '../services/api';
const api = apiNamed || apiDefault;

const TurmaContext = createContext();

const verificarPerfilAdmin = () => {
  const papeisAdmin = ['admin', 'administrador', 'superadmin', 'master', 'system', 'diretor'];
  try {
    const raw = localStorage.getItem('sessao_operador') || sessionStorage.getItem('sessao_operador');
    if (raw) {
      const s = JSON.parse(raw);
      const papel = String(s?.usuario?.papel || s?.papel || '').trim().toLowerCase();
      if (papeisAdmin.includes(papel) || s?.usuario?.is_admin === true) return true;
    }
    const r = String(localStorage.getItem('role') || localStorage.getItem('papel') || '').trim().toLowerCase();
    if (papeisAdmin.includes(r)) return true;
  } catch (_) {}
  return false;
};

export function TurmaProvider({ children }) {
  const [turmas, setTurmas] = useState([]);
  const [turmaSelecionada, setTurmaSelecionada] = useState(() => {
    return localStorage.getItem('turma_ativa_id') || '';
  });
  const [carregandoTurmas, setCarregandoTurmas] = useState(true);
  const isAdmin = verificarPerfilAdmin();

  const sincronizarStorageTurma = (t) => {
    if (!t) return;
    const idStr = String(t.id);
    const rotulo = t.codigo ? `[${t.codigo}] ${t.nome}` : t.nome;
    localStorage.setItem('turma_ativa_id', idStr);
    localStorage.setItem('turma_ativa_nome', t.nome || '');
    localStorage.setItem('turma_ativa_label', rotulo || '');
  };

  const carregarTurmas = useCallback(async () => {
    try {
      setCarregandoTurmas(true);
      const res = await api.get('/turmas');
      const lista = Array.isArray(res) ? res : (res?.turmas || []);
      setTurmas(lista);

      const ativas = lista.filter((t) => Boolean(t.ativa));
      const poolPermitido = isAdmin ? lista : (ativas.length > 0 ? ativas : lista);

      const salva = localStorage.getItem('turma_ativa_id');
      const turmaSalvaObj = poolPermitido.find((t) => String(t.id) === String(salva));

      // Se a turma salva ainda é permitida (e ativa para não-admin), mantém; senão troca para a primeira ativa
      if (turmaSalvaObj && (isAdmin || Boolean(turmaSalvaObj.ativa))) {
        setTurmaSelecionada(String(turmaSalvaObj.id));
        sincronizarStorageTurma(turmaSalvaObj);
      } else {
        const padrao = ativas[0] || poolPermitido[0];
        if (padrao) {
          const idStr = String(padrao.id);
          setTurmaSelecionada(idStr);
          sincronizarStorageTurma(padrao);
        }
      }
    } catch (err) {
      console.error('Falha ao carregar turmas:', err);
    } finally {
      setCarregandoTurmas(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    carregarTurmas();
  }, [carregarTurmas]);

  const mudarTurma = (novoId) => {
    const idStr = String(novoId);
    const encontrada = turmas.find((t) => String(t.id) === idStr);
    if (encontrada && !encontrada.ativa && !isAdmin) {
      const primeiraAtiva = turmas.find((t) => Boolean(t.ativa));
      if (primeiraAtiva) {
        setTurmaSelecionada(String(primeiraAtiva.id));
        sincronizarStorageTurma(primeiraAtiva);
      }
      return;
    }
    setTurmaSelecionada(idStr);
    if (encontrada) sincronizarStorageTurma(encontrada);
    else localStorage.setItem('turma_ativa_id', idStr);
  };

  const turmasVisiveis = isAdmin
    ? turmas
    : turmas.filter((t) => Boolean(t.ativa));

  const turmaAtual = turmas.find((t) => String(t.id) === String(turmaSelecionada)) || null;
  const turmaEncerrada = Boolean(turmaAtual && !turmaAtual.ativa);

  return (
    <TurmaContext.Provider
      value={{
        turmas,
        turmasVisiveis,
        turmaSelecionada,
        turmaAtual,
        turmaEncerrada,
        isAdmin,
        mudarTurma,
        carregandoTurmas,
        recarregarTurmas: carregarTurmas
      }}
    >
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
