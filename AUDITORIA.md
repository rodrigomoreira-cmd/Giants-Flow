# Auditoría de Seguridad y Arquitectura - sistema-eventos

**Auditante:** Engenheiro Sênior (revisão de código estática — sem alterações em arquivos de produção, sem migrations, sem instalações)

---

## Resumo Executivo

Foram identificados **5 achados de risco crítico** na ordem de prioridade. O projeto é um sistema de gestão de funil e diagnósticos de clientes em eventos, construído com Node.js/Express (back-end) e React (front-end), usando PostgreSQL e Redis. Não há configuração de testes automatizados, nenhuma variável pública secreta detectada e o controle de concorrência depende quase exclusivamente de locks otimistas no banco de dados.

---

## 5 Achados de Maior Risco (em ordem)

| # | Achado | Risco | Arquivo / Linha | Descrição |
|---|--------|-------|----------------|-----------|
| 1 | **ApiController — Monólito de 745 linhas** | **Alto** | `src/infrastructure/http/controllers/ApiController.js` | O controlador único mistura autenticação, gestão de usuários, módulo pitch, métricas do hub, alocação de mesas, fichas, entrevistas, propostas e financeiro. Qualquer mudança de risco afeta múltiplas funcionalidades sem isolamento. O arquivo é o principal ponto de falha e dificultaria auditorias de segurança futuras. |
| 2 | **Sem testes automatizados** | **Alto** | Projeto inteiro | Zero arquivos de teste (.test., .spec., pasta tests). Não há como validar regressões, mudanças de regras de negócio ou compatibilidade de APIs. O login, fluxo de propostas e regras comerciais não são cobertos por testes unitários ou de integração. |
| 3 | **Race condition no fluxo de almoço/ocupação de mesas** | **Médio-Alto** | `src/infrastructure/http/routes/operacoes.routes.js` (linha 393-442) e `frontend-react/src/pages/Lunch.jsx` | O frontend valida `liberadoAlmoço` baseada em `membro_giants`, `almoco_pago` ou `valor_almoco >= 1000`, mas essa validação é feita do lado do cliente/in-memory. Se duas requisições simultâneas chegarem para alocar o mesmo cliente na mesma mesa, o `FOR UPDATE` no endpoint `/entrevistas/agendar` evita gravar dados inconsistentes, mas a lógica de "liberado" ainda depende do valor lido no momento da requisição — não há constraint única no banco que impeça duas mesas de ultrapassar capacidade simultaneamente sem o lock ser alcançado a tempo. |
| 4 | **Regras de negócio expostas no front sem proteção** | **Médio** | `frontend-react/src/pages/AdminRules.jsx`; `frontend-react/src/services/lunch-rules.service.js` | O admin pode editar valores de `desconto_maximo_autonomo`, `entrada_minima_padrao`, `taxa_almoco_empresa` diretamente no frontend (inputs numéricos). Embora o endpoint `PUT /regras/:id` tenha validação de teto (100% para percentuais, 10.000.000 para valores absolutos) e validação de não-negativo, a confiar apenas na validação do servidor após a edição do frontend cria um risco de "validade aparente" — se alguém chamar a API diretamente (curl, Postman), não há limite de taxa no client que impeça valores inválidos. Além disso, o `VALIDO_MINIMO_ALMOCO = 1000` está hardcoded no serviço front-end. |
| 5 | **Idempotência de webhooks e pagamentos inexistente** | **Médio** | `src/infrastructure/http/routes/operacoes.routes.js` (linha 245-285) | O endpoint `POST /financeiro/analisar` tem um check básico de idempotência (`if (atual[0].status_aprovacao === novoStatus)`), mas não usa *idempotency key* (chave de repetição) nem verifica assinatura de corpo. Se o mesmo evento de pagamento chegar 2 vezes ao gateway, o status poderá ser reescrito ou a lógica de aprovação/recusa ser acionada erroneamente. Não há registro de eventos processados com ID único. |

---

## Etapa 1: Testes de Integração

- **Ferramenta de teste configurada?** Não. Não foram encontrados arquivos de configuração de teste (Jest, Mocha, Vitest, etc.), nem arquivos `.test.`, `.spec.`, nem pasta `tests/`.
- **Banco de teste separado?** Não verificado — não há configuração de ambiente de teste.
- **Comando para rodar tudo?** Não existe. Os scripts do `package.json` só têm `start` e `dev`.
- **Resultado:** Zero testes encontrados. Não é possível afirmar passos/falhas.

**Fluxos críticos e cobertura:**

| Fluxo | Teste de rota real? | Teste com mock? | Cobertura |
|-------|---------------------|-----------------|-----------|
| Cadastro (ficha/cliente) | Não | Não | ❌ |
| Login | Não | Não | ❌ |
| Checkout / pagamento | Não | Não | ❌ |
| Assinatura / recorrente | Não | Não | ❌ |
| Webhooks | Não | Não | ❌ |

---

