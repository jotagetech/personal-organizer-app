// Geometria dos gráficos de evolução: escalas, marcas de eixo, caminho da
// linha e posição das barras. Tudo em unidades do viewBox, sem tocar no DOM.

export type Baseline = 'zero' | 'data'
export type Preference = 'max' | 'min'

export const CHART_HEIGHT = 140
export const CHART_BASE_WIDTH = 320
// Largura mínima de cada coluna: é a área de toque do ponto ou da barra.
export const COLUMN_MIN_WIDTH = 44
export const BAR_MAX_WIDTH = 16
export const BAR_GAP = 2
export const BAR_CORNER_RADIUS = 4

const PLOT_LEFT = 40
const PLOT_RIGHT = 12
const PLOT_TOP = 24
const PLOT_BOTTOM = 24
const TARGET_TICK_INTERVALS = 2
const FLOAT_DIGITS = 10

export type ChartLayout = {
    width: number
    height: number
    plotLeft: number
    plotRight: number
    plotTop: number
    plotBottom: number
}

export type AxisScale = {
    min: number
    max: number
    ticks: number[]
}

export type ChartColumn = {
    // Borda esquerda e largura da coluna inteira, que recebe o toque.
    left: number
    width: number
    center: number
    // Altura do valor da coluna no eixo.
    y: number
}

export type ChartModel = {
    layout: ChartLayout
    axis: AxisScale
    columns: ChartColumn[]
    // Primeiro índice do melhor valor; o empate fica com o mais antigo.
    recordIndex: number
    lastIndex: number
}

export type Point = { x: number; y: number }

export type BarShape = {
    x: number
    y: number
    width: number
    height: number
}

export function chartLayout(columnCount: number): ChartLayout {
    const neededWidth = PLOT_LEFT + PLOT_RIGHT + columnCount * COLUMN_MIN_WIDTH
    const layout = {
        width: Math.max(CHART_BASE_WIDTH, neededWidth),
        height: CHART_HEIGHT,
        plotLeft: PLOT_LEFT,
        plotRight: PLOT_RIGHT,
        plotTop: PLOT_TOP,
        plotBottom: PLOT_BOTTOM,
    }

    return layout
}

function roundFloat(value: number): number {
    const rounded = Number(value.toFixed(FLOAT_DIGITS))

    return rounded
}

// Passo no formato 1, 2, 5 vezes uma potência de dez.
export function niceStep(rawStep: number): number {
    if (rawStep <= 0) {
        return 1
    }
    const magnitude = 10 ** Math.floor(Math.log10(rawStep))
    const fraction = rawStep / magnitude
    const factor = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
    const step = roundFloat(factor * magnitude)

    return step
}

function paddedExtent(values: readonly number[], baseline: Baseline): { low: number; high: number } {
    const dataLow = Math.min(...values)
    const dataHigh = Math.max(...values)
    if (baseline === 'zero') {
        return { low: Math.min(0, dataLow), high: dataHigh > 0 ? dataHigh : 1 }
    }
    if (dataLow === dataHigh) {
        const spread = Math.max(Math.abs(dataLow) * 0.1, 1)
        // Dado sem negativo não ganha eixo negativo só pela folga.
        const paddedLow = dataLow >= 0 ? Math.max(0, dataLow - spread) : dataLow - spread

        return { low: paddedLow, high: dataHigh + spread }
    }

    return { low: dataLow, high: dataHigh }
}

// Eixo que começa e termina numa marca, com poucas marcas redondas. Na base
// zero o eixo não desce abaixo de zero; nos dados, não cruza zero sem
// necessidade.
export function axisScaleFor(values: readonly number[], baseline: Baseline): AxisScale {
    const { low, high } = paddedExtent(values, baseline)
    const step = niceStep((high - low) / TARGET_TICK_INTERVALS)
    const min = roundFloat(Math.floor(low / step) * step)
    const max = roundFloat(Math.ceil(high / step) * step)
    const ticks: number[] = []
    for (let tick = min; tick <= max + step / 2; tick += step) {
        ticks.push(roundFloat(tick))
    }
    const axis = { min, max: ticks[ticks.length - 1], ticks }

    return axis
}

