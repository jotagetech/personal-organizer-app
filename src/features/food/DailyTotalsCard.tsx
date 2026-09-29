import { computeDailyTotals } from '@/features/food/dailyTotals'
import type { FoodEntryRow } from '@/features/food/types'

type DailyTotalsCardProps = {
    entries: FoodEntryRow[]
}

type MacroStatProps = {
    label: string
    grams: number
}

function MacroStat({ label, grams }: MacroStatProps) {
    return (
        <div className="daily-totals-card__macro">
            <span className="daily-totals-card__macro-label">{label}</span>
            <span className="daily-totals-card__macro-value">
                {grams}
                <span className="daily-totals-card__macro-unit">g</span>
            </span>
        </div>
    )
}

export function DailyTotalsCard({ entries }: DailyTotalsCardProps) {
    const totals = computeDailyTotals(entries)

    if (entries.length === 0) {
        return (
            <div className="card">
                <h2 className="section-title daily-totals-card__title">Total do dia</h2>
                <p className="daily-totals-card__empty">0 kcal · nada registrado ainda</p>
            </div>
        )
    }

    return (
        <div className="card">
            <h2 className="section-title daily-totals-card__title">Total do dia</h2>
            <div className="daily-totals-card__kcal">
                <strong>{totals.kcal}</strong>
                <span>kcal</span>
            </div>
            <div className="daily-totals-card__macros">
                <MacroStat label="Proteína" grams={totals.proteinG} />
                <MacroStat label="Carbo" grams={totals.carbsG} />
                <MacroStat label="Gordura" grams={totals.fatG} />
            </div>
            {totals.entriesWithoutNutrition > 0 && (
                <p className="daily-totals-card__hint">
                    {totals.entriesWithoutNutrition === 1
                        ? '1 item sem dado nutricional'
                        : `${totals.entriesWithoutNutrition} itens sem dado nutricional`}
                </p>
            )}
        </div>
    )
}
