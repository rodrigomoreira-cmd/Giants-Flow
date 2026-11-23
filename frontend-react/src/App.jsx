import ProposalContractPdf from './pages/ProposalContractPdf';
import FichaPdf from './pages/FichaPdf';
﻿import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import Sidebar from './components/Sidebar';
import Header from './components/Header';
import { TurmaProvider } from './context/TurmaContext';
import { MenuProvider } from './context/MenuContext';
import { SystemModalProvider } from './context/ModalContext';

import Login from './pages/Login';
import Home from './pages/Home';

const Companies = lazy(() => import('./pages/Companies'));
const CompanyDetail = lazy(() => import('./pages/CompanyDetail'));
const WarRoom = lazy(() => import('./pages/WarRoom'));
const Interviews = lazy(() => import('./pages/Interviews'));
const InterviewDetail = lazy(() => import('./pages/InterviewDetail'));
const InterviewEdit = lazy(() => import('./pages/InterviewEdit'));
const Approvals = lazy(() => import('./pages/Approvals'));
const CashbackCompanies = lazy(() => import('./pages/CashbackCompanies'));
const Lunch = lazy(() => import('./pages/Lunch'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const AdminCompanies = lazy(() => import('./pages/AdminCompanies'));
const AdminCohorts = lazy(() => import('./pages/AdminCohorts'));
const AdminRules = lazy(() => import('./pages/AdminRules'));
const AuditLogs = lazy(() => import('./pages/AuditLogs'));

function RotaAdmin({ children }) {
  try {
    const raw = localStorage.getItem('sessao_operador');
    const s = raw ? JSON.parse(raw) : null;
    const papel = String(s?.usuario?.papel || s?.papel || '').toUpperCase();
    if (!s) return <Navigate to="/login" replace />;
    if (papel !== 'ADMIN') return <Navigate to="/home" replace />;
    return children;
  } catch (_) {
    return <Navigate to="/home" replace />;
  }
}

function RotaSemFinanceiro({ children }) {
  try {
    const raw = localStorage.getItem('sessao_operador');
    const s = raw ? JSON.parse(raw) : null;
    if (!s) return <Navigate to="/login" replace />;
    const papel = String(s?.usuario?.papel || s?.papel || '').toUpperCase();
    if (papel === 'FINANCEIRO') return <Navigate to="/home" replace />;
    return children;
  } catch (_) {
    return <Navigate to="/home" replace />;
  }
}

function RotaFinanceiroOuAdmin({ children }) {
  try {
    const raw = localStorage.getItem('sessao_operador');
    const s = raw ? JSON.parse(raw) : null;
    if (!s) return <Navigate to="/login" replace />;
    const papel = String(s?.usuario?.papel || s?.papel || '').toUpperCase();
    if (!['ADMIN', 'FINANCEIRO'].includes(papel)) return <Navigate to="/home" replace />;
    return children;
  } catch (_) {
    return <Navigate to="/home" replace />;
  }
}

function RotaProtegida({ children }) {
  const sessao = localStorage.getItem('sessao_operador');
  return sessao ? children : <Navigate to="/login" replace />;
}

function LayoutComSidebar({ children }) {
  const [isModoTv, setIsModoTv] = React.useState(
    () => new URLSearchParams(window.location.search).get('tv') === '1'
  );

  React.useEffect(() => {
    const onTvMode = (e) => setIsModoTv(Boolean(e.detail));
    window.addEventListener('warroom-tv-mode', onTvMode);
    return () => window.removeEventListener('warroom-tv-mode', onTvMode);
  }, []);

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden', background: isModoTv ? '#060911' : '#f8fafc', margin: 0, padding: 0 }}>
      <Sidebar />
      <main style={{ flex: 1, height: '100vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', minWidth: 0, overflow: 'hidden' }}>
        <Header />
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', width: '100%', maxWidth: '100vw' }}>
          <Suspense
            fallback={
              <div style={{ padding: '2.5rem', textAlign: 'center', color: '#64748b', fontWeight: 700, fontSize: '0.92rem' }}>
                Carregando módulo...
              </div>
            }
          >
            {children}
          </Suspense>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <TurmaProvider>
        <SystemModalProvider>
        <MenuProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* Rotas Oficiais GIANTS Flow */}
          <Route path="/home" element={<RotaProtegida><LayoutComSidebar><Home /></LayoutComSidebar></RotaProtegida>} />
          <Route path="/companies" element={<RotaProtegida><LayoutComSidebar><Companies /></LayoutComSidebar></RotaProtegida>} />
          <Route path="/war-room" element={<RotaProtegida><LayoutComSidebar><WarRoom /></LayoutComSidebar></RotaProtegida>} />
          <Route path="/companies/:id" element={<RotaProtegida><LayoutComSidebar><CompanyDetail /></LayoutComSidebar></RotaProtegida>} />
          <Route path="/interviews" element={<RotaSemFinanceiro><LayoutComSidebar><Interviews /></LayoutComSidebar></RotaSemFinanceiro>} />
          <Route path="/interviews/:id" element={<RotaSemFinanceiro><LayoutComSidebar><InterviewDetail /></LayoutComSidebar></RotaSemFinanceiro>} />
            <Route path="/interviews/:id/pdf" element={<RotaSemFinanceiro><FichaPdf /></RotaSemFinanceiro>} />
          <Route path="/interviews/:id/edit" element={<RotaSemFinanceiro><LayoutComSidebar><InterviewEdit /></LayoutComSidebar></RotaSemFinanceiro>} />
          <Route path="/approvals" element={<RotaProtegida><LayoutComSidebar><Approvals /></LayoutComSidebar></RotaProtegida>} />
          <Route path="/proposals/:id/contract" element={<RotaProtegida><ProposalContractPdf /></RotaProtegida>} />
          <Route path="/cashback" element={<RotaFinanceiroOuAdmin><LayoutComSidebar><CashbackCompanies /></LayoutComSidebar></RotaFinanceiroOuAdmin>} />
          <Route path="/lunch" element={<RotaSemFinanceiro><LayoutComSidebar><Lunch /></LayoutComSidebar></RotaSemFinanceiro>} />
          <Route path="/reports" element={<Navigate to="/home" replace />} />
          <Route path="/admin/users" element={<RotaAdmin><LayoutComSidebar><AdminUsers /></LayoutComSidebar></RotaAdmin>} />
          <Route path="/admin/companies" element={<RotaAdmin><LayoutComSidebar><AdminCompanies /></LayoutComSidebar></RotaAdmin>} />
          <Route path="/admin/cohorts" element={<RotaAdmin><LayoutComSidebar><AdminCohorts /></LayoutComSidebar></RotaAdmin>} />
          <Route path="/admin/rules" element={<RotaAdmin><LayoutComSidebar><AdminRules /></LayoutComSidebar></RotaAdmin>} />
          <Route path="/admin/audit" element={<RotaAdmin><LayoutComSidebar><AuditLogs /></LayoutComSidebar></RotaAdmin>} />

          {/* Redirecionamentos de Compatibilidade */}
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/fichas" element={<Navigate to="/companies" replace />} />
          <Route path="/entrevistas" element={<Navigate to="/interviews" replace />} />
          <Route path="/propostas" element={<Navigate to="/approvals" replace />} />
          <Route path="/mesas" element={<Navigate to="/lunch" replace />} />

          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
                      </MenuProvider>
        </SystemModalProvider>
      </TurmaProvider>
    </BrowserRouter>
  );
}
