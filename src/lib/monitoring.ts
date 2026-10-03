// Envio de erros e eventos ao Sentry. Só liga no build de produção com o DSN
// configurado, para o dev local e os testes nunca mandarem nada.
//
// O app guarda dado pessoal de saúde (peso, sono, comentários de série,
// refeições), então nenhum valor registrado pela pessoa sai daqui: só
// metadados (tipo de operação, data, código e status do erro) e o id da
// conta, nunca o e-mail.

import * as Sentry from '@sentry/react'

import type { OutboxErrorClassification, OutboxOperation } from '@/lib/outbox/outboxQueue'

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN
const IS_MONITORING_ENABLED = import.meta.env.PROD && Boolean(SENTRY_DSN)

type RequestErrorDetails = {
    code: string | null
    status: number | null
}

export function initMonitoring(): void {
    if (!IS_MONITORING_ENABLED) {
        return
    }

    Sentry.init({
        dsn: SENTRY_DSN,
        environment: import.meta.env.MODE,
        dataCollection: {
            userInfo: false,
            httpBodies: [],
            databaseQueryData: false,
            stackFrameVariables: false,
        },
        // O corpo das requisições ao Supabase carrega os valores das séries;
        // o breadcrumb fica só com método, endereço e status.
        beforeBreadcrumb: (breadcrumb) => {
            if (breadcrumb.data) {
                delete breadcrumb.data.request_body
                delete breadcrumb.data.response_body
            }

            return breadcrumb
        },
    })
}

export function identifyMonitoredUser(userId: string | null): void {
    const monitoredUser = userId ? { id: userId } : null

    Sentry.setUser(monitoredUser)
}

function requestErrorDetailsOf(error: unknown): RequestErrorDetails {
    const errorRecord = typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : {}
    const code = typeof errorRecord.code === 'string' ? errorRecord.code : null
    const status = typeof errorRecord.status === 'number' ? errorRecord.status : null
    const details: RequestErrorDetails = { code, status }

    return details
}

// Falha definitiva vira um problema no Sentry (com alerta); falha que vai ser
// tentada de novo é só um log, porque rede ruim na academia é o normal e não
// merece alerta, mas ajuda a contar a história quando algo dá errado depois.
export function reportOutboxFailure(
    operation: OutboxOperation,
    error: unknown,
    classification: OutboxErrorClassification,
): void {
    if (!IS_MONITORING_ENABLED) {
        return
    }

    const { code, status } = requestErrorDetailsOf(error)
    const failureContext = {
        operation_kind: operation.kind,
        session_date: operation.sessionDate,
        attempts: operation.attempts,
        error_code: code ?? 'sem código',
        http_status: status ?? 'sem status',
    }

    if (classification === 'retry') {
        Sentry.logger.warn('Envio da fila falhou, vai tentar de novo', failureContext)
        return
    }

    Sentry.captureException(error, {
        tags: { area: 'outbox', operation_kind: operation.kind },
        contexts: { outbox: failureContext },
    })
}

export const MonitoringErrorBoundary = Sentry.ErrorBoundary
