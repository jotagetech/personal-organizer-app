import { BuilderRangeField } from '@/features/workout/builder/BuilderRangeField'
import { BuilderSetList } from '@/features/workout/builder/BuilderSetList'
import { builderFieldId } from '@/features/workout/builder/builderValidation'
import type { BuilderPrescription } from '@/features/workout/builder/builderTypes'
import { MAX_INTERVAL_ROUNDS, MAX_RIR, MAX_RPE, MIN_RPE, type ExerciseKind } from '@/lib/workoutPlanSchema'

type BuilderPrescriptionFieldsProps = {
    fieldPath: (string | number)[]
    tipo: ExerciseKind
    prescription: BuilderPrescription
    onChange: (changes: Partial<BuilderPrescription>) => void
}

// O que o exercício prescreve e que uma semana do bloco pode trocar: a mesma
// tela serve para a base e para cada "semana diferente".
export function BuilderPrescriptionFields({ fieldPath, tipo, prescription, onChange }: BuilderPrescriptionFieldsProps) {
    if (tipo === 'intervalado') {
        const roundsId = builderFieldId([...fieldPath, 'rodadas'])

        return (
            <>
                <div className="field">
                    <label htmlFor={roundsId}>Rodadas</label>
                    <input
                        id={roundsId}
                        type="text"
                        inputMode="numeric"
                        placeholder={`1 a ${MAX_INTERVAL_ROUNDS}`}
                        value={prescription.rodadas}
                        onChange={(event) => onChange({ rodadas: event.target.value })}
                    />
                </div>
                <BuilderRangeField
                    id={builderFieldId([...fieldPath, 'trabalho'])}
                    label="Trabalho"
                    unit="s"
                    range={prescription.trabalho}
                    onChange={(trabalho) => onChange({ trabalho })}
                    hint="Com faixa, dá para encerrar o trabalho dentro dela."
                />
                <BuilderRangeField
                    id={builderFieldId([...fieldPath, 'recuperacao'])}
                    label="Recuperação"
                    unit="s"
                    range={prescription.recuperacao}
                    onChange={(recuperacao) => onChange({ recuperacao })}
                />
                <BuilderRangeField
                    id={builderFieldId([...fieldPath, 'rpe'])}
                    label="RPE alvo"
                    unit={`${MIN_RPE} a ${MAX_RPE}, opcional`}
                    range={prescription.rpe}
                    onChange={(rpe) => onChange({ rpe })}
                />
            </>
        )
    }

    return (
        <>
            <BuilderRangeField
                id={builderFieldId([...fieldPath, 'descanso'])}
                label="Descanso"
                unit="s, opcional"
                range={prescription.descanso}
                onChange={(descanso) => onChange({ descanso })}
            />
            <BuilderRangeField
                id={builderFieldId([...fieldPath, 'rir'])}
                label="RIR alvo"
                unit={`0 a ${MAX_RIR}, opcional`}
                range={prescription.rir}
                onChange={(rir) => onChange({ rir })}
                hint="Repetições que sobram no fim da série."
            />
            <BuilderSetList
                fieldPath={fieldPath}
                sets={prescription.series}
                onChange={(series) => onChange({ series })}
            />
        </>
    )
}
