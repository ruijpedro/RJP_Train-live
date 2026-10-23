# RJP Train Live V2.9 — Alertas por dia e passagem na estação

1. Na Cloudflare D1 `rjp-train-live-db`, executar `worker/migration_v2_9.sql`.
2. No Worker existente `rjp-train-live-api`, substituir o conteúdo de `worker.js` pelo novo `worker/worker.js` e fazer Deploy. Confirmar `/health` com `version: 2.9.0`.
3. Carregar o conteúdo deste ZIP na **raiz** do repositório GitHub (não uma pasta envolvente), mantendo os secrets e o workflow. Gerar a APK pelo GitHub Actions e instalar como atualização.
4. Na APK, abrir Alertas, selecionar `Comboio + estação`, comboio `6450`, estação `Monte Real`, evento `Chegada`, escolher dias, antecedência e se deseja pré-aviso e/ou aviso de passagem detetada. Guardar e ativar push.
5. Testar push remoto com a APK fechada.

## Importante
A fonte Comboios Live indica a última estação reportada; a alteração desse campo **não comprova que o comboio parou**. Por isso, o aviso é identificado como `passagem detetada`, não `chegada confirmada`. Sem atualização dos dados, não existe garantia de alerta. A monitorização é executada a cada minuto, mas o Firebase e o Android podem atrasar a entrega. As regras antigas sem seleção de dias continuam ativas todos os dias. A notificação de passagem exige duas observações consecutivas do comboio no mesmo dia; não dispara no primeiro registo observado. A tabela `train_observations` guarda apenas a última estação reportada por número de comboio, e não dados pessoais.
