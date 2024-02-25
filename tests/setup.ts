// @ts-expect-error Game games
// eslint-disable-next-line no-var
var Game: Game = {
    time: 0,
};

global.Game = Game;

// @ts-expect-error global
class RawMemory implements RawMemory {
    private _segments: { [segmentId: number]: string };
    private _publicSegments: number[];

    constructor() {
        this._segments = {};
        this._publicSegments = [];
    }

    get segments() {
        return this._segments;
    }

    setPublicSegments(ids: number[]) {
        this._publicSegments = ids;
        return undefined;
    }
}

// @ts-expect-error global
global.RawMemory = new RawMemory();
