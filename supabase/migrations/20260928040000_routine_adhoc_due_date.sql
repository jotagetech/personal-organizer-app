-- Prazo opcional para tarefa avulsa e o dia em que um registro foi dado como
-- feito. Uma tarefa avulsa com prazo continua visível nos dias seguintes até
-- ser concluída.
alter table routine_day_entries
    add column if not exists due_date date,
    add column if not exists completed_on date;

update routine_day_entries
set completed_on = entry_date
where completed_at is not null and completed_on is null;

-- Mantém completed_on coerente com completed_at mesmo para clientes que só
-- enviam completed_at: sem data explícita, a conclusão vale para o próprio
-- entry_date. O app sempre envia completed_on junto ao marcar, então herdar o
-- valor anterior num update que só troca completed_at nunca desloca o dia.
create or replace function sync_routine_day_entry_completed_on() returns trigger as $$
begin
    if new.completed_at is null then
        new.completed_on := null;
    elsif new.completed_on is null then
        new.completed_on := new.entry_date;
    end if;

    return new;
end;
$$ language plpgsql;

drop trigger if exists routine_day_entries_sync_completed_on on routine_day_entries;
create trigger routine_day_entries_sync_completed_on
    before insert or update on routine_day_entries
    for each row execute function sync_routine_day_entry_completed_on();

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'routine_day_entries_due_date_adhoc_only'
          and conrelid = 'public.routine_day_entries'::regclass
    ) then
        alter table routine_day_entries
            add constraint routine_day_entries_due_date_adhoc_only
            check (due_date is null or (routine_item_id is null and due_date >= entry_date));
    end if;

    if not exists (
        select 1 from pg_constraint
        where conname = 'routine_day_entries_completed_on_not_before_entry'
          and conrelid = 'public.routine_day_entries'::regclass
    ) then
        alter table routine_day_entries
            add constraint routine_day_entries_completed_on_not_before_entry
            check (completed_on is null or completed_on >= entry_date);
    end if;
end
$$;

create index if not exists routine_day_entries_open_due_idx
    on routine_day_entries (user_id, entry_date)
    where due_date is not null and completed_on is null;
