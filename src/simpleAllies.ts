import * as Types from './types';
import { insertSorted, randomHex } from 'utils';

export const RequestStatus = Types.RequestStatus;

/**
 * The segment ID used for communication
 */
export const SIMPLE_ALLIES_SEGMENT_ID = 90;

/**
 * Max number of segments openable at once
 * This isn't in the docs for some reason, so we need to add it
 */
const MAX_OPEN_SEGMENTS = 10;

/**
 * Default priority if left unspecified
 */
const SIMPLE_ALLIES_DEFAULT_PRIORITY = 0;

/**
 * The rate at which to refresh allied segments
 */
const SIMPLE_ALLIES_MIN_REFRESH_RATE = 5;

/**
 * Represents the goal type enum for javascript
 */
export const EFunnelGoal = {
    GCL: 0,
    RCL7: 1,
    RCL8: 2,
};

/**
 * Represents the goal type enum for javascript
 */
export const EWorkType = {
    BUILD: 'build',
    REPAIR: 'repair',
};

/**
 * Simple allies class manages ally requests
 */
export class SimpleAllies {
    private requests: {
        resource: Types.ResourceRequest[];
        defense: Types.DefenseRequest[];
        attack: Types.AttackRequest[];
        player: Set<string>;
        work: Types.WorkRequest[];
        funnel: Types.FunnelRequest[];
        room: Set<string>;
    };
    responses: Types.AllyResponses;

    requestStatus: { [id: Types.RequestID]: Types.RequestStatus } = {};

    selfInfo: Types.SelfInfo | undefined;
    public allySegments: { [playerName: string]: Types.SimpleAlliesSegment };
    private allyIdx: number;
    private _allies: Set<string>;
    private lastUpdateTime: number;
    private refreshRate: number;
    private _debug: boolean;

