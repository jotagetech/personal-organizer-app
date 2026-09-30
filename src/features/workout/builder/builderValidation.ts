// Validação do plano montado na tela. Quem decide o que é válido é o
// contrato (`workoutPlanV2Schema`); aqui o problema só ganha texto em
// português para quem não conhece os nomes dos campos do JSON, um "onde"
// legível e o campo da tela que deve receber o foco.

import type { z } from 'zod'

import { builderPlanToDocument } from '@/features/workout/builder/builderDocument'
import type { BuilderPlan } from '@/features/workout/builder/builderTypes'
import { workoutPlanV2Schema, type WorkoutPlanV2Document } from '@/lib/workoutPlanSchema'

type PathSegment = string | number

export type BuilderIssue = {
    // Caminho do campo na tela, na mesma ordem das listas do montador.
    fieldPath: PathSegment[]
    local: string
    mensagem: string
    workoutUid: string | null
    exerciseUid: string | null
    variationUid: string | null
}

export type BuilderValidationResult =
    | { success: true; document: WorkoutPlanV2Document }
    | { success: false; issues: BuilderIssue[] }

// Cada par min/max do contrato é um campo só na tela (a faixa).
const FIELD_ALIASES: Record<string, string> = {
    id: 'nome',
    repeticoes_min: 'alvo',
    repeticoes_max: 'alvo',
    segundos_min: 'alvo',
    segundos_max: 'alvo',
    metros_min: 'alvo',
    metros_max: 'alvo',
    descanso_segundos_min: 'descanso',
    descanso_segundos_max: 'descanso',
    descanso_padrao_segundos_min: 'descanso_padrao',
    descanso_padrao_segundos_max: 'descanso_padrao',
    rir_alvo_min: 'rir',
    rir_alvo_max: 'rir',
    trabalho_segundos_min: 'trabalho',
    trabalho_segundos_max: 'trabalho',
    recuperacao_segundos_min: 'recuperacao',
    recuperacao_segundos_max: 'recuperacao',
    rpe_alvo_min: 'rpe',
    rpe_alvo_max: 'rpe',
}

const FIELD_LABELS: Record<string, string> = {
    nome: 'nome',
    alvo: 'alvo',
    carga_sugerida: 'carga sugerida',
    descanso: 'descanso',
    descanso_padrao: 'descanso padrão',
    rir: 'RIR alvo',
    rodadas: 'rodadas',
    trabalho: 'trabalho',
    recuperacao: 'recuperação',
    rpe: 'RPE alvo',
    modalidade: 'modalidade',
    observacoes: 'observações',
    semanas: 'semanas',
    bloco_semanas: 'semanas do bloco',
    dias_semana: 'dias da semana',
    forma_carga: 'forma de carga',
    equipamento: 'equipamento',
    grupo: 'grupo',
}

const EMPTY_LIST_MESSAGES: Record<string, string> = {
    treinos: 'adicione pelo menos um treino',
    exercicios: 'adicione pelo menos um exercício',
    series: 'adicione pelo menos uma série',
    semanas: 'escolha pelo menos uma semana',
    quedas: 'adicione pelo menos uma queda',
}

// Mensagens próprias do contrato que citam campos do JSON ganham uma versão
// que fala da tela; as demais já são claras e passam como vieram.
const CUSTOM_MESSAGE_REWRITES: [RegExp, string][] = [
    [/^obrigatório junto com.*$/, 'preencha o mínimo e o máximo'],
    [/^deve ser maior ou igual a.*$/, 'o máximo não pode ser menor que o mínimo'],
    [/^informe a métrica da série.*$/, 'informe o alvo da série'],
    [/^informe o que muda na semana.*$/, 'mude pelo menos um valor nesta semana'],
    [/^obrigatório quando o plano usa.*$/, 'informe quantas semanas tem o bloco'],
    [/^a semana (\d+) já tem variação neste exercício/, 'a semana $1 já está em outra variação deste exercício'],
    [/^os exercícios do grupo .* devem ficar em sequência.*$/, 'os exercícios do grupo precisam ficar um depois do outro'],
    [/^o grupo .* precisa de pelo menos.*$/, 'um grupo precisa de pelo menos 2 exercícios'],
    [/ \(bloco_semanas\)$/, ''],
]

