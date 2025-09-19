import Peer from 'peerjs'
import { useEffect } from 'react'

function PeerApp() {
    useEffect(() => {
        const peer = new Peer()

        peer.on('open', function(id) {
            console.log('My peer ID is: ' + id)
        })
    })

    return
    (
        <div className="App">
            <h1>Test</h1>
        </div>
    )
}

export default PeerApp