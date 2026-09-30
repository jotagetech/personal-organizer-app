import { ChartFrame, type SeriesChartProps } from '@/features/evolution/charts/ChartFrame'
import { barPath, barShape, type ChartModel } from '@/features/evolution/charts/chartGeometry'

function renderBarMarks(model: ChartModel, activeIndex: number | null) {
    return (
        <>
            {model.columns.map((column, index) => (
                <path
                    key={column.left}
                    className={
                        index === activeIndex ? 'exercise-chart__bar exercise-chart__bar--active' : 'exercise-chart__bar'
                    }
                    d={barPath(barShape(column, model.layout))}
                />
            ))}
        </>
    )
}

// Barras finas ancoradas na base: o comprimento só é honesto a partir de zero.
export function BarChart(props: SeriesChartProps) {
    return <ChartFrame {...props} baseline="zero" renderMarks={renderBarMarks} />
}
