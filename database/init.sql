
-- =========================================
-- PASSAGEIROS
-- =========================================

CREATE TABLE passengers (
    id INT AUTO_INCREMENT PRIMARY KEY,

    name VARCHAR(100) NOT NULL,
    birth_date DATE NOT NULL,
    rg VARCHAR(20) NOT NULL UNIQUE,
    cpf VARCHAR(14) NOT NULL UNIQUE,
    facial TEXT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- =========================================
-- RESPONSÁVEIS
-- =========================================

CREATE TABLE responsaveis (
    id INT AUTO_INCREMENT PRIMARY KEY,

    cpf VARCHAR(14) NOT NULL UNIQUE,
    nome VARCHAR(100) NOT NULL,
    rg VARCHAR(20) NOT NULL,
    email VARCHAR(150) NOT NULL,
    telefone VARCHAR(20) NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- =========================================
-- ENDEREÇOS
-- =========================================

CREATE TABLE enderecos (
    id INT AUTO_INCREMENT PRIMARY KEY,

    cep VARCHAR(10) NOT NULL,
    rua VARCHAR(150) NOT NULL,
    numero VARCHAR(20) NOT NULL,
    bairro VARCHAR(100) NOT NULL,
    cidade VARCHAR(100) NOT NULL,
    estado VARCHAR(2) NOT NULL,
    complemento VARCHAR(150) NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- =========================================
-- VEÍCULOS
-- =========================================

CREATE TABLE vehicles (
    id INT AUTO_INCREMENT PRIMARY KEY,

    plate VARCHAR(10) NOT NULL UNIQUE,
    model VARCHAR(100),
    capacity INT NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- =========================================
-- EVENTOS DE ACESSO
-- =========================================

CREATE TABLE access_events (
    id INT AUTO_INCREMENT PRIMARY KEY,

    passenger_id INT NOT NULL,
    vehicle_id INT NOT NULL,

    action ENUM('ENTRY', 'EXIT') NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (passenger_id)
        REFERENCES passengers(id)
        ON DELETE CASCADE,

    FOREIGN KEY (vehicle_id)
        REFERENCES vehicles(id)
        ON DELETE CASCADE
);


CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'driver', 'responsible') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);