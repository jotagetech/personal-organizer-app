import { computeDailyTotals } from '@/features/food/dailyTotals'
import type { FoodEntryRow } from '@/features/food/types'

type DailyTotalsCardProps = {
    entries: FoodEntryRow[]
}

export function DailyTotalsCard({ entries }: DailyTotalsCardProps) {
    const totals = computeDailyTotals(entries)

    if (entries.length === 0) {
        return (
            <div className="card">
                <h2 style={{ fontSize: 16, marginTop: 0, marginBottom: 8 }}>Total do dia</h2>
                <p className="daily-totals-card__empty">0 kcal · nada registrado ainda</p>
            </div>
        )
    }

    return (
        <div className="card">
            <h2 style={{ fontSize: 16, marginTop: 0, marginBottom: 8 }}>Total do dia</h2>
            <div className="daily-totals-card__stats">
                <div className="daily-totals-card__stat">
                    <strong>{totals.kcal}</strong>
                    <span>kcal</span>
                </div>
                <div className="daily-totals-card__stat">
                    <strong>{totals.proteinG}</strong>
                    <span>g proteína</span>
                </div>
                <div className="daily-totals-card__stat">
                    <strong>{totals.carbsG}</strong>
                    <span>g carbo</span>
                </div>
                <div className="daily-totals-card__stat">
                    <strong>{totals.fatG}</strong>
                    <span>g gordura</span>
                </div>
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
