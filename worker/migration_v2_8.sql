-- Executar uma única vez na consola Cloudflare D1, antes de publicar o Worker V2.8.
CREATE TABLE IF NOT EXISTS push_test_queue (
 device_id TEXT PRIMARY KEY,
 due_at TEXT NOT NULL
);
