import { ChartFrame, type SeriesChartProps } from '@/features/evolution/charts/ChartFrame'
import { linePath, type ChartModel } from '@/features/evolution/charts/chartGeometry'

const DOT_RADIUS = 5

function renderLineMarks(model: ChartModel, activeIndex: number | null) {
    const path = linePath(model.columns.map((column) => ({ x: column.center, y: column.y })))

    return (
        <>
            <path className="exercise-chart__line" d={path} />
            {model.columns.map((column, index) => (
                <circle
                    key={column.left}
                    className={
                        index === activeIndex ? 'exercise-chart__dot exercise-chart__dot--active' : 'exercise-chart__dot'
                    }
                    cx={column.center}
                    cy={column.y}
                    r={DOT_RADIUS}
                />
            ))}
        </>
    )
}

// Linha de 2px com um ponto de 10px por sessão. O eixo acompanha os dados em
// vez de começar em zero, porque a variação é o que interessa.
export function LineChart(props: SeriesChartProps) {
    return <ChartFrame {...props} baseline="data" renderMarks={renderLineMarks} />
}
