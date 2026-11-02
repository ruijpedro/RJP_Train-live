# RJP Train Live V2.12.6 — validação antes da OTA

## Implementado no ramo de desenvolvimento
- Siglas U, R, IR, IC, AP e P nos marcadores do mapa
- Versão alinhada em package.json, src/ota.js e cabeçalho
- Reconciliação conservadora com prioridade ao Comboios Live de Rui Costa
- Testes automáticos do módulo de reconciliação

## Bloqueadores de publicação
- [ ] GitHub Actions: npm test e npm run build com resultado positivo
- [ ] Confirmar símbolos e número do comboio no mapa real
- [ ] Verificar alertas locais, push remoto e dados guardados numa APK existente
- [ ] Verificar atualização OTA de V2.12.5 para V2.12.6 sem reinstalação
- [ ] Validar acesso autorizado e estrutura dos dados do Já Vou antes de ativar segunda fonte
- [ ] Confirmar se há duplicados, posições inválidas ou dados desatualizados

## Publicação
O workflow publish-ota-r2.yml exige versão 2.12.6 e confirmação explícita PUBLICAR. Não o executar antes dos bloqueadores estarem resolvidos. O ramo de desenvolvimento não deve ser fundido automaticamente em main.
