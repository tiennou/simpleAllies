const hexChars = '0123456789abcdef'

/**
 * Generate a random hex string of specified length
 */
export function randomHex(length: number): string {
    let result = ''
    for (let i = 0; i < length; i++) {
        result += hexChars[Math.floor(Math.random() * hexChars.length)]
    }
    return result
}
