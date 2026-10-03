// O PostgREST recusa um token cujo horário de emissão está à frente do relógio
// dele ("JWT issued at future", código PGRST303). Isso acontece logo depois de
// o app voltar do segundo plano: a sessão é renovada pelo servidor de
// autenticação, cujo relógio pode estar um ou dois segundos adiantado, e as
// leituras disparadas na mesma hora chegam antes de o relógio do banco
// alcançar o horário do token. O mesmo token passa a valer em seguida, então
// basta repetir a requisição depois de uma pausa curta.

const JWT_ISSUED_AT_FUTURE_PATTERN = /JWT issued at future/i
const JWT_ISSUED_AT_FUTURE_CODE = 'PGRST303'
const RETRY_DELAYS_MS = [1000, 2000, 3000]

type FetchFunction = typeof fetch
type SleepFunction = (milliseconds: number) => Promise<void>

// Chamada indireta para o fetch global não perder o contexto da janela.
function globalFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const response = fetch(input, init)
    return response
}

function sleepFor(milliseconds: number): Promise<void> {
    const pause = new Promise<void>((resolve) => {
        setTimeout(resolve, milliseconds)
    })
    return pause
}

export function isJwtIssuedAtFutureBody(status: number, bodyText: string): boolean {
    if (status !== 401) {
        return false
    }

    const mentionsIssuedAtFuture =
        bodyText.includes(JWT_ISSUED_AT_FUTURE_CODE) || JWT_ISSUED_AT_FUTURE_PATTERN.test(bodyText)
    return mentionsIssuedAtFuture
}

async function isJwtIssuedAtFutureResponse(response: Response): Promise<boolean> {
    if (response.status !== 401) {
        return false
    }

    const bodyText = await response.clone().text()
    return isJwtIssuedAtFutureBody(response.status, bodyText)
}

// A requisição pode chegar como Request, cujo corpo só pode ser lido uma vez;
// cada tentativa usa uma cópia nova.
function requestForAttempt(input: RequestInfo | URL): RequestInfo | URL {
    const attemptInput = input instanceof Request ? input.clone() : input
    return attemptInput
}

export function createClockSkewRetryFetch(
    baseFetch: FetchFunction = globalFetch,
    sleep: SleepFunction = sleepFor,
): FetchFunction {
    async function clockSkewRetryFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        let response = await baseFetch(requestForAttempt(input), init)

        for (const delayMs of RETRY_DELAYS_MS) {
            if (!(await isJwtIssuedAtFutureResponse(response))) {
                return response
            }
            await sleep(delayMs)
            response = await baseFetch(requestForAttempt(input), init)
        }

        return response
    }

    return clockSkewRetryFetch
}
