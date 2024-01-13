const hexChars = '0123456789abcdef';

/**
 * Generate a random hex string of specified length
 */
export function randomHex(length: number): string {
    let result = '';
    for (let i = 0; i < length; i++) {
        result += hexChars[Math.floor(Math.random() * hexChars.length)];
    }
    return result;
}

export function findSortedIndex<T>(ary: T[], cmp: (obj: T) => boolean) {
    let i;
    for (i = i = ary.length - 1; i >= 0 && cmp(ary[i]); i--) {
        /** loop */
    }

    return i + 1;
}

export function insertSorted<T>(ary: T[], value: T, cmp: (a: T, b: T) => boolean) {
    const insertIdx = findSortedIndex(ary, (obj) => cmp(obj, value));
    ary.splice(insertIdx, 0, value);
}