## Etapa 2: Confiança no Cliente

### Regras de preço, desconto, permissão, papel de admin ou limite de plano só no front

- **AdminRules.jsx** expõe inputs numéricos para `valor_numerico` de regras comerciais (desconto máximo, entrada mínima, taxa de almoço). Embora o backend valide límites (`> 100%` para percentuais, `> 10.000.000` para absolutos, `não negativo`), a edição pelo front-end remove qualquer barreira para quem tiver acesso à página admin.
- **Lunch.jsx** usa `VALIDO_MINIMO_ALMOCO = 1000` hardcoded no serviço front-end para elegibilidade de almoço.

### Chaves e tokens em código de front ou variáveis para navegador

- **NEXT_PUBLIC_ / VITE_ / EXPO_PUBLIC_:** Nenhuma variável com esses prefixes foi encontrada em `.env`, `.env.example` nem no código fonte.
- **Tokens:** O login emite `token-auth-{id}` e `jwt-session-{id}-{timestamp}` que são armazenados em `localStorage` (`sessao_operador`) e enviados via header `Authorization: Bearer ${token}`. Não há tokens "por design" expostos — são gerenciados pelo cliente, mas não são secrets em tempo de build.

### Tabelas expostas com RLS desligado / policies permissivas

- O projeto usa **PostgreSQL nativo** (via `pg`), **não Supabase**.
- No `init.sql`, nenhuma instrução `ENABLE ROW LEVEL SECURITY` nem `CREATE POLICY` foi encontrada.
- Por padrão, o PostgreSQL inicia com **RLS OFF**. Não há policies definidas no código ou SQL de inicialização.
- **Impacto:** Todas as tabelas (`usuarios`, `propostas`, `aplicacoes`, etc.) estão abertas a leitura/escrita conectada pelo app. Se alguém tiver acesso direto ao banco (ou se o RLS for ligado posteriormente sem policies), teria acesso a todos os dados.
- **Policies inexistentes:** Não há policies `USING (true)` ou `WITH CHECK (true)` nem regras que não comparam com `auth.uid()`, pois não há RLS nem supabase auth. O controle de acesso é feito via aplicação (tokens, roles `captador`, `entrevistador`, `financeiro`, `admin`).

---

## Etapa 3: Race Condition

Para cada recurso limitado, análise de 2 requisições simultâneas:

| Recurso | Com 2 reqs simultâneas | Constraint/Atômica/Lock? | Banco sozinho resolveria? |
|---------|-----------------------|--------------------------|---------------------------|
| **Estoque / vagas de mesa** (endpoint `/entrevistas/agendar`) | O `FOR UPDATE` no PostgreSQL impede que ambas leiam o mesmo estado. Uma bloqueia até a outra commitar. Porém, a validação `liberadoAlmoco` lida no momento da leitura — se ambas passarem pela liberação antes do commitar, a segunda ainda seria bloqueada pelo lock. | ✅ `FOR UPDATE` no query dentro de `BEGIN`/`COMMIT` (operacoes.routes.js:405-413). Também há validação `mesas.tem_entrevistador` e `liberadoAlmoco` lidas do row. | **Sim** — o `SELECT ... FOR UPDATE` é um lock de linha nativo do PostgreSQL. Se a aplicação sempre usá-lo, o banco resolve sozinho. O risco está se algum código bypassar o lock. |
| **Cupom / saldo / crédito** (atualização de cashback) | O endpoint `PUT /clientes/:id` usa `BEGIN`/`COMMIT` com `FOR UPDATE` (operacoes.routes.js:209-235). Race condition é evitada pelo lock de linha. | ✅ `SELECT ... FOR UPDATE` + transação explícita. | **Sim** — lock de linha + transação garantem atomicidade. |
| **Permissão / papel de admin** (atualização de usuário) | O endpoint `PATCH /usuarios/:id/papel` usa `BEGIN`/`COMMIT` com `FOR UPDATE` + verificação do último admin (operacoes.routes.js:306-343). | ✅ Lock de linha + verificação de contagem de admins no mesmo transaction. | **Sim** — o banco previne remoção do último admin. |
| **Convite / limite de plano** | Não encontrado fluxo específico de "convite" com race condition. O fluxo de proposta (`POST /financeiro/analisar`) tem `FOR UPDATE` + check de status idempotente (linha 270-272). | ✅ `SELECT ... FOR UPDATE` dentro de transação. | **Sim** — porém, o check de idempotência é fraco (apenas compara status). |

**Conclusão geral:** O banco de dados (PostgreSQL) sozinho resolveria os race conditions **desde que** todo acesso crítico use `SELECT ... FOR UPDATE` dentro de transações. O risco é a dependência de lock em memória / validação prévia no frontend (como no fluxo de almoço do Lunch.jsx), que poderia ser pulada se alguém chamar a API diretamente.

---

## Etapa 4: Idempotência

### Webhooks recebidos

