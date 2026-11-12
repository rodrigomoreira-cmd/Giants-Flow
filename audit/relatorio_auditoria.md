# Auditoria de Segurança e Qualidade de Código - Sistema de Eventos

**Data da auditoria:** Wed Nov 11 2026  
**Auditor:** Engenheiro Sênior  
**Alcance:** Análise de código, testes, configurações e possíveis vulnerabilidades

---

## ETAPA 1: Testes de Integração

### 1.1 Ferramenta de teste configurada

- **Framework:** `vitest` (via `node --test` em arquivos `.test.js`) - configurado no `package.json` como `test: "node --test tests/*.test.js"`
- **Bibliotecas:** `supertest`, `bcryptjs`, `pg` (PostgreSQL)
- **Comando para rodar tudo:** `npm test` ou `node --test tests/*.test.js`

### 1.2 Execução dos testes

Rodamos os testes individuais disponíveis:

#### ✅ auth.test.js
- **1 teste passou:** "Deve rejeitar login sem preenchimento de e-mail (400)" - status 400, validação de e-mail obrigatório
- **1 teste falhou/timed out:** "Deve rejeitar credenciais com e-mail inexistente sem conceder admin (401)" - timeout de conexão com PostgreSQL

#### ❌ lunch.test.js
- **1 teste falhou:** "PostgreSQL deve barrar alocação simultânea no mesmo assento do Lunch (Constraint 23505)" - **Connection terminated due to connection timeout**
- O PostgreSQL não estava disponível na execução local

#### ⏸️ proposta.test.js
- Não executado devido a problemas de conexão com banco de dados
- Contém teste completo de fluxo de proposta com cashback, cálculo de parcelas e avanço de etapa

### 1.3 Banco de teste separado do produção?

- Não configurado explicitamente. Todos os testes utilizam a mesma conexão PostgreSQL definida no `.env` (ou defaults):
  - `DB_HOST`: `app_postgres` (nome de serviço Docker)
  - `DB_USER`: `admin_local`
  - `DB_PASSWORD`: `senha_segura_evento` (padrão em código)
  - `DB_DATABASE`: `evento_operacao`
- **Risco:** Testes podem alterar dados de produção se rodados contra ambiente errado.

### 1.4 Lista de fluxos críticos e cobertura de teste

| Fluxo Crítico | Tem teste de rota real? | Tem teste com mock? | Nenhum teste |
|---------------|-------------------------|---------------------|--------------|
| **Cadastro** (novo usuário/ficha) | ✅ `proposta.test.js` usa `pool.query` real | ❌ | ⚠️ Cadastro puro de ficha |
| **Login** | ✅ `auth.test.js` POST `/auth/login` com bcrypt real | ❌ | ❌ |
| **Checkout / Proposta** | ✅ `proposta.test.js` fluxo completo cashback | ❌ | ❌ |
| **Assinatura / Lunch** | ✅ `lunch.test.js` constraint 23505 | ❌ | ❌ |
| **Webhooks** | ❌ | ❌ | ✅ **NÃO EXISTE** |

**Conclusão:** A cobertura de testes integra é **parcial**. Os testes que existem batem em rotas reais com banco de dados, o que é bom para validação de integração, mas:
1. A falha na conexão PostgreSQL impede a execução completa
2. Não há testes de unidade com mock para isolar lógica de negócio
3. Fluxo de webhooks não tem cobertura nenhuma
4- O teste de cadastro de usuário novo não foi encontrado como teste dedicado

---

## ETAPA 2: Confiança no Cliente

### 2.1 Regras de preço, desconto, permissão só no front

#### Regras comerciais configuráveis via AdminRules.jsx
- Tabela `regras_comerciais` no banco com 4 regras padrão:
  1. **desconto_maximo_autonomo** (R$ 0.00): "Qualquer desconto superior a R$ 0 exige aprovação de alçada." - Se valor > 0, qualquer desconto exige aprovação.
  2. **entrada_minima_padrao** (R$ 10.000,00): "Entradas inferiores a este piso bloqueiam a ficha como Aguardando Aprovação." - Validação de piso de entrada.
  3. **taxa_almoco_empresa** (R$ 1.000,00): "Valor oficial da taxa de almoço cobrado por CNPJ participante." - Usada na regra de liberação de almoço.
  4. **permite_boleto_saldo** (0): "Se 0, qualquer saldo via boleto bancário exige autorização prévia." - 0 = bloqueado, 1 = liberado.

