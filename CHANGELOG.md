# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
datas no lugar de versão semântica (projeto pessoal, sem releases numeradas).

## 2026-09-29

### Adicionado

- Pausar, retomar e cancelar o início do treino. Com o treino em andamento,
  o relógio do topo ganha "Pausar"; pausado, ele mostra "Pausado", congela o
  tempo exibido e oferece "Retomar", quantas vezes for preciso. Confirmar ou
  pular uma série (ou uma queda do drop set) com o treino pausado retoma
  naquele momento, e um treino finalizado nunca fica pausado. Enquanto
  nenhuma série da sessão foi concluída ou pulada (contando a fila local),
  "Cancelar início" volta ao estado de antes de "Iniciar treino"; depois
  disso só existe pausar. Na fila otimista, pausar e retomar
  (`pause_session`, `resume_session`) levam o estado completo da pausa,
  calculado no aparelho com a hora de cada toque, e dividem a chave da
  data, então reenviar é idempotente e várias pausas sem sinal deixam só o
  estado mais recente. Cancelar um início que ainda não saiu do aparelho
  só tira da fila o início e a pausa pendentes; se o início já foi tentado
  ou enviado, entra `cancel_session_start`, que zera início e pausa no
  servidor (sem mexer em sessão finalizada) e é enviado antes de tudo da
  mesma data. A passada de envio também deixa de mandar operações que
  saíram da fila no meio dela. O status de sincronização mostra "Pausar
  treino de", "Retomar treino de" e "Cancelar início do treino de" para
  essas operações. Migração `20260929040000_workout_sessions_pause.sql`
  (colunas `paused_at` e `paused_seconds` em `workout_sessions`), que
  precisa ser aplicada no SQL Editor antes do deploy.
- "Ver treino" no cartão de treino concluído (aba Treino): abre o detalhe do
  que foi feito, exercício por exercício, com carga, repetições, RIR, séries
  puladas, comentário de cada série e quedas de drop set, no mesmo formato
  do detalhe do dia em Resultados (que passou a compartilhar o componente).
  Usa as séries locais da sessão, então aparece certo antes de sincronizar.
- Descanso padrão do plano e descanso por série. O plano aceita
  `descanso_padrao_segundos_min/max` na raiz, que vale para todo exercício de
  séries sem descanso próprio, e cada série aceita
  `descanso_segundos_min/max` (também nas séries de uma variação da semana).
  Vale o mais específico: série, variação da semana ativa, exercício e, por
  fim, o padrão do plano; o intervalado continua usando só a recuperação.
  Os campos são opcionais e o contrato continua `versao: 2`, então planos e
  sessões já salvos seguem iguais. O snapshot da sessão grava o descanso já
  resolvido (no exercício, e na série só quando ela difere), o texto
  "Descanso" do card e a contagem regressiva usam o da série atual, e a
  exportação por período ganha `rest_seconds_min/max` em cada série
  planejada. No montador, "Descanso padrão" fica no topo do plano e
  "Descanso próprio" entre as ações de cada série; o exemplo em
  `examples/plano-exemplo.json` passou a usar os dois. Sem migração: plano
  e snapshot ficam em colunas jsonb.
- Cronômetro da sessão de treino. Antes de começar, o topo do treino mostra
  "Iniciar treino" (botão grande); ao tocar, o início é gravado e o topo
  passa a mostrar o tempo decorrido, em `m:ss` até uma hora e `h:mm:ss`
  depois, calculado do horário de início (certo depois de sair da aba,
  bloquear a tela ou reabrir o app). Confirmar ou pular uma série sem ter
  tocado no botão inicia o treino naquele momento. O início entra na fila
  otimista como operação própria (`start_session`), que cria a sessão se
  preciso, grava `started_at` só se ainda estiver vazio e é enviada antes
  das séries e da finalização da mesma data; sem sinal, a tela usa o
  horário guardado na fila, e um treino só iniciado, sem série nenhuma,
  volta ao reabrir a data. O status de sincronização mostra "Iniciar treino
  de" para essa operação. Ao finalizar, o relógio para e mostra o tempo
  total. Migração `20260929030000_workout_sessions_started_at.sql` (coluna
  `started_at` em `workout_sessions`), que precisa ser aplicada no SQL
  Editor antes do deploy.
