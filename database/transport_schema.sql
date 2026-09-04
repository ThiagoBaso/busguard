-- Tabelas complementares do sistema de transporte escolar
-- MySQL 8.0+
-- Dependencias: users(id), passengers(id), vehicles(id), drivers(id), addresses(id)

CREATE TABLE IF NOT EXISTS routes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255),
    shift ENUM('morning', 'afternoon', 'evening') NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS supervisors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_supervisors_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS route_stops (
    id INT AUTO_INCREMENT PRIMARY KEY,
    route_id INT NOT NULL,
    address_id INT NOT NULL,
    sequence INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_route_stops_route
        FOREIGN KEY (route_id) REFERENCES routes(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_route_stops_address
        FOREIGN KEY (address_id) REFERENCES addresses(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT uq_route_stop_sequence UNIQUE (route_id, sequence)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS route_passengers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    route_id INT NOT NULL,
    passenger_id INT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_route_passengers_route
        FOREIGN KEY (route_id) REFERENCES routes(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_route_passengers_passenger
        FOREIGN KEY (passenger_id) REFERENCES passengers(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT uq_route_passenger UNIQUE (route_id, passenger_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS driver_vehicles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    driver_id INT NOT NULL,
    vehicle_id INT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_driver_vehicles_driver
        FOREIGN KEY (driver_id) REFERENCES drivers(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_driver_vehicles_vehicle
        FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT uq_driver_vehicle UNIQUE (driver_id, vehicle_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS trips (
    id INT AUTO_INCREMENT PRIMARY KEY,
    route_id INT NOT NULL,
    vehicle_id INT NOT NULL,
    driver_id INT NOT NULL,
    supervisor_id INT,
    trip_date DATE NOT NULL,
    started_at DATETIME NULL,
    finished_at DATETIME NULL,
    status ENUM('scheduled', 'in_progress', 'completed', 'cancelled')
        NOT NULL DEFAULT 'scheduled',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_trips_route
        FOREIGN KEY (route_id) REFERENCES routes(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_trips_vehicle
        FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_trips_driver
        FOREIGN KEY (driver_id) REFERENCES drivers(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_trips_supervisor
        FOREIGN KEY (supervisor_id) REFERENCES supervisors(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    INDEX idx_trips_date (trip_date),
    INDEX idx_trips_route_date (route_id, trip_date),
    INDEX idx_trips_vehicle_date (vehicle_id, trip_date),
    INDEX idx_trips_driver_date (driver_id, trip_date)
) ENGINE=InnoDB;
