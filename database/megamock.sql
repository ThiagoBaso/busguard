-- ============================================================
-- MOCK DATA — Sistema de Controle de Passageiros de Ônibus
-- Transporte escolar via reconhecimento facial
-- ============================================================
-- Observação: os tipos ENUM não estavam totalmente legíveis no PDF.
-- Assumi valores plausíveis para o domínio (indicados nos comentários).
-- Ajuste os nomes dos ENUMs conforme o que foi realmente definido
-- no seu schema (users.role, cnh.status_cnh, trips.status,
-- access_events.action, routes.shift).
-- ============================================================

-- ------------------------------------------------------------
-- 1) users
-- role ENUM assumido: 'admin','motorista','responsavel','supervisor'
-- ------------------------------------------------------------
INSERT INTO users (id, name, email, password_hash, role, created_at, phone, cpf, rg) VALUES
(1, 'Admin Sistema',      'admin@transportescolar.com',    '$2y$10$hashadminexemplo000000000000000000', 'admin',       '2026-01-05 08:00:00', '14998010001', '11122233344', '223344556'),
(2, 'João Pereira',       'joao.pereira@transportescolar.com', '$2y$10$hashmotorista1exemplo00000000000', 'motorista',   '2026-01-06 09:15:00', '14998010002', '22233344455', '334455667'),
(3, 'Carlos Menezes',     'carlos.menezes@transportescolar.com', '$2y$10$hashmotorista2exemplo00000000000', 'motorista',   '2026-01-06 09:20:00', '14998010003', '33344455566', '445566778'),
(4, 'Maria Fernandes',    'maria.fernandes@email.com',      '$2y$10$hashresponsavel1exemplo0000000000', 'responsavel', '2026-01-10 10:00:00', '14998010004', '44455566677', '556677889'),
(5, 'Ana Cristina Souza', 'ana.souza@email.com',            '$2y$10$hashresponsavel2exemplo0000000000', 'responsavel', '2026-01-10 10:10:00', '14998010005', '55566677788', '667788990'),
(6, 'Pedro Almeida',      'pedro.almeida@transportescolar.com', '$2y$10$hashsupervisorexemplo000000000', 'supervisor',  '2026-01-07 08:30:00', '14998010006', '66677788899', '778899001');

-- ------------------------------------------------------------
-- 2) cnh (carteira de motorista) — status_cnh ENUM assumido: 'valida','vencida','suspensa'
-- ------------------------------------------------------------
INSERT INTO cnh (id_cnh, numero_registro, numero_espelho, categoria, data_emissao, data_validade, data_primeira_habilitacao, uf_emissao, observacoes, status_cnh, atualizado_em) VALUES
(1, '12345678900', 'ESP001234', 'D', '2020-03-15', '2030-03-15', '2010-06-01', 'SP', 'Nenhuma restrição registrada.', 'valida', '2026-01-06 09:00:00'),
(2, '98765432100', 'ESP005678', 'D', '2019-07-22', '2029-07-22', '2008-02-14', 'SP', 'Curso de transporte escolar concluído.', 'valida', '2026-01-06 09:05:00');

-- ------------------------------------------------------------
-- 3) drivers (motoristas)
-- ------------------------------------------------------------
INSERT INTO drivers (id, users_id, cnh_id_cnh) VALUES
(1, 2, 1),
(2, 3, 2);

-- ------------------------------------------------------------
-- 4) vehicles (veículos)
-- ------------------------------------------------------------
INSERT INTO vehicles (id, plate, model, capacity, created_at) VALUES
(1, 'ABC1D23', 'Mercedes-Benz Sprinter 415', 20, '2026-01-08 08:00:00'),
(2, 'XYZ9E87', 'Volkswagen 9-160 Escolar',    25, '2026-01-08 08:05:00');

-- ------------------------------------------------------------
-- 5) driver_vehicles (vínculo motorista ↔ veículo)
-- ------------------------------------------------------------
INSERT INTO driver_vehicles (id, driver_id, vehicle_id, active, assigned_at) VALUES
(1, 1, 1, 1, '2026-01-09 08:00:00'),
(2, 2, 2, 1, '2026-01-09 08:10:00');

-- ------------------------------------------------------------
-- 6) supervisors (supervisores de viagem)
-- ------------------------------------------------------------
INSERT INTO supervisors (id, user_id, created_at) VALUES
(1, 6, '2026-01-07 08:35:00');

-- ------------------------------------------------------------
-- 7) addresses (endereços — usados por passageiros e paradas de rota)
-- ------------------------------------------------------------
INSERT INTO addresses (id, cep, rua, numero, bairro, cidade, estado, complemento, created_at) VALUES
(1, '17601-020', 'Rua das Palmeiras',   '120', 'Jardim América',   'Tupã', 'SP', 'Casa',             '2026-01-11 09:00:00'),
(2, '17601-150', 'Rua Sete de Setembro','345', 'Vila Nova',        'Tupã', 'SP', 'Apto 12, Bloco B', '2026-01-11 09:05:00'),
(3, '17602-030', 'Avenida Brasil',      '890', 'Centro',           'Tupã', 'SP', NULL,               '2026-01-11 09:10:00'),
(4, '17601-020', 'Rua das Palmeiras',   '120', 'Jardim América',   'Tupã', 'SP', 'Ponto de embarque', '2026-01-11 09:15:00'),
(5, '17601-150', 'Rua Sete de Setembro','345', 'Vila Nova',        'Tupã', 'SP', 'Ponto de embarque', '2026-01-11 09:20:00'),
(6, '17602-200', 'Rua da Escola',       '500', 'Centro',           'Tupã', 'SP', 'Escola Municipal Monteiro Lobato', '2026-01-11 09:25:00');

