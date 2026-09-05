-- ============================================================
-- RESET — Limpa todas as tabelas antes de rodar o mock_data.sql
-- Ordem: filhos primeiro, pais por último (inverso da ordem de insert)
-- ============================================================

SET SQL_SAFE_UPDATES = 0;

DELETE FROM access_events;
DELETE FROM route_passengers;
DELETE FROM route_stops;
DELETE FROM routes;
DELETE FROM passengers_responsibles;
DELETE FROM responsibles;
DELETE FROM passengers;
DELETE FROM addresses;
DELETE FROM trips;
DELETE FROM supervisors;
DELETE FROM driver_vehicles;
DELETE FROM vehicles;
DELETE FROM drivers;
DELETE FROM cnh;
DELETE FROM users;

-- ------------------------------------------------------------
-- Reseta os contadores AUTO_INCREMENT (MySQL) para os IDs
-- voltarem a começar do 1, batendo com o mock_data.sql
-- ------------------------------------------------------------
ALTER TABLE access_events        AUTO_INCREMENT = 1;
ALTER TABLE route_passengers     AUTO_INCREMENT = 1;
ALTER TABLE route_stops          AUTO_INCREMENT = 1;
ALTER TABLE routes               AUTO_INCREMENT = 1;
ALTER TABLE passengers_responsibles AUTO_INCREMENT = 1;
ALTER TABLE responsibles         AUTO_INCREMENT = 1;
ALTER TABLE passengers           AUTO_INCREMENT = 1;
ALTER TABLE addresses            AUTO_INCREMENT = 1;
ALTER TABLE trips                AUTO_INCREMENT = 1;
ALTER TABLE supervisors          AUTO_INCREMENT = 1;
ALTER TABLE driver_vehicles      AUTO_INCREMENT = 1;
ALTER TABLE vehicles             AUTO_INCREMENT = 1;
ALTER TABLE drivers              AUTO_INCREMENT = 1;
ALTER TABLE cnh                  AUTO_INCREMENT = 1;
ALTER TABLE users                AUTO_INCREMENT = 1;