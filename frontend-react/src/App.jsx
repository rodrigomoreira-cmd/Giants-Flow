import React, { Suspense, lazy } from 'react';
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
const Lunch = lazy(() => import('./pages/Lunch'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const AdminCompanies = lazy(() => import('./pages/AdminCompanies'));
const AdminCohorts = lazy(() => import('./pages/AdminCohorts'));
const AdminRules = lazy(() => import('./pages/AdminRules'));
const AuditLogs = lazy(() => import('./pages/AuditLogs'));

function RotaProtegida({ children }) {
  const sessao = localStorage.getItem('sessao_operador');
  return sessao ? children : <Navigate to="/login" replace />;
}

function LayoutComSidebar({ children }) {
  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden', background: '#f8fafc', margin: 0, padding: 0 }}>
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
          <Route path="/interviews" element={<RotaProtegida><LayoutComSidebar><Interviews /></LayoutComSidebar></RotaProtegida>} />
          <Route path="/interviews/:id" element={<RotaProtegida><LayoutComSidebar><InterviewDetail /></LayoutComSidebar></RotaProtegida>} />
            <Route path="/interviews/:id/pdf" element={<RotaProtegida><FichaPdf /></RotaProtegida>} />
          <Route path="/interviews/:id/edit" element={<RotaProtegida><LayoutComSidebar><InterviewEdit /></LayoutComSidebar></RotaProtegida>} />
          <Route path="/approvals" element={<RotaProtegida><LayoutComSidebar><Approvals /></LayoutComSidebar></RotaProtegida>} />
          <Route path="/lunch" element={<RotaProtegida><LayoutComSidebar><Lunch /></LayoutComSidebar></RotaProtegida>} />
          <Route path="/reports" element={<Navigate to="/home" replace />} />
          <Route path="/admin/users" element={<RotaProtegida><LayoutComSidebar><AdminUsers /></LayoutComSidebar></RotaProtegida>} />
          <Route path="/admin/companies" element={<RotaProtegida><LayoutComSidebar><AdminCompanies /></LayoutComSidebar></RotaProtegida>} />
          <Route path="/admin/cohorts" element={<RotaProtegida><LayoutComSidebar><AdminCohorts /></LayoutComSidebar></RotaProtegida>} />
          <Route path="/admin/rules" element={<RotaProtegida><LayoutComSidebar><AdminRules /></LayoutComSidebar></RotaProtegida>} />
          <Route path="/admin/audit" element={<RotaProtegida><LayoutComSidebar><AuditLogs /></LayoutComSidebar></RotaProtegida>} />

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
