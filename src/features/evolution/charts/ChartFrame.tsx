import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import {
    buildChartModel,
    labelAnchorFor,
    valueToY,
    type Baseline,
    type ChartModel,
    type LabelAnchor,
    type Preference,
} from '@/features/evolution/charts/chartGeometry'
import {
    CHART_NEEDS_MORE_SESSIONS,
    CHART_TOUCH_HINT,
    formatAxisTick,
    formatChartReadout,
    formatChartSummary,
} from '@/features/evolution/metrics/exerciseText'
import { formatDayMonth } from '@/features/evolution/sections/daysWindow'
import type { IsoDate } from '@/lib/dateUtils'

export type SeriesChartPoint = {
    date: IsoDate
    value: number
}

export type SeriesChartProps = {
    title: string
    points: readonly SeriesChartPoint[]
    // O melhor valor é o maior, ou o menor quando menos é melhor.
    preference: Preference
    formatValue: (value: number) => string
}

type ChartFrameProps = SeriesChartProps & {
    baseline: Baseline
    renderMarks: (model: ChartModel, activeIndex: number | null) => ReactNode
}

type ChartLabel = {
    key: string
    x: number
    y: number
    text: string
    anchor: LabelAnchor
}

const RECORD_LABEL_PREFIX = 'recorde'
const LABEL_OFFSET_Y = 10
const DATE_OFFSET_Y = 16
const TICK_OFFSET_X = 6
const TICK_OFFSET_Y = 3

// Último valor e recorde; quando são o mesmo ponto, um rótulo só.
function labelsOf(
    model: ChartModel,
    points: readonly SeriesChartPoint[],
    formatValue: (value: number) => string,
): ChartLabel[] {
    const { columns, recordIndex, lastIndex, layout } = model
    const lastText = formatValue(points[lastIndex].value)
    const labels: ChartLabel[] = [
        {
            key: 'last',
            x: columns[lastIndex].center,
            y: columns[lastIndex].y - LABEL_OFFSET_Y,
            text: lastIndex === recordIndex ? `${RECORD_LABEL_PREFIX} ${lastText}` : lastText,
            anchor: labelAnchorFor(columns[lastIndex].center, layout),
        },
    ]
    if (recordIndex !== lastIndex) {
        labels.push({
            key: 'record',
            x: columns[recordIndex].center,
            y: columns[recordIndex].y - LABEL_OFFSET_Y,
            text: `${RECORD_LABEL_PREFIX} ${formatValue(points[recordIndex].value)}`,
            anchor: recordIndex < lastIndex ? 'start' : 'end',
        })
    }

    return labels
}

// Moldura comum dos gráficos: título, grade, eixos, rótulos do último valor
// e do recorde, e a área de toque de cada coluna. As marcas (linha ou barras)
// vêm de fora.
export function ChartFrame({ title, points, preference, baseline, formatValue, renderMarks }: ChartFrameProps) {
    const [activeIndex, setActiveIndex] = useState<number | null>(null)
    const scrollRef = useRef<HTMLDivElement>(null)
    const values = useMemo(() => points.map((point) => point.value), [points])
    const model = useMemo(
        () => (values.length >= 2 ? buildChartModel(values, baseline, preference) : null),
        [values, baseline, preference],
    )

    // O mais recente fica à direita; com muitas sessões o gráfico rola e abre
    // nele.
    useEffect(() => {
        const scroller = scrollRef.current
        if (scroller) {
            scroller.scrollLeft = scroller.scrollWidth
        }
    }, [values.length])

    if (model === null) {
        return (
            <section className="exercise-chart">
                <h4 className="exercise-chart__title">{title}</h4>
                <p className="text-muted text-small">{CHART_NEEDS_MORE_SESSIONS}</p>
            </section>
        )
    }

    const { layout, axis, columns } = model
    const plotBottom = layout.height - layout.plotBottom
    const plotRightEdge = layout.width - layout.plotRight
    const activePoint = activeIndex === null ? null : points[activeIndex]
    const readout = activePoint ? formatChartReadout(activePoint.date, formatValue(activePoint.value)) : CHART_TOUCH_HINT
    const summary = formatChartSummary(title, values, formatValue)

    return (
        <section className="exercise-chart">
            <h4 className="exercise-chart__title">{title}</h4>
            <p className="exercise-chart__readout" aria-live="polite">
                {readout}
            </p>
            <div className="exercise-chart__scroll" ref={scrollRef}>
                <svg
                    className="exercise-chart__svg"
                    viewBox={`0 0 ${layout.width} ${layout.height}`}
                    style={{ minWidth: layout.width }}
                    role="img"
                    aria-label={summary}
                >
                    {axis.ticks.map((tick) => {
                        const y = valueToY(tick, axis, layout)

                        return (
                            <g key={tick}>
                                <line
                                    className="exercise-chart__grid"
                                    x1={layout.plotLeft}
                                    x2={plotRightEdge}
                                    y1={y}
                                    y2={y}
                                />
                                <text
                                    className="exercise-chart__tick"
                                    x={layout.plotLeft - TICK_OFFSET_X}
                                    y={y + TICK_OFFSET_Y}
                                    textAnchor="end"
                                >
                                    {formatAxisTick(tick)}
                                </text>
                            </g>
                        )
                    })}
                    <line
                        className="exercise-chart__axis"
                        x1={layout.plotLeft}
                        x2={plotRightEdge}
                        y1={plotBottom}
                        y2={plotBottom}
                    />
                    {renderMarks(model, activeIndex)}
                    {labelsOf(model, points, formatValue).map((label) => (
                        <text
                            key={label.key}
                            className="exercise-chart__label"
                            x={label.x}
                            y={label.y}
                            textAnchor={label.anchor}
                        >
                            {label.text}
                        </text>
                    ))}
                    {columns.map((column, index) => (
                        <g key={column.left}>
                            <text
                                className="exercise-chart__date"
                                x={column.center}
                                y={plotBottom + DATE_OFFSET_Y}
                                textAnchor="middle"
                            >
                                {formatDayMonth(points[index].date)}
                            </text>
                            <rect
                                className="exercise-chart__hit"
                                x={column.left}
                                y={0}
                                width={column.width}
                                height={layout.height}
                                onPointerEnter={() => setActiveIndex(index)}
                                onPointerLeave={(event) => {
                                    if (event.pointerType === 'mouse') {
                                        setActiveIndex(null)
                                    }
                                }}
                                onClick={() => setActiveIndex(index)}
                            />
                        </g>
                    ))}
                </svg>
            </div>
        </section>
    )
}
