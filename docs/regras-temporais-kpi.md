# Regras temporais dos indicadores — Performance Wrike

Universo base: **`itens_escopo`** — tarefas que passam pelos filtros de squad/pessoa e **intersectam** o intervalo `[início, fim]`:

- criadas até o fim do período;
- não concluídas antes do início;
- canceladas antes do início ficam fora.

**Todo o período:** `p_todo_periodo = true` → início = data mínima de criação na base (com filtros dimensionais) e fim = hoje.

## KPIs (fluxo vs estoque vs duração)

| Indicador | Tipo | Regra |
|-----------|------|--------|
| Tarefas no escopo | Escopo | Contagem de `itens_escopo` |
| Criadas | Fluxo | `criado_no_wrike_em` dentro do intervalo |
| Entregues | Fluxo | `concluido_em` dentro do intervalo |
| Canceladas | Fluxo | `grupo_status = Cancelled` e `atualizado_no_wrike_em` no intervalo |
| Em andamento | Estoque | Se fim ≥ hoje: `Active`/`Deferred` no escopo; senão proxy “aberto na data final” por datas |
| Com OKR | Cobertura | OKR preenchido (≠ vazio/Nenhum) no escopo |
| Pendências de qualidade | Qualidade | Auditoria aplicada só ao escopo |
| Status (gráfico) | Escopo | Distribuição de `nome_status` no escopo |
| Cobertura OKR por squad | Cobertura | % no escopo por squad |
| Cycle time / Top 10 | Duração | Webhook; transições com `ocorrido_em` no intervalo |
| Gargalos | Duração | Média de intervalos entre transições no intervalo |

## Limitações declaradas no payload

- Sem snapshot diário de status → backlog retroativo é **proxy** por datas.
- Cycle time depende de webhook ativo e histórico no intervalo.

## Parâmetros HTTP

- `inicio`, `fim`: `YYYY-MM-DD`
- `periodo=todo` ou `todo_periodo=true`: histórico completo
- `squad`, `pessoa`: IDs internos (bigint)
