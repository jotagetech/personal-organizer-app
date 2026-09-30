-- A nutrição de um consumo é a foto do catálogo no momento do registro. O
-- cálculo rodava em qualquer update, e o formulário de edição sempre reenvia
-- todos os campos, então mudar só a refeição ou a data de um consumo antigo
-- aplicava o catálogo atual. Apagar o alimento do catálogo também zerava a
-- nutrição, porque o `on delete set null` da chave estrangeira é um update em
-- food_entries.
--
-- Agora, num update, a nutrição gravada só é refeita quando a porção ou o
-- alimento mudam de verdade, ou quando o consumo ainda não tem nenhum dado
-- (o caso que recalc_food_entries_without_nutrition depende para preencher).
create or replace function food_entry_keeps_nutrition(
    old_entry food_entries,
    new_entry food_entries
) returns boolean as $$
declare
    v_has_nutrition boolean;
    v_same_portion boolean;
    v_same_item boolean;
    v_item_unlinked boolean;
    v_keeps boolean;
begin
    v_has_nutrition := old_entry.kcal is not null
        or old_entry.protein_g is not null
        or old_entry.carbs_g is not null
        or old_entry.fat_g is not null;

    v_same_portion := new_entry.quantity is not distinct from old_entry.quantity
        and new_entry.unit is not distinct from old_entry.unit;

    v_same_item := new_entry.food_item_id is not distinct from old_entry.food_item_id;

    -- Mesmo alimento que perdeu o vínculo com o catálogo (item apagado): a
    -- foto antiga continua sendo a melhor informação sobre o que foi comido.
    v_item_unlinked := old_entry.food_item_id is not null
        and new_entry.food_item_id is null
        and new_entry.food_name = old_entry.food_name;

    v_keeps := v_has_nutrition and v_same_portion and (v_same_item or v_item_unlinked);

    return v_keeps;
end;
$$ language plpgsql immutable;

create or replace function calc_food_entry_nutrition() returns trigger as $$
declare
    v_item food_items;
begin
    if tg_op = 'UPDATE' and food_entry_keeps_nutrition(old, new) then
        new.kcal := old.kcal;
        new.protein_g := old.protein_g;
        new.carbs_g := old.carbs_g;
        new.fat_g := old.fat_g;
        return new;
    end if;

    if new.food_item_id is null then
        new.kcal := null;
        new.protein_g := null;
        new.carbs_g := null;
        new.fat_g := null;
        return new;
    end if;

    select * into v_item from food_items where id = new.food_item_id;

    if v_item.reference_quantity is null
        or v_item.reference_unit is null
        or v_item.reference_unit <> new.unit
    then
        new.kcal := null;
        new.protein_g := null;
        new.carbs_g := null;
        new.fat_g := null;
        return new;
    end if;

    new.kcal := round(v_item.kcal * new.quantity / v_item.reference_quantity, 2);
    new.protein_g := round(v_item.protein_g * new.quantity / v_item.reference_quantity, 2);
    new.carbs_g := round(v_item.carbs_g * new.quantity / v_item.reference_quantity, 2);
    new.fat_g := round(v_item.fat_g * new.quantity / v_item.reference_quantity, 2);

    return new;
end;
$$ language plpgsql;
