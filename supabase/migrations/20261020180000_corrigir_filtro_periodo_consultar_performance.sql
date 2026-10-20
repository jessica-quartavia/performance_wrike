-- Corrige o recorte temporal de consultar_performance e documenta limitações no payload.
-- Não altera tabelas; apenas substitui funções. Aplicar em produção somente após aprovação.

create or replace function _performance_wrike.consultar_performance(
  p_inicio date,
  p_fim date,
  p_id_squad bigint default null,
  p_id_pessoa bigint default null,
  p_todo_periodo boolean default false
)
returns jsonb
language sql
stable
security invoker
set search_path = _performance_wrike, pg_temp
as $$
with base as (
  select i.*
  from itens_trabalho i
  where (p_id_squad is null or i.id_squad = p_id_squad)
    and (p_id_pessoa is null or exists (
      select 1 from responsaveis_itens ri
      where ri.id_item_trabalho = i.id and ri.id_pessoa = p_id_pessoa and ri.ativo
    ))
), limites as (
  select
    case
      when p_todo_periodo then coalesce((select min(b.criado_no_wrike_em::date) from base b), current_date)
      else p_inicio
    end as inicio,
    case
      when p_todo_periodo then current_date
      else p_fim
    end as fim,
    p_todo_periodo as todo_periodo
), params as (
  select
    least(l.inicio, l.fim) as inicio,
    greatest(l.inicio, l.fim) as fim,
    l.todo_periodo,
    (greatest(l.inicio, l.fim) >= current_date) as inclui_hoje
  from limites l
), itens_escopo as (
  select b.*, p.inicio as p_inicio, p.fim as p_fim, p.inclui_hoje
  from base b
  cross join params p
  where coalesce(b.criado_no_wrike_em::date, p.inicio) <= p.fim
    and coalesce(b.concluido_em::date, date '9999-12-31') >= p.inicio
    and not (
      b.grupo_status = 'Cancelled'
      and coalesce(b.atualizado_no_wrike_em::date, b.criado_no_wrike_em::date, p.inicio) < p.inicio
    )
), ciclos as (
  select h.id_item_trabalho,
    min(h.ocorrido_em) filter (where m.considera_execucao and h.origem = 'webhook') as inicio_execucao,
    min(h.ocorrido_em) filter (where m.encerra_ciclo and h.origem = 'webhook') as fim_execucao
  from historico_status_itens h
  join itens_escopo i on i.id = h.id_item_trabalho
  left join mapeamentos_status m on m.id_status_wrike = h.id_status_novo
  where h.ocorrido_em::date between (select inicio from params) and (select fim from params)
  group by h.id_item_trabalho
), itens_com_ciclo as (
  select i.*,
    case
      when c.inicio_execucao is not null and c.fim_execucao is not null and c.fim_execucao >= c.inicio_execucao
        then extract(epoch from (c.fim_execucao - c.inicio_execucao)) / 86400.0
    end as dias_ciclo
  from itens_escopo i
  left join ciclos c on c.id_item_trabalho = i.id
), aberto_no_fim as (
  select i.id
  from itens_escopo i
  cross join params p
  where coalesce(i.criado_no_wrike_em::date, p.inicio) <= p.fim
    and coalesce(i.concluido_em::date, date '9999-12-31') > p.fim
    and not (
      i.grupo_status = 'Cancelled'
      and coalesce(i.atualizado_no_wrike_em::date, i.criado_no_wrike_em::date, p.inicio) <= p.fim
    )
), em_andamento_calc as (
  select i.id
  from itens_escopo i
  cross join params p
  where (
    p.inclui_hoje and i.grupo_status in ('Active', 'Deferred')
  ) or (
    not p.inclui_hoje and exists (select 1 from aberto_no_fim a where a.id = i.id)
  )
), auditoria as (
  select i.id, i.id_wrike, i.titulo, i.link_wrike,
    coalesce(string_agg(p.problema, '; ' order by p.problema), '') as problemas
  from itens_escopo i
  cross join lateral (values
    (case when not i.descricao_preenchida then 'Sem descrição' end),
    (case when i.prazo_em is null then 'Sem prazo' end),
    (case when i.okr is null or btrim(i.okr) = '' or lower(i.okr) = 'nenhum' then 'OKR ausente ou Nenhum' end),
    (case when jsonb_array_length(i.itens) = 0 then 'Itens ausente' end),
    (case when i.itens ? 'Outro' then 'Itens contém Outro' end),
    (case when not exists (select 1 from responsaveis_itens ri where ri.id_item_trabalho = i.id and ri.ativo) then 'Sem responsável' end)
  ) p(problema)
  where p.problema is not null
  group by i.id, i.id_wrike, i.titulo, i.link_wrike
), intervalos_status as (
  select h.id_item_trabalho,
    coalesce(m.nome_status, h.nome_status_novo, 'Não classificado') as etapa,
    extract(epoch from (lead(h.ocorrido_em) over (partition by h.id_item_trabalho order by h.ocorrido_em) - h.ocorrido_em)) / 86400.0 as dias
  from historico_status_itens h
  join itens_escopo i on i.id = h.id_item_trabalho
  cross join params p
  left join mapeamentos_status m on m.id_status_wrike = h.id_status_novo
  where h.ocorrido_em::date between p.inicio and p.fim
), gargalos as (
  select etapa, round(avg(dias)::numeric, 1) as dias_medios
  from intervalos_status
  where dias is not null and dias >= 0
  group by etapa
), metricas as (
  select
    (select count(*) from itens_escopo) as total,
    (select count(*) from em_andamento_calc) as em_andamento,
    count(*) filter (where i.concluido_em::date between (select inicio from params) and (select fim from params)) as entregues,
    count(*) filter (
      where i.grupo_status = 'Cancelled'
        and i.atualizado_no_wrike_em::date between (select inicio from params) and (select fim from params)
    ) as cancelados,
    count(*) filter (where i.criado_no_wrike_em::date between (select inicio from params) and (select fim from params)) as criadas,
    count(*) filter (where i.okr is not null and btrim(i.okr) <> '' and lower(i.okr) <> 'nenhum') as com_okr,
    (select count(*) from auditoria) as itens_com_problema
  from itens_escopo i
)
select jsonb_build_object(
  'meta', jsonb_build_object('versao_consulta', 2),
  'periodo', jsonb_build_object(
    'inicio', (select inicio from params),
    'fim', (select fim from params),
    'todo_periodo', (select todo_periodo from params),
    'inclui_hoje', (select inclui_hoje from params)
  ),
  'definicoes', jsonb_build_object(
    'total', 'Fluxo/escopo: tarefas com ciclo de vida intersectando o intervalo (criação, conclusão ou cancelamento).',
    'criadas', 'Fluxo: tarefas criadas no Wrike dentro do intervalo.',
    'entregues', 'Fluxo: tarefas concluídas dentro do intervalo.',
    'cancelados', 'Fluxo: tarefas canceladas com atualização no Wrike dentro do intervalo.',
    'em_andamento', 'Estoque: com fim no passado, proxy por datas (abertas na data final); com fim hoje ou futuro, status Active/Deferred no recorte.',
    'com_okr', 'Cobertura: tarefas do escopo com OKR preenchido (exceto vazio/Nenhum).',
    'itens_com_problema', 'Qualidade: tarefas do escopo com ao menos uma pendência na auditoria.',
    'status', 'Distribuição de status das tarefas do escopo temporal.',
    'cobertura_okr', 'Percentual de OKR no escopo por squad.',
    'dias_ciclo', 'Duração: cycle time via webhook, transições dentro do intervalo.',
    'gargalos', 'Duração: tempo médio entre transições de status registradas no intervalo.'
  ),
  'limitacoes', (
    select coalesce(jsonb_agg(limite), '[]'::jsonb)
    from (
      select 'Cycle time e gargalos dependem de histórico de webhook; períodos anteriores à ativação podem ficar vazios.' as limite
      union all
      select 'Backlog retroativo usa proxy por datas de criação/conclusão/cancelamento; não há snapshot diário de status.'
      where not (select inclui_hoje from params)
      union all
      select 'Em andamento com fim no presente usa status atual do Wrike entre as tarefas do escopo.'
      where (select inclui_hoje from params)
    ) x
  ),
  'metricas', (select to_jsonb(metricas) from metricas),
  'status', coalesce((
    select jsonb_agg(jsonb_build_object('nome', nome_status, 'quantidade', quantidade) order by quantidade desc)
    from (select nome_status, count(*) as quantidade from itens_escopo group by nome_status) x
  ), '[]'::jsonb),
  'squads', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'nome', s.nome, 'tipo_grupo', s.tipo_grupo,
      'em_andamento', coalesce(x.em_andamento, 0),
      'entregues', coalesce(x.entregues, 0),
      'cobertura_okr', coalesce(x.cobertura_okr, 0)
    ) order by s.tipo_grupo, s.nome)
    from squads s
    left join (
      select
        i.id_squad,
        count(*) filter (where exists (select 1 from em_andamento_calc e where e.id = i.id)) as em_andamento,
        count(*) filter (where i.concluido_em::date between (select inicio from params) and (select fim from params)) as entregues,
        round(100.0 * count(*) filter (where i.okr is not null and btrim(i.okr) <> '' and lower(i.okr) <> 'nenhum') / nullif(count(*), 0), 1) as cobertura_okr
      from itens_escopo i
      group by i.id_squad
    ) x on x.id_squad = s.id
    where s.ativo
  ), '[]'::jsonb),
  'pessoas', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'nome', p.nome,
      'em_andamento', coalesce(x.em_andamento, 0),
      'entregues', coalesce(x.entregues, 0),
      'dias_ciclo_medio', x.dias_ciclo_medio
    ) order by coalesce(x.em_andamento, 0) desc, p.nome)
    from pessoas p
    left join (
      select
        ri.id_pessoa,
        count(*) filter (where exists (select 1 from em_andamento_calc e where e.id = i.id)) as em_andamento,
        count(*) filter (where i.concluido_em::date between (select inicio from params) and (select fim from params)) as entregues,
        round(avg(ic.dias_ciclo)::numeric, 1) as dias_ciclo_medio
      from responsaveis_itens ri
      join itens_escopo i on i.id = ri.id_item_trabalho
      left join itens_com_ciclo ic on ic.id = i.id
      where ri.ativo
      group by ri.id_pessoa
    ) x on x.id_pessoa = p.id
    where p.ativo
  ), '[]'::jsonb),
  'top_itens', coalesce((
    select jsonb_agg(jsonb_build_object(
      'titulo', titulo, 'link_wrike', link_wrike, 'nome_status', nome_status, 'dias_ciclo', dias_ciclo, 'squad', squad
    ) order by dias_ciclo desc)
    from (
      select ic.titulo, ic.link_wrike, ic.nome_status, round(ic.dias_ciclo::numeric, 1) as dias_ciclo, s.nome as squad
      from itens_com_ciclo ic
      left join squads s on s.id = ic.id_squad
      where ic.dias_ciclo is not null
      order by ic.dias_ciclo desc
      limit 10
    ) t
  ), '[]'::jsonb),
  'gargalos', coalesce((
    select jsonb_agg(jsonb_build_object('etapa', etapa, 'dias_medios', dias_medios) order by dias_medios desc)
    from gargalos
  ), '[]'::jsonb),
  'auditoria', coalesce((
    select jsonb_agg(jsonb_build_object('id_wrike', id_wrike, 'titulo', titulo, 'link_wrike', link_wrike, 'problemas', problemas) order by titulo)
    from (select * from auditoria order by titulo limit 50) a
  ), '[]'::jsonb),
  'avisos', jsonb_build_array(
    'Bugs críticos e validação de hipóteses dependem de campos de classificação ainda não cadastrados no Wrike.',
    'Cycle time considera apenas transições registradas via webhook dentro do intervalo selecionado.'
  )
);
$$;

grant execute on function _performance_wrike.consultar_performance(date, date, bigint, bigint, boolean) to service_role;

drop function if exists api.consultar_performance_wrike(date, date, bigint, bigint);

create or replace function api.consultar_performance_wrike(
  p_inicio date,
  p_fim date,
  p_id_squad bigint default null,
  p_id_pessoa bigint default null,
  p_todo_periodo boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path = _performance_wrike, pg_temp
as $$
  select _performance_wrike.consultar_performance(p_inicio, p_fim, p_id_squad, p_id_pessoa, p_todo_periodo);
$$;

revoke all on function api.consultar_performance_wrike(date, date, bigint, bigint, boolean) from public, anon, authenticated;
grant execute on function api.consultar_performance_wrike(date, date, bigint, bigint, boolean) to service_role;
