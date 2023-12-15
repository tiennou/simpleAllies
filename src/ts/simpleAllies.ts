import { randomHex } from "utils"

/**
 * The segment ID used for communication
 */
export const SIMPLE_ALLIES_SEGMENT_ID = 90

/**
 * Max number of segments openable at once
 * This isn't in the docs for some reason, so we need to add it
 */
const MAX_OPEN_SEGMENTS = 10

const SIMPLE_ALLIES_DEFAULT_PRIORITY = 0

/**
 * The rate at which to refresh allied segments
 */
const SIMPLE_ALLIES_MIN_REFRESH_RATE = 5

/** Type of requests supported */
export type AllyRequestTypes =
    | 'resource'
    | 'defense'
    | 'attack'
    | 'player'
    | 'work'
    | 'econ'
    | 'room'

/** A request identifier */
type RequestID = string & Tag.OpaqueTag<Request>

/**
 * Root type for all requests
 */
interface Request {
    /** The request's unique identifier */
    id: RequestID
    /** The request's priority, from 0 (low) to 1 (high) */
    priority: number
}

export interface ResourceRequest extends Request {
    /**
     * The resource type requested
     */
    resourceType: ResourceConstant

    /**
     * How much they want of the resource. If the responder sends only a portion of what you ask for, that's fine
     */
    amount: number

    /**
     * The room to sent the resource at
     */
    roomName?: string

    /**
     * If the bot has no terminal, allies should instead haul the resources to us
     */
    terminal?: boolean
}

export interface DefenseRequest extends Request {}

export interface AttackRequest extends Request {}

export interface PlayerRequest {
    /**
     * The amount you think your team should hate the player. Hate should probably affect combat aggression and targetting
     */
    hate?: number
    /**
     * The last time this player has attacked you
     */
    lastAttackedBy?: number
}

export type WorkRequestType = 'build' | 'upgrade' | 'repair'

export interface WorkRequest extends Request {
    roomName: string
    workType: WorkRequestType
}

export interface SelfInfo {
    /**
     * total credits the bot has. Should be 0 if there is no market on the server
     */
    credits: number
    /**
     * the maximum amount of energy the bot is willing to share with allies. Should never be more than the amount of energy the bot has in storing structures
     */
    sharableEnergy: number
    /**
     * The average energy income the bot has calculated over the last 100 ticks
     * Optional, as some bots might not be able to calculate this easily.
     */
    energyIncome?: number
    /**
     * The number of mineral nodes the bot has access to, probably used to inform expansion
     */
    mineralNodes?: { [key in MineralConstant]: number }
}

export interface IntelRequest {
    /**
     * The player who owns this room. If there is no owner, the room probably isn't worth making a request about
     */
    playerName: string
    /**
     * The last tick your scouted this room to acquire the data you are now sharing
     */
    lastScout: number
    rcl: number
    /**
     * The amount of stored energy the room has. storage + terminal + factory should be sufficient
     */
    energy: number
    towers: number
    avgRamprtHits: number
    terminal: boolean
}

export interface AllyRequests {
    resource?: { [id: RequestID]: ResourceRequest }
    defense?: { [roomName: string]: DefenseRequest }
    attack?: { [roomName: string]: AttackRequest }
    player?: string[]
    work?: { [roomName: string]: WorkRequest }
    intel?: string[]
}

/**
 * Data definition for the shared segment used
 */
export interface SegmentData {
    /** The tick the segment was last updated at */
    updatedAt: number
    /**
     * Requests of the new system
     */
    requests: AllyRequests
    /**
     * Economic data on ourself
     */
    info?: SelfInfo
}

export class SimpleAllies {
    _allies: string[]
    allySegments: { [playerName: string]: SegmentData }
    selfInfo: SelfInfo | undefined
    requests: {
        resource: { [id: RequestID]: ResourceRequest }
        defense: { [roomName: string]: DefenseRequest }
        attack: { [roomName: string]: AttackRequest }
        player: Set<string>
        work: { [roomName: string]: WorkRequest }
        intel: Set<string>
    }

