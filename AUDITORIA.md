# Auditoria de Segurança e Qualidade de Código
## Sistema de Gestão de Funil e Diagnósticos de Eventos

**Auditor:** Engenheiro Sênior (Revisão de Código Estática)
**Data:** 2026-11-16
**Escopo:** Revisão de código estática — sem alteração de arquivos, migrations ou instalações.
**Ambiente:** Node.js + Express + PostgreSQL (pg) + ioredis. Nenhum banco de teste ou Redis configurado localmente para execução de testes de integração.

---

## 5 Achados de Maior Risco (em ordem decrescente)

| # | Achado | Risco | Arquivo/Linha | Correção Sugerida |
|---|--------|-------|---------------|-------------------|
| 1 | **Sem banco de testes isolado** — Todos os testes de integração conectam no banco `evento_operacao` (produção). O comando `test:isolated` usa `DB_DATABASE=evento_test` mas o contêiner não roda PostgreSQL/Redis, então testes são impossíveis de executar localmente. | **Alto** | `package.json` linhas 9-11; `tests/` todos | Configurar Docker Compose ou script de setup para subir `postgres`+`redis` nos testes. Adicionar variáveis `TEST_DB_PASSWORD`, `TEST_REDIS_URL`. |
| 2 | **Race condition na validação de almoço** — A lógica de `liberadoAlmoco` (verifica `membro_giants || almoco_pago || cortesia_almoco`) é avaliada FORA do `SELECT ... FOR UPDATE` block em `clientes.routes.js` linhas 88-112. Se duas requisições chegarem simultâneas e a validação acontecer antes do lock ser efetivado, ambas podem passar e o `FOR UPDATE` apenas bloqueia a segunda leitura, mas o dano já ocorreu na validação de negócio. | **Alto** | `src/infrastructure/http/routes/clientes.routes.js` linhas 88-112 | Garantir que a validação de elegibilidade (liberadoAlmoco) aconteça DENTRO do mesmo `SELECT ... FOR UPDATE` block, ou usar `SELECT ... FOR UPDATE SKIP LOCKED`. |
| 3 | **Ausência de idempotência em webhooks de pagamento** — Não há verificação de assinatura com corpo bruto (`req.rawBody`) nem registro de eventos processados por ID único. Se o gateway reenviar o mesmo webhook, a proposta será gravada duas vezes. Não há chave de idempotency nos endpoints de pagamento. | **Alto** | `src/infrastructure/http/routes/propostas.routes.js` linhas 69-80; ausência de repository de eventos | Implementar tabela `webhook_events` com `id` único + hash do corpo. Verificar `stripe-signature` ou `mercadopago-webhook-signature` usando `req.rawBody`. Usar header `Idempotency-Key` nas chamadas ao gateway. |
| 4 | **Regras de negócio frágeis — validação de percentual baseada em string matching** — A função `isPercentual` nas `admin.routes.js` linhas 156-159 e no `CriarPropostaUseCase.js` linha 109-111 baseia-se em `chave` ou `nome` contendo a palavra "desconto" ou "taxa". Se alguém criar uma regra com chave `taxa_personalizada` sem a palavra "taxa" no nome, o teto de 100% não será aplicado. Além disso, o piso de entrada mínima de R$ 10.000 está codificado em dois lugares (`.routes/usuarios.js` linha 78 e `CriarPropostaUseCase.js` linha 44), descumprindo a rega "single source of truth". | **Médio** | `src/infrastructure/http/routes/admin.routes.js` linhas 156-159; `src/application/use-cases/proposta/CriarPropostaUseCase.js` linha 44; `src/infrastructure/http/routes/usuarios.routes.js` linha 78 | Centralizar todas as regras em um único lugar (service layer) e validar no repositório, não na rota. Criar enum/tabela de tipos de regra em vez de string matching. |
| 5 | **Variáveis de ambiente secretas sem marcação adequada** — `JWT_SECRET` e `DB_PASSWORD` estão no `.env` sem prefixo `NEXT_PUBLIC_`, `VITE_` ou `EXPO_PUBLIC_`. Embora o código do JWT lance erro fatal se `JWT_SECRET` não estiver definida em produção, a ausência de `.env.example` com classificação facilita o vazamento acidental para o front. | **Médio** | `.env` todas as linhas; `src/infrastructure/security/jwt.js` linha 9; `src/infrastructure/database/connection.js` linha 8 | Adicionar `.env.example` com `JWT_SECRET=***` e `DB_PASSWORD=***` marcados como secrets. Verificar se há alguma variável exposta acidentalmente no front. |

