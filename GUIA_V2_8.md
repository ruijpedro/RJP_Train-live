# RJP Train Live V2.8 — Alertas push remotos

## Ordem de instalação
1. Na Cloudflare D1, consola da base `rjp-train-live-db`, executar `worker/migration_v2_8.sql` **uma vez**.
2. Publicar o novo Worker (`worker/worker.js`) com o workflow **Deploy RJP Live Proxy** do GitHub Actions. Verificar `/health` e versão `2.8.0`.
3. Carregar o ZIP atualizado no GitHub, substituindo os ficheiros da raiz do repositório. O workflow **RJP Train Live - Web + Android APK** gera a nova APK.
4. Instalar a APK por cima da anterior (mesmo identificador e assinatura debug, se a chave de assinatura for igual). Caso a assinatura varie entre builds, poderá ser necessário reinstalar; nesse caso, exportar previamente os dados relevantes.
5. Na APK, abrir **Alertas** → **Ativar push em segundo plano**. A mensagem deverá confirmar `Push ativo · dispositivo e regras sincronizados` ou apresentar erro após 20 segundos.
6. Premir **Testar push remoto (60 segundos)**, fechar normalmente a aplicação e bloquear o ecrã. A entrega poderá ocorrer depois do minuto indicado, conforme a execução cron e a rede.
7. Criar um alerta **Comboio + estação**, número **6450**, estação **Monte Real**, **Chegada**, antecedência **10 min**.

## Limites conhecidos
- O pré-aviso depende dos horários fornecidos pelo feed; não é uma confirmação de chegada real.
- O teste remoto verifica o envio pelo FCM, não garante a entrega em todos os estados do Android.
- A funcionalidade de chegada *confirmada* depende de sinais inequívocos da fonte; esta versão envia alertas de **chegada prevista**, não confirmações de chegada.
- As regras antigas permanecem guardadas no dispositivo e na D1.
- Os testes remotos são agendados para o próprio dispositivo autenticado, nunca para todos os telemóveis.