- Retomada do treino no mesmo passo: sair da aba Treino (ou fechar o app) e
  voltar para a mesma data reabre o treino escolhido (inclusive num dia com
  mais de um treino, antes de qualquer registro), o exercício e a série em
  que estava na navegação livre e a queda do drop set. O passo fica em
  localStorage por data (só as datas mais recentes), é conferido contra o
  treino atual (outro treino ou posição que não existe mais caem na
  retomada pela primeira série pendente) e é apagado ao finalizar o treino.

- Suporte a mais de uma conta: todo usuário novo recebe a própria cópia do
  catálogo TACO (antes só a primeira conta do banco recebia). A seed fica
  numa tabela de referência (`food_items_seed`) sem acesso pelo cliente, e
  contas já existentes sem o catálogo recebem a cópia ao aplicar a
  migração `20260929000000_food_items_seed_per_user.sql`.
- Contrato versão 2 do plano de treino, com série de repetições, de tempo
  (`segundos_min`/`segundos_max`) ou de distância (`metros_min`/`metros_max`),
  drop set (`quedas`), `equipamento`, `forma_carga: "assistencia"` (menos é
  progresso), `por_lado` (execução unilateral), `descanso_segundos_min/max`,
  `rir_alvo_min/max` e `observacoes`. Arquivos versão 1 continuam aceitos e
  planos e sessões já salvos são lidos normalmente. No README, `por_lado` do
  exercício (um lado por vez) e `forma_carga: "por_lado"` (carga de cada lado
  da barra) estão explicados lado a lado, com um exemplo de cada campo.
- Lançamento de tempo, distância e drop set na sessão de treino: o alvo
  aparece na unidade da série, o campo de carga diz o que o número significa
  em cada forma de carga e cada queda do drop set vira um passo próprio.
- Migração `20260929010000_workout_sets_metrics_and_drops.sql`, que precisa
  ser aplicada no SQL Editor antes do deploy: `workout_sets` ganha `metric`,
  `duration_seconds` e `distance_m`, a regra de série concluída passa a olhar
  a métrica (sem `metric` continua exigindo carga e repetições) e as quedas
  ficam em `workout_set_drops`, gravadas por `replace_workout_set_drops`.
- Detalhe do dia em Resultados mostra a série na unidade certa (`35 s`,
  `32,5 m`), a assistência como `assist. 40 kg`, peso corporal sem lastro sem
  "0 kg" e as quedas sob a série principal (`↳ 22,5 kg × 9 reps`). O app não
  tem total de volume, então nada soma tempo ou distância como repetição.
- Exportação JSON por período com os campos novos, só acrescentados (o
  formato anterior continua igual): por exercício `equipment`, `per_side`,
  `rest_seconds_min/max`, `target_rir_min/max` e `notes`; por série planejada
  e por série realizada, `drops`.
- Cronômetros na sessão de treino. A série de tempo ganha "Iniciar" e
  "Parar": o tempo sobe mostrando a meta, avisa (visual e bipe) ao atingir o
  mínimo e o máximo e, ao parar, preenche o campo "Tempo (s)", que continua
  editável. Depois de confirmar uma série de exercício com descanso
  prescrito, uma faixa compacta faz a contagem regressiva até o máximo,
  destaca a passagem do mínimo, aceita +15 s ou pular e apita ao terminar;
  com drop set, começa ao confirmar a última queda (ou pular as restantes), e não aparece entre quedas nem depois da última série. O tempo
  vem de timestamps guardados em localStorage (certo depois de o iPhone
  suspender a aba ou de reabrir o app), o bipe usa Web Audio e a tela fica
  acesa com wake lock quando o aparelho oferece.
- Progressão por semana no plano de treino: `bloco_semanas` no plano,
  `semanas` com uma descrição curta por semana e `variacoes_semana` no
  exercício, que substitui as séries (e, se informados, o descanso e o RIR
  alvo) só nas semanas indicadas. A semana vem do ciclo em andamento (dias 1
  a 7 são a semana 1) e o bloco recomeça na semana 1 quando o ciclo passa
  da duração dele. A sessão grava as séries já resolvidas e a semana no
  snapshot, a aba Treino mostra "Semana N de M" ao lado do badge do ciclo,
  o detalhe do dia em Resultados mostra a semana e a exportação ganha
  `block_week` e `block_weeks` por treino. Planos e sessões já salvos
  continuam iguais, sem migração.
