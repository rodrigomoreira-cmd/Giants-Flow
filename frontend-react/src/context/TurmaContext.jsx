import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import apiDefault, { api as apiNamed } from '../services/api';
const api = apiNamed || apiDefault;

const TurmaContext = createContext();

const obterTokenSessao = () => {
  try {
    const raw = localStorage.getItem('sessao_operador') || sessionStorage.getItem('sessao_operador');
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s?.token || null;
  } catch (_) {
    return null;
  }
};

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
  const location = useLocation();
  const [turmas, setTurmas] = useState([]);
  const [turmaSelecionada, setTurmaSelecionada] = useState(() => {
    return localStorage.getItem('turma_ativa_id') || '';
  });
  const [carregandoTurmas, setCarregandoTurmas] = useState(false);
  const [isAdmin, setIsAdmin] = useState(() => verificarPerfilAdmin());

  const sincronizarStorageTurma = (t) => {
    if (!t) return;
    const idStr = String(t.id);
    const rotulo = t.codigo ? `[${t.codigo}] ${t.nome}` : t.nome;
    localStorage.setItem('turma_ativa_id', idStr);
    localStorage.setItem('turma_ativa_nome', t.nome || '');
    localStorage.setItem('turma_ativa_label', rotulo || '');
  };

  const carregarTurmas = useCallback(async () => {
    const token = obterTokenSessao();
    const naTelaLogin = location.pathname === '/login';
    const adminAtual = verificarPerfilAdmin();
    setIsAdmin(adminAtual);

    if (!token || naTelaLogin) {
      setTurmas([]);
      setCarregandoTurmas(false);
      return;
    }

    try {
      setCarregandoTurmas(true);
      const res = await api.get('/turmas');
      const lista = Array.isArray(res) ? res : (res?.turmas || []);
      setTurmas(lista);

      const ativas = lista.filter((t) => Boolean(t.ativa));
      const poolPermitido = adminAtual ? lista : (ativas.length > 0 ? ativas : lista);

      const salva = localStorage.getItem('turma_ativa_id');
      const turmaSalvaObj = poolPermitido.find((t) => String(t.id) === String(salva));

      if (turmaSalvaObj) {
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
  }, [location.pathname]);

  useEffect(() => {
    carregarTurmas();

    const aoAtualizarSessao = () => {
      carregarTurmas();
    };
    window.addEventListener('sessao_atualizada', aoAtualizarSessao);
    return () => window.removeEventListener('sessao_atualizada', aoAtualizarSessao);
  }, [carregarTurmas]);

  const ativasLista = turmas.filter((t) => Boolean(t.ativa));
  const turmasVisiveis = isAdmin
    ? turmas
    : (ativasLista.length > 0 ? ativasLista : turmas);

  const mudarTurma = (novoId) => {
    const idStr = String(novoId);
    const encontrada = turmasVisiveis.find((t) => String(t.id) === idStr) || turmas.find((t) => String(t.id) === idStr);
    if (!encontrada) return;
    setTurmaSelecionada(String(encontrada.id));
    sincronizarStorageTurma(encontrada);
  };

  const turmaAtual =
    turmasVisiveis.find((t) => String(t.id) === String(turmaSelecionada)) ||
    turmas.find((t) => String(t.id) === String(turmaSelecionada)) ||
    turmasVisiveis[0] ||
    null;

  const turmaEncerrada = Boolean(turmaAtual && !turmaAtual.ativa);

  return (
    <TurmaContext.Provider
      value={{
        turmas,
        turmasVisiveis,
        turmaSelecionada: turmaAtual ? String(turmaAtual.id) : turmaSelecionada,
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