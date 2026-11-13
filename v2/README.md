# RJP Train Live 2.0 — laboratório independente

Este projeto **não substitui** a RJP Train Live original. É uma aplicação de ensaio com identificador Android separado `pt.rjp.trainlive2`; a branch `main`, os alertas e o canal OTA da versão original não são alterados.

## Fase 1: Base de horários da CP

Fonte: GTFS estático publicado em https://publico.cp.pt/gtfs/gtfs.zip . O workflow `v2-build.yml` importa os serviços programados para três dias e produz a WebApp e uma APK de ensaio.

**Horários programados não equivalem a posições GPS, atrasos reais ou confirmações de circulação.** O mapa assinala estações; a linha traçada entre paragens é meramente esquemática. Esta versão não utiliza o servidor de Rui Costa, nem aciona os alertas ou registos Firebase da aplicação anterior.

## Próximas fases

1. Validar horários, calendar_dates, numeração de comboios e cobertura CP com a rede real.
2. Obter interface autorizada de informação operacional diretamente da CP e/ou IP.
3. Identificar fiabilidade/frescura da fonte e cruzar atrasos sem apresentar GPS fictício.
4. Implementar notificações e OTA próprios, depois de validada a independência das fontes.
5. Quando a versão 2.0 estiver estável, introduzir as melhorias na aplicação original com o **mesmo identificador Android original**, preservando os utilizadores e os seus alertas. Uma aplicação com appId diferente não migra automaticamente dados locais de outra.

## Desenvolvimento local

```sh
python3 scripts/import_gtfs.py --days 3
npm install
npm run build
```

O GitHub Actions constrói a aplicação sem necessidade de instalação local. Não publicar em GitHub Pages da aplicação original: o ambiente de produção e o canal OTA da versão 1 devem permanecer isolados.