- Cardio intervalado como exercício do treino do dia (`tipo:
  "intervalado"`), com `modalidade` livre, `rodadas`,
  `trabalho_segundos_min/max`, `recuperacao_segundos_min/max`,
  `rpe_alvo_min/max` opcional e `observacoes`, e progressão por semana via
  `variacoes_semana` (rodadas, trabalho, recuperação e RPE). Campos de série
  num intervalado são recusados com o caminho do campo. O JSON Schema e o
  plano de exemplo trazem os tiros de 30 s / 90 s (6, 8, 10 e 6 rodadas) e a
  resistência de 3 a 4 min com 2 min de recuperação. Na sessão, o
  intervalado é um passo com timer guiado: trabalho e recuperação alternando
  sozinhos, contagem regressiva grande, "Rodada 3 de 8", bipe na troca de
  fase, aviso no mínimo e troca no máximo de uma faixa de trabalho, pausar,
  pular rodada, começar a próxima antes e encerrar o bloco antes; retoma ao
  reabrir o app e mantém a tela acesa. No fim, as rodadas são conferidas
  (tempo editável, feita ou pulada, RPE do bloco de 1 a 10) antes de
  gravar, uma linha de `workout_sets` por rodada, pela fila otimista.
  Resultados mostra `8 × 30 s / 90 s · RPE 8` e a exportação ganha
  `exercise_type`, `interval` e `rpe`, só acrescentados. Migração
  `20260929020000_workout_sets_rpe.sql` (coluna `rpe` em `workout_sets`),
  que precisa ser aplicada no SQL Editor antes do deploy. O cardio livre do
  fim do treino continua igual.
- Montador de plano na aba Treino, para montar o plano sem escrever JSON:
  "Criar plano" (tela vazia e menu de três pontos) e "Editar plano atual",
  que carrega o plano ativo. Treinos com dias da semana, exercícios de
  séries ou intervalados com reordenar, duplicar e remover, séries com
  métrica, faixa (ou valor fixo), carga sugerida e drop set, e progressão
  por semanas opcional com "Semana diferente" por exercício. O `id` sai do
  nome e, num plano carregado, renomear não muda o id (histórico mantido),
  com "Tratar como exercício novo" explícito. O plano é validado pelo
  contrato antes de salvar, com a lista de problemas em português levando
  ao campo, e é salvo pelo mesmo caminho da importação; "Baixar JSON" gera
  o arquivo e o rascunho fica em localStorage até salvar ou descartar. A
  tela fica no tema do sistema, fora do modo treino.

### Alterado

- Avaliação do treino concluído com modo leitura. Sem avaliação salva, a
  escala de sentimento e o "Detalhar" ficam abertos e nada é gravado até
  tocar em "Salvar avaliação" (desabilitado sem nota escolhida; texto em
  branco vira vazio). Com avaliação salva, o painel mostra a nota e o texto
  e um botão "Editar" reabre os campos preenchidos, com "Cancelar" para
  descartar as mudanças. Antes, tocar na nota salvava na hora e o texto
  salvava ao sair do campo.
- A duração do treino (painel de finalização, detalhe do dia e relatório
  em Resultados, exportação) passa a descontar o tempo pausado; sessões sem
  pausa continuam iguais. A exportação acrescenta `paused_seconds` por
  treino, sem mudar `format_version`.
- A duração do treino (painel de finalização, detalhe do dia e relatório
  em Resultados, exportação) passa a ser de `started_at` a `finished_at`
  quando a sessão tem início marcado; sessões antigas continuam medidas da
  primeira à última série concluída. A exportação acrescenta `started_at`
  por treino, sem mudar `format_version`.
- Trocar o treino depois de ter iniciado (ou registrado uma série) numa
  data aberta antes de a sessão existir no servidor passa a conferir se ela
  já foi criada lá, para a troca valer no servidor e não só no aparelho.
- Repaginação visual do app inteiro, sem mudar regra de negócio nem dados.
  Todas as cores, raios, sombras e fontes saem de variáveis CSS, com tema
  claro e escuro automático pelo sistema. Cards brancos sem borda com sombra
  leve, listas dentro de um card com divisórias finas e índigo como única
  cor de destaque. As convenções de cor continuam: âmbar para pendente,
  vermelho para atrasado, verde para concluído, cinza para série pulada e
  azul para item de comida sem dado nutricional.
- Modo treino na aba Treino: a tela inteira fica escura, com lima como
  destaque e como concluído, e nomes de exercício e números (carga, reps,
  RIR, tempo) em fonte condensada grande.
- Ícones de verdade (`lucide-react`) no lugar de emojis e caracteres usados
  como ícone, com `aria-label` nos botões só de ícone.
