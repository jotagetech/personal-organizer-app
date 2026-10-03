import { describe, expect, it, vi } from 'vitest'

import { createClockSkewRetryFetch, isJwtIssuedAtFutureBody } from '@/lib/clockSkewRetryFetch'

const ISSUED_AT_FUTURE_BODY = JSON.stringify({
    code: 'PGRST303',
    details: null,
    hint: null,
    message: 'JWT issued at future',
})

function issuedAtFutureResponse(): Response {
    const response = new Response(ISSUED_AT_FUTURE_BODY, { status: 401 })
    return response
}

function okResponse(): Response {
    const response = new Response('[]', { status: 200 })
    return response
}

const noSleep = vi.fn(async () => {})

describe('isJwtIssuedAtFutureBody', () => {
    it('reconhece o 401 de token emitido no futuro pelo código ou pela mensagem', () => {
        expect(isJwtIssuedAtFutureBody(401, ISSUED_AT_FUTURE_BODY)).toBe(true)
        expect(isJwtIssuedAtFutureBody(401, '{"message":"JWT issued at future"}')).toBe(true)
    })

    it('ignora outros 401 e outros status', () => {
        expect(isJwtIssuedAtFutureBody(401, '{"code":"PGRST301","message":"JWT expired"}')).toBe(false)
        expect(isJwtIssuedAtFutureBody(400, ISSUED_AT_FUTURE_BODY)).toBe(false)
    })
})

describe('createClockSkewRetryFetch', () => {
    it('devolve a resposta direto quando não há recusa do token', async () => {
        const baseFetch = vi.fn(async () => okResponse())
        const retryFetch = createClockSkewRetryFetch(baseFetch, noSleep)

        const response = await retryFetch('https://exemplo/rest/v1/tabela')

        expect(response.status).toBe(200)
        expect(baseFetch).toHaveBeenCalledTimes(1)
    })

    it('repete a requisição depois de uma pausa quando o token foi emitido no futuro', async () => {
        const baseFetch = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(issuedAtFutureResponse())
            .mockResolvedValueOnce(okResponse())
        const sleep = vi.fn(async () => {})
        const retryFetch = createClockSkewRetryFetch(baseFetch, sleep)

        const response = await retryFetch('https://exemplo/rest/v1/tabela', { method: 'POST', body: '{"a":1}' })

        expect(response.status).toBe(200)
        expect(baseFetch).toHaveBeenCalledTimes(2)
        expect(baseFetch.mock.calls[1][1]).toEqual({ method: 'POST', body: '{"a":1}' })
        expect(sleep).toHaveBeenCalledTimes(1)
    })

    it('desiste depois das tentativas e devolve a última recusa', async () => {
        const baseFetch = vi.fn(async () => issuedAtFutureResponse())
        const retryFetch = createClockSkewRetryFetch(baseFetch, noSleep)

        const response = await retryFetch('https://exemplo/rest/v1/tabela')

        expect(response.status).toBe(401)
        expect(baseFetch).toHaveBeenCalledTimes(4)
    })

    it('não repete outro 401', async () => {
        const baseFetch = vi.fn(async () => new Response('{"message":"JWT expired"}', { status: 401 }))
        const retryFetch = createClockSkewRetryFetch(baseFetch, noSleep)

        await retryFetch('https://exemplo/rest/v1/tabela')

        expect(baseFetch).toHaveBeenCalledTimes(1)
    })
})
