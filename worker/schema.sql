-- Executar UMA VEZ na consola D1 existente, após as 3 tabelas já criadas.
ALTER TABLE push_subscriptions ADD COLUMN device_secret TEXT;
ALTER TABLE push_subscriptions ADD COLUMN rules TEXT NOT NULL DEFAULT '[]';
-- A tabela train_alerts fica disponível para evolução dos alertas por estação/comboio.
-- O Worker V2.7.1 mantém regras JSON por dispositivo para compatibilidade com a APK V2.7.
