# RJP Train Live V2.12 — OTA via GitHub Releases (piloto manual)

## Sem Cloudflare R2 nem nova subscrição
A APK consulta um manifesto HTTPS público no GitHub. Os ficheiros Web OTA são publicados como assets de GitHub Releases. O Worker, Firebase, a base de dados D1 e os alertas existentes não são alterados.

## Passo 1 — APK base
Substituir os ficheiros do repositório por este ZIP mantendo GitHub Secrets, especialmente GOOGLE_SERVICES_JSON_B64. Executar workflow `RJP Train Live - Web + Android APK`. Instalar a APK sobre a anterior (mesmo applicationId e assinatura). **Nota:** APK debug de outro ambiente pode ter assinatura incompatível. Nesse caso NÃO desinstalar a anterior sem salvaguardar os dados.

## Passo 2 — Publicar atualização Web
Modificar apenas código Web. Abrir GitHub > Actions > `RJP Train Live - Publish OTA Web Bundle` > Run workflow; indicar versão superior à 2.12.0, ex. `2.12.1`. O workflow cria Release `ota-v2.12.1` com `rjp-train-live-ota-2.12.1.zip` e um ficheiro SHA256.

## Passo 3 — Ativar manifesto após publicação
Editar `ota/manifest.json` na branch main:
```
{
  "appId": "pt.rjp.trainlive",
  "version": "2.12.1",
  "url": "https://github.com/ruijpedro/RJP_Train-live/releases/download/ota-v2.12.1/rjp-train-live-ota-2.12.1.zip"
}
```
O manifesto inicial (versão 2.12.0) não propõe atualização. A app usa `https://raw.githubusercontent.com/ruijpedro/RJP_Train-live/main/ota/manifest.json`.

## Passo 4 — Teste seguro
Na APK 2.12, usar `Verificar OTA` e confirmar. Testar ETA, alertas e push remoto com app fechada. Não distribuir o piloto antes de validar rollback, compatibilidade e integridade.

## Avisos importantes
- A atualização OTA altera apenas Web assets; plugins nativos e permissões requerem nova APK.
- O ficheiro SHA256 é publicado para auditoria, mas **a APK ainda não valida criptograficamente o pacote antes da instalação**. Este é um piloto manual, não um canal seguro de produção.
- O mecanismo de recuperação depende do plugin e deve ser testado em dispositivo de teste.
- A versão base está fixa em `src/ota.js`; depois de uma atualização OTA, o piloto pode voltar a oferecer a mesma versão. Isto requer aperfeiçoamento antes da distribuição pública.
- Não publicar contas de serviço Firebase ou outros segredos no GitHub.
- O GitHub pode aplicar limites ou políticas de uso aos downloads; não há garantia de gratuidade ilimitada.
