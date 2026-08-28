SELECT
    access_events.id,
    passengers.name AS passenger,
    vehicles.plate AS vehicle,
    access_events.action,
    access_events.created_at
FROM access_events
JOIN passengers
    ON access_events.passenger_id = passengers.id
JOIN vehicles
    ON access_events.vehicle_id = vehicles.id;