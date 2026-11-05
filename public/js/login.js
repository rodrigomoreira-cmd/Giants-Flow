// public/js/login.js
document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // Se já possuir sessão válida, redireciona diretamente ao Hub
  const sessaoAtiva = localStorage.getItem('sessao_operador');
  if (sessaoAtiva) {
    try {
      const dados = JSON.parse(sessaoAtiva);
      if (dados && dados.id) {
        window.location.href = '/hub';
        return;
      }
    } catch (e) {
      localStorage.removeItem('sessao_operador');
    }
  }

  const formLogin = document.getElementById('formLogin');
  const inputEmail = document.getElementById('inputEmail');
  const inputSenha = document.getElementById('inputSenha');
  const btnEntrar = document.getElementById('btnEntrar');
  const boxAlertaErro = document.getElementById('boxAlertaErro');
  const textoAlertaErro = document.getElementById('textoAlertaErro');
  const btnToggleSenha = document.getElementById('btnToggleSenha');
  const iconeToggleSenha = document.getElementById('iconeToggleSenha');

  // Alternar visualização da senha
  btnToggleSenha?.addEventListener('click', () => {
    const isPassword = inputSenha.getAttribute('type') === 'password';
    inputSenha.setAttribute('type', isPassword ? 'text' : 'password');
    iconeToggleSenha.textContent = isPassword ? 'visibility_off' : 'visibility';
  });

  function exibirErro(mensagem) {
    if (textoAlertaErro && boxAlertaErro) {
      textoAlertaErro.textContent = mensagem;
      boxAlertaErro.style.display = 'flex';
    }
  }

  function ocultarErro() {
    if (boxAlertaErro) {
      boxAlertaErro.style.display = 'none';
    }
  }

  inputEmail?.addEventListener('input', ocultarErro);
  inputSenha?.addEventListener('input', ocultarErro);

  formLogin?.addEventListener('submit', async (e) => {
    e.preventDefault();
    ocultarErro();

    const email = inputEmail.value.trim();
    const senha = inputSenha.value.trim();

    if (!email || !senha) {
      exibirErro('Por favor, informe seu e-mail e senha.');
      return;
    }

    btnEntrar.disabled = true;
    const textoOriginal = btnEntrar.querySelector('.btn-text').textContent;
    btnEntrar.querySelector('.btn-text').textContent = 'Autenticando...';

    try {
      // Tenta rota /api/auth/login e fallback /api/login
      let res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha }),
      });

      if (res.status === 404) {
        res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, senha }),
        });
      }

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.erro || data.mensagem || 'Credenciais inválidas.');
      }

      // Normaliza payload do operador
      const operador = data.usuario || data.operador || data;

      localStorage.setItem(
        'sessao_operador',
        JSON.stringify({
          id: operador.id || 1,
          nome: operador.nome || 'Operador',
          email: operador.email || email,
          papel: operador.papel || operador.role || 'admin',
        })
      );

      btnEntrar.querySelector('.btn-text').textContent = 'Acesso Autorizado!';
      setTimeout(() => {
        window.location.href = '/hub';
      }, 400);
    } catch (err) {
      console.error('Erro de autenticação:', err.message);
      exibirErro(err.message || 'Falha na conexão com o servidor.');
      btnEntrar.disabled = false;
      btnEntrar.querySelector('.btn-text').textContent = textoOriginal;
    }
  });
});
