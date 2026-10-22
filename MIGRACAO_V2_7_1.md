# RJP Train Live V2.7.1 — Migração D1

O Worker V2.7 original consultava `devices` e `deliveries`, mas a tua base D1 contém `push_subscriptions`, `train_alerts` e `notification_history`. Esta versão utiliza as tabelas existentes.

**Antes de publicar o Worker**, executar na consola D1, uma vez de cada vez:

```sql
ALTER TABLE push_subscriptions ADD COLUMN device_secret TEXT;
ALTER TABLE push_subscriptions ADD COLUMN rules TEXT NOT NULL DEFAULT '[]';
```

A tabela `train_alerts` foi preservada para futura normalização; a V2.7.1 guarda as regras por dispositivo na coluna `rules`, compatível com a app.

Depois, publicar o Worker através do workflow `Deploy RJP Live Proxy` (necessita dos secrets CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID), ou copiar `worker/worker.js` para o editor Cloudflare e publicar. Confirmar que o cron de 1 minuto está configurado na Cloudflare.

A chave privada Firebase deve ficar apenas no Secret `FIREBASE_SERVICE_ACCOUNT`, nunca no GitHub nem na WebApp. Para Android é necessário incluir `google-services.json` na compilação e configurar o plugin Gradle Google Services; esta versão não contém credenciais privadas. **Não assumir que push está operacional até a APK receber token FCM e ser testado um envio real.**
