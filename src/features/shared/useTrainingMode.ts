import { useEffect } from 'react'

const TRAINING_MODE = 'treino'
const CHROME_COLOR_TOKEN = '--color-chrome-bg'
const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)'

// O modo treino fica no elemento raiz, e não num wrapper da aba, pra o fundo
// da página, o cabeçalho e a barra inferior escurecerem juntos.
export function useTrainingMode(isTrainingActive: boolean) {
    useEffect(() => {
        const rootElement = document.documentElement
        if (isTrainingActive) {
            rootElement.dataset.mode = TRAINING_MODE
        } else {
            delete rootElement.dataset.mode
        }

        syncThemeColor()
    }, [isTrainingActive])

    useEffect(() => {
        const darkSchemeQuery = window.matchMedia(DARK_SCHEME_QUERY)
        darkSchemeQuery.addEventListener('change', syncThemeColor)

        return () => darkSchemeQuery.removeEventListener('change', syncThemeColor)
    }, [])
}

// O theme-color pinta a barra do navegador; acompanhar o fundo do cabeçalho
// evita uma faixa de outra cor em cima do app ao trocar de tema ou de modo.
function syncThemeColor() {
    const themeColorMeta = document.querySelector('meta[name="theme-color"]')
    if (!themeColorMeta) {
        return
    }

    const rootStyle = getComputedStyle(document.documentElement)
    const chromeColor = rootStyle.getPropertyValue(CHROME_COLOR_TOKEN).trim()
    themeColorMeta.setAttribute('content', chromeColor)
}
