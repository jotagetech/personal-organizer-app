// Envia os pushes agendados que já venceram. Chamada a cada poucos segundos
// pelo pg_cron (via pg_net), só quando há algo vencido. Publicada com a
// verificação de JWT desligada: quem chama apresenta PUSH_CRON_SECRET no
// header x-push-cron-secret, e sem ele a função responde 401 antes de tocar
// no banco.
//
// Arquivo único, sem imports locais, para poder ser publicado pelo editor de
// Edge Functions do painel.

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

// Só a montagem da requisição (criptografia aes128gcm e assinatura VAPID) vem
// da web-push; o envio é um fetch comum, sem depender do node:https.

const CRON_SECRET_HEADER = 'x-push-cron-secret'
// Um aviso de descanso que perdeu a hora não serve: passado esse atraso, o
// push é marcado como tratado e descartado sem envio.
const MAX_DELAY_MS = 60_000
const PUSH_TTL_SECONDS = 60

type DuePush = {
    user_id: string
    kind: string
    fire_at: string
    title: string
    body: string
}

type SubscriptionRow = {
    id: string
    endpoint: string
    p256dh: string
    auth: string
}

type VapidDetails = {
    subject: string
    publicKey: string
    privateKey: string
}

type DeliveryResult = 'enviado' | 'expirado' | 'falhou'

function requireEnv(name: string): string {
    const value = Deno.env.get(name)
    if (!value) {
        throw new Error(`Variável ${name} não configurada`)
    }

    return value
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    })
}

// Comparação em tempo constante, para o tempo de resposta não revelar
// quantos caracteres do segredo estão certos.
function secretsMatch(provided: string | null, expected: string): boolean {
    if (provided === null) {
        return false
    }
    const encoder = new TextEncoder()
    const providedBytes = encoder.encode(provided)
    const expectedBytes = encoder.encode(expected)
    if (providedBytes.length !== expectedBytes.length) {
        return false
    }
    let difference = 0
    for (let index = 0; index < expectedBytes.length; index += 1) {
        difference |= providedBytes[index] ^ expectedBytes[index]
    }

    return difference === 0
}

async function deliver(subscription: SubscriptionRow, payload: string, vapid: VapidDetails): Promise<DeliveryResult> {
    const details = webpush.generateRequestDetails(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        payload,
        { vapidDetails: vapid, TTL: PUSH_TTL_SECONDS, urgency: 'high', contentEncoding: 'aes128gcm' },
    )
    // O tamanho do corpo fica por conta do fetch.
    const headers = new Headers()
    for (const [name, value] of Object.entries(details.headers)) {
        if (name.toLowerCase() !== 'content-length') {
            headers.set(name, String(value))
        }
    }
    const response = await fetch(details.endpoint, { method: details.method, headers, body: details.body })
    await response.body?.cancel()
    if (response.status === 404 || response.status === 410) {
        return 'expirado'
    }

    return response.ok ? 'enviado' : 'falhou'
}

async function sendDuePushes(): Promise<Record<string, number>> {
    const vapid: VapidDetails = {
        subject: requireEnv('VAPID_SUBJECT'),
        publicKey: requireEnv('VAPID_PUBLIC_KEY'),
        privateKey: requireEnv('VAPID_PRIVATE_KEY'),
    }
    const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
        auth: { persistSession: false, autoRefreshToken: false },
    })

    // Marcar e ler no mesmo update: duas chamadas sobrepostas nunca pegam o
    // mesmo push, e um push que falhar não é reenviado depois da hora.
    const nowMs = Date.now()
    const nowIso = new Date(nowMs).toISOString()
    const { data: claimed, error: claimError } = await supabase
        .from('scheduled_pushes')
        .update({ sent_at: nowIso })
        .is('sent_at', null)
        .lte('fire_at', nowIso)
        .select('user_id, kind, fire_at, title, body')
    if (claimError) {
        throw new Error(claimError.message)
    }

    const duePushes = (claimed ?? []) as DuePush[]
    const onTimePushes = duePushes.filter((push) => nowMs - Date.parse(push.fire_at) <= MAX_DELAY_MS)
    const counts = {
        vencidos: duePushes.length,
        atrasados: duePushes.length - onTimePushes.length,
        enviados: 0,
        falhas: 0,
        assinaturas_removidas: 0,
    }

    for (const push of onTimePushes) {
        const { data: subscriptions, error: subscriptionsError } = await supabase
            .from('push_subscriptions')
            .select('id, endpoint, p256dh, auth')
            .eq('user_id', push.user_id)
        if (subscriptionsError) {
            counts.falhas += 1
            continue
        }

        const payload = JSON.stringify({ title: push.title, body: push.body, tag: push.kind })
        const expiredIds: string[] = []
        for (const subscription of (subscriptions ?? []) as SubscriptionRow[]) {
            let result: DeliveryResult
            try {
                result = await deliver(subscription, payload, vapid)
            } catch {
                result = 'falhou'
            }
            if (result === 'enviado') {
                counts.enviados += 1
            } else if (result === 'expirado') {
                expiredIds.push(subscription.id)
            } else {
                counts.falhas += 1
            }
        }

        if (expiredIds.length > 0) {
            const { error: deleteError } = await supabase.from('push_subscriptions').delete().in('id', expiredIds)
            if (!deleteError) {
                counts.assinaturas_removidas += expiredIds.length
            }
        }
    }

    return counts
}

Deno.serve(async (request) => {
    if (request.method !== 'POST') {
        return jsonResponse({ erro: 'método não permitido' }, 405)
    }

    const expectedSecret = Deno.env.get('PUSH_CRON_SECRET')
    if (!expectedSecret || !secretsMatch(request.headers.get(CRON_SECRET_HEADER), expectedSecret)) {
        return jsonResponse({ erro: 'não autorizado' }, 401)
    }

    try {
        const counts = await sendDuePushes()
        return jsonResponse(counts)
    } catch (sendError) {
        const message = sendError instanceof Error ? sendError.message : 'falha ao enviar pushes'
        return jsonResponse({ erro: message }, 500)
    }
})
