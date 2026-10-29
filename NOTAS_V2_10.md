# RJP Train Live V2.10.0 — atualização conservadora

- ETA por estação e contagem de minutos (aproximada, baseada na hora local do dispositivo).
- Percurso com número da última estação conhecida quando os dados permitem identificar a estação.
- Indicação de antiguidade da última consulta.
- Atualização da ficha selecionada com novos dados sem ter de a fechar.

## Proteção das notificações

`src/push.js`, `src/alerts.js`, `worker/worker.js`, `worker/wrangler.toml`, migrations, Android e GitHub Actions **não foram alterados**. Mantêm-se as chaves localStorage e os endpoints. Não desinstalar a APK anterior; atualizar por cima com o mesmo applicationId e assinatura. O segredo FIREBASE_SERVICE_ACCOUNT permanece exclusivamente na Cloudflare.

**Limite importante:** os alertas remotos continuam a funcionar com a lógica da V2.9.2. O ETA desta versão é informativo e NÃO foi integrado na programação de push do Worker, para evitar regressões. Os horários podem ser apenas horários de relógio sem data de serviço, pelo que a contagem de minutos é apenas aproximada.
