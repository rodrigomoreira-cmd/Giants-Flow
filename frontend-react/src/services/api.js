const API_BASE = '/api';

export async function request(endpoint, options = {}) {
  const sessaoRaw = localStorage.getItem('sessao_operador');
  const sessao = sessaoRaw ? JSON.parse(sessaoRaw) : null;
  const token = sessao?.token;

  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers
  };

  const url = `${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const response = await fetch(url, {
    ...options,
    headers
  });

  if (response.status === 401) {
    localStorage.removeItem('sessao_operador');
    window.location.href = '/login';
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  const text = await response.text();
  let dados;
  try {
    dados = text ? JSON.parse(text) : {};
  } catch (e) {
    console.error('Resposta não-JSON recebida da API:', text);
    throw new Error(`Erro na API (${response.status}): Servidor retornou resposta inválida.`);
  }

  if (!response.ok) {
    throw new Error(dados.erro || dados.message || `Erro HTTP ${response.status}`);
  }

  return dados;
}

export const api = {
  get: (url) => request(url, { method: 'GET' }),
  post: (url, body) => request(url, { method: 'POST', body: JSON.stringify(body) }),
  put: (url, body) => request(url, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (url, body = {}) => request(url, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (url) => request(url, { method: 'DELETE' })
};
export default api;