    constructor(options?: { debug?: boolean; refreshRate?: number }) {
        this._debug = options?.debug ?? false;
        this.refreshRate = options?.refreshRate ?? SIMPLE_ALLIES_MIN_REFRESH_RATE;
        this._allies = new Set();
        this.allyIdx = 0;
        this.allySegments = {};
        this.requests = {
            resource: [],
            defense: [],
            attack: [],
            work: [],
            player: new Set(),
            funnel: [],
            room: new Set(),
        };
        this.responses = {
            resource: {},
            defense: {},
            attack: {},
            work: {},
            funnel: {},
            player: {},
            room: {},
        };
        this.lastUpdateTime = 0;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private log(...args: any[]) {
        console.log('[SimpleAllies]', ...args);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private debug(...args: any[]) {
        if (!this._debug) return;

        this.log(...args);
    }

    private makeRequestID() {
        return randomHex(20) as Types.RequestID;
    }

    private checkPriority(priority: number | undefined) {
        if (typeof priority !== 'number') return SIMPLE_ALLIES_DEFAULT_PRIORITY;
        return Math.max(0, Math.min(1, priority));
    }

    addAlly(...allies: string[]) {
        for (const ally of allies) {
            this._allies.add(ally);
        }
    }
    removeAlly(...allies: string[]) {
        for (const ally of allies) {
            this._allies.delete(ally);
        }
    }

    get allies() {
        return [...this._allies.keys()];
    }

    /**
     * Main initialization method
     *
     * Must be called before any requests are made or responded to.
     *
     * Is responsible for fetching allied segments in the background
     */
    public initRun() {
        // Reset the data of myRequests
        this.readAllySegment();
    }

    // Private Segment helpers

    /**
     * Private helper to check for segment availability
     *
     * Subclasses can override that to perform their own segment processing
     */
    private canOpenSegment() {
        return Object.keys(RawMemory.segments).length >= MAX_OPEN_SEGMENTS;
    }

    /**
     * Private helper to write a segment
     *
     * Subclasses can override that to perform their own segment processing
     */
    private writeSegment(id: number, segment: Types.SimpleAlliesSegment) {
        RawMemory.segments[id] = JSON.stringify(segment);
    }

    /**
     * Private helper to mark a segment as public
     *
     * Subclasses can override that to perform their own segment processing
     */
    private markPublic(id: number) {
        RawMemory.setPublicSegments([id]);
    }

    /**
     * Private helper to activate a foreign segment
     *
     * Subclasses can override that to perform their own segment processing
     */
    private setForeignSegment(playerName: string, id: number) {
        RawMemory.setActiveForeignSegment(playerName, id);
    }

    /**
     * Private helper to read and parse a foreign segment
     *
     * Subclasses can override that to perform their own segment processing
     */
    private readForeignSegment(playerName: string, id: number) {
        if (!RawMemory.foreignSegment) return;
        if (
            RawMemory.foreignSegment.username !== playerName ||
            RawMemory.foreignSegment.id !== id
        ) {
            this.debug(`not the segment we were expecting, ignoring`);
            return undefined;
        }

        // Safely grab the segment and parse it in
        let segment;
        try {
            const parsed = JSON.parse(RawMemory.foreignSegment.data);
            if (
                parsed &&
                typeof parsed === 'object' &&
                'requests' in parsed &&
                Array.isArray(parsed.requests) &&
                'responses' in parsed &&
                Array.isArray(parsed.responses) &&
                'updatedAt' in parsed &&
                typeof parsed.updatedAt === 'number'
            ) {
                segment = parsed as Types.SimpleAlliesSegment;
            }
            throw new Error();
        } catch (err) {
            this.log(`Error reading ${playerName} segment ${SIMPLE_ALLIES_SEGMENT_ID}`);
        }
        return segment;
    }

    /**
     * Refresh our allies' shared segments in a round-robin
     */
    private readAllySegment() {
        if (!this._allies.size) {
            this.log(`no allies, skipping`);
            return;
        }

        const clock = ((Game.time - 1) % this.refreshRate) - this.refreshRate + 1;
        switch (clock) {
            case -1: {
                // Make a request to read the data of the next ally in the list, for next tick
                this.allyIdx = (this.allyIdx + 1) % this._allies.size;
                const ally = this.allies[this.allyIdx];
                this.debug(`loading segment for ${ally}`);
                this.setForeignSegment(ally, SIMPLE_ALLIES_SEGMENT_ID);
                break;
            }
            case 0: {
                this.debug(`checking loaded segment…`);
                const ally = this.allies[this.allyIdx];
                const segment = this.readForeignSegment(ally, SIMPLE_ALLIES_SEGMENT_ID);
                if (segment) {
                    this.debug(`successfully loaded segment for ${ally}`);
                    this.allySegments[ally] = segment;
                } else {
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
     * Helper function used to purge responses to requests that have disappeared
     */
    private purgeResponses<T extends object>(obj: T, set: Set<string>) {
        for (const id in obj) {
            if (set.has(id)) {
                delete obj[id];
                return true;
            }
        }
        return false;
    }

    /**
     * Update our segment with requests made
     *
     * Must be called after all requests were made
     */
    public endRun() {
        // Check if we have any new requests to send
        const doUpdate = this.lastUpdateTime === Game.time;
        const doRefresh = Game.time % (this.refreshRate * this._allies.size) === 0;
        if (!doUpdate && !doRefresh) return;

        // Make sure we don't have too many segments open
        if (this.canOpenSegment()) {
            this.log(`Too many segments open: can't update!`);
            return;
        }

        if (doRefresh) {
            // Get all the requests indentifier across loaded segments
            // We'll use that to purge out responses to requests that
            // have been removed.
            const playerNames = new Set<string>();
            const roomNames = new Set<string>();
            const allIds = new Set<Types.RequestID>();
            for (const [_allyName, segment] of Object.entries(this.allySegments)) {
                [
                    ...(segment.requests?.attack ?? []),
                    ...(segment.requests?.defense ?? []),
                    ...(segment.requests?.work ?? []),
                    ...(segment.requests?.funnel ?? []),
                    ...(segment.requests?.resource ?? []),
                ].forEach((req) => allIds.add(req.id));

                segment.requests?.player?.forEach((name) => playerNames.add(name));
                segment.requests?.room?.forEach((room) => roomNames.add(room));
            }

            let didUpdate = false;

            didUpdate ??= this.purgeResponses(this.responses.resource, allIds);
            didUpdate ??= this.purgeResponses(this.responses.attack, allIds);
            didUpdate ??= this.purgeResponses(this.responses.defense, allIds);
            didUpdate ??= this.purgeResponses(this.responses.work, allIds);
            didUpdate ??= this.purgeResponses(this.responses.funnel, allIds);
            didUpdate ??= this.purgeResponses(this.responses.player, playerNames);
            didUpdate ??= this.purgeResponses(this.responses.room, roomNames);

            if (didUpdate) {
                this.lastUpdateTime = Game.time;
            }
        }

        const segment: Types.SimpleAlliesSegment = {
            updatedAt: Game.time,
            requests: {
                resource: this.requests.resource,
                defense: this.requests.defense,
                attack: this.requests.attack,
                player: [...this.requests.player.keys()],
                work: this.requests.work,
                funnel: this.requests.funnel,
                room: [...this.requests.room.keys()],
            },
            responses: {},
        };
        if (this.selfInfo) segment.selfInfo = this.selfInfo;
        if (this.responses) {
            segment.responses = this.responses;
        }

        this.writeSegment(SIMPLE_ALLIES_SEGMENT_ID, segment);
        this.markPublic(SIMPLE_ALLIES_SEGMENT_ID);
    }

    // Request methods

    /**
     * Request resource
     * @param {'energy' | ResourceConstant} resourceType - The resource to ask for
     * @param {number} amount - How much they want of the resource. If the responder sends only a portion of what you ask for, that's fine
     * @param {string} roomName - The room to transfer resources to
     * @param [opts] - options for the request
     * @param {number} [opts.priority] - 0-1 where 1 is highest consideration
     * @param {boolean} [opts.terminal] - If the bot has no terminal, allies should instead haul the resources to us
     * @param {number} [opts.timeout] - Tick after which the request should be ignored. If your bot crashes, or stops updating requests for some other reason, this is a safety mechanism.
     */
    public requestResource(
        resourceType: ResourceConstant,
        amount: number,
        roomName: string,
        opts?: { priority: number; hasTerminal?: boolean; timeout?: number }
    ) {
        const id = this.makeRequestID();
        const request: Types.ResourceRequest = {
            id,
            resourceType,
            amount,
            roomName: roomName,
            priority: this.checkPriority(opts?.priority),
        };
        if (opts?.hasTerminal) request.terminal = opts.hasTerminal;
        if (opts?.timeout) request.timeout = opts.timeout;

        insertSorted(this.requests.resource, request, (a, b) => a.priority < b.priority);
        this.lastUpdateTime = Game.time;
        return id;
    }

    /**
     * Request help in defending a room
     * @param {string} roomName - The room that needs defending
     * @param [opts] - a request object
     * @param {number} [opts.priority] - 0-1 where 1 is highest consideration
     * @param {number} [opts.timeout] - Tick after which the request should be ignored. If your bot crashes, or stops updating requests for some other reason, this is a safety mechanism.
     */
    public requestDefense(roomName: string, opts?: { priority?: number; timeout?: number }) {
        if (this.requests.defense.some((req) => req.roomName === roomName)) {
            this.log(`defense request for room ${roomName} already exists, ignoring`);
            return;
        }
        const id = this.makeRequestID();
        const request: Types.DefenseRequest = {
            id,
            roomName,
            priority: this.checkPriority(opts?.priority),
        };
        if (opts?.timeout) request.timeout = opts.timeout;
        insertSorted(this.requests.defense, request, (a, b) => a.priority < b.priority);
        this.lastUpdateTime = Game.time;
        return id;
    }

    /**
     * Request an attack force to be sent to the given room
     * @param {string} roomName - The room to send an attack force to
     * @param [opts] - a request object
     * @param {number} [opts.priority] - 0-1 where 1 is highest consideration
     * @param {number} [opts.timeout] - Tick after which the request should be ignored. If your bot crashes, or stops updating requests for some other reason, this is a safety mechanism.
     */
    public requestAttack(roomName: string, opts?: { priority?: number; timeout?: number }) {
        if (this.requests.attack.some((req) => req.roomName === roomName)) {
            this.log(`attack request for room ${roomName} already exists, ignoring`);
            return;
        }
        const id = this.makeRequestID();
        const request: Types.AttackRequest = {
            id,
            roomName,
            priority: this.checkPriority(opts?.priority),
        };
        if (opts?.timeout) request.timeout = opts.timeout;
        insertSorted(this.requests.attack, request, (a, b) => a.priority < b.priority);
        this.lastUpdateTime = Game.time;
        return id;
    }

    /**
     * Request help in building/fortifying a room
     * @param {string} roomName - The room to send help to
     * @param {EWorkType.BUILD | EWorkType.REPAIR} workType - The type of work to perform there
     * @param [opts] - a request object
     * @param {number} [opts.priority] - 0-1 where 1 is highest consideration
     * @param {number} [args.timeout] - Tick after which the request should be ignored. If your bot crashes, or stops updating requests for some other reason, this is a safety mechanism.
     */
    public requestWork(
        roomName: string,
        workType: Types.WorkType,
        opts?: { priority?: number; timeout?: number }
    ) {
        if (this.requests.work.some((req) => req.roomName === roomName)) {
            this.log(`work request for room ${roomName} already exists, ignoring`);
            return;
        }
        const id = this.makeRequestID();
        const request: Types.WorkRequest = {
            id,
            roomName,
            workType,
            priority: this.checkPriority(opts?.priority),
        };
        if (opts?.timeout) request.timeout = opts.timeout;
        insertSorted(this.requests.work, request, (a, b) => a.priority < b.priority);
        this.lastUpdateTime = Game.time;
        return id;
    }

    /**
     * Request energy to a room for a purpose of making upgrading faster.
     * @param roomName - The room name to send the energy to
     * @param {EFunnelGoal.GCL | EFunnelGoal.RCL7 | EFunnelGoal.RCL8} goalType - What energy will be spent on. Room receiving energy should focus solely on achieving the goal.
     * @param {number} maxAmount - Amount of energy needed. Should be equal to energy that needs to be put into controller for achieving goal.
     * @param [opts] - a request object
     * @param {number} [opts.priority] - 0-1 where 1 is highest consideration
     * @param {number} [opts.timeout] - Tick after which the request should be ignored. If your bot crashes, or stops updating requests for some other reason, this is a safety mechanism.
     */
    public requestFunnel(
        roomName: string,
        goalType: Types.FunnelGoal,
        maxAmount: number,
        opts?: { priority?: number; timeout?: number }
    ) {
        if (this.requests.funnel.some((req) => req.roomName === roomName)) {
            this.log(`funnel request for room ${roomName} already exists, ignoring`);
            return;
        }
        const id = this.makeRequestID();
        const request: Types.FunnelRequest = {
            id,
            roomName,
            goalType,
            maxAmount,
            priority: this.checkPriority(opts?.priority),
        };
        if (opts?.timeout) request.timeout = opts.timeout;
        insertSorted(this.requests.funnel, request, (a, b) => a.priority < b.priority);
        this.lastUpdateTime = Game.time;
        return id;
    }

    /**
     * Request intel on a player
     *
     * @param playerName - The player name to ask intel about
     */
    requestPlayerIntel(playerName: string) {
        this.requests.player.add(playerName);
        this.lastUpdateTime = Game.time;
    }

    /**
     * Request intel on a given room
     *
     * @param roomName - The room name to ask intel about
     */
    public requestRoomIntel(roomName: string) {
        this.requests.room.add(roomName);
        this.lastUpdateTime = Game.time;
    }

    /**
     * Share how your bot is doing economically
     * @param info - Info about your own bot
     * @param {number} info.credits - total credits the bot has. Should be 0 if there is no market on the server
     * @param {number} info.sharableEnergy - the maximum amount of energy the bot is willing to share with allies. Should never be more than the amount of energy the bot has in storing structures
     * @param {number} [info.energyIncome] - The average energy income the bot has calculated over the last 100 ticks. Optional, as some bots might not be able to calculate this easily.
     * @param {Object.<MineralConstant, number>} [info.mineralNodes] - The number of mineral nodes the bot has access to, probably used to inform expansion
     */
    public setSelf(info: Types.SelfInfo) {
        this.selfInfo = info;
        this.lastUpdateTime = Game.time;
    }

    // Response handling

    public replyResource(request: Types.ResourceRequest, amount: number) {
        const response: Types.ResourceResponse = {
            id: request.id,
            status: amount > 0 ? Types.RequestStatus.FULFILLED : Types.RequestStatus.DISMISSED,
        };
        this.responses.resource[request.id] = response;
        this.lastUpdateTime = Game.time;
    }

    public replyAttack(
        request: Types.AttackRequest,
        data: { creepCount: number; eta?: Types.Eta }
    ) {
        const response: Types.AttackResponse = {
            id: request.id,
            status:
                data.creepCount > 0 ? Types.RequestStatus.FULFILLED : Types.RequestStatus.DISMISSED,
            creepCount: data.creepCount,
        };
        if (data.creepCount && data.eta) response.eta = data.eta;

        this.responses.attack[request.id] = response;
        this.lastUpdateTime = Game.time;
    }

    public replyDefense(
        request: Types.DefenseRequest,
        data: { creepCount: number; eta?: Types.Eta }
    ) {
        const response: Types.DefenseResponse = {
            id: request.id,
            status:
                data.creepCount > 0 ? Types.RequestStatus.FULFILLED : Types.RequestStatus.DISMISSED,
            creepCount: data.creepCount,
        };
        if (data.creepCount && data.eta) response.eta = data.eta;

        this.responses.defense[request.id] = response;
        this.lastUpdateTime = Game.time;
    }

    public replyWork(request: Types.WorkRequest, data: { creepCount: number; eta?: Types.Eta }) {
        const response: Types.WorkResponse = {
            id: request.id,
            status:
                data.creepCount > 0 ? Types.RequestStatus.FULFILLED : Types.RequestStatus.DISMISSED,
            creepCount: data.creepCount,
        };
        if (data.creepCount && data.eta) response.eta = data.eta;

        this.responses.work[request.id] = response;
        this.lastUpdateTime = Game.time;
    }

    public replyIntel(roomName: string, intel: Types.RoomIntelResponse) {
        this.responses.room[roomName] = intel;
        this.lastUpdateTime = Game.time;
    }

    public replyPlayer(playerName: string, info: Types.PlayerIntelResponse) {
        this.responses.player[playerName] = info;
        this.lastUpdateTime = Game.time;
    }

    // Request processing

    private markRequest<T extends Types.Request>(request: T, status: Types.RequestStatus) {
        this.requestStatus[request.id] = status;
    }

    public processRequests<T extends Types.RequestType, R extends Types.AllRequestTypes[T]>(
        requestType: T,
        cb: (playerName: string, request: R) => Types.RequestStatus | undefined
    ): void {
        for (const [ally, segment] of Object.entries(this.allySegments)) {
            for (const request of segment.requests?.[requestType] ?? []) {
                const req = request as R;

                if (typeof req !== 'string' && req.id in this.requestStatus) continue;

                const result = cb(ally, req);

                if (result === undefined) return;

                // Mark request as fulfilled
                if (typeof req !== 'string') {
                    this.markRequest(req, result);
                }
            }
        }
    }
}