function normalizeFieldPath(path: PathSegment[]): PathSegment[] {
    const normalized = path.map((segment) =>
        typeof segment === 'string' ? (FIELD_ALIASES[segment] ?? segment) : segment,
    )
    const isPlanWeekDescription = normalized[0] === 'semanas'
    if (isPlanWeekDescription) {
        return ['progressao']
    }
    // Problema na série ou na queda inteira é sempre de métrica (nenhuma ou
    // duas ao mesmo tempo), e quem resolve é o campo do alvo.
    const listName = normalized[normalized.length - 2]
    const pointsAtSetOrDrop =
        typeof normalized[normalized.length - 1] === 'number' && (listName === 'series' || listName === 'quedas')
    const fieldPath = pointsAtSetOrDrop ? [...normalized, 'alvo'] : normalized

    return fieldPath
}

function lastFieldName(path: PathSegment[]): string | null {
    const names = path.filter((segment): segment is string => typeof segment === 'string')
    const lastName = names.length > 0 ? names[names.length - 1] : null

    return lastName
}

function rewriteCustomMessage(message: string): string {
    const rewritten = CUSTOM_MESSAGE_REWRITES.reduce(
        (current, [pattern, replacement]) => current.replace(pattern, replacement),
        message,
    )

    return rewritten
}

function tooSmallMessage(issue: z.ZodTooSmallIssue, fieldName: string | null): string {
    if (issue.type === 'string') {
        return 'não pode ficar vazio'
    }
    if (issue.type === 'array') {
        return EMPTY_LIST_MESSAGES[fieldName ?? ''] ?? 'adicione pelo menos um item'
    }
    const minimum = Number(issue.minimum)
    const message = issue.inclusive ? `deve ser pelo menos ${minimum}` : `deve ser maior que ${minimum}`

    return message
}

function tooBigMessage(issue: z.ZodTooBigIssue): string {
    const maximum = Number(issue.maximum)
    if (issue.type === 'string') {
        return `texto longo demais (máximo de ${maximum} caracteres)`
    }
    if (issue.type === 'array') {
        return `no máximo ${maximum} itens`
    }
    const message = `deve ser no máximo ${maximum}`

    return message
}

function invalidTypeMessage(issue: z.ZodInvalidTypeIssue): string {
    if (issue.expected === 'integer') {
        return 'use um número inteiro'
    }
    if (issue.received === 'undefined') {
        return 'campo obrigatório'
    }
    const message = issue.expected === 'number' ? 'número inválido' : 'valor inválido'

    return message
}

export function translateIssueMessage(issue: z.ZodIssue): string {
    const fieldName = lastFieldName(issue.path)
    switch (issue.code) {
        case 'too_small':
            return tooSmallMessage(issue, fieldName)
        case 'too_big':
            return tooBigMessage(issue)
        case 'invalid_type':
            return invalidTypeMessage(issue)
        case 'custom':
            return rewriteCustomMessage(issue.message)
        case 'invalid_enum_value':
            return 'opção inválida'
        default:
            return issue.message
    }
}

function quoted(name: string, fallback: string): string {
    const trimmed = name.trim()
    const label = trimmed === '' ? fallback : `"${trimmed}"`

    return label
}

type IssueOwners = Pick<BuilderIssue, 'workoutUid' | 'exerciseUid' | 'variationUid'> & { parts: string[] }

