# RJP Train Live — V2.12.6: integração multifonte

## Objetivo
Mostrar prioritariamente os comboios provenientes do **Comboios Live — Rui Costa**. O **Já Vou — javou.pt** pode acrescentar comboios que não constem na fonte principal, apenas com identidade do serviço confirmada e prevenção de duplicados; não deve substituir posições já existentes do Rui Costa. Pode ainda fornecer autocarros de substituição, quando validados. Ambas as plataformas continuam identificadas como fontes, sem lhes atribuir categorias exclusivas na interface.

## Estado de partida
A V2.12.5 consulta `/api/trains/active` no Worker RJP, normaliza os comboios, atualiza a cada 30 s e conserva alertas locais e push. O Já Vou ainda não foi tecnicamente validado como API pública ou feed reutilizável.

## Regras de integração
1. Criar adaptadores separados `ruiCostaAdapter` e `jaVouAdapter` **após** confirmar formatos, condições de utilização e disponibilidade de dados. Nunca extrair posições de HTML presumindo que são telemetria.
2. Modelo comum: `source`, `operator`, `serviceId`, `serviceDate`, `mode` (rail/bus/unknown), `serviceType`, `latitude`, `longitude`, `observedAt`, `delayMinutes`, `origin`, `destination`, `stops`, `replacementFor`.
3. Associar veículos apenas quando houver identificador estável, operador e data de serviço compatíveis; não presumir que `36408_20260322` corresponde ao número comercial de comboio.
4. **Regra prioritária:** Rui Costa é fonte principal dos comboios. Só acrescentar comboios do Já Vou que comprovadamente não existam na fonte principal; nunca sobrepor posições de comboios já apresentados pelo Rui Costa. Para autocarros de substituição confirmados, preferir observações recentes com timestamp verificável.
5. Nunca duplicar comboios: reconciliar por operador, data e identificador estável, sem assumir equivalência por número isolado. Não duplicar o mesmo autocarro no mapa. Manter registo de proveniência por campo, mesmo quando o veículo reúne dados de duas fontes.
6. Mostrar legendas de serviço: U = Urbano, R = Regional, IR = InterRegional, IC = Intercidades, AP = Alfa Pendular. A sigla é classificação do serviço, não origem dos dados.
7. Autocarros de substituição com ícone próprio e associação ao serviço substituído **só quando confirmada**.
8. Não alterar `ALERTS_KEY`, regras push, ID da app, assinatura Android ou processo OTA; testar atualização sem perda de alertas.
9. Falha de uma fonte não bloqueia a outra; apresentar estado por fonte e instante de última observação.
10. Evitar expor chaves e contornar limitações de acesso; preferir endpoint autorizado no Worker.

## Validação antes de publicar
- Verificar endpoints, permissões de uso, CORS e esquema do Já Vou.
- Testar serviços com mesma referência, referências diferentes, posições divergentes, ausência de GPS e dados desatualizados.
- Confirmar legendas U/AP e restantes categorias, preservação dos alertas e funcionamento da OTA.
- Publicar OTA só após testes; não alterar a versão de produção antecipadamente.

## Símbolos no mapa
- Mostrar **sigla de serviço no próprio marcador**, não apenas no painel lateral: U (Urbano), R, IR, IC e AP (Alfa Pendular).
- O utilizador pediu também a sigla **P**; confirmar o significado exato antes de a associar automaticamente a uma categoria. Até confirmação, mostrar P apenas se a fonte fornecer literalmente esse código.
- Fonte de dados não determina sigla; a classificação depende do serviço identificado.
