// Lifted from the typed-screeps definitions
const OpaqueTagSymbol: unique symbol

export class OpaqueTag<T> {
    private [OpaqueTagSymbol]: T
}