#### Acesso ao front
- O frontend (`AdminRules.jsx`) permite edição desses valores através de inputs numéricos
- As regras são salvas via PUT `/regras/:id` na API
- **⚠️ CRITICAL:** Não foi encontrada validação no backend que impeça valores inválidos de serem salvos além das verificações já presentes no próprio endpoint `/regras/:id` (admin.routes.js). O frontend envia o valor e o backend valida, mas se alguém chamar a API diretamente com valores extremos, as validações existem mas são "defensivas".

### 2.2 Chaves e tokens em código de front

#### Varredura para variáveis públicas
Procurado padrões: `NEXT_PUBLIC_`, `VITE_`, `EXPO_PUBLIC_`

| Arquivo | Padrão encontrado | Classificação |
|---------|------------------|---------------|
| `frontend-react/src/services/api.js` | `API_BASE = '/api'` | Pública por design (rota relativa) |
| `frontend-react/vite.config.js` | Nenhuma variável exposta | — |
| `frontend-react/src/context/TurmaContext.jsx` | `localStorage` para sessão | Secreta (armazenada no navegador) |
| Qualquer outro arquivo | **Nenhum `NEXT_PUBLIC_`, `VITE_`, `EXPO_PUBLIC_` encontrado** | — |

#### Classificação de secrets encontradas

| Segredo | Local | Classificação |
|---------|-------|---------------|
| `senha_segura_evento` | `src/infrastructure/database/connection.js` line 12 | **Secreta por descuido** - default hardcoded no código |
| `DB_PASSWORD` | `src/infrastructure/database/connection.js` line 12 | Secreta - usada em produção |
| Token de auth no front | `frontend-react/src/pages/Login.jsx` - `localStorage.setItem('sessao_operador', ...)` | **Secreta** - armazenada no `localStorage` do navegador |
| Nenhuma chave API (Stripe, Google Maps, etc.) | — | — |

**Recomendação:** Mover `DB_PASSWORD` e quaisquer outros secrets para variáveis de ambiente reais (`.env` production) e nunca commitar defaults hardcoded.

### 2.3 Tabelas expostas com RLS desligado

#### Status do Row Level Security (RLS)

O sistema utiliza **PostgreSQL nativo** (pacote `pg`), **NÃO Supabase**.

**Não foram encontradas políticas RLS** (`CREATE POLICY`) no arquivo `init.sql`. O mecanismo de RLS está sendo implementado **aplicacionalmente** através do `AsyncLocalStorage` em `src/infrastructure/database/connection.js`.

#### Como funciona o RLS atual (customizado)

1. **Middleware `/api`** (server.js lines 57-87):
   - Extrai o token Bearer do header `Authorization`
   - Se token matcher `token-(auth|admin)-(\d+)`, extrai o ID numérico
   - Consulta `SELECT id, papel, ativo FROM usuarios WHERE id = $1`
   - Se usuário ativo, define `req.usuario`
   - Chama `rlsStorage.run({ userId, userRole }, next)` para armazenar contexto na conexão

2. **Interceptador de conexão** (connection.js lines 24-52):
   - No `pool.connect`, lê o store do `AsyncLocalStorage`
   - Se há `userId`, executa: `SELECT set_config('app.current_user_id', $1, false)` e `set_config('app.user_role', $2, false)`
   - No `client.release`, limpa os configs (`set_config` para strings vazias)

#### ⚠️ Críticas de Segurança do RLS

| Issue | Descrição |
|-------|-----------|
| **RLS provavelmente desabilitado** | Sem `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` em init.sql. As tabelas padrão do PostgreSQL têm RLS OFF. |
| **Policies inexistentes** | Sem `CREATE POLICY` para tabelas: `usuarios`, `fichas`, `propostas`, `aplicacoes`, `mesas`. |
| **Comparação com auth.uid()** | O código usa `set_config('app.current_user_id', ...)` em vez do padrão `USING (auth.uid())`. Isso é compatível com PostgreSQL nativo, mas depende de cada query filtrar por esse config. |
| **Políticas permissivas por design** | Se alguém habilitar RLS sem policies específicas, o comportamento padrão é **bloquear TUDO** (`SELECT/INSERT/UPDATE/DELETE` falham para tabelas com RLS enabled e nenhuma policy). |
| **Risco de bypass** | O `set_config` é session-level. Se uma conexão abrir sem passar pelo middleware de auth (ex: requisição direta ao banco via ferramenta de admin), o `app.current_user_id` será NULL e as queries que o filtrem retornarão zero linhas — mas também não haverá erro, apenas dados "invisíveis". |
| **Comparação direta com auth.uid()** | Não acontece. O sistema usa uma config customizada `app.current_user_id` que deve ser comparada manualmente em cada query (ou não ser comparada, dependendo da implementação). |

