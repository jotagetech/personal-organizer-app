-- Perfil da pessoa em user_settings: nome completo e apelido. O app usa o
-- apelido para cumprimentar; sem ele cai no primeiro nome e, sem nome, no
-- começo do e-mail. Nulo significa "não informado".
--
-- As policies de user_settings (select/update da própria linha) já cobrem as
-- colunas novas, então nenhuma policy ou grant é criada aqui.

alter table user_settings
    add column if not exists full_name text
        check (full_name is null or char_length(btrim(full_name)) between 1 and 80),
    add column if not exists nickname text
        check (nickname is null or char_length(btrim(nickname)) between 1 and 40);
