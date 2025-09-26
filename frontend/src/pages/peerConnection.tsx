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
  const [messages, setMessages] = useState<string[]>([])
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')
  const [transferProgress, setTransferProgress] = useState(0)
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

  const addMessage = (message: string) => {
    setMessages(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`])
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      setInputFile(files[0])
      addMessage(`File selected: ${files[0].name} (${(files[0].size / 1024).toFixed(1)} KB)`)
    }
  }

  useEffect(() => {
    const peer = new Peer() // Initialize Peer
    peerRef.current = peer

    peer.on('open', (id: string) => {
      console.log('My peer ID is:', id)
      setPeerId(id)
      addMessage(`Your peer ID: ${id}`)
    })

    peer.on('connection', (conn: DataConnection) => { // Somebody connects to you.
      console.log('Incoming connection')
      connectionRef.current = conn
      setConnectionStatus('connected')
      addMessage('Incoming connection established')
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
      addMessage('Connection closed')
      connectionRef.current = null
    })

    conn.on('error', (error: any) => {
      console.error('Connection error:', error)
      addMessage(`Connection error: ${error}`)
    })
  }

  const handleReceivedData = (data: FileMessage) => {
    switch (data.type) {
      case 'file-start':
        addMessage(`Receiving file: ${data.fileName} (${(data.fileSize / 1024).toFixed(1)} KB)`)
        receivingFile.current = {
          name: data.fileName,
          size: data.fileSize,
          chunks: new Array(data.totalChunks),  // Allocate Chunk Array
          receivedChunks: 0,
          totalChunks: data.totalChunks
        }
        setTransferProgress(0)
        setIsTransferring(true)
        break

      case 'chunk':
        if (receivingFile.current) {
          receivingFile.current.chunks[data.chunkIndex] = data.data // Store Chunk in correct possition
          receivingFile.current.receivedChunks++
          
          const progress = (receivingFile.current.receivedChunks / receivingFile.current.totalChunks) * 100
          setTransferProgress(progress)
          
          if (receivingFile.current.receivedChunks === receivingFile.current.totalChunks) {
            // File transfer complete
            const completeFile = new Blob(receivingFile.current.chunks)
            downloadFile(completeFile, receivingFile.current.name)
            addMessage(`File received and downloaded: ${receivingFile.current.name}`)
            receivingFile.current = null
            setIsTransferring(false)
            setTransferProgress(0)
          }
        }
        break

      case 'file-end':
        addMessage(`File transfer completed: ${data.fileName}`)
        break
    }
  }

  const connectToPeer = () => {
    if (!remotePeerId || !peerRef.current) {
      addMessage('Please enter a remote peer ID')
      return
    }

    setConnectionStatus('connecting')
    addMessage(`Connecting to peer: ${remotePeerId}`)
    
    const conn = peerRef.current.connect(remotePeerId)  // Initiate Connection
    connectionRef.current = conn

    conn.on('open', () => {
      console.log('Connected to remote peer!')
      setConnectionStatus('connected')
      addMessage(`Connected to peer: ${remotePeerId}`)
      setupConnectionHandlers(conn)
    })

    conn.on('error', (error: any) => {
      console.error('Connection failed:', error)
      addMessage(`Connection failed: ${error}`)
      setConnectionStatus('disconnected')
    })
  }

  const sendFile = async () => {
    if (!inputFile || !connectionRef.current || connectionStatus !== 'connected') {
      addMessage('Please select a file and ensure you are connected to a peer')
      return
    }

    setIsTransferring(true)
    setTransferProgress(0)
    
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

      addMessage(`Sending file: ${inputFile.name} (${totalChunks} chunks)`)

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
        
        const progress = ((i + 1) / totalChunks) * 100
        setTransferProgress(progress)

        // Small delay to prevent overwhelming the connection
        await new Promise(resolve => setTimeout(resolve, 10))
      }

      // Send file end message
      const fileEnd: FileEnd = {
        type: 'file-end',
        fileName: inputFile.name
      }
      connectionRef.current.send(fileEnd)

      addMessage(`File sent successfully: ${inputFile.name}`)
      setIsTransferring(false)
      setTransferProgress(0)

    } catch (error) {
      console.error('Error sending file:', error)
      addMessage(`Error sending file: ${error}`)
      setIsTransferring(false)
      setTransferProgress(0)
    }
  }

  const disconnect = () => {
    if (connectionRef.current) {
      connectionRef.current.close()
      connectionRef.current = null
    }
    setConnectionStatus('disconnected')
    addMessage('Disconnected from peer')
  }

  const connectToSelf = () => {
    setRemotePeerId(peerId)
    setTimeout(() => connectToPeer(), 100)
  }

  return (
    <div className="p-6 max-w-2xl mx-auto bg-white rounded-lg shadow-lg">
      <h1 className="text-3xl font-bold mb-6 text-center text-gray-800">PeerJS File Transfer</h1>

      {/* Peer ID Display */}
      <div className="mb-4 p-3 bg-gray-100 rounded">
        <strong>Your Peer ID:</strong> 
        <span className="font-mono text-sm ml-2 select-all bg-white px-2 py-1 rounded border">
          {peerId || 'Connecting...'}
        </span>
        {peerId && (
          <button 
            onClick={connectToSelf}
            className="ml-2 px-2 py-1 bg-purple-500 text-white text-xs rounded hover:bg-purple-600"
            title="Demo: Connect to yourself"
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
            className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={connectionStatus === 'connected'}
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
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 transition-colors"
            >
              {connectionStatus === 'connecting' ? 'Connecting...' : 'Connect'}
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

      {/* Messages Log */}
      <div className="border-t pt-4">
        <h3 className="font-semibold mb-3 text-gray-800">How-To-Use:</h3>
        <div className="bg-gray-50 rounded p-3 h-40 overflow-y-auto">
          <p className="text-gray-500 text-sm">Copy your given ID. Either send to another user and they will connect to it,
            or you can use it yourself on another website. Choose a file to send (must be 64KB or less), and then send.
          </p>
        </div>
      </div>
    </div>
  )
}

export default PeerApp