- Fontes embutidas no app (Inter no corpo e Barlow Condensed no modo
  treino, via fontsource), servidas junto com o app, sem CDN externo.
- Cabeçalho com o dia por extenso (tocar na data abre o calendário), barra
  inferior com ícones e pílula na aba ativa e status de sincronização
  compacto.
- Alvos de toque de no mínimo 44px em botões e campos, e campos com fonte
  de 16px para o iOS não dar zoom ao focar.
- O relatório do dia em Resultados passa a expor as pendências de forma
  estruturada (título e se está atrasada). O chip da pendência atrasada
  mostra só o título, em vermelho, em vez de depender do sufixo
  "(atrasada)" no texto. A lista de títulos com o sufixo continua igual.

### Adicionado

- Instalação na tela de início: `manifest.webmanifest`, ícones do app
  (inclusive `apple-touch-icon`) e metatags de web app, com o nome
  "Organizer" embaixo do ícone. A cor da barra do sistema acompanha o tema.

## 2026-09-28

### Corrigido

- Consumo de um alimento novo continuava sem dado nutricional mesmo depois
  de o item ser preenchido no catálogo: o item nasce vazio quando é lançado
  pela primeira vez, e a nutrição do consumo só era calculada no registro.
  Agora, ao editar a nutrição de um item, os consumos dele que ainda não têm
  nenhum dado são recalculados (migração
  `20260928050000_food_entries_recalc_on_item_update.sql`, que também corrige
  os consumos que já estavam nessa situação). Consumos que já tinham
  nutrição não mudam.
- A grade semanal de Resultados podia ficar enorme no celular: com um ciclo
  longo ou uma data selecionada distante ela crescia sem teto (dezenas de
  semanas), e em paisagem ou tablet cada célula acompanhava a largura da
  tela. A grade agora mostra no máximo as 6 semanas mais recentes (ou 6 a
  partir da semana da data selecionada, quando ela é mais antiga), com
  "Ver ciclo inteiro (N semanas)" e "Mostrar menos" pra alternar. A área de
  conteúdo do app ganhou largura máxima de 560px e a grade de 420px, e as
  colunas usam `minmax(0, 1fr)` pra texto ampliado não estourar as células.
- O indicador de pendência de peso e sono não atualizava depois de salvar ou
  excluir um registro; agora atualiza na hora.
- "Criar rotina sugerida" duplicava itens quando nenhum item se aplicava ao
  dia selecionado (ex: um dia antes de `active_from`, ou fora dos dias da
  semana configurados): o botão aparecia de novo mesmo já existindo itens
  ativos, e cada clique inseria mais 5 itens. O critério agora é a
  existência de item ATIVO (independente do dia), não de linha aplicável ao
  dia selecionado; um dia sem nada aplicável mostra só "Nada de rotina pra
  este dia.", sem o botão.

### Adicionado

- Lançar vários itens da mesma refeição em sequência: a refeição passa a ser
  o primeiro campo do formulário de alimentação e continua escolhida depois
  de salvar (só alimento, quantidade e unidade são limpos, e o foco volta ao
  campo de alimento), com uma confirmação curta do item adicionado. Tocar num
  alimento frequente preenche o item sem trocar a refeição já escolhida.
- Ferramenta "Exportar período" no Menu: gera um JSON com todos os
  registros de um intervalo de datas (treinos com cada série e seu status,
  cardio, alimentos com totais por dia, rotina resolvida dia a dia, peso e
  sono), desnormalizado e sem `user_id`, para analisar em outra ferramenta.
  Atalhos "Esta semana", "Semana passada", "Este mês" e "Mês passado"
  preenchem as datas de início e fim, que também podem ser editadas à mão
  (máximo de 366 dias). Depois de "Gerar", uma linha resume as contagens e
  o resultado pode ser copiado, compartilhado (quando o navegador suporta)
  ou baixado como `organizer-export_AAAA-MM-DD_AAAA-MM-DD.json`. Se a cópia
  automática falhar, o JSON aparece num campo de texto selecionável. A
  rotina de cada dia usa a mesma resolução da aba Rotina, com os sinais de
  treino, refeições, peso e sono derivados dos próprios dados do período.
  As buscas são por intervalo e paginadas, sem uma consulta por dia.
