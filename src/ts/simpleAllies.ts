import { insertSorted, randomHex } from 'utils'

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

interface Response {
    status: RequestStatus
    requestId: RequestID
}

interface RoomRequest extends Request {
    roomName: string
}

type Eta = number | [min: number, max: number]

interface RoomResponse extends Response {
    creepCount: number
    eta?: Eta
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

export interface ResourceResponse extends Response {}

export interface DefenseRequest extends RoomRequest {}
export interface DefenseResponse extends RoomResponse {}

export interface AttackRequest extends RoomRequest {}

export interface AttackResponse extends RoomResponse {}

export type WorkRequestType = 'build' | 'upgrade' | 'repair'

export interface WorkRequest extends RoomRequest {
    workType: WorkRequestType
}

export interface WorkResponse extends RoomResponse {}

export interface PlayerInfo {
    /**
     * The amount you think your team should hate the player. Hate should probably affect combat aggression and targetting
     */
    hate?: number
    /**
     * The last time this player has attacked you
     */
    lastAttackedBy?: number
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

export interface RoomIntel {
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
    resource?: ResourceRequest[]
    defense?: DefenseRequest[]
    attack?: AttackRequest[]
    work?: WorkRequest[]
    player?: string[]
    intel?: string[]
}

export interface AllyResponses {
    intel?: { [roomName: string]: RoomIntel }
    player?: { [playerName: string]: PlayerInfo }
}

/** Type of requests supported */
export type RequestType = keyof AllyRequests

/**
 * Data definition for the shared segment used
 */
export interface AllySegment {
    /** The tick the segment was last updated at */
    updatedAt: number
    /**
     * Economic data on ourself
     */
    info?: SelfInfo
    /**
     * Requests of the new system
     */
    requests?: AllyRequests
    responses?: AllyResponses
}

interface AllRequestTypes {
    resource: ResourceRequest
    defense: DefenseRequest
    attack: AttackRequest
    work: WorkRequest
    player: string
    intel: string
}

export const RequestStatus = {
    FULFILLED: 'f',
    DISMISSED: 'd',
} as const

export type RequestStatus = (typeof RequestStatus)[keyof typeof RequestStatus]

export class SimpleAllies {
    _allies: Set<string>
    allySegments: { [playerName: string]: AllySegment }
    selfInfo: SelfInfo | undefined
    requests: {
        resource: ResourceRequest[]
        defense: DefenseRequest[]
        attack: AttackRequest[]
        work: WorkRequest[]
        player: Set<string>
        intel: Set<string>
    }
    responses: {
        resource: { [id: RequestID]: ResourceResponse }
        attack: { [id: RequestID]: AttackResponse }
        defense: { [id: RequestID]: DefenseResponse }
        work: { [id: RequestID]: WorkResponse }
        intel: { [roomName: string]: RoomIntel }
        player: { [playerName: string]: PlayerInfo }
    }

    requestStatus: { [id: RequestID]: RequestStatus } = {}

    lastUpdateTime: number
    refreshRate: number
    _debug: boolean
    allyIdx: number

