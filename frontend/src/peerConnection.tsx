import Peer from 'peerjs'
import type { DataConnection } from 'peerjs'
import {useState, useRef, useEffect } from 'react'


function PeerApp() {
   const [peerId, setPeerId] = useState('')
   const [remotePeerId, setRemotePeerId] = useState('')
   //const [inputFile, setInputFile] = useState(File)
   const [messages, setMessages] = useState<string[]>([])

   var peerRef = useRef<Peer | null>(null)
   const connectRef = useRef<DataConnection | null>(null)
   
    useEffect(() => {
        const peer = new Peer()
        peerRef.current = peer

        peer.on('open', (id) => {
        console.log('My peer ID is:', id)
        setPeerId(id)
    })

    peer.on('connection', (conn) => {
        console.log('Incoming connection')
        connectRef.current = conn

        conn.on('data', (data) => {
            console.log('Received:', data)
            setMessages((prev) => [...prev, `Remote: ${data}`])
      })
    })

    return () => {
      peer.destroy()
    }
  }, [])

  const connectToPeer = () =>
  {
    if (!remotePeerId || !peerRef.current) return

    const conn = peerRef.current.connect(remotePeerId)
    connectRef.current = conn

    conn.on('open', () => {
        console.log('Connected to remote peer!')
        conn.send('Hi from ' + peerId)
        setMessages((prev) => [...prev, `Me: Hi from ${peerId}`])
    })

    conn.on('data', (data) => {
        console.log('Received:', data)
        setMessages((prev) => [...prev, `Remote: ${data}`])
    })
  }


  return (
    <div>
      <h1>PeerJS P2P Example</h1>

      <p><strong>Your ID:</strong> {peerId}</p>

      <input
        type="text"
        value={remotePeerId}
        onChange={(e) => setRemotePeerId(e.target.value)}
        placeholder="Remote Peer ID"
      />
      <button onClick={connectToPeer}>Connect</button>

      <h3>Messages:</h3>
      <ul>
        {messages.map((msg, idx) => (
          <li key={idx}>{msg}</li>
        ))}
      </ul>
    </div>
  )
}

export default PeerApp