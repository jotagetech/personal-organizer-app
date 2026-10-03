import { useEffect, useState, type CSSProperties } from 'react'

// No iPhone, o teclado encolhe só a área visível (visual viewport); um
// elemento fixo em inset: 0 continua do tamanho da tela inteira e fica com a
// parte de baixo atrás do teclado, enquanto o Safari rola a página para
// mostrar o campo. Seguir a área visível mantém a folha inteira acima do
// teclado. Sem a API (navegadores antigos), nada muda.
export function useVisualViewportFrame(): CSSProperties | undefined {
    const [frameStyle, setFrameStyle] = useState<CSSProperties | undefined>(undefined)

    useEffect(() => {
        const viewport = window.visualViewport
        if (!viewport) {
            return undefined
        }
        const visualViewport = viewport

        function syncFrame() {
            const nextStyle: CSSProperties = {
                top: `${visualViewport.offsetTop}px`,
                height: `${visualViewport.height}px`,
                bottom: 'auto',
            }
            setFrameStyle(nextStyle)
        }

        syncFrame()
        visualViewport.addEventListener('resize', syncFrame)
        visualViewport.addEventListener('scroll', syncFrame)

        return () => {
            visualViewport.removeEventListener('resize', syncFrame)
            visualViewport.removeEventListener('scroll', syncFrame)
        }
    }, [])

    return frameStyle
}
