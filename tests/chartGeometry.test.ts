import { describe, expect, it } from 'vitest'

import {
    BAR_GAP,
    BAR_MAX_WIDTH,
    CHART_BASE_WIDTH,
    COLUMN_MIN_WIDTH,
    axisScaleFor,
    barPath,
    barShape,
    buildChartModel,
    chartLayout,
    columnAt,
    extremeIndex,
    labelAnchorFor,
    linePath,
    niceStep,
    valueToY,
} from '@/features/evolution/charts/chartGeometry'

describe('niceStep', () => {
    it('arredonda para 1, 2, 5 ou 10 vezes uma potência de dez', () => {
        expect(niceStep(0.3)).toBe(0.5)
        expect(niceStep(1)).toBe(1)
        expect(niceStep(1.4)).toBe(2)
        expect(niceStep(3)).toBe(5)
        expect(niceStep(7)).toBe(10)
        expect(niceStep(130)).toBe(200)
    })

    it('cai em 1 para passo não positivo', () => {
        expect(niceStep(0)).toBe(1)
    })
})

describe('axisScaleFor', () => {
    it('na base zero começa em zero e termina numa marca acima do maior valor', () => {
        const axis = axisScaleFor([180, 320, 250], 'zero')

        expect(axis.min).toBe(0)
        expect(axis.max).toBeGreaterThanOrEqual(320)
        expect(axis.ticks[0]).toBe(0)
        expect(axis.ticks[axis.ticks.length - 1]).toBe(axis.max)
    })

    it('nos dados envolve o menor e o maior valor com marcas em ordem', () => {
        const axis = axisScaleFor([42.5, 47.5], 'data')

        expect(axis.min).toBeLessThanOrEqual(42.5)
        expect(axis.max).toBeGreaterThanOrEqual(47.5)
        expect(axis.ticks).toEqual([...axis.ticks].sort((first, second) => first - second))
    })

    it('abre uma faixa quando todos os valores são iguais', () => {
        const axis = axisScaleFor([40, 40], 'data')

        expect(axis.min).toBeLessThan(40)
        expect(axis.max).toBeGreaterThan(40)
    })

    it('não desce abaixo de zero com todos os valores zerados nos dados', () => {
        const axis = axisScaleFor([0, 0], 'data')

        expect(axis.min).toBe(0)
        expect(axis.max).toBeGreaterThan(0)
    })

    it('mantém o eixo de zero com todos os valores zerados', () => {
        const axis = axisScaleFor([0, 0], 'zero')

        expect(axis.min).toBe(0)
        expect(axis.max).toBeGreaterThan(0)
    })

    it('não acumula erro de ponto flutuante nas marcas', () => {
        const axis = axisScaleFor([0.1, 0.4], 'data')

        axis.ticks.forEach((tick) => expect(tick).toBe(Number(tick.toFixed(10))))
    })
})

describe('chartLayout e columnAt', () => {
    it('usa a largura base com poucas colunas', () => {
        expect(chartLayout(3).width).toBe(CHART_BASE_WIDTH)
    })

    it('cresce para cada coluna ter a largura mínima de toque', () => {
        const layout = chartLayout(20)

        expect(columnAt(0, 20, layout).width).toBeGreaterThanOrEqual(COLUMN_MIN_WIDTH)
    })

    it('divide a área útil em colunas contíguas e centra cada uma', () => {
        const layout = chartLayout(4)
        const first = columnAt(0, 4, layout)
        const second = columnAt(1, 4, layout)

        expect(first.left).toBe(layout.plotLeft)
        expect(second.left).toBeCloseTo(first.left + first.width)
        expect(first.center).toBeCloseTo(first.left + first.width / 2)
    })
})

describe('valueToY', () => {
    it('põe o mínimo do eixo na base e o máximo no topo da área', () => {
        const layout = chartLayout(3)
        const axis = { min: 0, max: 100, ticks: [0, 50, 100] }

        expect(valueToY(0, axis, layout)).toBe(layout.height - layout.plotBottom)
        expect(valueToY(100, axis, layout)).toBe(layout.plotTop)
        expect(valueToY(50, axis, layout)).toBeCloseTo((layout.plotTop + layout.height - layout.plotBottom) / 2)
    })
})

describe('extremeIndex', () => {
    it('acha o primeiro maior ou o primeiro menor', () => {
        expect(extremeIndex([3, 9, 9, 1, 1], 'max')).toBe(1)
        expect(extremeIndex([3, 9, 9, 1, 1], 'min')).toBe(3)
    })
})

describe('buildChartModel', () => {
    it('monta uma coluna por valor com recorde e último índice', () => {
        const model = buildChartModel([40, 50, 45], 'data', 'max')

        expect(model.columns).toHaveLength(3)
        expect(model.recordIndex).toBe(1)
        expect(model.lastIndex).toBe(2)
        expect(model.columns[1].y).toBeLessThan(model.columns[0].y)
    })

    it('aponta o menor valor como recorde quando menos é melhor', () => {
        expect(buildChartModel([30, 20, 25], 'data', 'min').recordIndex).toBe(1)
    })
})

describe('linePath', () => {
    it('começa com M e liga os pontos com L', () => {
        expect(
            linePath([
                { x: 10, y: 20 },
                { x: 30.123, y: 40 },
            ]),
        ).toBe('M10 20 L30.12 40')
    })

    it('devolve vazio sem pontos', () => {
        expect(linePath([])).toBe('')
    })
})

describe('barShape e barPath', () => {
    const layout = chartLayout(3)
    const column = { ...columnAt(0, 3, layout), y: 60 }

    it('ancora a barra na base e deixa a folga para a vizinha', () => {
        const shape = barShape(column, layout)

        expect(shape.y + shape.height).toBe(layout.height - layout.plotBottom)
        expect(shape.width).toBeLessThanOrEqual(BAR_MAX_WIDTH)
        expect(column.width - shape.width).toBeGreaterThanOrEqual(BAR_GAP)
    })

    it('em coluna estreita a barra cede para manter a folga', () => {
        const narrow = { left: 0, width: 10, center: 5, y: 60 }

        expect(barShape(narrow, layout).width).toBe(10 - BAR_GAP)
    })

    it('arredonda só o topo com raio de 4 e fecha na base reta', () => {
        const path = barPath({ x: 10, y: 20, width: 16, height: 50 })

        expect(path).toBe('M10 70 V24 A4 4 0 0 1 14 20 H22 A4 4 0 0 1 26 24 V70 Z')
    })

    it('limita o raio em barras baixas', () => {
        const path = barPath({ x: 0, y: 0, width: 16, height: 2 })

        expect(path).toContain('A2 2 0 0 1')
    })
})

describe('labelAnchorFor', () => {
    it('cresce para a direita no começo e para a esquerda no fim', () => {
        const layout = chartLayout(4)

        expect(labelAnchorFor(layout.plotLeft + 10, layout)).toBe('start')
        expect(labelAnchorFor(layout.width - 20, layout)).toBe('end')
    })
})
