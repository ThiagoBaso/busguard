-- Apply once to databases initialized before the supervisor role was added.
ALTER TABLE users
  MODIFY role ENUM('admin', 'driver', 'responsible', 'supervisor') NOT NULL;