- **Não verificado:** Não há nenhum roteador de webhooks no código. Não há endpoint que receba notificações de pagadores externos (Stripe, Pagar.me, etc.). Não há verificação de assinatura com corpo bruto (`req.body` ou `Buffer`). **Não há como garantir idempotência para webhooks porque o recurso não existe.**

### Chamadas ao gateway de pagamento

- Não há integração com gateway de pagamento externo (Stripe, PayPal, Mercado Pago etc.).
- O endpoint `POST /financeiro/analisar` tem um check esporádico de idempotência:
  ```javascript
  if (atual[0].status_aprovacao === novoStatus) {
    await client.query('COMMIT');
    return res.json({ mensagem: 'Operação já processada (idempotente).', status: novoStatus });
  }
  ```
- **Problema:** Isso só funciona se a mesma requisição idêntica for enviada 2 vezes seguidas pelo mesmo cliente. Não há `Idempotency-Key` header, nem tabela de eventos processados com ID único. Se o sistema externo reenviar com levemente corpos diferentes, o check falha e a operação será processada novamente.

---

## Etapa 5: Separação de Responsabilidades

### Arquivos mais longos e mistura de camadas

| Arquivo | Linhas | Mistura de? |
|---------|--------|-------------|
| `src/infrastructure/http/controllers/ApiController.js` | **745** | ✅ Tela + regra de negócio + acesso a banco + serviço externo |
| `frontend-react/src/pages/Lunch.jsx` | ~1100 | ✅ Tela + regra de negócio (validação de almoço) + UI |
| `src/infrastructure/http/routes/operacoes.routes.js` | 482 | ✅ Rotas + regra de negócio + queries diretas ao banco |

### Candidato nº 1 para refatorar: `ApiController.js`

Este é o maior arquivo e o mais crítico. Ele mistura:

- **Autenticação** (login, verificação de senha)
- **Gestão de usuários** (criar, editar, remover, alterar papel/status)
- **Módulo pitch** (dados da oferta, condições de palco, upload de imagem)
- **Cockpit do hub** (métricas de faturamento, taxa de conversão, mix de produtos)
- **Carregamento de dados iniciais** (turmas, usuários, mesas, produtos)
- **Mesas e cadeiras** (CRUD de mesas, alteração de capacidade, desalocação)
- **Fichas de clientes** (criar, listar, editar ficha)
- **Entrevistas** (agendar, registrar resultado, desvincular mesa)
- **Propostas** (criar, listar, marcar vendido)
- **Financeiro** (listar propostas, analisar financeira, concretizar venda)

**Sugestão de refatoração:** Extrair cada domínio em seu próprio controlador/use case:
- `AuthController` (já existe separado)
- `UsuarioController`
- `PropostaController`
- `FinanceiroController`
- `EntrevistaController`
- `FichaController` (já existe)
- `RegrasComerciaisController`

---

## 5 Prompts de Correção — Qual Rodar Primeiro

**1. Refatorar ApiController.js — Extrair domínios em controladores separados**
- **Por que primeiro:** É o achado de maior risco (monólito de 745 linhas). Facilita futuras auditorias de segurança, reduz acoplamento e torna o código testável. Sem esta mudança, qualquer correção em um domínio (ex: validação de pagamento) rischa quebrar outro (ex: login). É a base para os outros fixes.

**2. Adicionar testes automatizados (jest/vitest) para fluxos críticos**
- **Por que segundo:** Sem testes, não há garantia de que as correções funcionam ou não quebram nada. Após refatorar o ApiController, os novos controladores podem ser testados isoladamente.

**3. Implementar proteção race condition no fluxo de almoço (front + back)**
- **Por que terceiro:** O frontend valida `liberadoAlmoço` in-memory; o backend usa `FOR UPDATE` mas a lógica de negócio de "liberado" deveria ter uma constraint única no banco ou ser mais rigorosa. Corrigir após a refatoração do controlador permite isolar o fluxo.

**4. Adicionar idempotência ao gateway de pagamento / webhooks**
- **Por que quarto:** Não há webhooks no sistema. Quando integrar com um gateway externo, precisarás de chave de idempotência e registro de eventos processados.

**5. Implementar RLS no PostgreSQL com policies adequadas**
- **Por que quinto:** Como o banco é usado via app (não direto), o risco é baixo, mas boas práticas exigem RLS ativo policies que comparam com `auth.uid()` ou roles equivalentes. Pode ser feito depois da refatoração.

---

## Conclusão

O sistema funciona para o caso de uso atual, mas carece de:

1. **Testes automatizados** (zero cobertura)
2. **Separação de responsabilidades** (ApiController é um monólito)
3. **Idempotência real** para webhooks/pagamentos (não existe)
4. **Validação de regras comerciais** não dependente apenas de validação server-side após edição front-end

O próximo passo recomendado é **prompt 1**: refatorar o `ApiController.js` para separar os domínios. Isso permite que os outros problemas sejam atacados de forma isolada e segura.