/* docker compose exec mysql mysql -uapp_user -p */

INSERT INTO passengers (name)
VALUES
    ('João'),
    ('Maria'),
    ('Pedro'),
    ('Ana');

INSERT INTO vehicles (plate, model, capacity)
VALUES
    ('ABC1D23', 'Mercedes Sprinter', 20),
    ('XYZ4E56', 'Iveco Daily', 25);

INSERT INTO access_events (
    passenger_id,
    vehicle_id,
    action
)
VALUES (
    1,
    1,
    'ENTRY'
);

INSERT INTO access_events (
    passenger_id,
    vehicle_id,
    action
)
VALUES (
    2,
    1,
    'ENTRY'
);

INSERT INTO access_events (
    passenger_id,
    vehicle_id,
    action
)
VALUES (
    3,
    2,
    'ENTRY'
);

show 