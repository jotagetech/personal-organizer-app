-- Catálogo canônico de exercícios. Um exercício global (owner_user_id nulo)
-- vale para todas as contas; um exercício privado existe só para quem o criou,
-- enquanto a curadoria não o funde num global. Duas séries são do mesmo
-- exercício quando a carga de uma é comparável à da outra: o exercise_key do
-- plano continua sendo a chave da sessão, e exercise_id é o vínculo com o
-- catálogo, que junta o histórico de planos diferentes.

-- Mesma regra de normalizeAlias (src/lib/exerciseCatalogSeed.ts): minúsculas,
-- sem acento, qualquer coisa fora de a-z e 0-9 vira espaço. A lista de
-- acentos cobre o que a decomposição NFKD do lado do app remove; "ø" fica de
-- fora de propósito, porque lá ele também não se decompõe e vira separador.
-- As maiúsculas acentuadas são trocadas antes do lower(), que dependendo do
-- locale do banco só converte ASCII.
create function normalize_exercise_name(p_text text) returns text
language sql immutable parallel safe as $$
    select btrim(regexp_replace(
        lower(translate(
            coalesce(p_text, ''),
            'áàâãäåāéèêëēíìîïīóòôõöōúùûüūçñýÿºªÁÀÂÃÄÅĀÉÈÊËĒÍÌÎÏĪÓÒÔÕÖŌÚÙÛÜŪÇÑÝŸ',
            'aaaaaaaeeeeeiiiiioooooouuuuucnyyoaaaaaaaaeeeeeiiiiioooooouuuuucnyy'
        )),
        '[^a-z0-9]+', ' ', 'g'
    ))
$$;

