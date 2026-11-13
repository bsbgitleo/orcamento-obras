# Registro de Decisões

Atualize este arquivo sempre que uma decisão for tomada em um chat do projeto (o contexto não passa de um chat para outro).

| # | Data | Decisão | Status |
|---|------|---------|--------|
| 1 | 2026-11-13 | Projeto criado. Escopo do MVP definido em 01-especificacao-app.md | Aprovado |
| 2 | 2026-11-13 | Stack: Next.js 16 + TypeScript + PostgreSQL + Prisma 7 (driver adapter `pg`, config em `prisma.config.ts`). Valores com decimal.js; testes com Vitest | Aprovado |
| 3 | 2026-11-13 | Base de preços: SINAPI (importação das planilhas da Caixa) + base própria | Aprovado (SINAPI) |
| 4 | 2026-11-13 | BDI calculado pela fórmula do Acórdão TCU 2622/2013 (obrigatória em obra pública; padrão sugerido em obra privada) | Aprovado para obra pública |
| 5 | 2026-11-13 | **Revisada.** Custo do item = `TRUNC(coeficiente × preço, 2)`; custo da composição = soma dos itens; custo do serviço = `TRUNC(qtd × custo unitário, 2)`. É a regra do SINAPI (fórmula da aba "Analítico com Custo"), verificada centavo a centavo em 10.710 composições do DF. Arredondar (decisão original) divergia em centavos | Aprovado |
| 6 | 2026-11-13 | O app atende obras públicas (licitação) e obras privadas; o campo "Tipo" no orçamento ativa as regras de cada uma | Aprovado |
| 7 | 2026-11-13 | Adotar do OrçaFascio como referência: criação em 3 passos, categorias de obra, BDI e encargos reutilizáveis, busca única de composições, numeração automática da EAP | Aprovado |
| 8 | 2026-11-13 | Código em github.com/bsbgitleo/orcamento-obras | Aprovado |
| 9 | 2026-11-13 | Ordem de desenvolvimento: (1) núcleo de cálculo puro com testes → (2) schema Prisma → (3) importador SINAPI → (4) telas | Aprovado |
| 10 | 2026-11-13 | Preço de venda usa o BDI **em percentual com 2 casas** (o valor declarado no demonstrativo), não o fator bruto. Ex.: fator 0,238616 → aplica 23,86 % | Aprovado (proposto pelo Claude) |
| 11 | 2026-11-13 | Composição auxiliar entra na composição-pai pelo custo unitário já calculado (soma truncada), como no SINAPI | Aprovado |
| 12 | 2026-11-13 | Faixas de BDI do Acórdão 2622/2013 (item 9.1) codificadas em `src/core/bdi.ts` como alerta (BELOW/WITHIN/ABOVE), nunca bloqueio. 6 tipos de obra, valores conferidos na fonte | Aprovado |
| 13 | 2026-11-13 | EAP no banco: etapas e serviços na mesma tabela `WbsNode` (árvore por `parentId` + `position`); `code` (1, 1.1…) recalculado pelo app | Aprovado (proposto pelo Claude) |
| 14 | 2026-11-13 | Regime padrão de importação/uso: **sem desoneração** (ISD/CSD). Os três regimes (sem desoneração, com desoneração, sem encargos) são importados como `PriceTable` separadas | Aprovado |
| 15 | 2026-11-13 | Regras do SINAPI reproduzidas no importador: preço em branco na UF → preço de SP (gravado em `Input.priceFallbackUf`); insumo sem preço em lugar nenhum → fica no banco com `unitPrice = null` e a composição é "SEM CUSTO" (`referenceCost = null`, custo calculado marcado `incomplete`). Uma composição "COM CUSTO" pode legitimamente custar R$ 0,00 (ex.: 104088) | Aprovado (proposto pelo Claude) |
| 16 | 2026-11-13 | Coeficientes gravados como `Decimal(18,7)` (o SINAPI publica até 7 casas); quantidades `Decimal(15,4)`; dinheiro `Decimal(15,2)` | Aprovado |
| 17 | 2026-11-13 | Toda coluna de FK tem índice (Postgres não cria automaticamente). Sem isso, excluir uma tabela de preços levava 4 min; com, 2 s | Aprovado |
| 18 | 2026-11-13 | `Composition.referenceCost` guarda o custo publicado pelo SINAPI só para conferência; o app sempre recalcula a partir dos itens | Aprovado (proposto pelo Claude) |
| 19 | 2026-11-13 | UI: Next.js App Router com server actions + `useActionState`, validação zod em `src/lib/schemas/*` (nunca exportar objetos de arquivos `"use server"`), CSS global simples sem Tailwind, fontes do sistema. `cacheComponents` desligado no MVP (renderização dinâmica) | Aprovado (proposto pelo Claude) |
| 20 | 2026-11-13 | Código do orçamento sequencial `ORC-0001`, `ORC-0002`… gerado pelo app, **único por empresa** (com retry em colisão) | Aprovado (proposto pelo Claude) |
| 21 | 2026-11-13 | O orçamento exige que a tabela de encargos sociais tenha o **mesmo regime** da base de preços (validação no servidor + pré-seleção automática no assistente). Os encargos sociais podem ser criados com um clique a partir dos percentuais publicados com a tabela SINAPI (`PriceTable.socialChargesHourly/Monthly`) | Aprovado (proposto pelo Claude) |
| 22 | 2026-11-13 | Campos de licitação (órgão, modalidade, processo, abertura) só em obra pública; o órgão licitante é obrigatório nesse caso. Arredondamento não é configurável (regra SINAPI fixa, decisão #5); o passo 2 do assistente apenas informa a regra | Aprovado (proposto pelo Claude) |
| 23 | 2026-11-13 | BDI de "mero fornecimento" (Súmula TCU 253) é opcional por orçamento (`Budget.supplyBdiId`) e é aplicado aos serviços marcados `isSupplyItem` | Aprovado (proposto pelo Claude) |
| 24 | 2026-11-13 | `Composition.unitCost` é um **cache** do custo calculado pelo motor do app (`scripts/cache-costs.ts`, rodado após cada importação; `null` = sem custo). Serve à busca e às listagens. O recálculo do orçamento **não usa o cache**: recalcula a partir dos itens (decisão #18) | Aprovado (proposto pelo Claude) |
| 25 | 2026-11-13 | Preço com BDI: `preço unitário = TRUNC(custo unitário × (1 + BDI%), 2)`; `preço total = TRUNC(qtd × preço unitário, 2)`; preço de venda = soma dos preços totais; etapa = soma dos filhos. Serviço "sem custo" não soma e é sinalizado na tela | **Aprovado pelo Leo** ("mantenha o padrão; se precisar mudar, peço") |
| 26 | 2026-11-13 | Busca de composições: código numérico → prefixo do código; texto → todas as palavras (qualquer ordem) ou frase exata; **sem distinguir acentos** (extensão `unaccent` do PostgreSQL, criada na migração inicial). Limitada à base de preços do orçamento | Aprovado (proposto pelo Claude) |
| 27 | 2026-11-13 | Toda alteração na EAP (adicionar, editar quantidade/descrição, mover, excluir) recalcula o orçamento inteiro no servidor (`recalculateBudget`). Simples e sempre consistente | **Aprovado pelo Leo** |
| 28 | 2026-11-13 | Curva ABC: a classe é decidida pelo acumulado **antes** do item (A se < 80 %, B se < 95 %, senão C). O item que cruza o limite fica na classe anterior; o 1º item é sempre A. Serviços agrupados por composição; insumos obtidos pela explosão das composições (qtd × coeficientes agregados). O total de insumos difere em centavos do custo direto por causa do truncamento item a item (esperado) | Aprovado (proposto pelo Claude) |
| 29 | 2026-11-13 | Cronograma físico-financeiro: % por mês sobre o preço de venda da etapa. `valor = TRUNC(preço × %/100, 2)`; o último mês com % recebe a diferença de centavos para a linha fechar. Linhas que não somam 100 % são salvas e sinalizadas (obra pública exige 100 %). Duração em `Budget.scheduleMonths` (1–60). **Revisada pela #37: por subetapa** | Aprovado |
| 30 | 2026-11-13 | **Modelo de negócio: SaaS para terceiros.** Multiempresa (tenant) em todos os dados de cadastro e orçamento, bases oficiais compartilhadas entre empresas, autenticação e planos | **Aprovado pelo Leo** · implementado (commit `9225a42`) |
| 31 | 2026-11-13 | **SICRO entra no MVP** (obras rodoviárias; Lei 14.133 art. 23 §2º). Regra TCU: não misturar SINAPI e SICRO item a item no mesmo orçamento — garantido por "uma base por orçamento". Estrutura das planilhas em `09-sicro-estrutura-planilhas.md` | **Aprovado pelo Leo** |
| 32 | 2026-11-13 | **Importação de qualquer UF**: o usuário informa a UF na importação (o arquivo da Caixa traz todas). Cada UF/mês/regime vira uma `PriceTable` | **Aprovado pelo Leo** |
| 33 | 2026-11-13 | **`SINAPI_Manutenções` será importado** para alertar, em orçamentos antigos, composições/insumos desativados ou alterados na referência nova. Nova tabela `SourceMaintenance` (referência, tipo, código, descrição, manutenção) | **Aprovado pelo Leo** |
| 34 | 2026-11-13 | **Upload das planilhas SINAPI pela interface** (tela Bases → Importar): envia o arquivo, escolhe UF e regimes, roda o importador em segundo plano com progresso, e cacheia custos ao final | **Aprovado pelo Leo** |
| 35 | 2026-11-13 | **Autenticação e multiusuário**: login por e-mail + senha; usuários convidados pelo gestor com senha inicial (mostrada uma vez) e troca obrigatória no 1º acesso; recuperação de senha por e-mail fica para depois. Papéis: **gestor** (aprova, administra empresa e usuários), **orçamentista** (cria e edita), **leitura**. Sessão em cookie `httpOnly` com hash SHA-256 no banco (30 dias); senha com scrypt. Toda server action checa sessão, empresa e papel | **Aprovado pelo Leo** · implementado |
| 36 | 2026-11-13 | **Busca de composições inclui a base própria** da empresa, com filtro por base (oficial / própria) e mês de referência (spec §4.7) | **Aprovado pelo Leo** |
| 37 | 2026-11-13 | **Cronograma por subetapa**: cada linha editável é uma etapa/subetapa folha (sem subetapas), em qualquer nível; etapas-pai mostram a soma das filhas e o % derivado | **Aprovado pelo Leo** · implementado (commit `815c0d9`) |
| 38 | 2026-11-13 | **Motor de cálculo próprio do SICRO** (`src/core/sicro.ts`), reproduzindo a metodologia do DNIT: equipamentos (qtd × utilização operativa/improdutiva × custo produtivo/improdutivo), mão de obra, custo de execução = total horário ÷ produção da equipe, FIC, materiais, atividades auxiliares, tempo fixo, transporte; **arredondamento meio para cima no final** (diferente do SINAPI). Verificado contra as 6.619 composições do DF 07/2026 | **Aprovado pelo Leo** |
| 39 | 2026-11-13 | **Transporte (grupo F) no SICRO**: o usuário informa o **DMT por material e tipo de via** (leito natural / revestimento primário / pavimentada) no orçamento, com um **DMT padrão do projeto** como valor inicial. Sem DMT, o custo fica igual ao publicado (sem transporte) e o serviço é sinalizado | **Aprovado pelo Leo** |
| 40 | 2026-11-13 | **Encargos sociais no SICRO** são por profissional (% A1…C por código P9xxx); a tabela de encargos do orçamento SICRO vem do relatório oficial, sem edição no MVP | **Aprovado pelo Leo** |
| 41 | 2026-11-13 | `PriceTable.companyId = null` identifica base oficial compartilhada; índice único `NULLS NOT DISTINCT` impede duplicar origem/UF/mês/regime oficial | Aprovado (proposto pelo Claude) |
| 42 | 2026-11-13 | Migrações aplicadas por `npm run db:migrate` (script próprio sobre `pg`, grava em `_prisma_migrations`), porque o schema-engine do Prisma não baixa no ambiente do Claude. Postgres local via `docker compose up -d` | Aprovado (proposto pelo Claude) |
| 43 | 2026-11-13 | Cronograma: etapa **mista** (com serviços diretos e subetapas) ganha uma linha editável "Serviços diretos de X" com o valor próprio (preço da etapa − soma das subetapas); os % dessa linha ficam gravados no id da própria etapa | Aprovado (proposto pelo Claude) |
| 44 | 2026-11-13 | **Ambiente local do Leo**: código clonado em `~/Documents/orcamento-obras` (Mac), planilhas SINAPI em `~/Documents/orcamento-obras-dados`. O Claude atualiza o código pelo GitHub (`git pull` na pasta); o Leo roda o app no Terminal do Mac (o Claude não consegue iniciar processos no macOS, só arquivos e uma VM Linux) | Aprovado (pedido do Leo) |
| 45 | 2026-11-13 | **Administrador da plataforma** (`User.isPlatformAdmin`), acima das empresas: só ele importa as bases oficiais compartilhadas (tela e API). Concedido por linha de comando: `npm run admin:platform -- email` (`--revoke`, `--list`). Gestores das empresas só veem as bases | **Aprovado pelo Leo** · implementado |
| 46 | 2026-11-13 | **Reimportação bloqueada** para a base oficial (UF + mês + regime) que já tenha orçamento: aquela UF/regime é pulada com aviso e as demais seguem. Base oficial de um mês não muda depois de usada | **Aprovado pelo Leo** · implementado |
| 47 | 2026-11-13 | **Importação pela interface** (#34): aceita o ZIP da Caixa como baixado ou as planilhas soltas; o tipo é reconhecido pelas **abas** (os nomes no ZIP vêm com acento quebrado). Várias UFs e regimes por envio. Roda em segundo plano no próprio servidor Next (`after()`), **uma por vez**, com registro ao vivo (`ImportJob.log`); arquivos em `IMPORT_DIR` apagados ao final; importação interrompida por reinício do servidor é marcada como falha. Limitação conhecida: enquanto calcula, o servidor responde mais devagar por alguns segundos; não serve para hospedagem serverless (rever ao escolher a hospedagem) | Aprovado (proposto pelo Claude) · implementado |
| 48 | 2026-11-13 | **SINAPI_Manutenções** (#33): o arquivo é cumulativo e nacional (34.393 linhas desde 07/2009 no de 10/2026); cada importação **substitui** todas as linhas SINAPI de `SourceMaintenance`, e um arquivo mais antigo nunca sobrescreve um mais novo. Leitor próprio, porque a Caixa grava esse arquivo com XML prefixado (`<x:row>`), que o leitor em streaming do exceljs ignora | Aprovado (proposto pelo Claude) · implementado |
| 49 | 2026-11-13 | **Alertas de manutenção no orçamento**: só em base oficial SINAPI; considera os serviços, as composições auxiliares (recursivo) e os insumos; mostra manutenções com referência **posterior** ao mês do orçamento. Desativação/suspensão = crítico (painel aberto); alterações de itens, coeficientes, família, unidade e descrição = atenção; criação e início de divulgação = informativo. Só alerta: o cálculo continua na base original | Aprovado (proposto pelo Claude) · implementado |
| 50 | 2026-11-13 | **Ambiente local no Mac revisado** (#42, #44): sem Docker; PostgreSQL 16 do Homebrew (usuário `postgres`, banco `orcamento_obras`, porta 5432). No Claude Code desktop o Claude roda comandos e o servidor (`orcamento-obras` no `launch.json`, porta 3010) direto no Mac | **Aprovado pelo Leo** (instalação) |

## Estado do código (2026-11-13, 20h20)
- Repo: github.com/bsbgitleo/orcamento-obras, branch `main`. Último commit no GitHub: `5cd512b`; a importação pela interface (#45–#49) está na pasta local, **ainda sem commit**.
- **91 testes**; `tsc` e `eslint` sem erros.
- Telas: Início, Clientes, BDI, Encargos sociais, Bases (lista, **Importar SINAPI**, acompanhamento da importação), Orçamentos (lista, assistente, planilha com EAP e **alertas de manutenção**, curva ABC, cronograma por subetapa), Login/Cadastro, Minha senha, Empresa → Usuários.

## Próximos passos (ordem combinada)
1. ~~Cronograma por subetapa (#37)~~ ✔
2. ~~Upload SINAPI pela interface + UF escolhida + Manutenções (#32–#34)~~ ✔ (#45–#49)
3. Composições próprias + busca unificada (#36).
4. SICRO: motor, importador das 12 planilhas, DMT no orçamento (#38–#40).
5. Exportações (Excel/PDF) e proposta comercial.

## Pendências
- Ambiente de teste na web (Vercel + Neon) — Leo decide se cria as contas.
- Planos/cobrança do SaaS (fora do MVP).
- Provedor de e-mail para recuperação de senha (depois).
- Pasta `~/orcamento-obras` (fora de Documentos): é um clone antigo do mesmo repositório (`07b2965`, só o `package-lock.json` alterado pelo npm) — o Leo decide se apaga.
- Documentos 01 (especificação), 02 (modelo de dados) e 06 (regras TCU) não estão no repositório.
- Importação em processo separado (worker) se a hospedagem escolhida exigir (#47).
