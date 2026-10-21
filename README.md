# RJP Train Live V2.3 — RUI COSTA LIVE

Fonte principal configurada:
`https://comboios.ruicosta.pt/api/cache/trains/active`

O formato foi adaptado à resposta observada no browser:
- `data.status`: posição, atraso em segundos, estado, última estação;
- `data.platforms`: plataformas;
- `db`: serviço, origem e destino;
- `fixed.trainStops`: percurso, estações, coordenadas, horários, ETA/ETD;
- `fixed`: atraso consolidado e estado.

O backend converte o atraso para minutos e determina a próxima paragem a partir da última estação.

## Fallbacks
- CP Map para posições quando a fonte principal falha;
- comboios-rs para integração CP/IP.

## Arranque
1. `npm install`
2. `npm run server`
3. noutro terminal: `npm run dev`

Ou `docker compose up`.

WebApp: http://localhost:5173
Diagnóstico: http://localhost:3000/api/health
Feed normalizado: http://localhost:3000/api/trains/active

## Nota
A chamada foi observada pelo utilizador no Network do browser. O acesso automatizado externo pode estar sujeito a disponibilidade, CORS, proteção do serviço ou alterações do endpoint. A app não fabrica posições se as fontes falharem.

Não utilizar para segurança da exploração ferroviária.


## Branding V2.3.1
Inclui o novo ícone/símbolo RJP Train Live fornecido em IconKitchen: favicon, PWA 192/512/maskable, Apple Touch Icon e recursos Android/iOS em `native-icons/`.

## V2.3.2
- Corrigido GitHub Pages em subdiretório com Vite `base: './'`.
- Caminhos de ícones e GeoJSON compatíveis com Pages/Capacitor.
- GitHub Actions passa a gerar Web artifact e APK Android debug.
- Capacitor Android incluído.
- Em publicação estática, a app tenta o feed Comboios Live diretamente; com `rjp_api` configurado usa o backend RJP.

## V2.3.3 — Android icon build fix
Corrigido o workflow Android: deixa de apagar `mipmap-*`, preserva a estrutura criada pelo Capacitor,
sobrepõe os recursos IconKitchen compatíveis e garante `ic_launcher` e `ic_launcher_round` antes do Gradle.

## V2.4.0 — Proxy live + novo IconKitchen
- Novo pacote IconKitchen (7) aplicado a Web/PWA, Android e iOS.
- A WebApp e o APK aceitam `VITE_API_URL` via variável GitHub Actions `RJP_API_URL`.
- Incluído `worker/` com proxy Cloudflare para evitar bloqueio CORS do browser.
- Workflow manual `Deploy RJP Live Proxy`.
- Diagnóstico da fonte mostra CORS/rede ou erro HTTP em vez de mensagem genérica.

### Ligação do proxy
Depois de publicar o Worker, criar no repositório GitHub:
Settings > Secrets and variables > Actions > Variables > `RJP_API_URL`
com o URL do Worker, sem `/api`, por exemplo `https://rjp-train-live-api....workers.dev/api`.
A app acrescenta `/trains/active`.


## V2.5 — Railway Map
- Rede ferroviária visível logo ao abrir o mapa (overlay OpenRailwayMap + GeoJSON RFN quando disponível).
- Fonte explicitamente identificada na interface: WebApp Comboios Live — Rui Costa.
- Botão Atualizar materializado, com estado de carregamento.
- Atualização automática mantida.
- RJP API / Cloudflare Worker como intermediário do feed.

## V2.6 — Alertas ferroviários

Botão **🔔 Alertas**: guardar regras por estação (nome igual ao recebido no feed) ou número de comboio; chegada/partida; antecedência 5/10/15 minutos. As regras ficam no armazenamento local do dispositivo e a verificação ocorre a cada atualização do feed (30 segundos). Ao atingir a janela de antecedência, é enviada uma notificação Web se a permissão tiver sido concedida e a aplicação estiver aberta. O sistema evita repetir o mesmo aviso no mesmo dia. Usa ETA/ETD do feed quando disponíveis, senão o horário publicado.

**Limite importante:** esta versão não inclui infraestrutura de Web Push, Firebase ou execução em segundo plano. Em Android/Chrome, as notificações podem não surgir quando a app está fechada ou suspensa. Para push real com app fechada, será necessário um serviço agendado no Worker, subscrições Web Push e chaves VAPID (ou FCM para Android), além de consentimento do utilizador. O feed disponibiliza previsões, não confirma por si só a chegada ou partida efetiva.

Fonte de dados de circulação atribuída explicitamente à **WebApp Comboios Live — Rui Costa**, por intermédio da RJP API / Cloudflare Worker.

Testes: `node --test tests/*.test.mjs`.
