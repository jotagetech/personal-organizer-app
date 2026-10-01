import type { CatalogMatch, CatalogSearchResult } from '@/features/exerciseCatalog/catalogSearch'
import type { ExerciseRow } from '@/features/exerciseCatalog/types'
import { exerciseTags } from '@/features/workout/setPresentation'

type CatalogSuggestionsProps = {
    result: CatalogSearchResult
    onPick: (exercise: ExerciseRow) => void
}

const MATCH_NOTE: Record<CatalogMatch['kind'], ((match: CatalogMatch) => string) | null> = {
    nome: null,
    apelido: (match) => `apelido: ${match.matchedText}`,
    meu_apelido: (match) => `seu apelido: ${match.matchedText}`,
    iniciais: () => 'pelas iniciais',
}

export function exerciseMeta(exercise: ExerciseRow, note: string | null = null): string {
    const tags = exerciseTags({
        equipamento: exercise.equipment,
        pegada: exercise.pegada,
        largura_pegada: exercise.largura_pegada,
        acessorio: exercise.acessorio,
        por_lado: false,
    })
    const ownership = exercise.owner_user_id === null ? [] : ['só seu']
    const meta = [...tags, ...ownership, ...(note ? [note] : [])].join(' · ')

    return meta
}

function SuggestionButton({ exercise, note, onPick }: { exercise: ExerciseRow; note: string | null; onPick: () => void }) {
    const meta = exerciseMeta(exercise, note)

    // onMouseDown evita que o campo perca o foco antes do toque contar.
    return (
        <button
            type="button"
            className="catalog-suggestions__item"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onPick}
        >
            <span className="catalog-suggestions__name">{exercise.name_pt}</span>
            {meta && <span className="catalog-suggestions__meta">{meta}</span>}
        </button>
    )
}

export function CatalogSuggestions({ result, onPick }: CatalogSuggestionsProps) {
    const genericSlugs = new Set(result.generic?.exercises.map((exercise) => exercise.id) ?? [])
    const otherMatches = result.matches.filter((match) => !genericSlugs.has(match.exercise.id))
    const hasGeneric = result.generic !== null && result.generic.exercises.length > 0
    if (!hasGeneric && otherMatches.length === 0) {
        return null
    }

    return (
        <div className="catalog-suggestions" role="listbox" aria-label="Exercícios do catálogo">
            {hasGeneric && (
                <>
                    <p className="catalog-suggestions__heading">
                        "{result.generic!.name}" serve para mais de uma variação. Qual é a sua?
                    </p>
                    {result.generic!.exercises.map((exercise) => (
                        <SuggestionButton key={exercise.id} exercise={exercise} note={null} onPick={() => onPick(exercise)} />
                    ))}
                </>
            )}
            {otherMatches.map((match) => {
                const noteOf = MATCH_NOTE[match.kind]
                const note = noteOf ? noteOf(match) : null

                return (
                    <SuggestionButton
                        key={match.exercise.id}
                        exercise={match.exercise}
                        note={note}
                        onPick={() => onPick(match.exercise)}
                    />
                )
            })}
        </div>
    )
}
