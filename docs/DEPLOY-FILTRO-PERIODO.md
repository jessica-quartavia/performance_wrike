# Deploy — correção do filtro de período

O dashboard local envia `inicio`, `fim` e `periodo=todo` corretamente. A correção analítica vive no Postgres.

## Sintoma com SQL antigo (produção atual)

- `metricas.total` e soma de `status` **não mudam** entre meses diferentes.
- `metricas.entregues` **muda** (único recorte parcial na versão antiga).
- Resposta **sem** `definicoes` nem `metricas.criadas`.
- `periodo=todo` cai nos últimos 30 dias.

## Passos (projeto `rckpuebaiswrxzmywllv`)

1. Aplicar migração:
   - `supabase/migrations/20261020180000_corrigir_filtro_periodo_consultar_performance.sql`
   - Via Dashboard SQL ou `supabase db push` com CLI linkado ao projeto correto.

2. Redeploy da Edge Function:
   - `supabase functions deploy consultar-performance`

3. Validar:
   ```bash
   npm run test:periodo
   npm run test:periodo:matriz
   ```
   Deve terminar com **PASSOU** (`versao2: true`, `soma_status === escopo` e totais variando entre recortes).

## Matriz esperada após deploy

| Componente | Regra (v2) |
|---|---|
| Tarefas no escopo | `itens_escopo` (interseção do ciclo de vida com o intervalo) |
| Carga por squad / status | agregados sobre `itens_escopo` |
| OKR | `com_okr` e cobertura por squad no mesmo escopo |
| Performance por responsável | joins `responsaveis_itens` → `itens_escopo` |
| Auditoria | pendências apenas em `itens_escopo` |

Enquanto a migração não estiver aplicada, **todos os gráficos e tabelas** continuam no backlog inteiro; só KPIs de fluxo parcial (ex.: entregues) mudam — o banner amarelo e `meta.diagnostico_periodo.versao_sql === 1` confirmam isso.

## Não aplicar no MCP errado

Confirme o `project_ref` antes de executar SQL. O projeto deste dashboard é `rckpuebaiswrxzmywllv`.