    lastRequestTime: number
    refreshRate: number
    _debug: boolean
    allyIdx: number

    constructor(options?: { refreshRate?: number; debug?: boolean }) {
        this._allies = []
        this.allySegments = {}
        this.requests = {
            resource: {},
            defense: {},
            attack: {},
            player: new Set(),
            work: {},
            intel: new Set(),
        }
        this.allyIdx = 0
        this.refreshRate = options?.refreshRate ?? SIMPLE_ALLIES_MIN_REFRESH_RATE
        this._debug = options?.debug ?? false
        this.lastRequestTime = 0
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private log(...args: any[]) {
        console.log('SimpleAllies', ...args)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private debug(...args: any[]) {
        if (!this._debug) return

        this.log(...args)
    }

    private makeRequestID() {
        return randomHex(20) as RequestID
    }

    private checkPriority(priority: number | undefined) {
        if (typeof priority !== 'number') return SIMPLE_ALLIES_DEFAULT_PRIORITY
        return Math.max(0, Math.min(1, priority))
    }

    get allies() {
        return this._allies
    }

    set allies(value: string[]) {
        this._allies = [...value]
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
        this.readAllySegment()
    }

    // Segment helpers

    /**
     * Private helper to check for segment availability
     *
     * Subclasses can override that to perform their own segment processing
     */
    private canOpenSegment() {
        return Object.keys(RawMemory.segments).length < MAX_OPEN_SEGMENTS
    }

    /**
     * Private helper to write a segment
     *
     * Subclasses can override that to perform their own segment processing
     */
    private writeSegment(id: number, segment: SegmentData) {
        RawMemory.segments[id] = JSON.stringify(segment)
    }

    /**
     * Private helper to mark a segment as public
     *
     * Subclasses can override that to perform their own segment processing
     */
    private markPublic(id: number) {
        RawMemory.setPublicSegments([id])
    }

    /**
     * Private helper to activate a foreign segment
     *
     * Subclasses can override that to perform their own segment processing
     */
    private setForeignSegment(playerName: string, id: number) {
        RawMemory.setActiveForeignSegment(playerName, id)
    }

    /**
     * Private helper to read and parse a foreign segment
     *
     * Subclasses can override that to perform their own segment processing
     */
    private readForeignSegment(playerName: string, id: number) {
        if (!RawMemory.foreignSegment) return
        if (
            RawMemory.foreignSegment.username !== playerName ||
            RawMemory.foreignSegment.id !== id
        ) {
            this.debug(`not the segment we were expecting, ignoring`)
            return undefined
        }

        // Safely grab the segment and parse it in
        let segment
        try {
            segment = JSON.parse(RawMemory.foreignSegment.data)
        } catch (err) {
            console.log('Error in getting requests for simpleAllies', playerName)
        }
        return segment
    }

    /**
     * Refresh our allies' shared segments in a round-robin
     */
    private readAllySegment() {
        if (!this._allies.length) {
            this.log(`no allies, skipping`)
            return
        }

        const clock = ((Game.time - 1) % this.refreshRate) - this.refreshRate + 1
        switch (clock) {
            case -1: {
                // Make a request to read the data of the next ally in the list, for next tick
                this.allyIdx = (this.allyIdx + 1) % this._allies.length
                const ally = this._allies[this.allyIdx]
                this.debug(`loading segment for ${ally}`)
                this.setForeignSegment(ally, SIMPLE_ALLIES_SEGMENT_ID)
                break
            }
            case 0: {
                this.debug(`checking loaded segment…`)
                const ally = this._allies[this.allyIdx]
                const segment = this.readForeignSegment(ally, SIMPLE_ALLIES_SEGMENT_ID)
                if (segment) {
                    this.debug(`successfully loaded segment for ${ally}`)
                    this.allySegments[ally] = segment
                } else {
                    this.debug(`unable to load segment for ${ally}, resetting`)
                    delete this.allySegments[ally]
                }

                break
            }
            default:
                break
        }
    }

    /**
     * Update our segment with requests made
     *
     * Must be called after all requests were made
     */
    run() {
        // Check if we have any new requests to send
        if (this.lastRequestTime !== Game.time) return

        // Make sure we don't have too many segments open
        if (this.canOpenSegment()) {
            this.log(`Too many segments open: can't update!`)
            return
        }

        const segment: SegmentData = {
            updatedAt: Game.time,
            requests: {
                resource: this.requests.resource,
                defense: this.requests.defense,
                attack: this.requests.attack,
                player: [...this.requests.player.keys()],
                work: this.requests.work,
                intel: [...this.requests.intel.keys()],
            },
        }
        if (this.selfInfo) segment.info = this.selfInfo

        this.writeSegment(SIMPLE_ALLIES_SEGMENT_ID, segment)
        this.markPublic(SIMPLE_ALLIES_SEGMENT_ID)
    }

    // Request methods

    /**
     * Set our own info to provide to allies
     */
    setSelf(info: SelfInfo) {
        this.selfInfo = info
        this.lastRequestTime = Game.time
    }

    /**
     * Request resources
     */
    requestResource(
        resourceType: ResourceConstant,
        amount: number,
        opts: { priority: number; roomName?: string; hasTerminal?: boolean }
    ) {
        const id = this.makeRequestID()
        const request: ResourceRequest = {
            id,
            resourceType,
            amount,
            priority: this.checkPriority(opts.priority),
            roomName: opts.roomName,
        }
        if (opts.hasTerminal) request.terminal = opts.hasTerminal

        this.requests.resource ??= {}
        this.requests.resource[id] = request
        this.lastRequestTime = Game.time
    }

    /**
     * Request a defense force for a given room
     */
    requestDefense(roomName: string, opts: { priority?: number }) {
        if (this.requests.defense[roomName]) {
            this.log(`defense request for room ${roomName} already exists, ignoring`)
            return
        }
        const id = this.makeRequestID()
        const request: DefenseRequest = {
            id,
            priority: this.checkPriority(opts.priority),
        }
        this.requests.defense ??= {}
        this.requests.defense[roomName] = request
        this.lastRequestTime = Game.time
    }

    /**
     * Request an attack force to be sent to the given room
     */
    requestAttack(roomName: string, opts: { priority?: number }) {
        if (this.requests.attack[roomName]) {
            this.log(`attack request for room ${roomName} already exists, ignoring`)
            return
        }
        const id = this.makeRequestID()
        const request: AttackRequest = {
            id,
            priority: this.checkPriority(opts.priority),
        }
        this.requests.attack ??= {}
        this.requests.attack[roomName] = request
        this.lastRequestTime = Game.time
    }

    /**
     * Request intel on a player
     *
     * @param playerName
     */
    requestPlayer(playerName: string) {
        this.requests.player.add(playerName)
        this.lastRequestTime = Game.time
    }

    /**
     * Request some help in working a room
     *
     * @param roomName
     * @param workType
     * @param opts
     * @returns
     */
    requestWork(roomName: string, workType: WorkRequestType, opts: { priority?: number }) {
        if (this.requests.work[roomName]) {
            this.log(`work request for room ${roomName} already exists, ignoring`)
            return
        }
        const id = this.makeRequestID()
        const request: WorkRequest = {
            id,
            roomName,
            workType,
            priority: this.checkPriority(opts.priority),
        }
        this.requests.work[roomName] = request
        this.lastRequestTime = Game.time
    }

    /**
     * Request intel on a given room
     *
     * @param roomName
     */
    requestIntel(roomName: string) {
        this.requests.intel.add(roomName)
        this.lastRequestTime = Game.time
    }

    // Request processing

    processResourceRequests() {
        for (const [_ally, segment] of Object.entries(this.allySegments)) {
            if (!segment.requests.resource) continue

            const requests = Object.entries(segment.requests.resource ?? {})
            requests.sort(([_aID, aReq], [_bId, bReq]) => aReq.priority - bReq.priority)
            return requests;
        }
        return []
    }
}

// export const simpleAllies = new SimpleAllies()
