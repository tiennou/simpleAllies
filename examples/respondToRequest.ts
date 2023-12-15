// IMPORTANT: This code is just meant to show you how use the segment data. It probably execute

import { RequestStatus, ResourceRequest, SimpleAllies, WorkRequest } from '../src/ts/simpleAllies'

// Example of fulfilling an ally resource request

const simpleAllies = new SimpleAllies()
simpleAllies.addAlly('Player1', 'Player2', 'Player3')

export function loop() {
    simpleAllies.init()

    respondToResourceRequests()

    simpleAllies.run()
}

function respondToResourceRequests() {
    simpleAllies.processRequests('resource', (playerName, request) => {
        // Respond to the request
        return sendResource(request)
    })
    simpleAllies.processRequests('work', (playerName, request) => {
        return sendWorkforce(request)
    })
}

function sendResource(_request: ResourceRequest) {
    // Just an example. You'd probably want to call terminal.send() to properly respond to the request
    return RequestStatus.FULFILLED
}

function sendWorkforce(_request: WorkRequest) {
    return RequestStatus.DISMISSED
}
