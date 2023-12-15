// IMPORTANT: This code is just meant to show you how use the segment data. It probably execute

import { ResourceRequest, SimpleAllies } from '../src/ts/simpleAllies'

// Example of fulfilling an ally resource request

const simpleAllies = new SimpleAllies()
simpleAllies.allies = ['Player1', 'Player2', 'Player3']

export function loop() {
    simpleAllies.init()

    respondToResourceRequests()

    simpleAllies.run()
}

function respondToResourceRequests() {
    const resourceRequests = simpleAllies.processResourceRequests()
    for (const ID in resourceRequests) {
        const request = resourceRequests[ID]

        // Respond to the request
        sendResource(request)

        // Now that we've fulfilled the request to the best of our ability...
        // Efficiently remove the request so we don't respond to it again. For example, in another room
        delete resourceRequests[ID]
    }
}

function sendResource(_request: ResourceRequest) {
    // Just an example. You'd probably want to call terminal.send() to properly respond to the request
}
