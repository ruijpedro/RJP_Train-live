-- Executar uma vez na base de dados D1 existente antes do Deploy V2.9.
CREATE TABLE IF NOT EXISTS train_observations (
 train_number TEXT PRIMARY KEY,
 last_station TEXT NOT NULL,
 service_day TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
