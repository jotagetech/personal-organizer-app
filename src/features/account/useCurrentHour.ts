import { useEffect, useState } from 'react'

// Hora atual do aparelho; reatualiza ao voltar para o app, para a saudação não
// ficar presa no período em que a tela foi aberta.
export function useCurrentHour(): number {
    const [currentHour, setCurrentHour] = useState(() => new Date().getHours())

    useEffect(() => {
        function refreshHour() {
            setCurrentHour(new Date().getHours())
        }
        document.addEventListener('visibilitychange', refreshHour)
        return () => document.removeEventListener('visibilitychange', refreshHour)
    }, [])

    return currentHour
}
