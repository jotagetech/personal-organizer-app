import { useState } from 'react'

import { deleteCycle, updateCycleStartDate } from '@/features/cycle/api'
import { useCycleHistory } from '@/features/evolution/data/CycleHistoryContext'
import { CycleHistoryErrorBanner } from '@/features/evolution/data/CycleHistoryErrorBanner'
import { summarizeCycles, type CycleSummary } from '@/features/evolution/metrics/cycleSummary'
import {
    buildDeleteCycleQuestion,
    cycleFocusDate,
    formatCycleBlockWeek,
    formatCycleCounts,
    formatCyclePlans,
    formatCycleRange,
    formatCycleRateChange,
    formatCycleRhythm,
    formatCycleTitle,
} from '@/features/evolution/metrics/cycleText'
import { useSelectedDate } from '@/contexts/SelectedDateContext'
import { todayInTimezone } from '@/lib/dateUtils'

type ItemMode = 'idle' | 'editing' | 'confirmingDelete'

type CycleItemProps = {
    summary: CycleSummary
    onFocus: () => void
    onChanged: () => Promise<void>
}

export function CyclesSection() {
    const { history, isLoading, errorMessage, reload } = useCycleHistory()
    const { setSelectedDate } = useSelectedDate()
    if (errorMessage && !history) {
        return <div className="error-list">{errorMessage}</div>
    }

    if (!history) {
        return isLoading ? <p className="text-muted">Carregando ciclos...</p> : null
    }

    // Mesmo fuso das ativações, para o dia de hoje e o dia de cada troca
    // de plano caírem na mesma régua.
    const today = todayInTimezone(history.timeZone)

    const summaries = summarizeCycles(history, today)

    return (
        <div className="cycles-section">
            <CycleHistoryErrorBanner />
            <h2 className="section-title results-tab__title">Ciclos</h2>
            {summaries.length === 0 && (
                <p className="text-muted text-small">
                    Nenhum ciclo ainda. Para iniciar um, use o menu ⋮ na aba Treino.
                </p>
            )}
            {summaries.map((summary) => (
                <CycleItem
                    key={summary.cycleId}
                    summary={summary}
                    onFocus={() => setSelectedDate(cycleFocusDate(summary, today))}
                    onChanged={reload}
                />
            ))}
        </div>
    )
}

function CycleItem({ summary, onFocus, onChanged }: CycleItemProps) {
    const [mode, setMode] = useState<ItemMode>('idle')
    const [startDate, setStartDate] = useState(summary.startDate)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const blockWeekLabel = formatCycleBlockWeek(summary)
    const plansLabel = formatCyclePlans(summary)
    const rhythmLabel = formatCycleRhythm(summary)
    const rateChangeLabel = formatCycleRateChange(summary)
    const cycleId = summary.cycleId

    function changeMode(nextMode: ItemMode) {
        setErrorMessage(null)
        setStartDate(summary.startDate)
        setMode(nextMode)
    }

    async function runChange(change: () => Promise<void>) {
        setIsSubmitting(true)
        setErrorMessage(null)

        try {
            await change()
            await onChanged()
            setMode('idle')
        } catch (changeError) {
            setErrorMessage(changeError instanceof Error ? changeError.message : 'Falha ao alterar o ciclo')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="card cycle-item">
            <button type="button" className="cycle-item__main" onClick={onFocus}>
                <span className="cycle-item__title">{formatCycleTitle(summary)}</span>
                <span className="cycle-item__line">{formatCycleRange(summary)}</span>
                <span className="cycle-item__line">{formatCycleCounts(summary)}</span>
                {plansLabel && <span className="cycle-item__line">{plansLabel}</span>}
                {blockWeekLabel && <span className="cycle-item__line">{blockWeekLabel}</span>}
                {rhythmLabel && <span className="cycle-item__line">{rhythmLabel}</span>}
                {rateChangeLabel && <span className="cycle-item__line">{rateChangeLabel}</span>}
            </button>
            {errorMessage && <div className="error-list">{errorMessage}</div>}
            {mode === 'idle' && (
                <div className="cycle-item__actions">
                    <button type="button" className="cycle-item__action" onClick={() => changeMode('editing')}>
                        Editar
                    </button>
                    <button type="button" className="cycle-item__action" onClick={() => changeMode('confirmingDelete')}>
                        Excluir
                    </button>
                </div>
            )}
            {mode === 'editing' && (
                <form
                    onSubmit={(event) => {
                        event.preventDefault()
                        void runChange(() => updateCycleStartDate(cycleId, startDate))
                    }}
                >
                    <div className="field">
                        <label htmlFor={`cycle-start-${cycleId}`}>Data de início do ciclo</label>
                        <input
                            id={`cycle-start-${cycleId}`}
                            type="date"
                            value={startDate}
                            onChange={(event) => setStartDate(event.target.value)}
                        />
                    </div>
                    <p className="text-muted text-small">
                        Os treinos já registrados mantêm a semana do bloco que foi gravada neles.
                    </p>
                    <div className="form-actions">
                        <button type="submit" className="primary-button" disabled={isSubmitting || startDate === ''}>
                            {isSubmitting ? 'Salvando...' : 'Salvar'}
                        </button>
                        <button type="button" className="secondary-button" onClick={() => changeMode('idle')}>
                            Cancelar
                        </button>
                    </div>
                </form>
            )}
            {mode === 'confirmingDelete' && (
                <div className="overflow-menu__confirm">
                    <span>{buildDeleteCycleQuestion(summary)}</span>
                    <div className="form-actions">
                        <button type="button" className="secondary-button" onClick={() => changeMode('idle')}>
                            Cancelar
                        </button>
                        <button
                            type="button"
                            className="primary-button overflow-menu__confirm-danger"
                            disabled={isSubmitting}
                            onClick={() => void runChange(() => deleteCycle(cycleId))}
                        >
                            Excluir
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
