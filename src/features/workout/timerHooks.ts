import { useEffect, useState } from 'react'

const CLOCK_INTERVAL_MS = 250

// O intervalo só dispara a releitura do relógio; o valor exibido vem sempre de
// Date.now(). Ao voltar para a aba a leitura é refeita na hora, sem esperar o
// próximo tick que o iOS pode ter atrasado.
export function useNow(isActive: boolean): number {
    const [nowMs, setNowMs] = useState(() => Date.now())

    useEffect(() => {
        if (!isActive) {
            return
        }
        setNowMs(Date.now())
        const intervalId = window.setInterval(() => setNowMs(Date.now()), CLOCK_INTERVAL_MS)
        function handleVisibilityChange() {
            if (document.visibilityState === 'visible') {
                setNowMs(Date.now())
            }
        }
        document.addEventListener('visibilitychange', handleVisibilityChange)

        return () => {
            window.clearInterval(intervalId)
            document.removeEventListener('visibilitychange', handleVisibilityChange)
        }
    }, [isActive])

    return nowMs
}

// O navegador solta o wake lock sozinho quando a aba fica oculta; ao voltar
// ele é pedido de novo enquanto o timer seguir rodando.
export function useWakeLock(isActive: boolean): void {
    useEffect(() => {
        if (!isActive || !('wakeLock' in navigator)) {
            return
        }

        let sentinel: WakeLockSentinel | null = null
        let isCancelled = false

        async function acquire() {
            try {
                const acquired = await navigator.wakeLock.request('screen')
                if (isCancelled) {
                    void acquired.release().catch(() => undefined)
                    return
                }
                sentinel = acquired
            } catch {
                // negado (economia de bateria, por exemplo): o timer não depende disso
            }
        }

        function handleVisibilityChange() {
            if (document.visibilityState === 'visible' && (!sentinel || sentinel.released)) {
                void acquire()
            }
        }

        void acquire()
        document.addEventListener('visibilitychange', handleVisibilityChange)

        return () => {
            isCancelled = true
            document.removeEventListener('visibilitychange', handleVisibilityChange)
            void sentinel?.release().catch(() => undefined)
        }
    }, [isActive])
}