- Prazo opcional em tarefa avulsa da rotina (migração
  `20260928040000_routine_adhoc_due_date.sql`, colunas `due_date` e
  `completed_on` em `routine_day_entries`). O campo de nova tarefa ganha um
  botão "+ Prazo" que revela uma terceira data, que não pode ser anterior à
  data da tarefa. Sem prazo nada muda: a tarefa aparece só no próprio dia.
  Com prazo, ela continua aparecendo em todos os dias seguintes até ser
  concluída, com a dica "Prazo dd/mm", "Vence hoje" ou, depois do prazo,
  fundo vermelho claro e "Atrasada desde dd/mm". Marcar como feita grava o
  dia selecionado em `completed_on` (não necessariamente hoje): a tarefa
  fica feita nesse dia, pendente nos dias anteriores e some dos seguintes.
  Tarefas carregadas de dias anteriores aparecem depois dos itens da rotina
  e antes das avulsas do dia, ordenadas pelo prazo, e contam na rotina e no
  indicador de todo dia em que aparecem; no resumo de Resultados, a pendente
  atrasada ganha o sufixo "(atrasada)". Uma tarefa avulsa pendente agora
  tem "Remover", que apaga a tarefa com a barra de desfazer. Registros já
  concluídos antes da mudança recebem o próprio `entry_date` como
  `completed_on`.
- Nova aba Menu, a última do menu inferior. A seção "Registros do dia" traz
  os cards de peso corporal e sono empilhados em largura total, gravando na
  data selecionada (mostrada logo abaixo do título). A seção "Ferramentas"
  lista atalhos em largura total; o primeiro é o "Catálogo de alimentos",
  que continua acessível também pelo ⋮ da aba de alimentação.
- Consumo de alimento e item do catálogo sem nenhum dado nutricional (kcal,
  proteína, carboidrato e gordura todos ausentes) ganham um fundo azul bem
  claro. A dica "N itens sem dado nutricional" do total do dia passa a usar o
  mesmo critério, então item com nutrição parcial não conta mais como sem
  dado.
- Série pulada como estado próprio, distinto de concluída e de não
  registrada (migração `20260928030000_workout_sets_skipped.sql`, coluna
  `skipped_at` em `workout_sets`). Cada série ganha "Pular série" e "Pular
  exercício"; pular zera carga, repetições e RIR mas mantém o comentário, e
  uma série pulada mostra o selo "Série pulada" com "Desfazer pulo". "Pular
  exercício" pede confirmação e marca como puladas só as séries ainda
  pendentes daquele exercício. Série pulada conta como resolvida: o treino
  finaliza quando tudo está concluído ou pulado, a barra de progresso mostra
  as puladas em cinza, e Resultados exibe "pulada" na série e "(N puladas)"
  no destaque do treino. Filas de envio gravadas antes da mudança continuam
  válidas (o campo novo entra como vazio).
- Navegação livre entre exercícios no treino: um seletor recolhível no topo
  ("Exercícios · 3 de 6") lista os exercícios da ficha com o andamento de
  cada um ("2/4", "✓", "pulado"). Tocar num exercício leva à primeira série
  ainda não resolvida dele (ou à série 1, se já estiver todo resolvido).
  Depois de confirmar ou pular, o treino segue para a próxima série não
  resolvida, dando a volta até o início se algo ficou para trás, e o botão
  "Confirmar e finalizar treino" aparece só na última série que falta.
- Aba Alimentação reorganizada: um card de total do dia (kcal, proteína,
  carboidrato e gordura) agora fica sempre visível no topo, mesmo com o dia
  vazio, no lugar do badge que só aparecia depois do primeiro registro. O
  formulário de "Adicionar consumo" some atrás de um botão quando já há algo
  registrado no dia (continua aberto por padrão no primeiro registro) e, uma
  vez aberto, só fecha com um botão "Fechar" explícito, pra não atrapalhar
  quem registra várias refeições em sequência.
- Exclusão de peso corporal, sono, cardio e consumo de alimento agora abre uma
  barra "Desfazer" por alguns segundos em vez de excluir na hora com uma
  confirmação. O item some da tela assim que a exclusão é pedida, mas só é
  apagado do banco depois da janela de desfazer terminar; tocar em "Desfazer"
  cancela a exclusão e o item volta a aparecer.
- Trocar de aba enquanto a barra de desfazer está visível não cancela a
  exclusão pendente, e reabrir a tela que mostrava o item continua escondendo
  ele até a exclusão se resolver.
- Se o app for pra segundo plano (minimizado ou trocado de app no celular)
  com alguma exclusão pendente, ela é confirmada na hora, pra não depender de
  o app continuar rodando até o fim da janela de espera.