-- ------------------------------------------------------------
-- 8) passengers (crianças/alunos transportados)
-- ------------------------------------------------------------
INSERT INTO passengers (id, name, birth_date, rg, cpf, facial, created_at, addresses_id) VALUES
(1, 'Lucas Fernandes',  '2016-04-12', '501234567', '10120334455', 'facial_template_base64_lucas...',  '2026-01-12 10:00:00', 1),
(2, 'Beatriz Souza',    '2015-09-03', '502345678', '20231445566', 'facial_template_base64_beatriz...','2026-01-12 10:05:00', 2),
(3, 'Rafael Fernandes', '2018-11-27', '503456789', '30342556677', 'facial_template_base64_rafael...', '2026-01-12 10:10:00', 1);

-- ------------------------------------------------------------
-- 9) responsi... (responsáveis legais)
-- ------------------------------------------------------------
INSERT INTO responsibles (id, addresses_id, users_id) VALUES
(1, 1, 4),
(2, 2, 5);

-- ------------------------------------------------------------
-- 10) passengers... (vínculo passageiro ↔ responsável)
-- ------------------------------------------------------------
INSERT INTO passengers_responsibles (id, passengers_id, responsible_id) VALUES
(1, 1, 1),  -- Lucas -> Maria
(2, 3, 1),  -- Rafael (irmão do Lucas) -> Maria
(3, 2, 2);  -- Beatriz -> Ana

-- ------------------------------------------------------------
-- 11) routes (rotas) — shift ENUM assumido: 'matutino','vespertino','noturno'
-- ------------------------------------------------------------
INSERT INTO routes (id, name, description, shift, active, created_at) VALUES
(1, 'Rota Manhã - Jardim América/Vila Nova', 'Rota escolar matutina atendendo Jardim América e Vila Nova até a Escola Municipal Monteiro Lobato', 'matutino', 1, '2026-01-13 07:00:00'),
(2, 'Rota Tarde - Retorno Centro',            'Rota escolar vespertina de retorno da escola para os bairros', 'vespertino', 1, '2026-01-13 07:10:00');

-- ------------------------------------------------------------
-- 12) route_stops (paradas de cada rota, em ordem de sequência)
-- ------------------------------------------------------------
INSERT INTO route_stops (id, route_id, address_id, sequence, created_at) VALUES
(1, 1, 4, 1, '2026-01-13 07:15:00'), -- embarque Jardim América
(2, 1, 5, 2, '2026-01-13 07:16:00'), -- embarque Vila Nova
(3, 1, 6, 3, '2026-01-13 07:17:00'), -- chegada na escola
(4, 2, 6, 1, '2026-01-13 07:20:00'), -- saída da escola
(5, 2, 4, 2, '2026-01-13 07:21:00'), -- desembarque Jardim América
(6, 2, 5, 3, '2026-01-13 07:22:00'); -- desembarque Vila Nova

-- ------------------------------------------------------------
-- 13) route_passeng... (vínculo passageiro ↔ rota)
-- ------------------------------------------------------------
INSERT INTO route_passengers (id, route_id, passenger_id, active, created_at) VALUES
(1, 1, 1, 1, '2026-01-14 08:00:00'),
(2, 1, 2, 1, '2026-01-14 08:01:00'),
(3, 1, 3, 1, '2026-01-14 08:02:00'),
(4, 2, 1, 1, '2026-01-14 08:03:00'),
(5, 2, 2, 1, '2026-01-14 08:04:00'),
(6, 2, 3, 1, '2026-01-14 08:05:00');

-- ------------------------------------------------------------
-- 14) trips (viagens realizadas) — status ENUM assumido: 'agendada','em_andamento','finalizada','cancelada'
-- ------------------------------------------------------------
INSERT INTO trips (id, route_id, vehicle_id, driver_id, supervisor_id, trip_date, started_at, finished_at, status, created_at) VALUES
(1, 1, 1, 1, 1, '2026-09-01', '2026-09-01 06:45:00', '2026-09-01 07:30:00', 'finalizada',   '2026-09-01 06:00:00'),
(2, 2, 1, 1, 1, '2026-09-01', '2026-09-01 17:00:00', '2026-09-01 17:40:00', 'finalizada',   '2026-09-01 16:30:00'),
(3, 1, 1, 1, 1, '2026-09-02', '2026-09-02 06:47:00', NULL,                  'em_andamento', '2026-09-02 06:00:00');

-- ------------------------------------------------------------
-- 15) access_eve... (eventos de embarque/desembarque)
-- action ENUM assumido: 'embarque','desembarque'
-- ------------------------------------------------------------
INSERT INTO access_events (id, passenger_id, vehicle_id, action, created_at) VALUES
(1, 1, 1, 'embarque',    '2026-09-01 06:48:00'),
(2, 2, 1, 'embarque',    '2026-09-01 06:52:00'),
(3, 3, 1, 'embarque',    '2026-09-01 06:53:00'),
(4, 1, 1, 'desembarque', '2026-09-01 07:25:00'),
(5, 2, 1, 'desembarque', '2026-09-01 07:26:00'),
(6, 3, 1, 'desembarque', '2026-09-01 07:27:00'),
(7, 1, 1, 'embarque',    '2026-09-02 06:50:00'),
(8, 2, 1, 'embarque',    '2026-09-02 06:54:00');