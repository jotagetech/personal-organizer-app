// Erro de uma chamada ao Supabase que guarda o código e o status HTTP da
// resposta. Sem eles, a fila de envio não distingue uma queda de rede (status
// 0, que no Safari chega só como "TypeError: Load failed") de um dado que o
// banco recusou, e desistiria de uma série que só precisava de outra tentativa.

type SupabaseErrorBody = {
    message: string
    code?: string
}

export class SupabaseRequestError extends Error {
    readonly code: string
    readonly status: number

    constructor(errorBody: SupabaseErrorBody, status: number) {
        super(errorBody.message)
        this.name = 'SupabaseRequestError'
        this.code = errorBody.code ?? ''
        this.status = status
    }
}
