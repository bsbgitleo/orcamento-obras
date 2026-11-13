# SICRO — estrutura das planilhas oficiais (DNIT, DF 07/2026)

Fonte: 12 planilhas enviadas pelo Leo em 13/11/2026 (`DF_07-2026_Relatório_*.xlsx`). Conferido com Python/openpyxl.

## Arquivos e conteúdo
| Arquivo | Aba | Conteúdo | Linhas |
|---|---|---|---|
| Sintético de Composições de Custos | Sheet1 | Código (7 dígitos), descrição, unidade, **custo unitário (2 casas)** | 6.619 composições |
| **Analítico de Composições de Custos** (7,7 MB) | Sheet1 | Um bloco por composição com grupos A–F (abaixo) | 6.619 blocos |
| Sintético de Mão de Obra (+ com desoneração) | Rel. Sintético | Código P9xxx, descrição, unidade (h / mês), custo (4 casas) | 1.479 |
| Analítico de Mão de Obra (+ com desoneração) | Rel. Analítico | Por profissional: salário + grupos A/B/C de encargos + encargos complementares | 8.845 linhas |
| Analítico de Encargos Sociais (+ com desoneração) | Encargos | Por profissional: % de cada encargo A1…, B…, C… | 183 |
| Sintético de Materiais | Sheet1 | Código M0xxx, descrição, unidade, preço (4 casas) | 1.704 |
| Sintético de Equipamentos (+ com desoneração) | Sheet1 | Código E9xxx: valor de aquisição, depreciação, oportunidade de capital, seguros, manutenção, operação, MO de operação, **custo produtivo e improdutivo (R$/h)** | 570 |
| Sintético de Origem de Preços | ENTREGA | Por insumo × UF: tipo de preço (P coletado, EST estimado, E extrapolado, I imputado, DMT, MDO, Z zerado…) | 2.422 |

Prefixos de código: **P** mão de obra, **M** material, **E** equipamento, **A** (origem de preços: itens de aquisição), composições com 7 dígitos (as de transporte começam com 59).

## Bloco de uma composição (Analítico)
```
Cabeçalho: UF | mês | FIC (fator de influência da chuva, ex. 0,02844) | Produção da equipe (ex. 2 dm³/h)
Código | Descrição
A - EQUIPAMENTOS   código | descrição | quantidade | utilização operativa | utilização improdutiva | custo produtivo | custo improdutivo | custo horário total
                   custo horário = qtd × (util.oper × custo produtivo + util.improd × custo improdutivo)
B - MÃO DE OBRA    código | descrição | quantidade | unidade | custo horário | custo horário total
   Custo horário total de execução = ΣA + ΣB
   Custo unitário de execução       = custo horário total / produção da equipe
   Custo do FIC                     = custo unitário de execução × FIC
C - MATERIAL       código | descrição | quantidade | unidade | preço unitário | custo unitário (= qtd × preço)
D - ATIVIDADES AUXILIARES  código (composição) | quantidade | unidade | custo unitário (da composição) | custo
   Subtotal = execução + FIC + C + D
E - TEMPO FIXO     material | código da composição de tempo fixo (59xxxxx) | quantidade (t) | custo unitário | custo
F - MOMENTO DE TRANSPORTE  material | quantidade (tkm) | códigos das composições de transporte por tipo de via (LN leito natural, RP revestimento primário, P pavimentada) | DMT | FIT | custo
   Custo unitário direto total = Subtotal + E + F
```
Valores com **4 casas** nos insumos; o custo final publicado tem **2 casas, arredondado (meio para cima)** — ex.: 184,5988 → 184,60. Diferente do SINAPI (que trunca).

## Medições (DF 07/2026)
- 6.619 composições; o custo do Analítico bate com o Sintético em **100 %**.
- 5.033 com equipamentos; 3.703 com atividades auxiliares; 2.989 com tempo fixo; **3.170 com transporte (F), todas com custo em branco** — o DMT (distância média de transporte) é do projeto, não da tabela. O custo publicado **não inclui transporte**.
- Regimes: há versão "com desoneração" para mão de obra, equipamentos e encargos → duas tabelas (sem / com desoneração), como no SINAPI.

## Implicações para o app
1. **Motor de cálculo próprio para o SICRO** (`src/core/sicro.ts`): equipamentos com utilização, produção da equipe, FIC, auxiliares, tempo fixo e transporte; arredondamento meio para cima no final. Verificável contra as 6.619 composições, como foi feito com o SINAPI.
2. **Modelo de dados**: a `CompositionItem` precisa de campos extras para o SICRO (grupo A–F, utilização operativa/improdutiva, códigos de transporte LN/RP/P); a `Composition` precisa de `productionRate` e `fic`; o `Input` de equipamento precisa de custo produtivo e improdutivo.
3. **Transporte**: no orçamento, o usuário informa o DMT por material e tipo de via (ou um DMT padrão do projeto); sem DMT, o custo fica igual ao publicado e o item é sinalizado "sem transporte".
4. **Encargos sociais**: o SICRO publica os % por profissional (A1…C), não um percentual único — a tabela de encargos do orçamento SICRO vem do próprio relatório.
5. **Não misturar** SINAPI e SICRO item a item no mesmo orçamento (TCU) — a regra atual de uma base por orçamento já garante isso.