    constructor(options?: { refreshRate?: number; debug?: boolean }) {
        this._allies = new Set()
        this.allySegments = {}
        this.requests = {
            resource: [],
            defense: [],
            attack: [],
            work: [],
            player: new Set(),
            intel: new Set(),
        }
        this.responses = {
            resource: {},
            defense: {},
            attack: {},
            work: {},
            player: {},
            intel: {},
        }
        this.allyIdx = 0
        this.refreshRate = options?.refreshRate ?? SIMPLE_ALLIES_MIN_REFRESH_RATE
        this._debug = options?.debug ?? false
        this.lastUpdateTime = 0
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

    addAlly(...allies: string[]) {
        for (const ally of allies) {
            this._allies.add(ally)
        }
    }
    removeAlly(...allies: string[]) {
        for (const ally of allies) {
            this._allies.delete(ally)
        }
    }

    get allies() {
        return [...this._allies.keys()]
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
    private writeSegment(id: number, segment: AllySegment) {
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
        if (!this._allies.size) {
            this.log(`no allies, skipping`)
            return
        }

        const clock = ((Game.time - 1) % this.refreshRate) - this.refreshRate + 1
        switch (clock) {
            case -1: {
                // Make a request to read the data of the next ally in the list, for next tick
                this.allyIdx = (this.allyIdx + 1) % this._allies.size
                const ally = this.allies[this.allyIdx]
                this.debug(`loading segment for ${ally}`)
                this.setForeignSegment(ally, SIMPLE_ALLIES_SEGMENT_ID)
                break
            }
            case 0: {
                this.debug(`checking loaded segment…`)
                const ally = this.allies[this.allyIdx]
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
        if (this.lastUpdateTime !== Game.time) return

        // Make sure we don't have too many segments open
        if (this.canOpenSegment()) {
            this.log(`Too many segments open: can't update!`)
            return
        }

        const segment: AllySegment = {
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
        if (this.responses) {
            segment.responses = this.responses
        }

        this.writeSegment(SIMPLE_ALLIES_SEGMENT_ID, segment)
        this.markPublic(SIMPLE_ALLIES_SEGMENT_ID)
    }

    // Request methods

    /**
     * Set our own info to provide to allies
     */
    setSelf(info: SelfInfo) {
        this.selfInfo = info
        this.lastUpdateTime = Game.time
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

        insertSorted(this.requests.resource, request, (a, b) => a.priority < b.priority)
        this.lastUpdateTime = Game.time
        return id
    }

    /**
     * Request a defense force for a given room
     */
    requestDefense(roomName: string, opts: { priority?: number }) {
        if (this.requests.defense.some(req => req.roomName === roomName)) {
            this.log(`defense request for room ${roomName} already exists, ignoring`)
            return
        }
        const id = this.makeRequestID()
        const request: DefenseRequest = {
            id,
            roomName,
            priority: this.checkPriority(opts.priority),
        }
        insertSorted(this.requests.defense, request, (a, b) => a.priority < b.priority)
        this.lastUpdateTime = Game.time
        return id
    }

    /**
     * Request an attack force to be sent to the given room
     */
    requestAttack(roomName: string, opts: { priority?: number }) {
        if (this.requests.attack.some(req => req.roomName === roomName)) {
            this.log(`attack request for room ${roomName} already exists, ignoring`)
            return
        }
        const id = this.makeRequestID()
        const request: AttackRequest = {
            id,
            roomName,
            priority: this.checkPriority(opts.priority),
        }
        insertSorted(this.requests.attack, request, (a, b) => a.priority < b.priority)
        this.lastUpdateTime = Game.time
        return id
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
        if (this.requests.work.some(req => req.roomName === roomName)) {
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
        insertSorted(this.requests.work, request, (a, b) => a.priority < b.priority)
        this.lastUpdateTime = Game.time
        return id
    }

    /**
     * Request intel on a player
     *
     * @param playerName
     */
    requestPlayer(playerName: string) {
        this.requests.player.add(playerName)
        this.lastUpdateTime = Game.time
    }

    /**
     * Request intel on a given room
     *
     * @param roomName
     */
    requestIntel(roomName: string) {
        this.requests.intel.add(roomName)
        this.lastUpdateTime = Game.time
    }

    // Response handling

    replyResource(request: ResourceRequest, amount: number) {
        const response: ResourceResponse = {
            requestId: request.id,
            status: amount > 0 ? RequestStatus.FULFILLED : RequestStatus.DISMISSED,
        }
        this.responses.resource[request.id] = response
        this.lastUpdateTime = Game.time
    }

    replyAttack(request: AttackRequest, data: { creepCount: number; eta?: Eta }) {
        const response: AttackResponse = {
            requestId: request.id,
            status: data.creepCount > 0 ? RequestStatus.FULFILLED : RequestStatus.DISMISSED,
            creepCount: data.creepCount,
        }
        if (data.creepCount && data.eta) response.eta = data.eta

        this.responses.attack[request.id] = response
        this.lastUpdateTime = Game.time
    }

    replyDefense(request: DefenseRequest, data: { creepCount: number; eta?: Eta }) {
        const response: DefenseResponse = {
            requestId: request.id,
            status: data.creepCount > 0 ? RequestStatus.FULFILLED : RequestStatus.DISMISSED,
            creepCount: data.creepCount,
        }
        if (data.creepCount && data.eta) response.eta = data.eta

        this.responses.defense[request.id] = response
        this.lastUpdateTime = Game.time
    }

    replyWork(request: WorkRequest, data: { creepCount: number; eta?: Eta }) {
        const response: WorkResponse = {
            requestId: request.id,
            status: data.creepCount > 0 ? RequestStatus.FULFILLED : RequestStatus.DISMISSED,
            creepCount: data.creepCount,
        }
        if (data.creepCount && data.eta) response.eta = data.eta

        this.responses.work[request.id] = response
        this.lastUpdateTime = Game.time
    }

    replyIntel(roomName: string, intel: RoomIntel) {
        this.responses.intel[roomName] = intel
        this.lastUpdateTime = Game.time
    }

    replyPlayer(playerName: string, info: PlayerInfo) {
        this.responses.player[playerName] = info
        this.lastUpdateTime = Game.time
    }

    // Request processing

    private markRequest<T extends Request>(request: T, status: RequestStatus) {
        this.requestStatus[request.id] = status
    }

    processRequests<T extends RequestType, R extends AllRequestTypes[T]>(
        requestType: T,
        cb: (playerName: string, request: R) => RequestStatus | undefined
    ): void {
        for (const [ally, segment] of Object.entries(this.allySegments)) {
            for (const request of segment.requests?.[requestType] ?? []) {
                const req = request as R

                if (typeof req !== "string" && req.id in this.requestStatus)
                    continue

                const result = cb(ally, req)

                if (result === undefined) return

                // Mark request as fulfilled
                if (typeof req !== 'string') {
                    this.markRequest(req, result)
                }
            }
        }
    }
}
