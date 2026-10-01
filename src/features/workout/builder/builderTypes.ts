// Estado do montador de plano. Números ficam como texto enquanto a pessoa
// digita (campo vazio, "62,5" ou um valor pela metade são estados válidos da
// tela); só a conversão para o JSON do contrato transforma em número.

import type {
    AttachmentType,
    ExerciseKind,
    GripType,
    GripWidth,
    LoadConvention,
    SetMetric,
    Weekday,
} from '@/lib/workoutPlanSchema'

// Par mínimo/máximo do contrato. Com `fixo`, a tela mostra um campo só e
// grava o mesmo número nos dois lados.
export type BuilderRange = {
    min: string
    max: string
    fixo: boolean
}

export type BuilderDrop = {
    uid: string
    alvo: BuilderRange
    carga: string
}

// `descanso` nulo é "igual ao exercício": a série só ganha o campo quando a
// pessoa pede um descanso próprio para ela.
export type BuilderSet = {
    uid: string
    metrica: SetMetric
    alvo: BuilderRange
    carga: string
    descanso: BuilderRange | null
    quedas: BuilderDrop[]
}

// "maquina_assistida" existe só na tela: no arquivo vira equipamento
// "maquina" com forma de carga "assistencia".
export type EquipmentChoice =
    | 'barra'
    | 'halteres'
    | 'maquina'
    | 'maquina_assistida'
    | 'cabo'
    | 'kettlebell'
    | 'elastico'
    | 'peso_corporal'
    | 'outro'

// O que uma semana do bloco pode trocar. O exercício guarda os campos dos
// dois tipos para trocar de séries para intervalado sem perder o que já foi
// digitado; a conversão só lê os do tipo escolhido.
export type BuilderPrescription = {
    series: BuilderSet[]
    descanso: BuilderRange
    rir: BuilderRange
    rodadas: string
    trabalho: BuilderRange
    recuperacao: BuilderRange
    rpe: BuilderRange
}

export type BuilderVariation = BuilderPrescription & {
    uid: string
    semanas: number[]
}

// `idSalvo` é o id que o exercício já tinha no plano carregado: é a chave do
// histórico, então renomear não muda o id. `tratarComoNovo` abre mão dele.
export type BuilderExercise = BuilderPrescription & {
    uid: string
    idSalvo: string | null
    tratarComoNovo: boolean
    nome: string
    tipo: ExerciseKind
    equipamento: EquipmentChoice | ''
    pegada: GripType | ''
    largura_pegada: GripWidth | ''
    acessorio: AttachmentType | ''
    forma_carga: LoadConvention
    por_lado: boolean
    modalidade: string
    observacoes: string
    // Bi-set, tri-set ou circuito: vizinhos com o mesmo rótulo. Gerado pela
    // tela (nunca digitado) e sempre passado por `normalizeGroups`.
    grupo: string | null
    variacoes: BuilderVariation[]
}

export type BuilderWorkout = {
    uid: string
    idSalvo: string | null
    nome: string
    dias_semana: Weekday[]
    exercicios: BuilderExercise[]
}

export type BuilderPlan = {
    nome: string
    usaProgressao: boolean
    blocoSemanas: string
    descricoesSemana: Record<string, string>
    descansoPadrao: BuilderRange
    treinos: BuilderWorkout[]
}
