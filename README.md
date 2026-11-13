# Orçamento de Obras

Aplicativo web para orçamento de obras de construção civil no Brasil: EAP, composições SINAPI e próprias, BDI (Acórdão TCU 2622/2013), curva ABC, cronograma físico-financeiro e exportação de planilha/proposta.

A especificação, o modelo de dados e o registro de decisões ficam no projeto do Claude (`01-especificacao-app`, `02-modelo-dados-e-regras`, `03-registro-de-decisoes`, `06-tcu-engenharia-custos-regras`).

## Stack

Next.js 16 · TypeScript · PostgreSQL · Prisma 7 (driver adapter `pg`) · decimal.js · Vitest

## Estrutura

```
src/core/        núcleo de cálculo puro (sem banco, sem UI) — 100 % testado
  money.ts         Decimal, arredondamento (2 casas ROUND_HALF_UP), formato R$ 1.234,56
  bdi.ts           fórmula TCU 2622/2013, faixas por tipo de obra
  composition.ts   custo unitário de composição (recursivo, com divisão material/MO/equip.)
  abc-curve.ts     curva ABC (A ≤ 80 %, B ≤ 95 %, C)
  wbs.ts           EAP com numeração automática e movimentação de itens
src/import/sinapi/ importador das planilhas da Caixa (streaming, exceljs)
  parse-reference.ts   SINAPI_Referência_AAAA_MM.xlsx → insumos, composições, árvore analítica
  parse-labor-share.ts SINAPI_mao_de_obra_AAAA_MM.xlsx → % de mão de obra por composição
  load.ts              grava uma PriceTable (origem + UF + mês + regime)
scripts/           CLIs: import-sinapi, validate-sinapi, check-price-table
src/lib/prisma.ts  cliente Prisma (singleton)
prisma/schema.prisma
prisma/migrations/ migração inicial (SQL)
```

## Rodando

```bash
cp .env.example .env        # ajuste DATABASE_URL
npm install                 # roda prisma generate
npm run db:migrate          # cria o banco
npm run dev
```

## Importando o SINAPI

Baixe no site da Caixa as planilhas do mês (ex.: `SINAPI_Referência_2026_10.xlsx` e
`SINAPI_mao_de_obra_2026_10.xlsx`) e rode:

```bash
npm run sinapi:import -- --ref SINAPI_Referência_2026_10.xlsx --labor SINAPI_mao_de_obra_2026_10.xlsx --uf DF --regime ALL
npm run sinapi:check -- DF 2026-10 NAO_DESONERADO   # recalcula tudo e compara com o custo publicado
```

Regras do SINAPI reproduzidas (verificadas centavo a centavo nas 10.710 composições do DF, 10/2026):
- custo do item = `TRUNC(coeficiente × preço, 2)`; custo da composição = soma dos itens;
- composição auxiliar entra pelo custo já calculado;
- preço em branco na UF → usa o preço de SP (gravado em `priceFallbackUf`);
- insumo sem preço em lugar nenhum → composição "SEM CUSTO" (custo publicado = 0; gravamos `null`).

## Testes

```bash
npm test
```

Todas as regras de cálculo têm teste. O BDI é validado contra o exemplo do guia do TCU (23,86 % sem CPRB; 30,13 % com CPRB 4,5 %).

## Convenções

- Código e commits em inglês; interface em PT-BR.
- Dinheiro e quantidades sempre em `Decimal` (nunca `number`).
- Todo preço tem fonte, UF, mês de referência e regime (desonerado / não desonerado).
- Custos de itens e serviços: 2 casas, **truncados** (regra do SINAPI). `roundMoney` só para exibição e BDI. BDI aplicado pelo percentual declarado (2 casas), não pelo fator bruto.
