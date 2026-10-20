# Deploy — Agenda de Entregas

## Pré-requisitos

- Tabelas `_performance_wrike.itens_trabalho`, `pessoas`, `responsaveis_itens` populadas pela sync Wrike.
- Campo **`prazo_em`** preenchido a partir de `dates.due` no Wrike.

## Passos (projeto `rckpuebaiswrxzmywllv`)

1. Aplicar `supabase/migrations/20261020183000_criar_agenda_entregas.sql`
2. Deploy: `supabase functions deploy consultar-agenda-entregas`
3. (Opcional) `.env` local: `SUPABASE_FUNCAO_AGENDA_URL=.../consultar-agenda-entregas`

## Endpoint

- Local: `GET /api/agenda-entregas?segunda=YYYY-MM-DD&squad=&pessoa=&busca=&apenas_pendentes=1`
- Supabase: Edge Function `consultar-agenda-entregas`

Resposta inclui `meta.versao_agenda = 1` quando a migração está ativa.
