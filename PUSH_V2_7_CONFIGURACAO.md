# RJP Train Live V2.7 — Push com aplicação fechada

A V2.7 inclui código de cliente Android e Cloudflare Worker para Firebase Cloud Messaging (FCM), **mas só fica operacional após a configuração das credenciais e da base D1**. Não incluí credenciais no ZIP.

## 1. Firebase
1. Criar um projeto Firebase, adicionar aplicação Android com package `pt.rjp.trainlive`.
2. Transferir `google-services.json`. Codificar em Base64 e colocar em GitHub → Settings → Secrets and variables → Actions → **Secrets** com o nome `GOOGLE_SERVICES_JSON_B64`. Nunca colocar este ficheiro no repositório público.
3. Em Firebase → Definições do projeto → Contas de serviço, gerar chave privada da conta de serviço. Guardar o JSON como **secret** no Worker Cloudflare com o nome `FIREBASE_SERVICE_ACCOUNT_JSON` (comando: `npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON` na pasta `worker`). Não publicar este JSON.
4. Ativar a Firebase Cloud Messaging API (HTTP v1) no Google Cloud, se necessário.

## 2. Cloudflare D1 e agendamento
1. Na pasta `worker`: `npx wrangler d1 create rjp-train-alerts`.
2. Copiar o `database_id` devolvido para `worker/wrangler.toml`, descomentando `[[d1_databases]]`, `binding = "DB"`, `database_name` e `database_id`.
3. Criar as tabelas: `npx wrangler d1 execute rjp-train-alerts --remote --file=./schema.sql`.
4. Publicar o Worker: `npx wrangler deploy`. O agendamento `* * * * *` executa a verificação **uma vez por minuto**.
5. Confirmar que a URL pública `/health` devolve a versão 2.7.

## 3. APK Android
1. Carregar o projeto no GitHub e configurar o Secret `GOOGLE_SERVICES_JSON_B64`.
2. Executar o workflow `RJP Train Live - Web + Android APK`.
3. Instalar a APK; abrir Alertas, autorizar notificações, guardar uma regra e tocar **Ativar push em segundo plano**.
4. Esperar pela confirmação `Push ativo · notificações em segundo plano` (o registo é assíncrono). A ligação à Internet e as permissões de notificações são necessárias.

## Limitações e responsabilidade
- Só a **APK Android** recebe push em segundo plano nesta versão. A WebApp continua com notificações locais enquanto aberta; iOS/Web Push requerem desenvolvimento específico.
- A chegada/partida é uma **previsão horária** da fonte, não uma confirmação física nem uma posição GPS certificada.
- Alertas são enviados com até ~1 minuto de atraso devido ao cron, mais latência da fonte/FCM e possíveis restrições do Android. A entrega não é garantida.
- Não é uma ferramenta de segurança da exploração ferroviária.
- A fonte de dados é **WebApp Comboios Live — Rui Costa**. O Worker RJP atua como intermediário; respeitar os termos, disponibilidade e limites da fonte.
- Não inclui painel de contas nem gestão multiutilizador. Cada instalação gera uma identidade aleatória local. Desinstalar a APK pode perder a identidade e regras, embora o servidor possa conservar os dados até serem removidos administrativamente.
- É aconselhável adicionar autenticação e proteção antiabuso antes de distribuir publicamente a APK a terceiros.
