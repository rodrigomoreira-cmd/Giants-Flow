INSERT INTO turmas (codigo, nome, ativa) VALUES 
('TURMA-2026-1', 'Imersão de Vendas Executivas', true),
('TURMA-2026-2', 'Mastermind Alta Performance', true)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO usuarios (nome, email, papel, ativo) VALUES 
('Carlos Captador', 'carlos.captador@evento.com', 'captador', true),
('Mariana Entrevistadora', 'mariana.entrevistas@evento.com', 'entrevistador', true),
('Roberto Entrevistador', 'roberto.entrevistas@evento.com', 'entrevistador', true),
('Fernanda Financeiro', 'fernanda.financeiro@evento.com', 'financeiro', true)
ON CONFLICT (email) DO NOTHING;

INSERT INTO mesas (numero, capacidade_total) VALUES 
(1, 4),
(2, 4),
(3, 6),
(4, 4)
ON CONFLICT (numero) DO NOTHING;

INSERT INTO produtos (nome, valor_base, ativo) VALUES 
('Mentoria Individual Premium', 25000.00, true),
('Grupo de Implementação Anual', 15000.00, true),
('Acesso Mastermind Fechado', 50000.00, true);