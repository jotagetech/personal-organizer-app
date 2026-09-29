-- A nutrição de um consumo é uma cópia calculada na hora do registro. Um
-- alimento novo nasce no catálogo sem nutrição (criado implicitamente ao ser
-- lançado pela primeira vez), então o consumo que o criou fica sem dado mesmo
-- depois de o catálogo ser preenchido. Ao editar o item, os consumos dele que
-- ainda não têm nenhum dado são recalculados; os que já têm ficam intactos,
-- pra uma correção no catálogo não reescrever o histórico.
create or replace function recalc_food_entries_without_nutrition() returns trigger as $$
begin
    -- O update em si não muda nada: ele só dispara o trigger de cálculo de
    -- food_entries, que refaz a nutrição a partir do item atualizado.
    update food_entries
    set updated_at = now()
    where food_item_id = new.id
      and kcal is null
      and protein_g is null
      and carbs_g is null
      and fat_g is null;

    return new;
end;
$$ language plpgsql;

drop trigger if exists food_items_recalc_entries_without_nutrition on food_items;
create trigger food_items_recalc_entries_without_nutrition
    after update of reference_quantity, reference_unit, kcal, protein_g, carbs_g, fat_g on food_items
    for each row execute function recalc_food_entries_without_nutrition();

-- Consumos que já ficaram sem dado antes deste trigger existir.
update food_entries
set updated_at = now()
where food_item_id is not null
  and kcal is null
  and protein_g is null
  and carbs_g is null
  and fat_g is null;