#### Tabelas expostas (existentes no banco)

| Tabela | RLS Status (provável) | Políticas |
|--------|----------------------|-----------|
| `usuarios` | **Off** (padrão) | Nenhuma |
| `turmas` | **Off** (padrão) | Nenhuma |
| `mesas` | **Off** (padrão) | Nenhuma |
| `aplicacoes` | **Off** (padrão) | Nenhuma |
| `produtos` | **Off** (padrão) | Nenhuma |
| `propostas` | **Off** (padrão) | Nenhuma |
| `analises_financeiras` | **Off** (padrão) | Nenhuma |
| `regras_comerciais` | **Off** (padrão) | Nenhuma (dados sensíveis de negócio expostos) |

**Recomendação urgente:** Implementar policies RLS nativas ou garantir que o aplicativo sempre defina `app.current_user_id` antes de qualquer query de leitura/escrita. Sem policies, qualquer usuário conectado pode ler/todas as tabelas.

---

## ETAPA 3: Race Condition

### 3.1 Race conditions identificadas no código

#### ✅ High Priority: Concurrency de assentos no Lunch (lunch.test.js)

**Arquivo:** `tests/lunch.test.js`  
**Cenário:** Dois inserts simultâneos no mesmo assento/mesa da sala de almoço

```javascript
// O teste espera que o PostgreSQL retorne constraint 23505 (unique violation)
```

**Análise:**
- O teste insere uma ficha no assento 2 da mesa 14 da turma 5555
- Em seguida, tenta um insert simultâneo no mesmo assento/turma
- **Esperado:** O PostgreSQL deveria rejeitar com `error.code === '23505'`
- **Risco atual:** O teste falhou por **timeout de conexão** (PostgreSQL não rodando), mas a lógica de constraint parece correta **se** a constraint existir

**Verificação necessária:**
```sql
-- Verificar se constraint existe:
SELECT DISTINCT constraint_name FROM information_schema.table_constraints 
WHERE table_name = 'fichas' AND constraint_type = 'UNIQUE';
```

**Risco se constraint não existir:** Dois participantes poderiam ser alocados no mesmo assento simultaneamente, causando sobrecapacidade no salão.

**Recomendação:** Garantir que haja um UNIQUE constraint sobre `(mesa_id, assento_alocado)` ou `(turma_id, mesa_alocada, assento_alocado)` no modelo de dados.

---

#### ⚠️ Medium Priority: Race condition na revogação de admin

**Arquivo:** `src/infrastructure/http/routes/usuarios.routes.js` lines 72-79 e 130-138

**Cenário:** Dois usuários/admin tentando modificar o último admin simultaneamente

```javascript
// Code pattern observado:
// 1. Check: SELECT COUNT(*) FROM usuarios WHERE papel = 'admin' AND ativo = true
// 2. Update: UPDATE usuarios SET ativo = false WHERE id = $1
```

**Análise:**
- Há uma janela de tempo entre o `SELECT COUNT(*)` e o `UPDATE` onde outra transação pode acontecer
- **Cenário de corrida:**
  - Request A: COUNT = 1 (único admin)
  - Request B: COUNT = 1 (único admin)  
  - Request A: PROCEDES para desativar admin (agora 0 admins)
  - Request B: PROCEDES para desativar admin (também para 0 admins) ← **Corrupção de estado**
- O código tem `BEGIN`/`COMMIT` mas o check e update são **queries separadas**, não atomadas.

**Risco:** Desativação acidental do último administrador, bloqueando todo o acesso ao sistema.

**Recomendação:** Usar uma única query atômica ou advisory lock PostgreSQL (`SELECT pg_advisory_xact(12345)`) ao redor do check-and-update.

---

#### ⚠️ Medium Priority: Cálculo de cashback não atômico

**Arquivo:** `src/domain/entities/Proposta.js` lines 46-56 e `CriarPropostaUseCase.js` lines 8-13

**Cenário:** Cálculo de `valorParcela` baseado em `valorTotal - valorEntrada - cashback / quantidadeParcelas`

**Análise:**
- O cálculo acontece no **lado da aplicação** (Node.js), **não no banco de dados**
- **Risco:** Se dois requests calcularem a proposta simultaneamente com os mesmos dados, ambos terão o mesmo resultado — o que pode ser desejado ou não, mas o problema é quando os dados mudam entre o cálculo e o persistimento
- O `PropostaRepository.salvar` faz um INSERT simples, não há `UPSERT` com cálculo no DB
- O teste `proposta.test.js` valida o cálculo correto, mas não testa concorrência

