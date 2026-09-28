# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
datas no lugar de versão semântica (projeto pessoal, sem releases numeradas).

## 2026-09-28

### Adicionado

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

### Alterado

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
