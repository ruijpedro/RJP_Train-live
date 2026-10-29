# RJP Train Live — OTA via Cloudflare R2

Este serviço é independente do Worker da API de comboios.

1. Na conta Cloudflare, ativar R2 e criar o bucket `rjp-train-live-ota`.
2. Carregar para o bucket o ZIP já publicado no GitHub Releases, com o nome exato `rjp-train-live-ota-v2.12.1.zip`. O ZIP deve ter `index.html` na raiz.
3. Criar um Worker chamado `rjp-train-live-ota`, usando `cloudflare-worker.js` e configurar o binding R2 `OTA_BUCKET` para o bucket criado. Em alternativa, publicar com Wrangler a partir desta pasta.
4. Testar `https://rjp-train-live-ota.<subdominio>.workers.dev/health` e `/ota/v2.12.1.zip`. Confirmar HTTP 200, Content-Type application/zip e descarregamento no Android.
5. Só após o teste, alterar o manifesto `ota/manifest.json` para o endereço real e ativar suporte a esse domínio no `src/ota.js` de uma APK de transição. Não mudar o manifesto antes de a APK estar pronta.
6. Testar OTA e preservação de alertas; só depois integrar na branch main.

Não colocar tokens da Cloudflare nem segredos Firebase no código. O ZIP deve ser distribuído publicamente; não colocar nele credenciais.