**Risco:** Cálculo inconsistente se houver alterações entre o momento do cálculo e o salvamento. O cashback de R$ 1.000 poderia ser aplicado errado em cenários de alta concorrência.

**Recomendação:** Mover o cálculo de `valorParcela` para o nível do banco de dados usando uma VIEW ou trigger, ou usar `SELECT ... FOR UPDATE` antes do INSERT.

---

#### ⚠️ Lower Priority: Regras comerciais under concurrent update

**Arquivo:** `src/infrastructure/http/routes/admin.routes.js` lines 132-185

**Cenário:** Duas requisições UPDATE simultâneas em `regras_comerciais`

**Análise:**
- O endpoint usa `BEGIN`/`COMMIT` com `SELECT ... FOR UPDATE` no row
- **Proteção:** O `FOR UPDATE` faz lock de linha, impedindo que duas transações modifiquem a mesma regra simultaneamente
- **Validações aplicadas:** Teto de 100% para percentuais, teto de R$ 10.000.000 para valores monetários, bloqueio de valores negativos
- **Risco:** Baixo — o row lock protege contra lost updates, mas a lógica de validação (`isPercentual`, comparações) é aplicada depois do lock e poderia ser refinada

**Conclusão:** Mais segura que as outras, mas a validação de `isPercentual` baseia-se no `chave` ou `nome` da regra, o que é frágil se alguém renamear a regra.

---

#### ⚠️ Lower Priority: Ficha creation concorrente

**Arquivo:** `src/infrastructure/http/routes/fichas.routes.js` lines 24-54

**Cenário:** Dois usuários cadastrando fichas simultaneamente com dados semelhantes

**Análise:**
- INSERT simples sem conflict resolution
- **Risco:** Two fichas with same email/phone could be created if there's no unique constraint
- O código valida `!nome || !telefone` como obrigatórios, mas não há verificação de duplicidade de email/CPF na inserção (essa validação existe em `usuarios.routes.js` mas não em `fichas.routes.js`)

**Recomendação:** Adicionar constraint UNIQUE em `cnpj` ou `email` na tabela `fichas` se a negócio exige.

---

### 3.2 Resumo de risco de race condition

| Prioridade | Componente | Risco | Probabilidade | Impacto |
|------------|-----------|-------|---------------|---------|
| **High** | Lunch seat constraint 23505 | Double-booking de assentos | Média (depende de constraint existir) | Médio (sobrecapacidade salão) |
| **Medium** | Revogação de admin último | Sistema sem admin | Baixa/Média | **Crítico** (bloqueia todo acesso) |
| **Medium** | Cálculo cashback | Valores de parcela incorretos | Baixa | Médio (prejuízo financeiro) |
| **Lower** | Regras comerciais concurrentas | Valores inconsistentes | Baixa | Baixa (config de negócio) |
| **Lower** | Ficha creation | Dados duplicados | Baixa | Baixa |

---

## CONSOLIDADO: Recomendações de Segurança

### Críticas (corrigir imediatamente):

1. **RLS desabilitado** — Tabelas inteiras expostas sem políticas de segurança. Implementar `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` com policies adequadas, ou migrar para o pattern `set_config` com aplicação consistente.

2. **Secret hardcoded** — `DB_PASSWORD: 'senha_segura_evento'` em `connection.js`. Mover para `.env` production e rotacionar senha.

3. **Race condition no admin last-user** — Janela de tempo entre check COUNT e UPDATE pode desativar o último admin. Implementar lock atomizado.

4. **Testes com timeout** — PostgreSQL não disponível na execução local. Configurar container Docker ou containerized testes.

### Altas (corrigir em breve):

5. **Constraint UNIQUE no Lunch** — Garantir constraint sobre assentos/mesas para evitar double-booking.

6. **Validação de regras no backend** — As regras de desconto/mínimo existentes no frontend também devem ser validadas/server-side de forma mais robusta.

### Médias (melhoria de qualidade):

7. **Mover cálculo de cashback para o BD** — Usar triggers ou VIEW para garantir consistência matemática.

8. **Cobertura de testes** — Adicionar testes de unidade com mock para lógica de negócio isolada dos DB calls.

### Baixas (arquitetura):

9. **Remover defaults de senha do código** — Todos os defaults de `process.env.X || 'padrao'` devem ser removidos ou substituídos por validação de erro se variável não definida.

10. **Webhooks** — Implementar testes/validação para endpoints de webhook caso existam integrações externas.