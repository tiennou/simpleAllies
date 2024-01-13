/**
 * Represents the segment data for simpleAllies.
 */
export interface SimpleAlliesSegment {
    /**
     * Economic data on ourself
     */
    selfInfo?: SelfInfo;
    /**
     * Requests from the ally
     */
    requests: AllyRequests;
    /**
     * Responses from the ally
     */
    responses: Partial<AllyResponses>;
    /** The tick the segment was last updated at */
    updatedAt: number;
}

/**
 * Represents the collection of ally requests.
 */
export interface AllyRequests {
    resource: ResourceRequest[];
    defense: DefenseRequest[];
    attack: AttackRequest[];
    work: WorkRequest[];
    funnel: FunnelRequest[];
    player: string[];
    room: string[];
}

/** Type of requests supported */
export type RequestType = keyof AllyRequests;

export interface AllRequestTypes {
    resource: ResourceRequest;
    defense: DefenseRequest;
    attack: AttackRequest;
    work: WorkRequest;
    funnel: FunnelRequest;
    player: string;
    room: string;
}

export interface AllyResponses {
    resource: { [id: RequestID]: ResourceResponse };
    defense: { [id: RequestID]: DefenseResponse };
    attack: { [id: RequestID]: AttackResponse };
    work: { [id: RequestID]: WorkResponse };
    funnel: { [id: RequestID]: FunnelResponse };
    player: { [playerName: string]: PlayerIntelResponse };
    room: { [roomName: string]: RoomIntelResponse };
}

/** A request identifier */
export type RequestID = string & Tag.OpaqueTag<Request>;

/**
 * Abstract superclass of a request
 */
export interface Request {
    /** The request's unique identifier */
    id: RequestID;
    /** The request's priority, from 0 (low) to 1 (high) */
    priority: number;
    /**
     * Tick after which the request should be ignored.
     */
    timeout?: number;
}

export enum RequestStatus {
    FULFILLED = 'f',
    DISMISSED = 'd',
}

/** Abstract superclass for a response */
export interface Response {
    status: RequestStatus;
    id: RequestID;
}

interface RoomRequest extends Request {
    /**
     * The name of the room the request applies to
     */
    roomName: string;
}

export type Eta = number | [min: number, max: number];

interface RoomResponse extends Response {
    creepCount: number;
    eta?: Eta;
}

/**
 * Request resource
 */
export interface ResourceRequest extends RoomRequest {
    /**
     * The type of resource needed.
     */
    resourceType: ResourceConstant;

    /**
     * The amount of the resource needed.
     */
    amount: number;

    /**
     * If set to false, allies can haul resources to us.
     */
    terminal?: boolean;
}

export interface ResourceResponse extends Response {}

/**
 * Request help in defending a room
 */

export interface DefenseRequest extends RoomRequest {}

export interface DefenseResponse extends RoomResponse {}

/**
 * Request an attack on a specific room
 */
export interface AttackRequest extends RoomRequest {}

export interface AttackResponse extends RoomResponse {}

/**
 * Influence allies aggresion score towards a player
 */
export interface PlayerIntelResponse extends Response {
    /**
     * The name of the player.
     */
    playerName: string;

    /**
     * The level of hatred towards the player, ranging from 0 to 1 where 1 is the highest consideration.
     * This value affects combat aggression and targeting.
     */
    hate?: number;

    /**
     * The last time this player has attacked you.
     */
    lastAttackedBy?: number;
}

/**
 * Represents the type of work needed in a work request.
 */
export const enum WorkType {
    BUILD = 'build',
    REPAIR = 'repair',
}

/**
 * Request help in building/fortifying a room
 */
export interface WorkRequest extends RoomRequest {
    /**
     * The type of work needed.
     */
    workType: WorkType;
}

export interface WorkResponse extends RoomResponse {}

/**
 * Represents the goal type for a funnel request.
 */
export const enum FunnelGoal {
    GCL = 0,
    RCL7 = 1,
    RCL8 = 2,
}

/**
 * Request energy to a room for a purpose of making upgrading faster.
 */
export interface FunnelRequest extends RoomRequest {
    /**
     * The amount of energy needed. Should be equal to the energy that needs to be put into the controller for achieving the goal.
     */
    maxAmount: number;
    /**
     * The type of goal that the energy will be spent on. The room receiving energy should focus solely on achieving this goal.
     */
    goalType: FunnelGoal;
}

export interface FunnelResponse extends RoomResponse {}

/**
 * Share scouting data about hostile owned rooms
 */
export interface RoomIntelResponse extends Response {
    /**
     * The player who owns this room. If there is no owner, the room probably isn't worth making a request about.
     */
    playerName: string;
    /**
     * The last tick when you scouted this room to acquire the data you are now sharing.
     */
    lastScout: number;
    /**
     * The level of the room's controller.
     */
    rcl: number;
    /**
     * The amount of stored energy the room has. The sum of storage, terminal, and factory should be sufficient.
     */
    energy: number;
    /**
     * The number of towers in the room.
     */
    towers: number;
    /**
     * Indicates whether the room has a terminal.
     */
    terminal: boolean;
    /**
     * The average rampart hits in the room.
     */
    avgRamprtHits?: number;
    /**
     * Tick after which the request should be ignored.
     */
    timeout?: number;
}

/**
 * Share how your bot is doing economically
 */
export interface SelfInfo {
    /**
     * The total credits the bot has. Should be 0 if there is no market on the server.
     */
    credits?: number;
    /**
     * The amount of energy in storage that the bot is willing to share with allies.
     */
    sharableEnergy?: number;
    /**
     * The average energy income the bot has calculated over the last 100 ticks.
     */
    energyIncome?: number;
    /**
     * The number of mineral nodes the bot has access to, probably used to inform expansion.
     */
    mineralNodes?: { [mineral in MineralConstant]?: number };
}
