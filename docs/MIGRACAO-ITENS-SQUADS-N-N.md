# Plano de migração — `itens_trabalho_squads` (N:N)

**Projeto:** Business Data (`rckpuebaiswrxzmywllv`) · schema `_performance_wrike`  
**Arquivo:** `supabase/migrations/20261028173000_itens_trabalho_squads_nn.sql`

## Objetivo

Contagem global por `id_wrike` única; análise por squad refletindo **todos** os boards vinculados no Wrike.

## Pré-requisitos

1. Backup lógico ou snapshot do schema `_performance_wrike`.
2. Janela de manutenção curta (DDL + replace de funções).
3. Ordem recomendada se ainda não aplicada: `20261020180000` (filtro período v2) **ou** aplicar apenas `20261028173000` (já inclui v2 + N:N).

## Passos de implantação

1. **Aplicar migração SQL** (MCP/CLI) — cria tabela, backfill a partir de `id_squad`, substitui `consultar_performance` e `consultar_agenda_entregas`.
2. **Deploy Edge Functions:** `sincronizar-wrike`, `consultar-performance` (sem mudança de contrato HTTP).
3. **Executar reconciliação Wrike** uma vez para popular `itens_trabalho_squads` com todos os `parentIds`.
4. **Validação:**
   - `npm run test:periodo` (se v2 ativa)
   - `npm run test:periodo:parcial` (legado)
   - `npm test`
   - Comparar `count(distinct id_wrike)` vs `metricas.total` e soma de `em_andamento` por squad ≥ total (quando houver multi-board).

## Rollback

1. Restaurar funções SQL anteriores (`consultar_performance` v1 ou v2 sem N:N) a partir do repositório git.
2. Opcional: `drop table _performance_wrike.itens_trabalho_squads` (não remove `itens_trabalho.id_squad` legado).
3. Redeploy Edge com versão anterior de `sincronizar.ts` (apenas `.find()`).
4. Reconciliação Wrike.

**Nota:** rollback de funções sem dropar a tabela N:N é seguro; consultas antigas ignoram a junction.

## Validação de contagens (SQL manual pós-deploy)

```sql
-- Tarefas únicas
select count(*) from _performance_wrike.itens_trabalho;

-- Tarefas com mais de um squad
select id_item_trabalho, count(*) from _performance_wrike.itens_trabalho_squads
group by 1 having count(*) > 1;

-- Backfill legado coberto
select count(*) from _performance_wrike.itens_trabalho i
where i.id_squad is not null
  and not exists (
    select 1 from _performance_wrike.itens_trabalho_squads its
    where its.id_item_trabalho = i.id and its.id_squad = i.id_squad
  );
```

## Pendências

- Aplicar migração em **produção** (aguardando autorização).
- Após sync, confirmar `meta.multi_squad: true` na API de performance.