- Fila de escrita otimista para o treino, pensada pro sinal ruim de academia:
  confirmar uma série aplica o valor na tela e avança pro próximo passo na
  hora, sem esperar resposta de rede. A escrita fica guardada em
  `localStorage` e é reenviada sozinha quando a rede volta (evento `online`,
  aba voltando a ficar visível, ou tentativas com espera crescente até um
  teto de 60s). Duas escritas seguidas da mesma série viram uma só (a última
  vence), e a fila garante a sessão do dia antes de enviar as séries, e as
  séries antes de finalizar o treino. Um erro de rede ou de servidor tenta de
  novo sozinho; uma violação de dado marca a escrita como falha definitiva,
  com opção de descartar, em vez de tentar pra sempre. Reabrir uma data com
  escritas pendentes mostra o treino já com esses valores, sem "voltar" pra
  uma série que já foi confirmada localmente. Cobre só o treino (a parte que
  mais dói perder no meio de uma série); cardio, alimentação, peso, sono,
  sentimento pós-treino e "Trocar treino" continuam com gravação direta e
  mensagem de erro visível.
- Selo de sincronização no cabeçalho de data, mostrando quantas séries ainda
  aguardam envio (ou que já está tudo salvo), com atalho pra descartar uma
  escrita marcada como falha definitiva.
- Cabeçalho de data destaca visualmente quando a data selecionada não é hoje,
  pra ficar claro que um registro feito ali vai entrar num dia diferente do
  atual.
- Grade de resultados agora é clicável: tocar num dia muda a data selecionada
  em todo o app (mesma usada pelas outras abas), com destaque visual na
  célula correspondente. A grade continua limitada à janela do ciclo atual
  (ou aos últimos dias, sem ciclo ativo), mas sempre se estende pra mostrar a
  data selecionada em algum lugar, mesmo quando ela cai fora dessa janela.
  Título do card passa a citar a data de início do ciclo quando há um ciclo
  ativo.
- Aba Resultados ganhou um detalhe somente leitura do dia selecionado, logo
  abaixo da grade: treino (nome, séries por exercício com carga, repetições,
  RIR e comentário, duração e sentimento pós-treino), cardio, alimentação
  agrupada por refeição com os totais do dia, e peso/sono. Botões abrem
  diretamente a aba de Treino ou de Alimentação para registrar o que falta.
- Menu inferior ganhou indicadores de estado por aba, refletindo a data
  selecionada no momento (não necessariamente hoje): um check verde em
  Treino quando o treino do dia está finalizado, um ponto âmbar quando está
  em andamento, um check verde em Alimentação com pelo menos um registro no
  dia, e um ponto âmbar em Resultados quando falta peso corporal ou sono
  daquele dia. Cada aba com indicador leva um `aria-label` descrevendo o
  estado. A leitura desses sinais é deliberadamente leve (só presença ou
  ausência de registro, nunca os dados completos do dia) e roda de novo
  sempre que a data selecionada muda ou que finalizar treino, adicionar/
  editar/excluir consumo, ou adicionar/excluir cardio confirma de fato no
  banco, sem esperar a próxima troca de data. Uma falha nessa leitura não
  trava a tela nem aparece como erro, só deixa o indicador desatualizado até
  a próxima tentativa.
- Nova aba Rotina: checklist diário de hábitos recorrentes (ex: academia
  seg-sex, refeições, suplemento diário), virou a primeira aba do menu e a
  tela de abertura padrão do app. Um item pode ter um vínculo opcional com
  outra aba (treino finalizado, uma categoria de refeição, peso corporal ou
  sono) e é marcado automaticamente quando esse sinal já existe pro dia
  selecionado, sem gravar nada de novo pra isso. Tocar num item vinculado
  ainda pendente leva direto pra aba correspondente ("Registrar agora"); uma
  ação secundária "Marcar feito sem registrar" grava uma marcação manual
  mesmo assim, com visual diferente (âmbar) da marcação automática, pra não
  esconder que o registro de verdade ainda falta. Itens sem vínculo são
  marcados manualmente, e a lista aceita tarefas avulsas de um único dia. O
  menu "⋮" abre o gerenciamento dos itens recorrentes: criar, editar título/
  dias da semana/vínculo, e arquivar (sem excluir, pra manter o histórico).
  Tela vazia (nenhum item criado ainda) oferece um botão "Criar rotina
  sugerida" com um conjunto de exemplo pronto. Templates recorrentes só
  materializam um registro por dia quando algo é de fato marcado ou uma
  tarefa avulsa é criada, sem job de background populando datas futuras.