// Percorre o caminho do problema pelas mesmas listas do montador, que saem
// no documento na mesma ordem, para dizer em qual treino, exercício, semana,
// série e queda ele está.
function describeOwners(plan: BuilderPlan, path: PathSegment[]): IssueOwners {
    const owners: IssueOwners = { parts: [], workoutUid: null, exerciseUid: null, variationUid: null }
    const workout = path[0] === 'treinos' && typeof path[1] === 'number' ? plan.treinos[path[1]] : undefined
    if (!workout) {
        owners.parts.push('Plano')
        return owners
    }
    owners.workoutUid = workout.uid
    owners.parts.push(`Treino ${quoted(workout.nome, String(Number(path[1]) + 1))}`)

    const exercise = path[2] === 'exercicios' && typeof path[3] === 'number' ? workout.exercicios[path[3]] : undefined
    if (!exercise) {
        return owners
    }
    owners.exerciseUid = exercise.uid
    owners.parts.push(quoted(exercise.nome, `Exercício ${Number(path[3]) + 1}`))

    let rest = path.slice(4)
    if (rest[0] === 'variacoes_semana' && typeof rest[1] === 'number') {
        const variation = exercise.variacoes[rest[1]]
        if (variation) {
            owners.variationUid = variation.uid
            owners.parts.push(variation.semanas.length > 0 ? `Semana ${variation.semanas.join(', ')}` : 'Semana diferente')
        }
        rest = rest.slice(2)
    }
    if (rest[0] === 'series' && typeof rest[1] === 'number') {
        owners.parts.push(`Série ${rest[1] + 1}`)
    }
    if (rest[2] === 'quedas' && typeof rest[3] === 'number') {
        owners.parts.push(`Queda ${rest[3] + 1}`)
    }

    return owners
}

function toBuilderIssue(plan: BuilderPlan, issue: z.ZodIssue): BuilderIssue {
    const fieldPath = normalizeFieldPath(issue.path)
    const owners = describeOwners(plan, issue.path)
    const fieldName = lastFieldName(fieldPath)
    const fieldLabel = fieldName ? FIELD_LABELS[fieldName] : undefined
    const local = fieldLabel ? `${owners.parts.join(' › ')} › ${fieldLabel}` : owners.parts.join(' › ')

    return {
        fieldPath,
        local,
        mensagem: translateIssueMessage(issue),
        workoutUid: owners.workoutUid,
        exerciseUid: owners.exerciseUid,
        variationUid: owners.variationUid,
    }
}

// O contrato aceita plano sem `bloco_semanas`; na tela, ligar a progressão
// e deixar o número vazio é esquecimento, não escolha.
function blockWeeksIssue(plan: BuilderPlan): BuilderIssue | null {
    if (!plan.usaProgressao || plan.blocoSemanas.trim() !== '') {
        return null
    }

    return {
        fieldPath: ['bloco_semanas'],
        local: 'Plano › semanas do bloco',
        mensagem: 'informe quantas semanas tem o bloco',
        workoutUid: null,
        exerciseUid: null,
        variationUid: null,
    }
}

// Duas mensagens iguais no mesmo campo (o mínimo e o máximo da mesma faixa,
// por exemplo) viram uma só.
function uniqueIssues(issues: BuilderIssue[]): BuilderIssue[] {
    const seen = new Set<string>()
    const unique = issues.filter((issue) => {
        const key = `${issue.fieldPath.join('.')}|${issue.mensagem}`
        if (seen.has(key)) {
            return false
        }
        seen.add(key)
        return true
    })

    return unique
}

export function validateBuilderPlan(plan: BuilderPlan): BuilderValidationResult {
    const document = builderPlanToDocument(plan)
    const result = workoutPlanV2Schema.safeParse(document)
    const extraIssue = blockWeeksIssue(plan)
    if (result.success && !extraIssue) {
        return { success: true, document: result.data }
    }

    const schemaIssues = result.success ? [] : result.error.issues.map((issue) => toBuilderIssue(plan, issue))
    const issues = uniqueIssues(extraIssue ? [extraIssue, ...schemaIssues] : schemaIssues)

    return { success: false, issues }
}

const FIELD_ID_PREFIX = 'plano'

export function builderFieldId(path: PathSegment[]): string {
    const fieldId = [FIELD_ID_PREFIX, ...path].join('-')

    return fieldId
}

// Do campo exato até o treino: se o campo não existe na tela (um problema da
// lista de séries inteira, por exemplo), o foco vai para o contêiner dele.
export function candidateFieldIds(path: PathSegment[]): string[] {
    const candidates = path.map((_, index) => builderFieldId(path.slice(0, path.length - index)))

    return candidates
}
