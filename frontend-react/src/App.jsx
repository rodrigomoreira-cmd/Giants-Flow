import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import Sidebar from './components/Sidebar';
import Header from './components/Header';
import { TurmaProvider } from './context/TurmaContext';

import Login from './pages/Login';
import Home from './pages/Home';
import Companies from './pages/Companies';
import CompanyDetail from './pages/CompanyDetail';
import Interviews from './pages/Interviews';
import InterviewDetail from './pages/InterviewDetail';
import InterviewEdit from './pages/InterviewEdit';
import Approvals from './pages/Approvals';
import Lunch from './pages/Lunch';
import AdminUsers from './pages/AdminUsers';
import AdminCompanies from './pages/AdminCompanies';
import AdminCohorts from './pages/AdminCohorts';
import AdminRules from './pages/AdminRules';

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
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <TurmaProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          {/* Rotas Oficiais GIANTS Flow */}
          <Route path="/home" element={<RotaProtegida><LayoutComSidebar><Home /></LayoutComSidebar></RotaProtegida>} />
          <Route path="/companies" element={<RotaProtegida><LayoutComSidebar><Companies /></LayoutComSidebar></RotaProtegida>} />
          <Route path="/companies/:id" element={<RotaProtegida><LayoutComSidebar><CompanyDetail /></LayoutComSidebar></RotaProtegida>} />
          <Route path="/interviews" element={<RotaProtegida><LayoutComSidebar><Interviews /></LayoutComSidebar></RotaProtegida>} />
          <Route path="/interviews/:id" element={<RotaProtegida><LayoutComSidebar><InterviewDetail /></LayoutComSidebar></RotaProtegida>} />
          <Route path="/interviews/:id/edit" element={<RotaProtegida><LayoutComSidebar><InterviewEdit /></LayoutComSidebar></RotaProtegida>} />
          <Route path="/approvals" element={<RotaProtegida><LayoutComSidebar><Approvals /></LayoutComSidebar></RotaProtegida>} />
          <Route path="/lunch" element={<RotaProtegida><LayoutComSidebar><Lunch /></LayoutComSidebar></RotaProtegida>} />
          <Route path="/reports" element={<Navigate to="/home" replace />} />
          <Route path="/admin/users" element={<RotaProtegida><LayoutComSidebar><AdminUsers /></LayoutComSidebar></RotaProtegida>} />
          <Route path="/admin/companies" element={<RotaProtegida><LayoutComSidebar><AdminCompanies /></LayoutComSidebar></RotaProtegida>} />
          <Route path="/admin/cohorts" element={<RotaProtegida><LayoutComSidebar><AdminCohorts /></LayoutComSidebar></RotaProtegida>} />
          <Route path="/admin/rules" element={<RotaProtegida><LayoutComSidebar><AdminRules /></LayoutComSidebar></RotaProtegida>} />

          {/* Redirecionamentos de Compatibilidade */}
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/fichas" element={<Navigate to="/companies" replace />} />
          <Route path="/entrevistas" element={<Navigate to="/interviews" replace />} />
          <Route path="/propostas" element={<Navigate to="/approvals" replace />} />
          <Route path="/mesas" element={<Navigate to="/lunch" replace />} />

          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </TurmaProvider>
    </BrowserRouter>
  );
}