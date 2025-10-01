import Peer from 'peerjs'
import type { DataConnection } from 'peerjs'
import {useState, useRef, useEffect } from 'react'

const downloadFile = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const CHUNK_SIZE = 64 * 1024 //64 KB for now.

interface FileChunk {
  type: 'chunk'
  data: ArrayBuffer
  chunkIndex: number
  totalChunks: number
  fileName: string
  fileSize: number
}

interface FileStart {
  type: 'file-start'
  fileName: string
  fileSize: number
  totalChunks: number
}

interface FileEnd {
  type: 'file-end'
  fileName: string
}

type FileMessage = FileChunk | FileStart | FileEnd

function PeerApp() {
  const [peerId, setPeerId] = useState('')
  const [remotePeerId, setRemotePeerId] = useState('')
  const [inputFile, setInputFile] = useState<File | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')
  const [isTransferring, setIsTransferring] = useState(false)

  const peerRef = useRef<Peer | null>(null)
  const connectionRef = useRef<DataConnection | null>(null)
  
  const receivingFile = useRef<{
    name: string
    size: number
    chunks: ArrayBuffer[]
    receivedChunks: number
    totalChunks: number
  } | null>(null)


  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      setInputFile(files[0])
    }
  }

  useEffect(() => {
    const peer = new Peer() // Initialize Peer
    peerRef.current = peer

    peer.on('open', (id: string) => {
      console.log('My peer ID is:', id)
      setPeerId(id)
    })

    peer.on('connection', (conn: DataConnection) => { // Somebody connects to you.
      console.log('Incoming connection')
      connectionRef.current = conn
      setConnectionStatus('connected')
      setupConnectionHandlers(conn)
    })

    return () => {
      if (peer) {
        peer.destroy()
      }
    }
  }, [])

  const setupConnectionHandlers = (conn: DataConnection) => {
    conn.on('data', (data: unknown) => {
      handleReceivedData(data as FileMessage) // Process Data
    })

    conn.on('close', () => {            // Close Connection
      setConnectionStatus('disconnected')
      connectionRef.current = null
    })

    conn.on('error', (error: any) => {
      console.error('Connection error:', error)
    })
  }

  const handleReceivedData = (data: FileMessage) => {
    switch (data.type) {
      case 'file-start':
        receivingFile.current = {
          name: data.fileName,
          size: data.fileSize,
          chunks: new Array(data.totalChunks),  // Allocate Chunk Array
          receivedChunks: 0,
          totalChunks: data.totalChunks
        }
        setIsTransferring(true)
        break

      case 'chunk':
        if (receivingFile.current) {
          receivingFile.current.chunks[data.chunkIndex] = data.data // Store Chunk in correct possition
          receivingFile.current.receivedChunks++
          
          
          if (receivingFile.current.receivedChunks === receivingFile.current.totalChunks) {
            // File transfer complete
            const completeFile = new Blob(receivingFile.current.chunks)
            downloadFile(completeFile, receivingFile.current.name)
            receivingFile.current = null
            setIsTransferring(false)
          }
        }
        break

      case 'file-end':
        break
    }
  }

  const connectToPeer = () => {
    if (!remotePeerId || !peerRef.current) {
      return
    }

    setConnectionStatus('connecting')
    
    const conn = peerRef.current.connect(remotePeerId)  // Initiate Connection

    conn.on('open', () => {
      console.log('Connected to remote peer!')
      connectionRef.current = conn
      setConnectionStatus('connected')
      setupConnectionHandlers(conn)
    })

    conn.on('error', (error: any) => {
      console.error('Connection failed:', error)
      setConnectionStatus('disconnected')
    })
  }
  const sendFile = async () => {
    if (!inputFile || !connectionRef.current || connectionStatus !== 'connected') {
      return
    }

    setIsTransferring(true)
    
    try {
      const arrayBuffer = await inputFile.arrayBuffer() // Read file as binary.
      const totalChunks = Math.ceil(arrayBuffer.byteLength / CHUNK_SIZE) // Calculate Amount of chunks needed.

      const fileStart: FileStart = {  // File Metadata
        type: 'file-start',
        fileName: inputFile.name,
        fileSize: inputFile.size,
        totalChunks: totalChunks
      }
      connectionRef.current.send(fileStart)


      // Send file chunks one-by-one.
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE
        const end = Math.min(start + CHUNK_SIZE, arrayBuffer.byteLength)
        const chunkData = arrayBuffer.slice(start, end)

        const chunk: FileChunk = {
          type: 'chunk',
          data: chunkData,
          chunkIndex: i,
          totalChunks: totalChunks,
          fileName: inputFile.name,
          fileSize: inputFile.size
        }

        connectionRef.current.send(chunk)
      

        // Small delay to prevent overwhelming the connection
        await new Promise(resolve => setTimeout(resolve, 10))
      }

      // Send file end message
      const fileEnd: FileEnd = {
        type: 'file-end',
        fileName: inputFile.name
      }
      connectionRef.current.send(fileEnd)
      setIsTransferring(false)

    } catch (error) {
      console.error('Error sending file:', error)
      setIsTransferring(false)
    }
  }

  const disconnect = () => {
    if (connectionRef.current) {
      connectionRef.current.close()
      connectionRef.current = null
    }
    setConnectionStatus('disconnected')
  }


  return (
    <div className="min-h-214 min-w-screen p-6 max-w-2xl mx-auto bg-white rounded-lg shadow-lg">
      <h1 className="text-3xl font-bold mb-6 text-center text-gray-800">P2P File Transfer</h1>

      {/* Peer ID Display */}
      <div className="mb-4 p-3 bg-gray-300">
        <strong className="font-mono text-sm ml-2 select-all text-black px-2 py-1">Your Peer ID:</strong> 
        <span className="font-mono text-sm ml-2 select-all text-black px-2 py-1">
          {peerId || 'Connecting...'}
        </span>
        {peerId && (
          <button 
            onClick={() => {navigator.clipboard.writeText(peerId)}}
            className="ml-2 px-2 py-1 bg-gray-400 text-white text-xs rounded"
          >
            Copy ID
          </button>
        )}
      </div>

      {/* Connection Controls */}
      <div className="mb-6 space-y-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={remotePeerId}
            onChange={(e) => setRemotePeerId(e.target.value)}
            placeholder="Enter remote peer ID"
            className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
            disabled={connectionStatus === 'connected' || connectionStatus === 'connecting'}
          />
          {connectionStatus === 'connected' ? (
            <button 
              onClick={disconnect}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
            >
              Disconnect
            </button>
          ) : (
            <button 
              onClick={connectToPeer}
              disabled={connectionStatus === 'connecting' || !remotePeerId}
              className="px-4 py-2 bg-gray-400 text-white rounded disabled:bg-gray-400 transition-colors"
            >
              {connectionStatus === 'connecting' ? 'Connecting...' : 'Connect'}
            </button>
          )}

          {connectionStatus === 'connecting' && (
              <button
              onClick={disconnect}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
            >
              Abort Connection
            </button>
  
          )}
        </div>
        
        <div className="text-sm">
          Status: <span className={`font-semibold ${
            connectionStatus === 'connected' ? 'text-green-600' :
            connectionStatus === 'connecting' ? 'text-yellow-600' :
            'text-red-600'
          }`}>
            {connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1)}
          </span>
        </div>
      </div>

      {/* File Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select File to Send:
        </label>
        <input 
          type="file" 
          onChange={handleFileChange}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
        {inputFile && (
          <div className="mt-2 text-sm text-gray-600">
            Selected: <strong>{inputFile.name}</strong> ({(inputFile.size / 1024).toFixed(1)} KB)
          </div>
        )}
      </div>

      {/* Send File Button */}
      <div className="mb-6">
        <button 
          onClick={sendFile}
          disabled={!inputFile || connectionStatus !== 'connected' || isTransferring}
          className="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400 transition-colors"
        >
          {isTransferring ? 'Sending...' : 'Send File'}
        </button>
      </div>

      {/* How-To Log */}
      <div className="border-t pt-4">
        <h3 className="font-semibold mb-3 text-gray-800">How-To-Use:</h3>
        <div className="bg-gray-50 rounded p-3 h-40 overflow-y-auto">
          <p className="text-gray-500 text-sm">Copy your given ID. Either send to another user and they will connect to it,
            or you can use it yourself on another tab. Choose a file to send (must be 64KB or less), and then send.
          </p>
        </div>
      </div>
    </div>
  )
}

export default PeerApp