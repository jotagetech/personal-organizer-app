// Tela mostrada quando um erro derruba a renderização do app inteiro. O erro
// já foi enviado ao monitoramento; recarregar costuma bastar, e o que estava
// na fila de envio continua guardado no aparelho.
export function AppCrashFallback() {
    return (
        <div className="app-loading" role="alert">
            <span className="app-loading__label">Algo deu errado e o app parou.</span>
            <button type="button" className="primary-button" onClick={() => window.location.reload()}>
                Recarregar
            </button>
        </div>
    )
}