// Valor para altura: o mínimo do eixo fica na base da área do gráfico.
export function valueToY(value: number, axis: AxisScale, layout: ChartLayout): number {
    const top = layout.plotTop
    const bottom = layout.height - layout.plotBottom
    const span = axis.max - axis.min
    const ratio = span === 0 ? 0 : (value - axis.min) / span
    const y = bottom - ratio * (bottom - top)

    return y
}

export function columnAt(index: number, count: number, layout: ChartLayout): Pick<ChartColumn, 'left' | 'width' | 'center'> {
    const plotWidth = layout.width - layout.plotLeft - layout.plotRight
    const width = plotWidth / count
    const left = layout.plotLeft + index * width
    const column = { left, width, center: left + width / 2 }

    return column
}

export function extremeIndex(values: readonly number[], preference: Preference): number {
    let best = 0
    values.forEach((value, index) => {
        const isBetter = preference === 'max' ? value > values[best] : value < values[best]
        if (isBetter) {
            best = index
        }
    })

    return best
}

export function buildChartModel(values: readonly number[], baseline: Baseline, preference: Preference): ChartModel {
    const layout = chartLayout(values.length)
    const axis = axisScaleFor(values, baseline)
    const columns = values.map((value, index) => ({
        ...columnAt(index, values.length, layout),
        y: valueToY(value, axis, layout),
    }))
    const model = {
        layout,
        axis,
        columns,
        recordIndex: extremeIndex(values, preference),
        lastIndex: values.length - 1,
    }

    return model
}

function formatCoordinate(value: number): string {
    const text = String(roundFloat(Math.round(value * 100) / 100))

    return text
}

export function linePath(points: readonly Point[]): string {
    const path = points
        .map((point, index) => `${index === 0 ? 'M' : 'L'}${formatCoordinate(point.x)} ${formatCoordinate(point.y)}`)
        .join(' ')

    return path
}

// Barra fina no centro da coluna, sempre com folga de BAR_GAP para a vizinha.
export function barShape(column: ChartColumn, layout: ChartLayout): BarShape {
    const width = Math.min(BAR_MAX_WIDTH, column.width - BAR_GAP)
    const bottom = layout.height - layout.plotBottom
    const shape = {
        x: column.center - width / 2,
        y: column.y,
        width,
        height: Math.max(0, bottom - column.y),
    }

    return shape
}

// Topo arredondado e base reta encostada no eixo. O raio nunca passa da
// metade da largura nem da altura, para barras baixas não se deformarem.
export function barPath(shape: BarShape): string {
    const { x, y, width, height } = shape
    const radius = Math.min(BAR_CORNER_RADIUS, width / 2, height)
    const bottom = y + height
    const right = x + width
    const path = [
        `M${formatCoordinate(x)} ${formatCoordinate(bottom)}`,
        `V${formatCoordinate(y + radius)}`,
        `A${formatCoordinate(radius)} ${formatCoordinate(radius)} 0 0 1 ${formatCoordinate(x + radius)} ${formatCoordinate(y)}`,
        `H${formatCoordinate(right - radius)}`,
        `A${formatCoordinate(radius)} ${formatCoordinate(radius)} 0 0 1 ${formatCoordinate(right)} ${formatCoordinate(y + radius)}`,
        `V${formatCoordinate(bottom)}`,
        'Z',
    ].join(' ')

    return path
}

export type LabelAnchor = 'start' | 'end'

// Rótulos do fim do gráfico crescem para dentro; os do começo, para a direita.
export function labelAnchorFor(x: number, layout: ChartLayout): LabelAnchor {
    const anchor = x > layout.width / 2 ? 'end' : 'start'

    return anchor
}
