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
  maintenance.ts   alertas de manutenção do SINAPI (desativada / alterada) para orçamentos antigos
  own-composition.ts composições próprias no catálogo: itens oficiais por código, insumos próprios, ciclos
  sicro.ts         método de cálculo do DNIT (equipe, produção, FIC, acréscimos, tempo fixo)
src/import/sinapi/ importador das planilhas da Caixa (streaming, exceljs)
  parse-reference.ts   SINAPI_Referência_AAAA_MM.xlsx → insumos, composições, árvore analítica
  parse-labor-share.ts SINAPI_mao_de_obra_AAAA_MM.xlsx → % de mão de obra por composição
  parse-maintenance.ts SINAPI_Manutenções_AAAA_MM.xlsx → histórico de manutenções (XML com prefixo x:)
  classify.ts          reconhece cada planilha pelas abas (os nomes no ZIP da Caixa vêm sem acento)
  load.ts              grava uma PriceTable (origem + UF + mês + regime) e as manutenções
  run-import.ts        fluxo completo (UFs × regimes, cache de custos, conferência), usado pela CLI e pela tela
src/import/sicro/  importador dos relatórios do DNIT (SICRO)
src/lib/imports/   importação em segundo plano pela interface (ImportJob)
src/lib/pricing/budget-catalog.ts catálogo de uma base + composições próprias (recálculo, ABC, alertas, busca)
scripts/           CLIs: import-sinapi, validate-sinapi, check-price-table, platform-admin
src/lib/prisma.ts  cliente Prisma (singleton)
prisma/schema.prisma
prisma/migrations/ migrações (SQL escrito à mão; conferido com `prisma migrate diff`)
```

## Rodando na sua máquina

Pré-requisitos: Node.js 22+ e PostgreSQL 16 — pelo Docker (`docker compose up -d`) ou instalado direto
(no Mac: `brew install postgresql@16`, criar o usuário `postgres` com senha `postgres` e o banco `orcamento_obras`).

```bash
git clone https://github.com/bsbgitleo/orcamento-obras.git
cd orcamento-obras
cp .env.example .env            # DATABASE_URL já aponta para o Postgres do docker-compose
docker compose up -d            # sobe o PostgreSQL
npm install                     # instala e gera o cliente Prisma
npm run db:migrate              # cria as tabelas (aplica prisma/migrations/*.sql)
npm run sinapi:import -- --ref SINAPI_Referência_2026_10.xlsx --labor SINAPI_mao_de_obra_2026_10.xlsx --uf DF --regime ALL
npm run dev                     # http://localhost:3000
```

Na primeira vez, abra http://localhost:3000/cadastro e crie sua empresa (você será o gestor).
Para importar as bases oficiais pela interface, torne-se administrador da plataforma:
`npm run admin:platform -- seu@email.com` (`--revoke` retira; `--list` lista).
`npm run db:migrate` usa um script próprio (não precisa do schema-engine do Prisma) e pode ser repetido; migrações já aplicadas são puladas.

## Importando o SINAPI

**Pela interface** (só o administrador da plataforma — as bases oficiais são compartilhadas por todas as empresas):
Tabelas importadas → **Importar SINAPI**. Envie o ZIP baixado no site da Caixa (ex.: `SINAPI-2026-10-formato-xlsx.zip`)
ou as planilhas soltas; o tipo de cada arquivo é reconhecido pelas abas. Escolha as UFs e os regimes. A importação roda
em segundo plano no servidor (uma por vez), com o registro ao vivo em `/bases/importacoes/<id>`; ao final, o custo de
todas as composições é recalculado e conferido com o publicado. Os arquivos enviados ficam em `IMPORT_DIR`
(padrão `.data/imports`) só até o fim da importação.

**Pela linha de comando** (mesmo fluxo):

```bash
npm run sinapi:import -- --ref SINAPI_Referência_2026_10.xlsx --labor SINAPI_mao_de_obra_2026_10.xlsx --uf DF,GO --regime ALL \
    --maintenance SINAPI_Manutenções_2026_10.xlsx
npm run sinapi:check -- DF 2026-10 NAO_DESONERADO   # recalcula tudo e compara com o custo publicado
```

- Uma base (UF + mês + regime) que **já tenha orçamento** não é reimportada: aquela UF/regime é pulada e aparece como
  bloqueada; as demais seguem.
- **SINAPI_Manutenções** é cumulativo e nacional (34.393 registros desde 07/2009 no arquivo de 10/2026): cada importação
  substitui o anterior, e um arquivo mais antigo não sobrescreve um mais novo. Os orçamentos feitos numa referência
  anterior mostram as composições e os insumos (inclusive de composições auxiliares) desativados ou alterados depois.

## Importando o SICRO (DNIT)

Pela tela (administrador da plataforma): Tabelas importadas → **Importar base oficial**, enviando os relatórios .xlsx
do DNIT de uma UF (soltos ou num ZIP). Pela linha de comando: baixe no site do DNIT os relatórios da UF/mês em .xlsx (Analítico e Sintético de Composições, Sintéticos de Materiais,
Mão de Obra e Equipamentos — com e sem desoneração — e, opcionalmente, Origem de Preços) numa pasta e rode:

```bash
npm run sicro:import -- --dir "DF 07-2026" --regime ALL
```

Método do DNIT reproduzido (6.619 composições do DF 07/2026 iguais ao publicado): itens com 4 casas (meio para cima);
execução = (equipamentos + mão de obra) ÷ produção; **FIC = FIC × (custo improdutivo dos equipamentos + mão de obra) ÷
produção**; acréscimos percentuais dentro dos grupos; auxiliares e tempo fixo pelo custo final; total com 2 casas.
**Momento de transporte** (grupo F): na aba **Transporte** do orçamento SICRO, informe a DMT padrão por tipo de via
(e, se quiser, a de materiais específicos e o FIT). O app calcula peso × DMT de cada material (inclusive das
atividades auxiliares) e mantém uma etapa "Transportes" com um item em t·km por composição de transporte, como nos
orçamentos do DNIT. Sem DMT, os serviços aparecem "sem transporte".

## Importação de planilha orçamentária

Em **Criar orçamento**, marque "importar as etapas e os serviços de uma planilha .xlsx" (ou use o atalho no orçamento
vazio). O app acha o cabeçalho, sugere o papel de cada coluna e mostra a pré-visualização com o vínculo de cada
serviço: código da base ou de composição própria → vinculado; sem código e com preço → nova composição própria com esse
preço (com BDI, o app desconta o BDI do orçamento); sem preço → "sem custo". Reconhece a exportação do próprio app e o
modelo de homogeneização das proponentes.

## Exportações

Na aba **Exportar** do orçamento: planilha orçamentária em Excel (sintética, analítica, BDI e encargos, cronograma,
curvas ABC — valores iguais aos do app), **proposta comercial** em página A4 (Imprimir → Salvar como PDF) e
**planilha para proponentes** (sem preços, com especificação, critério de medição e campos da proponente em amarelo).
A especificação de cada serviço fica na aba **Especificações**; os dados da empresa, em Empresa → Dados da empresa.

## Base própria

Composições e insumos da empresa (menu **Base própria**). Os itens oficiais de uma composição própria ficam guardados
pelo **código** e são precificados na base de cada orçamento (UF, mês e regime); um código que não existe nessa base
deixa o serviço "sem custo". Insumos próprios têm preço, data e fonte. Dá para criar do zero ou copiando uma composição
oficial (ex.: 87879) para ajustar coeficientes e incluir insumos. Alterações valem para os orçamentos no próximo recálculo.

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
