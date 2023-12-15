"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimpleAllies = exports.SIMPLE_ALLIES_SEGMENT_ID = void 0;
/**
 * The segment ID used for communication
 */
exports.SIMPLE_ALLIES_SEGMENT_ID = 90;
/**
 * Max number of segments openable at once
 * This isn't in the docs for some reason, so we need to add it
 */
const MAX_OPEN_SEGMENTS = 10;
const SIMPLE_ALLIES_DEFAULT_PRIORITY = 0;
/**
 * The rate at which to refresh allied segments
 */
const SIMPLE_ALLIES_MIN_REFRESH_RATE = 5;
const hexChars = '0123456789abcdef';
/**
 * Generate a random hex string of specified length
 */
function randomHex(length) {
    let result = '';
    for (let i = 0; i < length; i++) {
        result += hexChars[Math.floor(Math.random() * hexChars.length)];
    }
    return result;
}
class SimpleAllies {
    _allies;
    allySegments;
    selfInfo;
    requests;
    lastRequestTime;
    refreshRate;
    _debug;
    allyIdx;
    constructor(options) {
        this._allies = [];
        this.allySegments = {};
        this.requests = {
            resource: {},
            defense: {},
            attack: {},
            player: new Set(),
            work: {},
            intel: new Set(),
        };
        this.allyIdx = 0;
        this.refreshRate = options?.refreshRate ?? SIMPLE_ALLIES_MIN_REFRESH_RATE;
        this._debug = options?.debug ?? false;
        this.lastRequestTime = 0;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    log(...args) {
        console.log('SimpleAllies', ...args);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    debug(...args) {
        if (!this._debug)
            return;
        this.log(...args);
    }
    makeRequestID() {
        return randomHex(20);
    }
    checkPriority(priority) {
        if (typeof priority !== 'number')
            return SIMPLE_ALLIES_DEFAULT_PRIORITY;
        return Math.max(0, Math.min(1, priority));
    }
    get allies() {
        return this._allies;
    }
    set allies(value) {
        this._allies = [...value];
    }
    /**
     * Main initialization method
     *
     * Must be called before any requests are made or responded to.
     *
     * Is responsible for fetching allied segments in the background
     */
    init() {
        // Reset the data of myRequests
        this.readAllySegment();
    }
    // Segment helpers
    /**
     * Private helper to check for segment availability
     *
     * Subclasses can override that to perform their own segment processing
     */
    canOpenSegment() {
        return Object.keys(RawMemory.segments).length < MAX_OPEN_SEGMENTS;
    }
    /**
     * Private helper to write a segment
     *
     * Subclasses can override that to perform their own segment processing
     */
    writeSegment(id, segment) {
        RawMemory.segments[id] = JSON.stringify(segment);
    }
    /**
     * Private helper to mark a segment as public
     *
     * Subclasses can override that to perform their own segment processing
     */
    markPublic(id) {
        RawMemory.setPublicSegments([id]);
    }
    /**
     * Private helper to activate a foreign segment
     *
     * Subclasses can override that to perform their own segment processing
     */
    setForeignSegment(playerName, id) {
        RawMemory.setActiveForeignSegment(playerName, id);
    }
    /**
     * Private helper to read and parse a foreign segment
     *
     * Subclasses can override that to perform their own segment processing
     */
    readForeignSegment(playerName, id) {
        if (!RawMemory.foreignSegment)
            return;
        if (RawMemory.foreignSegment.username !== playerName ||
            RawMemory.foreignSegment.id !== id) {
            this.debug(`not the segment we were expecting, ignoring`);
            return undefined;
        }
        // Safely grab the segment and parse it in
        let segment;
        try {
            segment = JSON.parse(RawMemory.foreignSegment.data);
        }
        catch (err) {
            console.log('Error in getting requests for simpleAllies', playerName);
        }
        return segment;
    }
    /**
     * Refresh our allies' shared segments in a round-robin
     */
    readAllySegment() {
        if (!this._allies.length) {
            this.log(`no allies, skipping`);
            return;
        }
        const clock = ((Game.time - 1) % this.refreshRate) - this.refreshRate + 1;
        switch (clock) {
            case -1: {
                // Make a request to read the data of the next ally in the list, for next tick
                this.allyIdx = (this.allyIdx + 1) % this._allies.length;
                const ally = this._allies[this.allyIdx];
                this.debug(`loading segment for ${ally}`);
                this.setForeignSegment(ally, exports.SIMPLE_ALLIES_SEGMENT_ID);
                break;
            }
            case 0: {
                this.debug(`checking loaded segment…`);
                const ally = this._allies[this.allyIdx];
                const segment = this.readForeignSegment(ally, exports.SIMPLE_ALLIES_SEGMENT_ID);
                if (segment) {
                    this.debug(`successfully loaded segment for ${ally}`);
                    this.allySegments[ally] = segment;
                }
                else {
                    this.debug(`unable to load segment for ${ally}, resetting`);
                    delete this.allySegments[ally];
                }
                break;
            }
            default:
                break;
        }
    }
    /**
     * Update our segment with requests made
     *
     * Must be called after all requests were made
     */
    run() {
        // Check if we have any new requests to send
        if (this.lastRequestTime !== Game.time)
            return;
        // Make sure we don't have too many segments open
        if (this.canOpenSegment()) {
            this.log(`Too many segments open: can't update!`);
            return;
        }
        const segment = {
            updatedAt: Game.time,
            requests: {
                resource: this.requests.resource,
                defense: this.requests.defense,
                attack: this.requests.attack,
                player: [...this.requests.player.keys()],
                work: this.requests.work,
                intel: [...this.requests.intel.keys()],
            },
        };
        if (this.selfInfo)
            segment.info = this.selfInfo;
        this.writeSegment(exports.SIMPLE_ALLIES_SEGMENT_ID, segment);
        this.markPublic(exports.SIMPLE_ALLIES_SEGMENT_ID);
    }
    // Request methods
    /**
     * Set our own info to provide to allies
     */
    setSelf(info) {
        this.selfInfo = info;
        this.lastRequestTime = Game.time;
    }
    /**
     * Request resources
     */
    requestResource(resourceType, amount, opts) {
        const id = this.makeRequestID();
        const request = {
            id,
            resourceType,
            amount,
            priority: this.checkPriority(opts.priority),
            roomName: opts.roomName,
        };
        if (opts.hasTerminal)
            request.terminal = opts.hasTerminal;
        this.requests.resource ??= {};
        this.requests.resource[id] = request;
        this.lastRequestTime = Game.time;
    }
    /**
     * Request a defense force for a given room
     */
    requestDefense(roomName, opts) {
        if (this.requests.defense[roomName]) {
            this.log(`defense request for room ${roomName} already exists, ignoring`);
            return;
        }
        const id = this.makeRequestID();
        const request = {
            id,
            priority: this.checkPriority(opts.priority),
        };
        this.requests.defense ??= {};
        this.requests.defense[roomName] = request;
        this.lastRequestTime = Game.time;
    }
    /**
     * Request an attack force to be sent to the given room
     */
    requestAttack(roomName, opts) {
        if (this.requests.attack[roomName]) {
            this.log(`attack request for room ${roomName} already exists, ignoring`);
            return;
        }
        const id = this.makeRequestID();
        const request = {
            id,
            priority: this.checkPriority(opts.priority),
        };
        this.requests.attack ??= {};
        this.requests.attack[roomName] = request;
        this.lastRequestTime = Game.time;
    }
    /**
     * Request intel on a player
     *
     * @param playerName
     */
    requestPlayer(playerName) {
        this.requests.player.add(playerName);
        this.lastRequestTime = Game.time;
    }
    /**
     * Request some help in working a room
     *
     * @param roomName
     * @param workType
     * @param opts
     * @returns
     */
    requestWork(roomName, workType, opts) {
        if (this.requests.work[roomName]) {
            this.log(`work request for room ${roomName} already exists, ignoring`);
            return;
        }
        const id = this.makeRequestID();
        const request = {
            id,
            roomName,
            workType,
            priority: this.checkPriority(opts.priority),
        };
        this.requests.work[roomName] = request;
        this.lastRequestTime = Game.time;
    }
    /**
     * Request intel on a given room
     *
     * @param roomName
     */
    requestIntel(roomName) {
        this.requests.intel.add(roomName);
        this.lastRequestTime = Game.time;
    }
    // Request processing
    processResourceRequests() {
        for (const [_ally, segment] of Object.entries(this.allySegments)) {
            if (!segment.requests.resource)
                continue;
            const requests = Object.entries(segment.requests.resource ?? {});
            requests.sort();
        }
    }
}
exports.SimpleAllies = SimpleAllies;
// export const simpleAllies = new SimpleAllies()
