CREATE TABLE passengers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE vehicles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    plate VARCHAR(10) NOT NULL UNIQUE,
    model VARCHAR(100),
    capacity INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE access_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    passenger_id INT NOT NULL,
    vehicle_id INT NOT NULL,
    action ENUM('ENTRY', 'EXIT') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (passenger_id)
        REFERENCES passengers(id),

    FOREIGN KEY (vehicle_id)
        REFERENCES vehicles(id)
);