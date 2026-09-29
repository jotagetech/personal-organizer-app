// Service worker, assinatura de push deste aparelho e o push de descanso
// agendado no servidor. Nada aqui passa pela fila offline: um aviso de
// descanso entregue depois da hora não serve, então sem rede fica só o bipe
// do próprio app, sem erro na tela.

import type { RestPushPlan } from '@/features/workout/restPush'
import { resolvePushAvailability, vapidPublicKeyToBytes, type PushAvailability } from '@/features/notifications/pushSupport'
import { supabase } from '@/lib/supabaseClient'

const SERVICE_WORKER_URL = '/sw.js'
const REST_PUSH_KIND = 'descanso'

export function isPushSupported(): boolean {
    return (
        typeof window !== 'undefined' &&
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window
    )
}

function isStandaloneDisplay(): boolean {
    const legacyNavigator = navigator as Navigator & { standalone?: boolean }
    const matchesStandalone =
        typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches

    return legacyNavigator.standalone === true || matchesStandalone
}

// iPad com iPadOS se apresenta como Mac, mas com tela de toque.
function isAppleMobileDevice(): boolean {
    const userAgent = navigator.userAgent
    const isIpadAsMac = /Macintosh/.test(userAgent) && navigator.maxTouchPoints > 1

    return /iPhone|iPad|iPod/.test(userAgent) || isIpadAsMac
}

export function currentPushAvailability(): PushAvailability {
    const hasNotification = typeof window !== 'undefined' && 'Notification' in window

    return resolvePushAvailability({
        supportsPush: isPushSupported(),
        isStandalone: isStandaloneDisplay(),
        isAppleMobile: isAppleMobileDevice(),
        permission: hasNotification ? Notification.permission : null,
    })
}

// O app funciona sem service worker; falhar aqui só tira as notificações.
export function registerServiceWorker(): void {
    if (!('serviceWorker' in navigator)) {
        return
    }
    void navigator.serviceWorker.register(SERVICE_WORKER_URL).catch(() => undefined)
}

export async function getActivePushSubscription(): Promise<PushSubscription | null> {
    if (!isPushSupported() || Notification.permission !== 'granted') {
        return null
    }
    try {
        const registration = await navigator.serviceWorker.getRegistration()
        const subscription = registration ? await registration.pushManager.getSubscription() : null
        return subscription
    } catch {
        return null
    }
}

async function saveSubscription(subscription: PushSubscription): Promise<void> {
    const { keys } = subscription.toJSON()
    if (!keys?.p256dh || !keys.auth) {
        throw new Error('Assinatura de push sem chaves')
    }
    const { error } = await supabase.rpc('register_push_subscription', {
        p_endpoint: subscription.endpoint,
        p_p256dh: keys.p256dh,
        p_auth: keys.auth,
        p_user_agent: navigator.userAgent,
    })
    if (error) {
        throw new Error(error.message)
    }
}

export type EnablePushResult = 'ativadas' | 'bloqueadas' | 'sem_resposta'

// Precisa ser chamada direto no toque: o iOS só mostra o pedido de permissão
// dentro de um gesto do usuário, então requestPermission vem antes de
// qualquer outra espera.
export async function enablePushNotifications(): Promise<EnablePushResult> {
    const permission = await Notification.requestPermission()
    if (permission === 'denied') {
        return 'bloqueadas'
    }
    if (permission !== 'granted') {
        return 'sem_resposta'
    }

    const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
    if (!publicKey) {
        throw new Error('VITE_VAPID_PUBLIC_KEY não está definida neste build')
    }
    await navigator.serviceWorker.register(SERVICE_WORKER_URL)
    const registration = await navigator.serviceWorker.ready
    const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: vapidPublicKeyToBytes(publicKey),
        }))
    await saveSubscription(subscription)

    return 'ativadas'
}

export async function disablePushNotifications(): Promise<void> {
    const subscription = await getActivePushSubscription()
    if (!subscription) {
        return
    }
    const { endpoint } = subscription
    await subscription.unsubscribe()
    const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
    if (error) {
        throw new Error(error.message)
    }
}

// O navegador pode trocar o endpoint da assinatura, e o servidor apaga a que
// recebe 404/410; regravar a atual ao abrir o Menu mantém as duas pontas iguais.
export async function syncPushSubscription(): Promise<void> {
    const subscription = await getActivePushSubscription()
    if (!subscription) {
        return
    }
    try {
        await saveSubscription(subscription)
    } catch {
        // melhor esforço: a próxima abertura tenta de novo
    }
}

// Agendar e cancelar em sequência: um "+15 s" seguido de "Pular" não pode
// chegar ao servidor fora de ordem e deixar um push que já foi cancelado.
let restPushQueue: Promise<void> = Promise.resolve()

function enqueueRestPushTask(task: () => Promise<void>): void {
    restPushQueue = restPushQueue.then(task).catch(() => undefined)
}

async function currentUserId(): Promise<string | null> {
    const { data } = await supabase.auth.getSession()
    const userId = data.session?.user.id ?? null

    return userId
}

export function scheduleRestPush(plan: RestPushPlan): void {
    enqueueRestPushTask(async () => {
        if (!navigator.onLine || !(await getActivePushSubscription())) {
            return
        }
        const userId = await currentUserId()
        if (!userId) {
            return
        }
        await supabase.from('scheduled_pushes').upsert(
            {
                user_id: userId,
                kind: REST_PUSH_KIND,
                fire_at: new Date(plan.fireAtMs).toISOString(),
                title: plan.title,
                body: plan.body,
                sent_at: null,
            },
            { onConflict: 'user_id,kind' },
        )
    })
}

export function cancelRestPush(): void {
    enqueueRestPushTask(async () => {
        if (!navigator.onLine || !isPushSupported()) {
            return
        }
        const userId = await currentUserId()
        if (!userId) {
            return
        }
        await supabase.from('scheduled_pushes').delete().eq('user_id', userId).eq('kind', REST_PUSH_KIND)
    })
}