- Menu inferior ganhou um indicador de estado também pra Rotina, calculado à
  parte dos outros três (depende dos próprios itens/registros de rotina, não
  só de DaySignals): concluído quando todo item aplicável ao dia está feito,
  pendente quando falta algo, e sem indicador num dia sem nenhum item
  aplicável.
- Relatório do dia no topo do detalhe da aba Resultados, no lugar do título
  repetido "Dia selecionado": placar da rotina (quantos itens foram feitos,
  o que ainda falta ou não foi feito) mais até 4 destaques do dia (séries de
  treino concluídas e duração, kcal/proteína, minutos de cardio, peso/sono
  registrados). A frase de abertura muda conforme a proporção de itens de
  rotina concluídos no dia, com 2 ou 3 variações por faixa escolhidas de
  forma determinística pela data (não muda a cada carregamento, mas também
  não repete todo dia). Um dia sem nenhum item de rotina ativo não entra em
  nenhuma faixa de conclusão, só informa que não há rotina configurada.

### Alterado

- Peso corporal e sono saíram da aba Resultados e passaram pro Menu. O
  detalhe do dia em Resultados continua mostrando os dois, só leitura. O
  indicador de pendência de peso e sono passou de Resultados pro Menu, e
  "Registrar agora" dos itens de rotina vinculados a peso ou sono leva ao
  Menu.
- Menu inferior com cinco abas: rótulos menores e o indicador de cada aba
  virou um ponto no canto do botão, pra caber em telas de 320px. A aba de
  alimentação passou a se chamar "Comida" no menu inferior, porque
  "Alimentação" não cabia nessa largura.
- Duração do treino agora é medida pelas próprias séries, da primeira à
  última concluída, em vez de ir da abertura da sessão até a finalização
  (que podia incluir horas antes de começar ou o tempo até a fila
  sincronizar). Com menos de duas séries concluídas a duração não é exibida.
  Vale no painel de fim de treino (que agora também mostra concluídas e
  puladas), no detalhe do dia e no destaque de Resultados.
- `finished_at` da sessão passa a registrar a hora em que o treino terminou
  no aparelho, e não a hora em que a fila conseguiu enviar. Quando o treino é
  fechado só ao reabrir a data, vale a hora da última série concluída.
- Peso corporal e sono subiram pro topo da aba Resultados, num agrupamento
  "Dia selecionado" acima da grade, e passam a gravar na data selecionada em
  vez de sempre em "hoje". Abrir um dia que já tem registro mostra o valor
  já preenchido no campo, em vez de sempre abrir em branco, e falta o
  registro do dia dá destaque visual ao card (mesma ideia binária do
  indicador da aba). A lista de registros recentes encolheu de uma lista
  vertical pra uma linha compacta ("últimos: 78.4 · 78.9 · 79.1"), tocando
  num valor pra excluir (a exclusão com desfazer continua igual). Validação
  do valor digitado (vírgula ou ponto decimal, rejeição de valor zero ou
  negativo, teto de 24h só pro registro de sono) saiu do formulário e virou
  função pura própria, testada isoladamente.

- `activeTab` (Treino/Alimentação/Resultados) saiu de um estado local do
  app pra um contexto de navegação compartilhado, usado pelo novo detalhe do
  dia pra abrir a aba certa a partir de um atalho.
- Aba padrão de abertura do app trocou de Treino pra Rotina, agora a
  primeira do menu inferior.
- Tarefa avulsa da aba Rotina deixa de ser sempre "só hoje": ganhou um campo
  de data, com valor padrão a data selecionada mas editável, pra criar de uma
  vez uma tarefa pra uma data futura (ou passada) específica sem precisar
  navegar até lá primeiro. Criar pra uma data diferente da selecionada não
  recarrega a lista visível (ela não mudou); mostra uma confirmação local em
  vez disso.
- Tocar num item de rotina manual ou avulso ainda pendente não grava mais na
  hora: mostra uma confirmação inline ("Confirmar conclusão de X?") antes de
  marcar concluído. Itens vinculados pendentes continuam com as mesmas duas
  ações de sempre ("Registrar agora"/"Marcar feito sem registrar").