---

## Análise Detalhada por Etapa

### 1. Testes de Integração

**Configuração existente:**
- Framework: `vitest` + `supertest`
- Scripts: `npm test` (roda todos os `tests/*.test.js`), `npm run test:isolated` (usa `DB_DATABASE=evento_test`)
- Banco de teste: não configurado separadamente por padrão. O `test:isolated` muda o banco para `evento_test` mas o serviço de PostgreSQL não roda localmente.

**Resultados dos testes (tentativa com `node --test tests/*.test.js` sem serviços subidos):**
- ✅ 2 testes passam (login: rejeita sem e-mail, rejeita sem senha)
- ❌ 10 testes falham — principais causas:
  - `ENOTFOUND postgres`: banco de dados não está rodando
  - `ENOTFOUND redis`: cache Redis não está rodando
  - AssertionError: expected 401, got 500 (credenciais no teste de admin único bloqueiam por causa do lock advisory de admin)

**Fluxos críticos — cobertura de teste:**

| Fluxo | Testa rota de verdade? | Apenas mock? | Nenhum teste |
|-------|------------------------|--------------|--------------|
| Cadastro (usuários) | ✅ (usuarios.routes.js / rls.test.js) | ❌ | — |
| Login | ✅ (auth.test.js) | ❌ (falha por Redis/Postgres fora do ar) | — |
| Checkout (proposta) | ✅ (proposta.test.js) | ❌ (falha por DB fora do ar) | — |
| Assinatura (pagamento) | ❌ | ❌ | **Nenhum teste encontrado** |
| Webhooks | ❌ | ❌ | **Nenhum teste encontrado** |

---

### 2. Confiança no Cliente

**Regras de preço/desconto só no front (ou duplicadas):**
- As **regras comerciais** (teto de desconto, piso de entrada) são validadas no backend nas rotas `/regras/:id` e no caso de uso `CriarPropostaUseCase`, mas a lógica de `isPercentual` (linha 156-159 do admin.routes.js) é frágil: baseia-se em `chave` ou `nome` contendo a palavra "desconto" ou "taxa". Se alguém criar uma regra com chave `taxa_personalizada` sem a palavra "taxa" no nome, o teto de 100% não será aplicado.
- O **piso de entrada mínima** de R$ 10.000 que bloqueia a ficha como "Aguardando Aprovação" está codificado em dois lugares:
  1. `src/infrastructure/http/routes/usuarios.routes.js` linha 78 — validação no momento do cadastro/atualização de usuário
  2. `src/application/use-cases/proposta/CriarPropostaUseCase.js` linha 44 — validação ao emitir proposta
  Isso descumpre a regra "single source of truth". Se alguém alterar apenas um dos dois, a regra ficará inconsistente.

**Chaves e tokens em código de front ou variáveis para o navegador:**
- `JWT_SECRET` e `DB_PASSWORD` estão no `.env` sem prefixo `NEXT_PUBLIC_`, `VITE_` ou `EXPO_PUBLIC_`.
- **Verificado:** Não há `NEXT_PUBLIC_`, `VITE_` ou `EXPO_PUBLIC_` no `.env`. Todas as variáveis são consumidas apenas no backend (Express). Não há variáveis de front expostas.
- **Classificação:** pública por design = none; secreta = `JWT_SECRET`, `DB_PASSWORD`.

