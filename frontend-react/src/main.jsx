import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import './responsive.css'; // <-- ESTA LINHA APLICA OS ESTILOS GLOBAIS DA SIDEBAR

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);