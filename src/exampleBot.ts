import { SimpleAllies, RequestStatus } from './simpleAllies';

const simpleAllies = new SimpleAllies();

/**
 * Example bot loop
 */
export function loop() {
    // Read next an ally segment
    simpleAllies.initRun();

    // Respond to ally requests
    respondToAllyDefenseRequests();
    respondToAllyResourceRequests();

    // Request support from allies
    requestAllyResources();
    requestAllyDefense();

    // Update ally segment
    simpleAllies.endRun();
}

/**
 * Example of responding to ally defense requests
 */
function respondToAllyDefenseRequests() {
    // Send creeps to defend rooms
    simpleAllies.processRequests('defense', (playerName, request) => {
        console.log(
            '[simpleAllies] Respond to defense request from',
            playerName,
            JSON.stringify(request)
        );
        return RequestStatus.DISMISSED;
    });
}

/**
 * Example of responding to ally resource requests
 */
function respondToAllyResourceRequests() {
    // Send resources to rooms
    simpleAllies.processRequests('resource', (playerName, request) => {
        console.log(
            '[simpleAllies] Respond to resource request',
            playerName,
            JSON.stringify(request)
        );
        return RequestStatus.FULFILLED;
    });
}

/**
 * Example of requesting ally resources
 */
function requestAllyResources() {
    // Add resource request
    simpleAllies.requestResource(RESOURCE_ENERGY, 10000, 'W1N1', {
        priority: 1,
    });
}

/**
 * Example of requesting ally defense
 */
function requestAllyDefense() {
    // Add defense request
    simpleAllies.requestDefense('W1N1', {
        priority: 1,
    });
}
