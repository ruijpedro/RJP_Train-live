CREATE TABLE IF NOT EXISTS devices (
 id TEXT PRIMARY KEY, secret TEXT NOT NULL, token TEXT NOT NULL,
 rules TEXT NOT NULL DEFAULT '[]', updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS deliveries (
 device_id TEXT NOT NULL, alert_key TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(device_id,alert_key)
);
CREATE INDEX IF NOT EXISTS idx_deliveries_created ON deliveries(created_at);
