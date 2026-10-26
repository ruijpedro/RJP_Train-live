# RJP Train Live V2.9.1 — correção push remoto

## Causas encontradas nos registos

1. Erro em `worker.js:83` na consulta à tabela `train_observations`. A tabela é criada por `worker/migration_v2_9.sql`. Se ainda não executaste a migração, abre Cloudflare > D1 > rjp-train-live-db > Console e executa o SQL abaixo. É seguro voltar a executar.

```sql
CREATE TABLE IF NOT EXISTS train_observations (
 train_number TEXT PRIMARY KEY,
 last_station TEXT NOT NULL,
 service_day TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

2. `Unexpected non-whitespace character after JSON at position 9` ao interpretar o segredo Firebase. O Worker agora aceita o JSON da conta de serviço diretamente ou codificado em Base64 e dá uma mensagem de erro mais clara quando o conteúdo é inválido. Se o segredo for outro formato, terás de corrigir o seu valor em Settings > Variables and Secrets. Não publiques nem partilhes o conteúdo do segredo.

## Instalação

1. Executa a migração acima na base D1 existente.
2. Cloudflare > Workers & Pages > rjp-train-live-api > Edit code: substitui todo o conteúdo do worker.js pelo ficheiro deste ZIP e faz Deploy.
3. Confirma que /health devolve version 2.9.1.
4. No Android, usa Testar push remoto (60 segundos), aguarda 2 minutos com a app fechada.
5. Em Cloudflare > Observability confirma se desapareceu o erro de JSON. Se aparecer `Firebase: segredo inválido`, verifica o formato do segredo; se aparecer HTTP 401/403, verifica credenciais e permissões da conta de serviço.

A correção não garante entrega enquanto as credenciais Firebase não forem válidas. O histórico de testes antigos poderá permanecer na fila até um envio bem-sucedido.
