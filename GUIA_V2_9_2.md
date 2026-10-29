# RJP Train Live V2.9.2 — ETA por estação

## Novidade
Na ficha de um comboio, consultar os horários das estações e a chegada estimada (ETA). Se a fonte não fornecer uma estimativa explícita, calcula-se o ETA a partir do horário previsto + atraso atual. Indica-se sempre a origem do valor. Sem dados suficientes, surge «indisponível».

## Preservação das notificações
- `src/push.js`, `src/alerts.js`, `worker/worker.js`, `worker/wrangler.toml` e `capacitor.config.json` mantidos sem alterações.
- As chaves localStorage de regras e registos de alerta não mudaram.
- Não substituir, eliminar ou voltar a configurar `FIREBASE_SERVICE_ACCOUNT` na Cloudflare.
- Instalar a atualização por cima da aplicação existente, sem desinstalar nem limpar dados.
- Após instalar, verificar que os alertas existentes continuam listados e executar «Testar push remoto (60 segundos)».

## Limitações
O ETA calculado propaga o atraso atual para as paragens seguintes; não é uma previsão operacional validada nem considera recuperação de tempo. A informação depende da fonte Comboios Live. As notificações remotas continuam a ser calculadas pelo Worker existente e não passam a utilizar automaticamente o ETA visual.

## Verificações
`node --test tests/*.test.mjs` — testes de alertas existentes e testes de ETA.
`npm install && npm run build` — compilação web/APK pelo fluxo GitHub Actions existente.
