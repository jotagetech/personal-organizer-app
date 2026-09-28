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

### Corrigido

- Falha ao excluir um registro (ex: sem conexão) agora restaura o item na
  lista com uma mensagem de erro, em vez de deixar a tela inconsistente com o
  banco.

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
