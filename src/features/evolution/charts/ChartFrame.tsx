import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import {
    buildChartModel,
    CHART_BASE_WIDTH,
    placeChartLabels,
    valueToY,
    type Baseline,
    type ChartModel,
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

const RECORD_LABEL_PREFIX = 'recorde'
const DATE_OFFSET_Y = 16
const TICK_OFFSET_X = 6
const TICK_OFFSET_Y = 3

function labelsOf(model: ChartModel, points: readonly SeriesChartPoint[], formatValue: (value: number) => string) {
    const lastText = formatValue(points[model.lastIndex].value)
    const recordText = `${RECORD_LABEL_PREFIX} ${formatValue(points[model.recordIndex].value)}`
    const labels = placeChartLabels(model, lastText, recordText)

    return labels
}

// Largura útil do container, para o gráfico ocupar a linha toda em vez de
// ficar com a largura base centralizada.
function useContainerWidth(element: HTMLDivElement | null): number {
    const [width, setWidth] = useState(CHART_BASE_WIDTH)

    useEffect(() => {
        if (!element || typeof ResizeObserver === 'undefined') {
            return
        }
        const observer = new ResizeObserver((entries) => {
            const measuredWidth = Math.floor(entries[0].contentRect.width)
            if (measuredWidth > 0) {
                setWidth(measuredWidth)
            }
        })
        observer.observe(element)

        return () => observer.disconnect()
    }, [element])

    return width
}

// Moldura comum dos gráficos: título, grade, eixos, rótulos do último valor
// e do recorde, e a área de toque de cada coluna. As marcas (linha ou barras)
// vêm de fora.
export function ChartFrame({ title, points, preference, baseline, formatValue, renderMarks }: ChartFrameProps) {
    const [activeIndex, setActiveIndex] = useState<number | null>(null)
    const scrollRef = useRef<HTMLDivElement | null>(null)
    const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
    const containerWidth = useContainerWidth(scrollElement)
    const values = useMemo(() => points.map((point) => point.value), [points])
    const model = useMemo(
        () => (values.length >= 2 ? buildChartModel(values, baseline, preference, containerWidth) : null),
        [values, baseline, preference, containerWidth],
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
            <div
                className="exercise-chart__scroll"
                ref={(element) => {
                    scrollRef.current = element
                    setScrollElement(element)
                }}
            >
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
