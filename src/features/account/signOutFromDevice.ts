import { clearBuilderDraft } from '@/features/workout/builder/builderDraft'
import { disablePushNotifications } from '@/features/notifications/pushApi'
import { clearAllWorkoutLocalState } from '@/features/workout/timerStorage'

// O que o app guarda no aparelho pertence à conta logada. A assinatura de push
// sai antes do signOut porque a RLS só deixa apagar a linha com a sessão ainda
// válida; sem ela, o aparelho continuaria recebendo avisos da conta anterior.
export async function signOutFromDevice(signOut: () => Promise<void>): Promise<void> {
    try {
        await disablePushNotifications()
    } catch {
        // sem rede: o navegador já descartou a assinatura, e o servidor apaga a
        // linha órfã quando o envio para ela voltar 404/410
    }
    clearAllWorkoutLocalState()
    clearBuilderDraft()
    await signOut()
}