**Supabase / banco exposto por API:**
- O projeto usa PostgreSQL nativo via `pg` e `ioredis` para Redis. Não há Supabase.
- **RLS (Row Level Security):** O sistema usa `AsyncLocalStorage` (`rlsStorage`) para configurar `app.current_user_id` e `app.user_role` por conexão (server-side only). As rotas de fichas (`fichas.routes.js`) e auditoria (`auditoria.routes.js`) têm middleware RLS que seta o contexto.
- **Políticas observadas no código:**
  - O RLS é ativado via `SELECT set_config('app.current_user_id', $1, false)` e `SELECT set_config('app.user_role', $2, false)` a cada conexão.
  - Não vi definição de `CREATE POLICY` no `init.sql` — o PostgreSQL pode estar usando **políticas implícitas baseadas no `user_role`** através do `set_config`, ou pode estar com RLS desligado (default = off).
  - **Risco:** Se o RLS estiver desativado (`ALTER DATABASE evento_operacao SET default_rls = off`) ou as policies não compararem com `auth.uid()`, qualquer usuário conectado via JWT poderia ler/alterar dados de outros usuários.
- **Ação:** Verificar as policies ativas no banco: `SELECT polname, polcmd, polroles, polqualify FROM pg_policy WHERE polrelid = 'fichas'::regclass;` (ou as tabelas relevantes). Se `polqualify` for `true` ou as policies usarem `USING (true)` / `WITH CHECK (true)`, é risco crítico. Se policies existirem e compararem com `auth.uid()`, o isolamento está correito, mas o mecanismo de `set_config` não é o padrão RLS e pode causar confusão.

---

### 3. Race Condition

Trechos que lêem, decidem e depois gravam sobre recurso limitado:

| Recurso | Padrão Leitura-Decisão-Grava | Constraint/Atômica no Banco | Proteção em Memória (Redis/Lock) | Veredito |
|---------|------------------------------|-----------------------------|----------------------------------|----------|
| **Assento do Salão Lunch** (mesa/alocação) | `SELECT ... FOR UPDATE` → valida elegibilidade → `INSERT` com constraint `UNIQUE(mesa_alocada, assento_alocado, turma_id)` | ✅ Constraint `23505` (testado em `lunch.test.js`) — bloqueia 2ª requisição | Nenhum (constraint no DB resolve) | ✅ DB sozinho resolve se constraint existir. Porém validação de `liberadoAlmoco` acontece FORA do lock em 2 phases. |
| **Criar Proposta** | `SELECT ... FROM aplicacoes WHERE id = $1 FOR UPDATE` → valida etapa → calcula cashback/parcela → `INSERT` na tabela propostas | `FOR UPDATE` no aplicacao; transação ACID | Nenhum lock Redis — usa lock pessimista do PG sozinho | ✅ PG sozinho resolve via `FOR UPDATE` dentro de transação. |
| **Status do Último Admin** | `SELECT pg_advisory_xact_lock(987654321)` → COUNT(*) admins → UPDATE/DELETE | Lock advisory serializado no PG | Nenhum | ✅ PG sozinho resolve. |
| **Validar Almoço do Participante** (cortesia/giants/pago) | `SELECT ... FROM fichas WHERE id = $1 FOR UPDATE` → verifica `membro_giants || almoco_pago || cortesia_almoco` → UPDATE ficha | `FOR UPDATE` no cliente | Nenhum lock Redis | ⚠️ **Risco:** Se duas requisições chegarem simultâneas e a validação de `liberadoAlmoco` acontecer antes do `FOR UPDATE` ser efetivado, ambas podem passar. O `FOR UPDATE` bloqueia a segunda leitura, mas a lógica de `if (!liberadoAlmoco)` roda NO cliente da primeira requisição antes do segundo bloquear. |
| **Mesa (capacidade)** | `SELECT ... FROM mesas WHERE id = $1 FOR UPDATE` → verifica `ocupantesAtuais < capacidadeTotal` → `UPDATE` incrementando ocupantes | `FOR_UPDATE` + transação | Nenhum lock Redis distribuído | ✅ PG sozinho resolve via `FOR UPDATE` dentro de transação única (como visto em `AgendarEntrevistaUseCase`). |

