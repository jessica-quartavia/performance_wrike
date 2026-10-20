-- Agenda semanal de entregas (prazo_em). Aplicar em produção somente após aprovação.

create or replace function _performance_wrike.consultar_agenda_entregas(
  p_segunda date,
  p_id_squad bigint default null,
  p_id_pessoa bigint default null,
  p_apenas_pendentes boolean default false,
  p_busca text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = _performance_wrike, pg_temp
as $$
with params as (
  select
    p_segunda as segunda,
    (p_segunda + 4) as sexta,
    current_date as hoje
), dias_semana as (
  select
    gs::date as data,
    case extract(isodow from gs)
      when 1 then 'Segunda-feira'
      when 2 then 'Terça-feira'
      when 3 then 'Quarta-feira'
      when 4 then 'Quinta-feira'
      when 5 then 'Sexta-feira'
    end as dia_semana
  from params p
  cross join generate_series(p.segunda, p.sexta, interval '1 day') gs
), base as (
  select
    i.id,
    i.id_wrike,
    i.titulo,
    i.link_wrike,
    i.nome_status,
    i.grupo_status,
    i.prazo_em,
    i.prazo_em::date as prazo_dia,
    i.concluido_em,
    i.id_squad,
    (i.grupo_status = 'Completed' or i.concluido_em is not null) as concluida,
    (i.grupo_status = 'Cancelled') as cancelada,
    (
      i.grupo_status not in ('Completed', 'Cancelled')
      and i.concluido_em is null
      and i.prazo_em::date < (select hoje from params)
    ) as atrasada,
    (
      i.grupo_status not in ('Completed', 'Cancelled')
      and i.concluido_em is null
    ) as pendente
  from itens_trabalho i
  cross join params p
  where i.prazo_em is not null
    and i.prazo_em::date between p.segunda and p.sexta
    and (p_id_squad is null or i.id_squad = p_id_squad)
    and (p_id_pessoa is null or exists (
      select 1 from responsaveis_itens ri
      where ri.id_item_trabalho = i.id and ri.id_pessoa = p_id_pessoa and ri.ativo
    ))
    and (p_busca is null or btrim(p_busca) = '' or i.titulo ilike '%' || btrim(p_busca) || '%')
    and (not p_apenas_pendentes or (
      i.grupo_status not in ('Completed', 'Cancelled') and i.concluido_em is null
    ))
), linhas as (
  select b.*, p.id as pessoa_id, p.nome as pessoa_nome
  from base b
  join responsaveis_itens ri on ri.id_item_trabalho = b.id and ri.ativo
  join pessoas p on p.id = ri.id_pessoa
  union all
  select b.*, 0::bigint as pessoa_id, 'Sem responsável' as pessoa_nome
  from base b
  where not exists (
    select 1 from responsaveis_itens ri where ri.id_item_trabalho = b.id and ri.ativo
  )
), metricas as (
  select
    count(distinct id) as previstas,
    count(distinct id) filter (where concluida) as concluidas,
    count(distinct id) filter (where pendente) as pendentes,
    count(distinct id) filter (where atrasada) as atrasadas
  from base
)
select jsonb_build_object(
  'meta', jsonb_build_object('versao_agenda', 1),
  'semana', jsonb_build_object(
    'segunda', (select segunda from params),
    'sexta', (select sexta from params)
  ),
  'metricas', (select to_jsonb(metricas) from metricas),
  'dias', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'data', d.data,
        'dia_semana', d.dia_semana,
        'is_hoje', d.data = (select hoje from params),
        'quantidade', coalesce((
          select count(distinct l.id) from linhas l where l.prazo_dia = d.data
        ), 0),
        'grupos', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'pessoa_id', g.pessoa_id,
              'nome', g.pessoa_nome,
              'tarefas', g.tarefas
            ) order by case when g.pessoa_nome = 'Sem responsável' then 1 else 0 end, g.pessoa_nome
          )
          from (
            select
              l.pessoa_id,
              l.pessoa_nome,
              jsonb_agg(
                jsonb_build_object(
                  'id_wrike', l.id_wrike,
                  'titulo', l.titulo,
                  'link_wrike', l.link_wrike,
                  'nome_status', l.nome_status,
                  'concluida', l.concluida,
                  'cancelada', l.cancelada,
                  'pendente', l.pendente,
                  'atrasada', l.atrasada
                ) order by l.titulo
              ) as tarefas
            from linhas l
            where l.prazo_dia = d.data
            group by l.pessoa_id, l.pessoa_nome
          ) g
        ), '[]'::jsonb)
      ) order by d.data
    )
    from dias_semana d
  ), '[]'::jsonb)
);
$$;

grant execute on function _performance_wrike.consultar_agenda_entregas(date, bigint, bigint, boolean, text) to service_role;

create or replace function api.consultar_agenda_entregas_wrike(
  p_segunda date,
  p_id_squad bigint default null,
  p_id_pessoa bigint default null,
  p_apenas_pendentes boolean default false,
  p_busca text default null
)
returns jsonb
language sql
stable
security definer
set search_path = _performance_wrike, pg_temp
as $$
  select _performance_wrike.consultar_agenda_entregas(
    p_segunda, p_id_squad, p_id_pessoa, p_apenas_pendentes, p_busca
  );
$$;

revoke all on function api.consultar_agenda_entregas_wrike(date, bigint, bigint, boolean, text) from public, anon, authenticated;
grant execute on function api.consultar_agenda_entregas_wrike(date, bigint, bigint, boolean, text) to service_role;
