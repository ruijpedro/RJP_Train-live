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
