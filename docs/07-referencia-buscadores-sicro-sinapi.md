# Referência — buscadorsicro.com.br e buscadorsinapi.com.br (consultados em 13/11/2026)

Sites independentes (sem vínculo com DNIT/Caixa) que apresentam as tabelas oficiais. Servem de inspiração de funcionalidades e para conferir estrutura de dados. **A fonte dos nossos dados continua sendo a planilha oficial** (Caixa para SINAPI, DNIT para SICRO); os próprios sites recomendam confirmar os valores nos canais oficiais.

## buscadorsicro.com.br (SICRO, referência jul/2026)
- Tabela por estado (27 UFs, agrupadas por região) e navegação por 44 categorias (ex.: Dragagem, Transportes, Bueiros de Concreto, Desmonte de Rochas, Fundações, Regularização e Sub-base, Ferrovias — Dormentes).
- Composições com código de 7 dígitos e custo dividido em grupos **A a F**: equipamentos, mão de obra, materiais, atividades auxiliares, tempo fixo e transporte. Insumos com prefixo por tipo (P = mão de obra, E = equipamento, M = material; ex.: P9824 Servente, E9686 Caminhão guindauto, M0424 Cimento CP II-32).
- "Top 100 insumos por uso": ranking pelo número de composições que usam o insumo (2.027 insumos com uso em jul/2026; corte do top 100 = 53 composições), preço médio simples entre as UFs com valor.
- Ferramentas: calculadora de BDI, calculadora de composição, comparador SICRO × SINAPI, glossário.

## buscadorsinapi.com.br (SINAPI, referência out/2026)
- 10.710 composições e 5.038 insumos — confere com a nossa importação de out/2026.
- Tabela por estado; navegação por 12 grupos; atalhos "por tipo de obra".
- Calculadoras de quantitativos (parceria com calculadoradeconstrucao.com.br): tijolos por m², traço de concreto, piso e porcelanato, tinta por m², argamassa, telhas.
- Calculadora de BDI pelo Acórdão TCU 2622/2013 com faixas por tipo de obra (já temos no cadastro de BDI).

## O que levar para o app (backlog, a priorizar)
- Importador SICRO (planilha oficial DNIT): código de 7 dígitos, grupos A–F, categorias. **Pendente: arquivo de exemplo.**
- "Top insumos por uso" calculado da nossa base (já temos itens das composições).
- Navegação por grupo/categoria (campo `Composition.group` já importado do SINAPI).
- Comparador SINAPI × SICRO para o mesmo serviço (atenção à regra do TCU de não misturar bases item a item no orçamento — pode comparar, não misturar).
- Calculadoras de quantitativos como ajuda ao levantamento (geram quantidade para um serviço da EAP).