-- Nome digitado numa ficha costuma trazer prescrição junto ("Rosca direta
-- (RIR 2)", "Tríceps corda drop", "Farmer walk pesado"). Tempo, pausa, drop e
-- intensidade não mudam o exercício, então saem antes de comparar.
create function exercise_match_key(p_text text) returns text
language sql immutable parallel safe as $$
    select btrim(regexp_replace(
        regexp_replace(
            normalize_exercise_name(regexp_replace(coalesce(p_text, ''), '\([^)]*\)', ' ', 'g')),
            '\m(leve|pesado|drop|com pausa|finisher|manutencao|quase falha|ate falha)\M', ' ', 'g'
        ),
        '\s+', ' ', 'g'
    ))
$$;

create table exercises (
    id uuid primary key default gen_random_uuid(),
    slug text not null check (slug ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
    owner_user_id uuid references auth.users (id) on delete cascade,
    name_pt text not null check (length(trim(name_pt)) > 0),
    name_norm text generated always as (normalize_exercise_name(name_pt)) stored,
    family text check (family is null or family ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
    primary_muscle text check (primary_muscle is null or primary_muscle = any (array[
        'peito', 'costas', 'trapezio', 'lombar', 'ombro_anterior', 'ombro_lateral', 'ombro_posterior',
        'biceps', 'triceps', 'antebraco', 'abdomen', 'gluteos', 'quadriceps', 'posterior_coxa',
        'adutores', 'abdutores', 'panturrilha', 'tibial'
    ])),
    secondary_muscles text[] not null default '{}' check (secondary_muscles <@ array[
        'peito', 'costas', 'trapezio', 'lombar', 'ombro_anterior', 'ombro_lateral', 'ombro_posterior',
        'biceps', 'triceps', 'antebraco', 'abdomen', 'gluteos', 'quadriceps', 'posterior_coxa',
        'adutores', 'abdutores', 'panturrilha', 'tibial'
    ]),
    equipment text check (equipment is null or equipment = any (array[
        'barra', 'halteres', 'maquina', 'cabo', 'kettlebell', 'elastico', 'peso_corporal', 'outro'
    ])),
    pegada text check (pegada is null or pegada = any (array['pronada', 'supinada', 'neutra'])),
    largura_pegada text check (largura_pegada is null or largura_pegada = any (array['fechada', 'media', 'aberta'])),
    acessorio text check (acessorio is null or acessorio = any (array[
        'barra_reta', 'barra_w', 'barra_neutra', 'triangulo', 'corda', 'alca'
    ])),
    padrao_movimento text check (padrao_movimento is null or padrao_movimento = any (array[
        'empurrar_horizontal', 'empurrar_vertical', 'puxar_horizontal', 'puxar_vertical',
        'elevacao_ombro', 'rotacao_ombro', 'elevacao_escapula', 'agachar', 'afundo',
        'dobradica_quadril', 'extensao_quadril', 'extensao_joelho', 'flexao_joelho',
        'abducao_quadril', 'aducao_quadril', 'flexao_plantar', 'dorsiflexao', 'flexao_cotovelo',
        'extensao_cotovelo', 'pegada', 'flexao_tronco', 'antiextensao', 'antirrotacao', 'rotacao',
        'carregamento', 'corpo_inteiro'
    ])),
    default_load_form text not null default 'total' check (default_load_form = any (array[
        'total', 'por_lado', 'por_halter', 'peso_corporal', 'assistencia'
    ])),
    description_pt text,
    source text not null default 'proprio',
    source_ref text,
    license text,
    attribution text,
    -- Exercício privado que a curadoria fundiu num global: continua existindo
    -- para planos que citam o slug dele, mas todo vínculo segue para o destino.
    merged_into_id uuid references exercises (id),
    created_at timestamptz not null default now(),
    -- Global precisa de ficha completa; privado nasce só com o nome.
    check (
        owner_user_id is not null
        or (
            family is not null and primary_muscle is not null and equipment is not null
            and padrao_movimento is not null and description_pt is not null
        )
    ),
    -- O prefixo meu_ é reservado ao privado, então um global novo nunca toma o
    -- slug que um plano usa para um exercício privado.
    check ((owner_user_id is null) = (slug not like 'meu\_%')),
    check (source = 'proprio' or (source_ref is not null and license is not null and attribution is not null))
);

create unique index exercises_global_slug_idx on exercises (slug) where owner_user_id is null;
create unique index exercises_private_slug_idx on exercises (owner_user_id, slug) where owner_user_id is not null;
create unique index exercises_global_name_idx on exercises (name_norm) where owner_user_id is null;
create unique index exercises_private_name_idx on exercises (owner_user_id, name_norm) where owner_user_id is not null;
create index exercises_family_idx on exercises (family);

create table exercise_aliases (
    id uuid primary key default gen_random_uuid(),
    exercise_id uuid not null references exercises (id) on delete cascade,
    owner_user_id uuid references auth.users (id) on delete cascade,
    alias text not null check (length(trim(alias)) > 0),
    alias_norm text generated always as (normalize_exercise_name(alias)) stored,
    created_at timestamptz not null default now(),
    check (length(normalize_exercise_name(alias)) > 0)
);

create unique index exercise_aliases_global_idx on exercise_aliases (alias_norm) where owner_user_id is null;
create unique index exercise_aliases_private_idx on exercise_aliases (owner_user_id, alias_norm) where owner_user_id is not null;
create index exercise_aliases_exercise_id_idx on exercise_aliases (exercise_id);

-- Nome que vale para mais de uma variação ("pull down", "remada baixa"): a
-- busca mostra os exercícios das famílias e a pessoa escolhe.
create table exercise_generic_names (
    name_norm text primary key,
    name text not null,
    families text[] not null check (cardinality(families) > 0)
);

alter table workout_sets add column exercise_id uuid references exercises (id) on delete set null;
create index workout_sets_exercise_id_idx on workout_sets (exercise_id);

-- Privado ganha slug próprio com o prefixo meu_ e sufixo numérico se o nome
-- já existir na conta; o dono escolhe só o nome. Campos de curadoria e de
-- fonte não são do cliente.
create function exercises_prepare_private() returns trigger as $$
declare
    v_base text;
    v_slug text;
    v_suffix integer := 1;
begin
    if new.owner_user_id is null then
        return new;
    end if;
    v_base := 'meu_' || coalesce(nullif(replace(normalize_exercise_name(new.name_pt), ' ', '_'), ''), 'exercicio');
    v_slug := v_base;
    while exists (
        select 1 from exercises e
        where e.owner_user_id = new.owner_user_id and e.slug = v_slug and e.id <> new.id
    ) loop
        v_suffix := v_suffix + 1;
        v_slug := v_base || '_' || v_suffix;
    end loop;
    -- A curadoria roda como dono do banco (funções security definer ou CLI) e
    -- é a única que marca a fusão; vindo do app, o campo não muda.
    if tg_op = 'INSERT' then
        new.slug := v_slug;
        new.merged_into_id := null;
    else
        new.slug := old.slug;
        if current_user in ('anon', 'authenticated') then
            new.merged_into_id := old.merged_into_id;
        end if;
    end if;
    new.source := 'proprio';
    new.source_ref := null;
    new.license := null;
    new.attribution := null;
    return new;
end;
$$ language plpgsql set search_path = public;

create trigger exercises_prepare_private_trigger
    before insert or update on exercises
    for each row execute function exercises_prepare_private();

create function follow_exercise_merge(p_exercise_id uuid) returns uuid as $$
declare
    v_current uuid := p_exercise_id;
    v_next uuid;
    v_hops integer := 0;
begin
    loop
        select e.merged_into_id into v_next from exercises e where e.id = v_current;
        exit when v_next is null or v_hops >= 10;
        v_current := v_next;
        v_hops := v_hops + 1;
    end loop;
    return v_current;
end;
$$ language plpgsql stable security definer set search_path = public;

-- Ordem de prioridade: o slug que o plano declara; depois o apelido da conta
-- (escolha explícita da pessoa); o exercício privado dela; o nome global; o
-- apelido global. Nome genérico ou desconhecido fica sem vínculo, para a
-- pessoa decidir.
create function resolve_exercise_id(p_user_id uuid, p_slug text, p_name text) returns uuid as $$
declare
    v_id uuid;
    v_keys text[] := array_remove(array[normalize_exercise_name(p_name), exercise_match_key(p_name)], '');
begin
    if p_slug is not null and p_slug <> '' then
        select e.id into v_id
        from exercises e
        where e.slug = p_slug and (e.owner_user_id is null or e.owner_user_id = p_user_id)
        order by e.owner_user_id nulls last
        limit 1;
    end if;
    if v_id is null and cardinality(v_keys) > 0 then
        select a.exercise_id into v_id
        from exercise_aliases a
        where a.owner_user_id = p_user_id and a.alias_norm = any (v_keys)
        order by array_position(v_keys, a.alias_norm)
        limit 1;
    end if;
    if v_id is null and cardinality(v_keys) > 0 then
        select e.id into v_id
        from exercises e
        where e.owner_user_id = p_user_id and e.name_norm = any (v_keys)
        order by array_position(v_keys, e.name_norm)
        limit 1;
    end if;
    if v_id is null and cardinality(v_keys) > 0 then
        select e.id into v_id
        from exercises e
        where e.owner_user_id is null and e.name_norm = any (v_keys)
        order by array_position(v_keys, e.name_norm)
        limit 1;
    end if;
    if v_id is null and cardinality(v_keys) > 0 then
        select a.exercise_id into v_id
        from exercise_aliases a
        where a.owner_user_id is null and a.alias_norm = any (v_keys)
        order by array_position(v_keys, a.alias_norm)
        limit 1;
    end if;
    if v_id is null then
        return null;
    end if;
    return follow_exercise_merge(v_id);
end;
$$ language plpgsql stable security definer set search_path = public;

revoke execute on function resolve_exercise_id(uuid, text, text) from public, anon, authenticated;
revoke execute on function follow_exercise_merge(uuid) from public, anon, authenticated;

-- O vínculo vem sempre do snapshot da sessão, nunca do cliente: o envio das
-- séries não muda, e uma série não consegue apontar para exercício de outra
-- conta.
create function workout_sets_set_exercise_id() returns trigger as $$
declare
    v_user_id uuid;
    v_snapshot_exercise jsonb;
begin
    select s.user_id, item into v_user_id, v_snapshot_exercise
    from workout_sessions s
    cross join lateral jsonb_array_elements(coalesce(s.workout_snapshot -> 'exercicios', '[]'::jsonb)) as item
    where s.id = new.session_id and item ->> 'exercise_key' = new.exercise_key
    limit 1;

    new.exercise_id := case
        when v_user_id is null then null
        else resolve_exercise_id(v_user_id, v_snapshot_exercise ->> 'catalogo', v_snapshot_exercise ->> 'nome')
    end;
    return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger workout_sets_set_exercise_id_trigger
    before insert or update of exercise_key on workout_sets
    for each row execute function workout_sets_set_exercise_id();

-- Recalcula o vínculo das séries de uma conta cujo nome no snapshot cai na
-- chave dada. Nulo em p_user_id recalcula todas as contas (curadoria).
create function relink_exercise_sets(p_user_id uuid, p_key text) returns void as $$
begin
    update workout_sets ws
    set exercise_id = resolve_exercise_id(s.user_id, item ->> 'catalogo', item ->> 'nome')
    from workout_sessions s
    cross join lateral jsonb_array_elements(coalesce(s.workout_snapshot -> 'exercicios', '[]'::jsonb)) as item
    where ws.session_id = s.id
        and item ->> 'exercise_key' = ws.exercise_key
        and (p_user_id is null or s.user_id = p_user_id)
        and (
            normalize_exercise_name(item ->> 'nome') = p_key
            or exercise_match_key(item ->> 'nome') = p_key
        );
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function relink_exercise_sets(uuid, text) from public, anon, authenticated;

create function exercise_aliases_relink() returns trigger as $$
begin
    if tg_op in ('UPDATE', 'DELETE') then
        perform relink_exercise_sets(old.owner_user_id, old.alias_norm);
    end if;
    if tg_op in ('INSERT', 'UPDATE') then
        perform relink_exercise_sets(new.owner_user_id, new.alias_norm);
    end if;
    return null;
end;
$$ language plpgsql security definer set search_path = public;

create trigger exercise_aliases_relink_trigger
    after insert or update or delete on exercise_aliases
    for each row execute function exercise_aliases_relink();

-- Exercício privado criado ou renomeado também passa a valer para as séries
-- antigas com o mesmo nome.
create function exercises_relink_private() returns trigger as $$
begin
    if new.owner_user_id is not null then
        perform relink_exercise_sets(new.owner_user_id, new.name_norm);
    end if;
    return null;
end;
$$ language plpgsql security definer set search_path = public;

create trigger exercises_relink_private_trigger
    after insert or update of name_pt on exercises
    for each row execute function exercises_relink_private();

alter table exercises enable row level security;
alter table exercise_aliases enable row level security;
alter table exercise_generic_names enable row level security;

-- Só quem está logado lê o catálogo; a chave pública sozinha não lista nada.
create policy exercises_select_visible on exercises
    for select using (auth.uid() is not null and (owner_user_id is null or owner_user_id = auth.uid()));
create policy exercises_insert_own on exercises
    for insert with check (owner_user_id = auth.uid());
create policy exercises_update_own on exercises
    for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy exercises_delete_own on exercises
    for delete using (owner_user_id = auth.uid() and merged_into_id is null);

-- Apelido da conta só aponta para exercício que a conta enxerga.
create policy exercise_aliases_select_visible on exercise_aliases
    for select using (auth.uid() is not null and (owner_user_id is null or owner_user_id = auth.uid()));
create policy exercise_aliases_insert_own on exercise_aliases
    for insert with check (
        owner_user_id = auth.uid()
        and exists (
            select 1 from exercises e
            where e.id = exercise_aliases.exercise_id
                and (e.owner_user_id is null or e.owner_user_id = auth.uid())
        )
    );
create policy exercise_aliases_update_own on exercise_aliases
    for update using (owner_user_id = auth.uid()) with check (
        owner_user_id = auth.uid()
        and exists (
            select 1 from exercises e
            where e.id = exercise_aliases.exercise_id
                and (e.owner_user_id is null or e.owner_user_id = auth.uid())
        )
    );
create policy exercise_aliases_delete_own on exercise_aliases
    for delete using (owner_user_id = auth.uid());

create policy exercise_generic_names_select_all on exercise_generic_names
    for select using (auth.uid() is not null);

grant select, insert, update, delete on exercises to authenticated;
grant select, insert, update, delete on exercise_aliases to authenticated;
grant select on exercise_generic_names to authenticated;

-- Nomes do histórico da conta que ainda não têm exercício do catálogo, para a
-- pessoa decidir. Cardio intervalado não entra no catálogo de força.
create function unlinked_exercise_names()
returns table (match_key text, example_name text, set_count bigint, last_session_date date) as $$
    select exercise_match_key(item ->> 'nome') as match_key,
        min(item ->> 'nome') as example_name,
        count(*) as set_count,
        max(s.session_date) as last_session_date
    from workout_sets ws
    join workout_sessions s on s.id = ws.session_id
    cross join lateral jsonb_array_elements(coalesce(s.workout_snapshot -> 'exercicios', '[]'::jsonb)) as item
    where s.user_id = auth.uid()
        and ws.exercise_id is null
        and item ->> 'exercise_key' = ws.exercise_key
        and coalesce(item ->> 'tipo', 'series') = 'series'
        and exercise_match_key(item ->> 'nome') <> ''
    group by 1
    order by count(*) desc, 1
$$ language sql stable security invoker set search_path = public;

grant execute on function unlinked_exercise_names() to authenticated;

-- Liga um nome do histórico (ou qualquer apelido) a um exercício, só para a
-- conta. Trocar o destino de um apelido existente reaponta as séries dele.
create function link_exercise_name(p_name text, p_exercise_id uuid) returns void as $$
    insert into exercise_aliases (exercise_id, owner_user_id, alias)
    values (p_exercise_id, auth.uid(), coalesce(nullif(exercise_match_key(p_name), ''), trim(p_name)))
    on conflict (owner_user_id, alias_norm) where owner_user_id is not null
    do update set exercise_id = excluded.exercise_id
$$ language sql security invoker set search_path = public;

grant execute on function link_exercise_name(text, uuid) to authenticated;

-- Curadoria, só para quem administra o banco (CLI ou SQL Editor). Nenhuma
-- destas views ou funções é exposta ao app.
--
-- Apelidos de conta que ainda não existem como globais, com quantas contas
-- usam cada um para o mesmo exercício: dois ou mais é candidato a global.
create view exercise_curation_aliases with (security_invoker = true) as
select a.alias_norm, e.id as exercise_id, e.slug, e.name_pt,
    count(distinct a.owner_user_id) as accounts
from exercise_aliases a
join exercises e on e.id = a.exercise_id
where a.owner_user_id is not null
    and not exists (
        select 1 from exercise_aliases g
        where g.owner_user_id is null and g.alias_norm = a.alias_norm
    )
group by a.alias_norm, e.id, e.slug, e.name_pt;

-- Exercícios privados ainda não fundidos, com o volume de séries ligadas.
create view exercise_curation_private with (security_invoker = true) as
select e.id, e.owner_user_id, e.slug, e.name_pt, e.equipment, e.pegada, e.largura_pegada, e.acessorio,
    count(ws.id) as set_count, e.created_at
from exercises e
left join workout_sets ws on ws.exercise_id = e.id
where e.owner_user_id is not null and e.merged_into_id is null
group by e.id;

revoke all on exercise_curation_aliases from anon, authenticated;
revoke all on exercise_curation_private from anon, authenticated;

create function promote_exercise_alias(p_alias_norm text, p_exercise_id uuid) returns void as $$
begin
    if not exists (select 1 from exercises e where e.id = p_exercise_id and e.owner_user_id is null) then
        raise exception 'apelido global só aponta para exercício global';
    end if;
    insert into exercise_aliases (exercise_id, owner_user_id, alias)
    values (p_exercise_id, null, p_alias_norm);
    delete from exercise_aliases a
    where a.owner_user_id is not null and a.alias_norm = p_alias_norm and a.exercise_id = p_exercise_id;
    perform relink_exercise_sets(null, p_alias_norm);
end;
$$ language plpgsql security definer set search_path = public;

-- Funde um exercício privado num global: as séries passam para o global, os
-- apelidos da conta seguem para ele e o nome do privado vira apelido da
-- conta, para a ficha antiga continuar reconhecida. Promover um privado a
-- global é criar o global com ficha completa e fundir o privado nele.
create function merge_private_exercise(p_private_id uuid, p_target_id uuid) returns void as $$
declare
    v_private exercises%rowtype;
begin
    select * into v_private from exercises where id = p_private_id;
    if v_private.owner_user_id is null then
        raise exception 'só exercício privado pode ser fundido';
    end if;
    if not exists (select 1 from exercises e where e.id = p_target_id and e.owner_user_id is null) then
        raise exception 'o destino precisa ser um exercício global';
    end if;

    update exercises set merged_into_id = p_target_id where id = p_private_id;

    update workout_sets set exercise_id = p_target_id where exercise_id = p_private_id;
    update exercise_aliases set exercise_id = p_target_id where exercise_id = p_private_id;
    insert into exercise_aliases (exercise_id, owner_user_id, alias)
    values (p_target_id, v_private.owner_user_id, v_private.name_pt)
    on conflict (owner_user_id, alias_norm) where owner_user_id is not null do nothing;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function promote_exercise_alias(text, uuid) from public, anon, authenticated;
revoke execute on function merge_private_exercise(uuid, uuid) from public, anon, authenticated;