**Conclusão Race Condition:** O PostgreSQL com `FOR UPDATE` dentro de transações isoladas resolve a maioria dos cenários. O único ponto fraco é a validação de elegibilidade de almoço (`liberadoAlmoco`) que é verificada logo após o `FOR UPDATE` ser liberado, em uma separação de stages que poderia ser unificada.

---

### 4. Idempotência

**Webhooks:**
- Não foi encontrado nenhum código que verifique assinatura de webhook usando o corpo bruto (`req.rawBody`).
- Não foi encontrado registro de eventos processados com ID único (tabela `webhook_events` não existe no `init.sql`).
- **Cenário:** Se o gateway de pagamento (provavelmente Stripe ou Mercado Pago) reenviar o mesmo webhook, não há como detectar duplicata. Cada envio criaria uma nova proposta ou alteraria o status da ficha indevidamente.

**Chave de idempotency no gateway de pagamento:**
- Não encontrada nenhuma chamada com `Idempotency-Key` header ou campo nos bodies enviados aos gateways.
- O endpoint `POST /propostas` não aceita uma chave de idempotency do cliente.
- **Risco:** Reenvio de webhook ou retry do gateway poderia criar propostas duplicadas com valores idênticos ou diferentes.

---

### 5. Separação de Responsabilidades

**Arquivos mais longos e mistura de camadas:**

| Arquivo | Tamanho (linhas) | Mistura de camadas |
|---------|------------------|-------------------|
| `src/infrastructure/http/routes/admin.routes.js` | ~196 | ⚠️ **Candidato Nº 1** — Mistura definição de tabelas (`CREATE TABLE IF NOT EXISTS regras_comerciais`), validação de negócio (tetos, percentuais), e acesso direto ao banco (`pool.query`). O endpoint `/regras/:id` tem lógica de validação de percentual/desconto que deveria estar em uma camada de serviço/domain separada. |
| `src/infrastructure/http/routes/usuarios.routes.js` | ~211 | Mistura CRUD de usuários, validação de "último admin" (blockade logic), e queries SQL diretas. O lock advisory `pg_advisory_xact_lock(987654321)` está diretamente na rota, acoplando preocupação de concorrência ao controller. |
| `src/application/use-cases/proposta/CriarPropostaUseCase.js` | ~82 | Caso de uso puro com `BEGIN`/`COMMIT`, `FOR UPDATE` e lógica de negócio (cálculo de cashback, transição de etapa). Bem estruturado — regras de negócio estão aqui e não espalhadas nas rotas. |

**Recomendação:** Extrair todas as validações de regras comerciais (tetos, pisos, percentuais) de `admin.routes.js` para um novo serviço `RegrasComerciaisService` ou para o próprio domínio. As rotas deveriam apenas chamar `servico.atualizarRegra(id, dados)` e não conter lógica de `if (isPercentual) > 100`.

---

## Resumo Executivo

### 5 Falhas Críticas (Risk High)

1. **Sem banco de testes isolado** — testes impossíveis de rodar localmente (ENOTFOUND postgres/redis)
2. **Race condition na validação de almoço** — `liberadoAlmoco` verificado fora do `FOR UPDATE` atômico
3. **Sem idempotência em webhooks** — reenvio duplicaria propostas/pagamentos
4. **Regras de negócio frágeis** — validação de percentual baseada em string matching de nome/chave; piso de R$ 10.000 duplicado em dois lugares
5. **Variáveis secretas sem marcação** — falta de `.env.example` com classificação

### Próximo passo recomendado

**Rodar o prompt de correção #3: "implementar idempotência em webhooks e gateway de pagamento"**. Este é o risco de maior impacto financeiro direto (cobrança duplicada) e tem solução mais direta (tabela de eventos processados + verificação de assinatura com `req.rawBody`). As outras correções envolvem reestruturação de banco ou lógica de corrida que são mais arriscadas de mudar sem testes rodando.