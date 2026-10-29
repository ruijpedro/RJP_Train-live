# RJP Train Live V2.12 — piloto OTA manual

## Estado
Este ZIP integra um **piloto** de OTA na APK, com botão «Verificar OTA» e instalação apenas após confirmação. **Não ativa atualizações automáticas** nem publica pacotes em Cloudflare R2. A versão 2.12 exige uma nova APK. Não desinstalar a anterior.

## Preparação
1. Criar bucket Cloudflare R2 e alojar nele um pacote ZIP de `dist/` (ficheiros na raiz do ZIP). Configurar domínio HTTPS para downloads.
2. Publicar um manifesto JSON semelhante a `ota-manifest.example.json` num URL HTTPS estável.
3. No repositório GitHub, configurar variável Actions `VITE_OTA_MANIFEST_URL` com o URL do manifesto.
4. Executar workflow Android para criar nova APK; instalar **por cima** da APK anterior.
5. Criar versão Web 2.12.1 com `npm run build`, zipar conteúdo de `dist/` e publicar em R2; apontar o manifesto para esse ZIP.
6. Na APK 2.12, tocar «Verificar OTA» e «Instalar». Confirmar que alertas e push continuam a funcionar com a aplicação fechada.

## Importante
- NÃO alterar `FIREBASE_SERVICE_ACCOUNT`, `GOOGLE_SERVICES_JSON_B64`, Worker ou D1.
- A versão piloto **não inclui assinatura criptográfica independente do manifesto/pacote**. Usar apenas num dispositivo de teste e com URL HTTPS sob controlo próprio; não distribuir a utilizadores finais antes de implementar verificação criptográfica, compatibilidade nativa, recuperação e testes completos.
- Nunca publicar ficheiros de conta de serviço Firebase em R2 ou GitHub.
- OTA atualiza apenas conteúdo Web, não plugins nativos, permissões ou configuração Android.
- Verificar a compatibilidade exata da versão do plugin Capgo com Capacitor 7 antes de compilar.
