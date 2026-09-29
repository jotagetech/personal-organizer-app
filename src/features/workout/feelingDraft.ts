// Texto do "Detalhar" como vai para o banco: sem espaços nas pontas e nulo
// quando ficou em branco.
export function normalizeFeelingNote(rawNote: string): string | null {
    const trimmedNote = rawNote.trim()
    const normalizedNote = trimmedNote === '' ? null : trimmedNote

    return normalizedNote
}
