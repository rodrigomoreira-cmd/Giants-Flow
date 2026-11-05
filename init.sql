-- Garante a base dedicada ao n8n na mesma instância Postgres
SELECT 'CREATE DATABASE n8n_db'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'n8n_db')\gexec

-- Conecta na base principal da aplicação
\c evento_operacao;

-- 1. ENUMS (Máquina de Estados Estrita)
CREATE TYPE user_role AS ENUM ('captador', 'entrevistador', 'financeiro', 'admin');
CREATE TYPE etapa_funil AS ENUM (
    'ficha_preenchida', 
    'em_entrevista', 
    'proposta_liberada', 
    'em_analise_financeira', 
    'aprovado_financeiro', 
    'vendido', 
    'reprovado'
);
CREATE TYPE turno_tipo AS ENUM ('almoco', 'jantar');
CREATE TYPE status_turno AS ENUM ('bloqueado', 'pendente', 'aprovado', 'reprovado', 'nao_compareceu');
CREATE TYPE status_prop AS ENUM ('em_digitacao', 'enviado_financeiro', 'aprovado', 'recusado', 'vendido');
CREATE TYPE status_serasa_tipo AS ENUM ('pendente', 'sem_restricao', 'com_restricao', 'reprovado');

-- 2. TABELA: Usuários Operacionais
CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    papel user_role NOT NULL,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. TABELA: Turmas / Eventos
CREATE TABLE IF NOT EXISTS turmas (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    nome VARCHAR(100) NOT NULL,
    ativa BOOLEAN DEFAULT TRUE
);

-- 4. TABELA: Mesas do Salão
CREATE TABLE IF NOT EXISTS mesas (
    id SERIAL PRIMARY KEY,
    numero INT UNIQUE NOT NULL,
    capacidade_total INT NOT NULL DEFAULT 4
);

-- 5. TABELA: Fichas de Aplicação (Clientes)
CREATE TABLE IF NOT EXISTS aplicacoes (
    id SERIAL PRIMARY KEY,
    turma_id INT REFERENCES turmas(id),
    responsavel_ficha_id INT REFERENCES usuarios(id),
    nome_completo VARCHAR(150) NOT NULL,
    nome_cracha VARCHAR(80),
    empresa VARCHAR(150) NOT NULL,
    cnpj VARCHAR(18),
    telefone VARCHAR(25) NOT NULL,
    email VARCHAR(150),
    etapa_atual etapa_funil DEFAULT 'ficha_preenchida',
    dados_diagnostico JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. TABELA: Entrevistas
CREATE TABLE IF NOT EXISTS entrevistas (
    id SERIAL PRIMARY KEY,
    aplicacao_id INT UNIQUE REFERENCES aplicacoes(id) ON DELETE CASCADE,
    mesa_id INT REFERENCES mesas(id),
    entrevistador_id INT REFERENCES usuarios(id),
    status_almoco status_turno DEFAULT 'pendente',
    status_jantar status_turno DEFAULT 'bloqueado',
    liberar_proposta BOOLEAN DEFAULT FALSE,
    observacoes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. TABELA: Catálogo de Produtos
CREATE TABLE IF NOT EXISTS produtos (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    valor_base DECIMAL(12,2) NOT NULL,
    ativo BOOLEAN DEFAULT TRUE
);

-- 8. TABELA: Propostas Comerciais
CREATE TABLE IF NOT EXISTS propostas (
    id SERIAL PRIMARY KEY,
    aplicacao_id INT REFERENCES aplicacoes(id),
    produto_id INT REFERENCES produtos(id),
    valor_total DECIMAL(12,2) NOT NULL,
    valor_entrada DECIMAL(12,2) DEFAULT 0.00,
    cashback DECIMAL(12,2) DEFAULT 0.00,
    metodo_pagamento VARCHAR(30) NOT NULL,
    quantidade_parcelas INT DEFAULT 1,
    valor_parcela DECIMAL(12,2) NOT NULL,
    status status_prop DEFAULT 'em_digitacao',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. TABELA: Análise Financeira
CREATE TABLE IF NOT EXISTS analises_financeiras (
    id SERIAL PRIMARY KEY,
    proposta_id INT UNIQUE REFERENCES propostas(id) ON DELETE CASCADE,
    analista_id INT REFERENCES usuarios(id),
    status_serasa status_serasa_tipo DEFAULT 'pendente',
    decisao_financeiro VARCHAR(30) DEFAULT 'pendente',
    parecer TEXT,
    analisado_em TIMESTAMP
);

-- Índices de Otimização
CREATE INDEX IF NOT EXISTS idx_aplicacoes_nome ON aplicacoes(nome_completo);
CREATE INDEX IF NOT EXISTS idx_aplicacoes_empresa ON aplicacoes(empresa);
CREATE INDEX IF NOT EXISTS idx_aplicacoes_turma ON aplicacoes(turma_id);
CREATE INDEX IF NOT EXISTS idx_propostas_status ON propostas(status);