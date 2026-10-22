# RJP Train Live V2.7.1 — Firebase / Cloudflare

## Já configurado por ti
- Firebase: `rjp-train-live`, Android `pt.rjp.trainlive`, FCM v1 ativo.
- Cloudflare Worker: `rjp-train-live-api`, Secret `FIREBASE_SERVICE_ACCOUNT` e binding D1 `DB` para `rjp-train-live-db`.
- **A V2.7 original esperava outro nome de secret. Esta versão aceita o nome que já guardaste.**

## Passo 1 — criar tabelas D1
Cloudflare > Storage & databases > D1 > `rjp-train-live-db` > Console. Executar o conteúdo integral de `worker/schema.sql`. Confirma que aparecem `devices` e `deliveries`.

## Passo 2 — Worker + Cron
**Não substituas o Worker antigo até terminares o passo 1.**
Para fazer deploy pelo GitHub Actions / Wrangler, abre o painel da base D1 e copia o **Database ID**. No `worker/wrangler.toml`, descomenta o bloco `[[d1_databases]]` e substitui `ID_REAL_DA_BASE` pelo ID real. Nunca inventes um ID. Depois faz deploy com `npx wrangler deploy` na pasta `worker`, com credenciais Cloudflare autorizadas. Confirma que o binding `DB` e o Secret `FIREBASE_SERVICE_ACCOUNT` continuam associados ao Worker. O cron executa a cada minuto.

Se preferires atualizar o código no editor do painel Cloudflare, mantém os bindings existentes e cria em Settings > Triggers um cron `* * * * *`.

## Passo 3 — GitHub Actions Android
A compilação lê o segredo GitHub Actions `GOOGLE_SERVICES_JSON_B64`. No teu Windows PowerShell, na pasta do ficheiro `google-services.json` (não é a chave privada da conta de serviço):

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path '.\google-services.json')))
```

Cola o resultado no GitHub > Settings > Secrets and variables > Actions > New repository secret com o nome `GOOGLE_SERVICES_JSON_B64`. Não publiques o JSON nem o Base64. Depois executa o workflow de Android e instala a APK.

## Passo 4 — validar
Abre `/health` no Worker e verifica versão 2.7. Na APK: Alertas > Autorizar notificações > Testar notificação local > Ativar push em segundo plano. Depois guarda um alerta e confirma o registo. A entrega com app fechada requer cron, token FCM, DB e conectividade.

**Limitações:** os avisos são previsões ETA/ETD, não confirmações físicas; não usar para segurança operacional. Não foi realizado teste ponta a ponta com um dispositivo real.