- Desmarcar um item de rotina já concluído tocando de novo deixou de existir.
  Um item concluído agora mostra "Editar" (atalho direto pra tela de
  gerenciamento, já aberta editando aquele item específico, quando o
  template por trás ainda está ativo) e/ou "Remover" (desfaz a marcação,
  quando há uma marcação de fato por trás do estado concluído). Uma falha ao
  confirmar, editar ou remover aparece acima da lista sem escondê-la.

### Corrigido

- Falha ao excluir um registro (ex: sem conexão) agora restaura o item na
  lista com uma mensagem de erro, em vez de deixar a tela inconsistente com o
  banco.
- Carregar o plano ativo ou a sessão do dia sem resposta do servidor (sinal
  caindo no meio da consulta) ficava pendurado em "Carregando..." pra
  sempre; agora essas leituras têm um prazo de 10s e caem no estado de erro
  com opção de tentar de novo.

## 2026-09-27

### Adicionado

- v0 inicial: importação de plano de treino via JSON, registro de séries,
  alimentação por refeição, autenticação com conta única.
- Fluxo de treino reescrito para mostrar um exercício e uma série por vez
  (em vez da lista completa), com barra de progresso e botão de voltar.
- Menu de ações ("⋮") na aba Treino para importar plano e iniciar ciclo, tirando
  essas ações do fluxo principal (evita toque acidental).
- Ciclo de treino: marca a data de início e mostra "Dia N do ciclo",
  independente de trocas de exercício no plano.
- Cardio: catálogo de atividades cadastrado na hora e registro diário
  (duração, distância opcional, sentimento, observação).
- Finalização do treino: sentimento pós-treino (escala 1 a 5) e duração da
  sessão calculada automaticamente a partir dos timestamps existentes.
- RIR (0 a 10) e comentário livre por série, pensados pra acompanhar fadiga
  intra-sessão e desconforto articular ao longo do tempo.
- Peso corporal e sono: registro rápido diário (upsert por dia), com
  histórico e exclusão, na aba Resultados.
- Aba Resultados: grade semanal de dias de treino concluído, com o número do
  dia do mês em cada célula.
- Alimentação: catálogo de alimentos com nutrição opcional (kcal, proteína,
  carboidrato, gordura por uma quantidade de referência), semeado com a
  Tabela Brasileira de Composição de Alimentos (TACO, 4ª edição, 597
  alimentos genéricos brasileiros). Chips de alimentos frequentes,
  autocomplete ao digitar, sugestão de refeição pela hora do dia, total
  diário de kcal/proteína e tela de edição do catálogo.

### Corrigido

- Telas que ficavam presas em "Carregando..." pra sempre quando a busca
  inicial falhava (ex: tabela ainda sem migração aplicada); agora mostram a
  mensagem de erro, com opção de tentar de novo.
- Cabeçalho de data sobrepondo os outros controles: o input nativo de
  calendário brigava por espaço com o rótulo da data. Trocado por um botão de
  ícone que abre o seletor via `showPicker()`, com o input escondido.
- Falta de `width: 100%` na regra global de campos de formulário, fazendo
  inputs vazarem pra fora do card em layouts de duas colunas (peso corporal e
  sono lado a lado).
- Grade de resultados só desenhava até a data atual do sistema; um treino
  concluído numa data posterior ficava fora do intervalo inteiro. Corrigido
  pra sempre cobrir o dia concluído mais recente.
- Cor de dia concluído na grade de resultados trocada de preto pra verde.
- Peso corporal e sono não tinham como ser excluídos depois de registrados.
- "Trocar treino" atualizava o snapshot da sessão mas não apagava as séries
  antigas no banco (faltava permissão de exclusão em `workout_sets`); elas
  ficavam escondidas na tela e reapareciam ao recarregar o dia. Corrigido com
  uma função no banco que atualiza o snapshot e apaga as séries antigas numa
  única transação.
- Trocar de data durante uma sessão de treino em andamento reaproveitava o
  mesmo componente entre datas diferentes, com risco de misturar séries
  digitadas num dia com a sessão de outro. Cada data agora tem sua própria
  instância.
- Falha de rede ao carregar o plano ativo ou a sessão do dia aparecia como
  "nenhum plano" ou "treino novo" em vez de erro, arriscando refazer registros
  já existentes. Agora o erro aparece explicitamente, com opção de tentar de
  novo.
- Sair de uma série sem tirar o foco do campo (trocando de série ou de data)
  podia perder até 600ms de digitação por cancelar o autosave pendente; agora
  esse autosave é enviado em vez de cancelado.
