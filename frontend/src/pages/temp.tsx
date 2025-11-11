import Peer from 'peerjs'
import type { DataConnection } from 'peerjs'
import {useState, useRef, useEffect } from 'react'

// ============================================
// UTILITY: File Download Function
// ============================================
// This function takes encrypted/decrypted file data (as a Blob) and triggers
// a browser download by creating a temporary download link
const downloadFile = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob) // Convert Blob to downloadable URL
  const a = document.createElement('a') // Create invisible link element
  a.href = url
  a.download = filename // Set the filename for download
  document.body.appendChild(a)
  a.click() // Simulate click to trigger download
  document.body.removeChild(a) // Clean up the temporary link
  URL.revokeObjectURL(url) // Free up memory by revoking the object URL
}

// ============================================
// CONSTANTS
// ============================================
// Files are split into 256KB chunks before sending (prevents memory overload)
// Smaller chunks = more network overhead, Larger chunks = more memory usage
const CHUNK_SIZE = 256 * 1024 // 256 KB

// ============================================
// ENCRYPTION CLASS: Handles AES-256-GCM Encryption
// ============================================
// This class provides static methods for generating, exporting, importing,
// encrypting, and decrypting data using the Web Crypto API (browser built-in)
class FileEncryption {
  // Generate a random AES-256 encryption key
  // This key is used to encrypt/decrypt file chunks
  // The key is "extractable" so we can send it to the peer
  static async generateKey(): Promise<CryptoKey> {
    return await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 }, // AES with 256-bit key
      true, // extractable - allows exporting the key to send to peer
      ['encrypt', 'decrypt'] // Can use this key for both operations
    )
  }

  // Export the encryption key as raw bytes so it can be sent to the peer
  // The peer will import these bytes to get the same key
  static async exportKey(key: CryptoKey): Promise<ArrayBuffer> {
    return await crypto.subtle.exportKey('raw', key)
  }

  // Import raw key bytes received from peer (reverse of exportKey)
  // Now both peers have the same encryption key to decrypt each other's files
  static async importKey(keyData: ArrayBuffer): Promise<CryptoKey> {
    return await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    )
  }

  // Encrypt file data using AES-256-GCM
  // GCM mode provides both encryption AND authentication (detects tampering)
  // Returns both encrypted data AND the random IV (initialization vector)
  // The IV must be sent with the encrypted data so receiver can decrypt
  static async encrypt(data: ArrayBuffer, key: CryptoKey): Promise<{ encrypted: ArrayBuffer; iv: ArrayBuffer }> {
    const iv = crypto.getRandomValues(new Uint8Array(12)) // Generate random 96-bit IV
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv.buffer }, // Tell encryption algorithm to use this IV
      key,
      data // The actual file chunk data to encrypt
    )
    return { encrypted, iv: iv.buffer } // Return both encrypted data and IV
  }

  // Decrypt file data using AES-256-GCM
  // Must provide: encrypted data, encryption key, AND the IV that was used
  // Without the correct IV, decryption will fail
  static async decrypt(encrypted: ArrayBuffer, key: CryptoKey, iv: ArrayBuffer): Promise<ArrayBuffer> {
    return await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv }, // Tell decryption algorithm which IV to use
      key,
      encrypted // The encrypted data
    )
  }
}

// ============================================
// INTERFACES: Type Definitions for Data Messages
// ============================================
// Performance metrics tracked during file transfer
interface PerformanceMetrics {
  startTime: number // When transfer started (milliseconds)
  endTime?: number // When transfer ended
  bytesTransferred: number // Total bytes sent/received
  latencies: number[] // Array of latencies for each chunk (in milliseconds)
  throughput?: number // MB/s calculated after transfer
  p95Latency?: number // 95th percentile latency (worst 5% of chunks)
  p99Latency?: number // 99th percentile latency (worst 1% of chunks)
  averageLatency?: number // Average latency across all chunks
  encrypted: boolean // Was this transfer encrypted?
}

// Message type for exchanging encryption keys between peers
interface KeyExchange {
  type: 'key-exchange'
  keyData: ArrayBuffer // The raw encryption key bytes
}

// Message type for sending individual file chunks
interface FileChunk {
  type: 'chunk'
  data: ArrayBuffer // The encrypted (or unencrypted) chunk data
  chunkIndex: number // Which chunk is this (0, 1, 2, etc.)
  totalChunks: number // Total chunks in this file
  fileName: string // Name of the file being transferred
  fileSize: number // Total size of the file
  timestamp: number // When this chunk was sent (for latency calculation)
  iv?: ArrayBuffer // The initialization vector needed for decryption
}

// Message type indicating start of file transfer
interface FileStart {
  type: 'file-start'
  fileName: string
  fileSize: number
  totalChunks: number
  encrypted: boolean // Was encryption enabled for this transfer?
}

// Message type indicating end of file transfer (currently unused)
interface FileEnd {
  type: 'file-end'
  fileName: string
}

// Union type: a message can be any of these types
type FileMessage = FileChunk | FileStart | FileEnd | KeyExchange

// ============================================
// MAIN REACT COMPONENT: P2P File Transfer App
// ============================================
function PeerApp() {
  // ============================================
  // STATE: Component State Variables
  // ============================================
  
  // My peer ID - displayed to user to share with others
  const [peerId, setPeerId] = useState('')
  
  // The peer ID I want to connect to (entered by user)
  const [remotePeerId, setRemotePeerId] = useState('')
  
  // The file selected by user to send
  const [inputFile, setInputFile] = useState<File | null>(null)
  
  // Current connection status to remote peer
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')
  
  // Whether a file transfer is currently happening
  const [isTransferring, setIsTransferring] = useState(false)
  
  // Progress of current transfer (0-100%)
  const [transferProgress, setTransferProgress] = useState(0)
  
  // Performance metrics from last completed transfer
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null)
  
  // Should we encrypt files before sending?
  const [encryptionEnabled, setEncryptionEnabled] = useState(true)
  
  // Have we successfully exchanged encryption keys with peer?
  const [keyExchangeComplete, setKeyExchangeComplete] = useState(false)

  // ============================================
  // REFS: References to Objects That Don't Trigger Re-renders
  // ============================================
  
  // The PeerJS instance (handles WebRTC connections)
  const peerRef = useRef<Peer | null>(null)
  
  // The current data connection to remote peer
  const connectionRef = useRef<DataConnection | null>(null)
  
  // The shared encryption key (same on both peers if encryption enabled)
  const encryptionKeyRef = useRef<CryptoKey | null>(null)
  
  // Data about file currently being received
  const receivingFile = useRef<{
    name: string // Filename
    size: number // Total file size
    chunks: ArrayBuffer[] // Array of received chunks (index = chunk number)
    receivedChunks: number // How many chunks received so far
    totalChunks: number // Total chunks expected
    metrics: PerformanceMetrics // Performance metrics for this transfer
    encrypted: boolean // Was this file encrypted?
  } | null>(null)

  // Metrics for file we are sending
  const sendingMetrics = useRef<PerformanceMetrics | null>(null)

  // ============================================
  // UTILITY FUNCTION: Calculate Latency Percentiles
  // ============================================
  // Given an array of latencies, calculate 95th/99th percentiles and average
  // This helps understand if the connection had consistent latency or spikes
  const calculatePercentiles = (latencies: number[]): { p95: number; p99: number; avg: number } => {
    if (latencies.length === 0) return { p95: 0, p99: 0, avg: 0 }
    
    // Sort latencies in ascending order
    const sorted = [...latencies].sort((a, b) => a - b)
    
    // Find indices for 95th and 99th percentiles
    const p95Index = Math.floor(sorted.length * 0.95) // 95% of values are below this
    const p99Index = Math.floor(sorted.length * 0.99) // 99% of values are below this
    
    // Calculate average latency
    const avg = sorted.reduce((sum, val) => sum + val, 0) / sorted.length
    
    return {
      p95: sorted[p95Index] || sorted[sorted.length - 1],
      p99: sorted[p99Index] || sorted[sorted.length - 1],
      avg
    }
  }

  // ============================================
  // EVENT HANDLER: File Selected by User
  // ============================================
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      setInputFile(files[0]) // Store selected file
      setMetrics(null) // Clear old metrics
    }
  }

  // ============================================
  // INITIALIZATION: Set Up PeerJS and WebRTC
  // ============================================
  // This runs once when component mounts
  useEffect(() => {
    // Create a new PeerJS instance
    // Config includes STUN servers - these help establish connections through firewalls/NAT
    const peer = new Peer({
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' }, // Google's public STUN server
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    })
    peerRef.current = peer

    // When peer gets assigned an ID, display it to user
    peer.on('open', (id: string) => {
      console.log('My peer ID is:', id)
      setPeerId(id) // Show this ID in the UI so user can share it
    })

    // When another peer tries to connect to us
    peer.on('connection', (conn: DataConnection) => {
      console.log('Incoming connection')
      connectionRef.current = conn
      setConnectionStatus('connected')
      setupConnectionHandlers(conn) // Set up message handlers
      
      // If encryption is enabled, generate and send our encryption key
      if (encryptionEnabled) {
        initializeEncryption(conn)
      }
    })

    // Cleanup: Destroy peer when component unmounts (prevent memory leaks)
    return () => {
      if (peer) {
        peer.destroy()
      }
    }
  }, [encryptionEnabled])

  // ============================================
  // ENCRYPTION SETUP: Generate and Send Encryption Key
  // ============================================
  // Called when connection is established and encryption is enabled
  const initializeEncryption = async (conn: DataConnection) => {
    try {
      // Generate a new random encryption key
      const key = await FileEncryption.generateKey()
      encryptionKeyRef.current = key
      
      // Export key as raw bytes
      const exportedKey = await FileEncryption.exportKey(key)
      
      // Send the key to the remote peer (they'll import it to get same key)
      conn.send({
        type: 'key-exchange',
        keyData: exportedKey
      } as KeyExchange)
      
      setKeyExchangeComplete(true)
      console.log('Encryption key generated and sent')
    } catch (error) {
      console.error('Error initializing encryption:', error)
    }
  }

  // ============================================
  // CONNECTION SETUP: Register Message Handlers
  // ============================================
  // When a data connection is established, set up handlers for different events
  const setupConnectionHandlers = (conn: DataConnection) => {
    // When we receive a message from the peer
    conn.on('data', (data: unknown) => {
      handleReceivedData(data as FileMessage)
    })

    // When connection closes
    conn.on('close', () => {
      setConnectionStatus('disconnected')
      connectionRef.current = null
      encryptionKeyRef.current = null
      setKeyExchangeComplete(false)
    })

    // When an error occurs on the connection
    conn.on('error', (error: any) => {
      console.error('Connection error:', error)
    })
  }

  // ============================================
  // MESSAGE HANDLER: Process Received Messages
  // ============================================
  // Handles different types of messages from the remote peer
  const handleReceivedData = async (data: FileMessage) => {
    switch (data.type) {
      // ============================================
      // CASE 1: Encryption Key Exchange
      // ============================================
      case 'key-exchange':
        try {
          // Remote peer sent us their encryption key
          const keyData = (data as KeyExchange).keyData
          // Import it so we can decrypt their files
          encryptionKeyRef.current = await FileEncryption.importKey(keyData)
          setKeyExchangeComplete(true)
          console.log('Encryption key received and imported')
        } catch (error) {
          console.error('Error handling key exchange:', error)
        }
        break

      // ============================================
      // CASE 2: File Transfer Starting
      // ============================================
      case 'file-start':
        // Remote peer is about to send us a file
        // Initialize the receiving buffer
        receivingFile.current = {
          name: data.fileName,
          size: data.fileSize,
          chunks: new Array(data.totalChunks), // Array to hold all chunks
          receivedChunks: 0, // Counter: how many chunks received
          totalChunks: data.totalChunks,
          encrypted: data.encrypted, // Was the file encrypted?
          metrics: {
            startTime: Date.now(),
            bytesTransferred: 0,
            latencies: [], // Array to track latency of each chunk
            encrypted: data.encrypted
          }
        }
        setIsTransferring(true)
        setTransferProgress(0)
        break

      // ============================================
      // CASE 3: Receiving File Chunk
      // ============================================
      case 'chunk':
        if (receivingFile.current) {
          // Calculate how long it took for this chunk to arrive
          const latency = Date.now() - data.timestamp
          receivingFile.current.metrics.latencies.push(latency)
          
          let chunkData = data.data
          
          // If the file was encrypted, decrypt this chunk
          if (receivingFile.current.encrypted && encryptionKeyRef.current && data.iv) {
            try {
              chunkData = await FileEncryption.decrypt(data.data, encryptionKeyRef.current, data.iv)
            } catch (error) {
              console.error('Error decrypting chunk:', error)
              return
            }
          }
          
          // Store this chunk in the right position
          receivingFile.current.chunks[data.chunkIndex] = chunkData
          receivingFile.current.receivedChunks++
          receivingFile.current.metrics.bytesTransferred += data.data.byteLength
          
          // Update progress bar
          const progress = (receivingFile.current.receivedChunks / receivingFile.current.totalChunks) * 100
          setTransferProgress(progress)
          
          // If we've received all chunks, file is complete!
          if (receivingFile.current.receivedChunks === receivingFile.current.totalChunks) {
            // Finalize metrics
            receivingFile.current.metrics.endTime = Date.now()
            const duration = (receivingFile.current.metrics.endTime - receivingFile.current.metrics.startTime) / 1000
            receivingFile.current.metrics.throughput = (receivingFile.current.metrics.bytesTransferred / (1024 * 1024)) / duration
            
            // Calculate latency percentiles
            const percentiles = calculatePercentiles(receivingFile.current.metrics.latencies)
            receivingFile.current.metrics.p95Latency = percentiles.p95
            receivingFile.current.metrics.p99Latency = percentiles.p99
            receivingFile.current.metrics.averageLatency = percentiles.avg
            
            // Display metrics
            setMetrics(receivingFile.current.metrics)
            
            // Combine all chunks into one complete file
            const completeFile = new Blob(receivingFile.current.chunks)
            // Trigger download
            downloadFile(completeFile, receivingFile.current.name)
            
            // Reset state
            receivingFile.current = null
            setIsTransferring(false)
            setTransferProgress(100)
          }
        }
        break

      // ============================================
      // CASE 4: File Transfer Ended
      // ============================================
      case 'file-end':
        // File transfer completed (this is just a marker message)
        break
    }
  }

  // ============================================
  // USER ACTION: Connect to Remote Peer
  // ============================================
  const connectToPeer = async () => {
    if (!remotePeerId || !peerRef.current) {
      return
    }

    setConnectionStatus('connecting')
    
    // Initiate connection to remote peer
    const conn = peerRef.current.connect(remotePeerId, {
      reliable: true, // Ensure all messages are delivered
      serialization: 'binary' // Send data as binary (not JSON)
    })

    // When connection successfully opens
    conn.on('open', async () => {
      console.log('Connected to remote peer!')
      connectionRef.current = conn
      setConnectionStatus('connected')
      setupConnectionHandlers(conn)
      
      // If encryption enabled, generate and send encryption key
      if (encryptionEnabled) {
        await initializeEncryption(conn)
      } else {
        setKeyExchangeComplete(true) // No encryption, so "key exchange" is done
      }
    })

    // If connection fails
    conn.on('error', (error: any) => {
      console.error('Connection failed:', error)
      setConnectionStatus('disconnected')
    })
  }

  // ============================================
  // USER ACTION: Send File to Remote Peer
  // ============================================
  const sendFile = async () => {
    // Check preconditions
    if (!inputFile || !connectionRef.current || connectionStatus !== 'connected') {
      return
    }

    // If encryption enabled but key exchange not complete, warn user
    if (encryptionEnabled && !keyExchangeComplete) {
      alert('Waiting for encryption key exchange to complete...')
      return
    }

    setIsTransferring(true)
    setTransferProgress(0)
    
    // Initialize metrics for this transfer
    sendingMetrics.current = {
      startTime: Date.now(),
      bytesTransferred: 0,
      latencies: [],
      encrypted: encryptionEnabled
    }
    
    try {
      // Read file into memory as ArrayBuffer
      const arrayBuffer = await inputFile.arrayBuffer()
      
      // Calculate how many chunks this file will be split into
      const totalChunks = Math.ceil(arrayBuffer.byteLength / CHUNK_SIZE)

      // Send "file-start" message to notify peer
      const fileStart: FileStart = {
        type: 'file-start',
        fileName: inputFile.name,
        fileSize: inputFile.size,
        totalChunks: totalChunks,
        encrypted: encryptionEnabled
      }
      connectionRef.current.send(fileStart)

      // Send each chunk
      for (let i = 0; i < totalChunks; i++) {
        // Extract chunk from the file
        const start = i * CHUNK_SIZE
        const end = Math.min(start + CHUNK_SIZE, arrayBuffer.byteLength)
        let chunkData = arrayBuffer.slice(start, end)
        
        let iv: ArrayBuffer | undefined
        
        // If encryption enabled, encrypt this chunk
        if (encryptionEnabled && encryptionKeyRef.current) {
          const encryptResult = await FileEncryption.encrypt(chunkData, encryptionKeyRef.current)
          chunkData = encryptResult.encrypted
          iv = encryptResult.iv // Needed for decryption on receiver side
        }

        // Prepare chunk message
        const chunk: FileChunk = {
          type: 'chunk',
          data: chunkData,
          chunkIndex: i,
          totalChunks: totalChunks,
          fileName: inputFile.name,
          fileSize: inputFile.size,
          timestamp: Date.now(), // Used to calculate latency on receiver side
          iv: iv
        }

        // Send the chunk
        connectionRef.current.send(chunk)
        
        // Update metrics
        sendingMetrics.current.bytesTransferred += chunkData.byteLength
        setTransferProgress((i + 1) / totalChunks * 100)

        // Small delay between chunks to avoid overwhelming the network
        await new Promise(resolve => setTimeout(resolve, 10))
      }

      // Send "file-end" marker
      const fileEnd: FileEnd = {
        type: 'file-end',
        fileName: inputFile.name
      }
      connectionRef.current.send(fileEnd)

      // Finalize sending metrics
      sendingMetrics.current.endTime = Date.now()
      const duration = (sendingMetrics.current.endTime - sendingMetrics.current.startTime) / 1000
      sendingMetrics.current.throughput = (sendingMetrics.current.bytesTransferred / (1024 * 1024)) / duration
      
      setMetrics(sendingMetrics.current)
      setIsTransferring(false)

    } catch (error) {
      console.error('Error sending file:', error)
      setIsTransferring(false)
    }
  }

  // ============================================
  // USER ACTION: Disconnect from Peer
  // ============================================
  const disconnect = () => {
    if (connectionRef.current) {
      connectionRef.current.close()
      connectionRef.current = null
    }
    setConnectionStatus('disconnected')
    setMetrics(null)
    encryptionKeyRef.current = null
    setKeyExchangeComplete(false)
  }

  // ============================================
  // RENDER: UI
  // ============================================
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-xl p-6">
          <h1 className="text-3xl font-bold mb-6 text-center text-gray-800">
            🔒 Encrypted P2P File Transfer
          </h1>

          {/* Display User's Peer ID */}
          <div className="mb-4 p-3 bg-gray-100 rounded">
            <strong className="font-mono text-sm text-gray-700">Your Peer ID:</strong> 
            <span className="font-mono text-sm ml-2 select-all text-gray-900 bg-white px-2 py-1 rounded">
              {peerId || 'Connecting...'}
            </span>
            {peerId && (
              <button 
                onClick={() => {navigator.clipboard.writeText(peerId)}}
                className="ml-2 px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
              >
                Copy ID
              </button>
            )}
          </div>

          {/* Encryption Toggle */}
          <div className="mb-4 p-3 bg-blue-50 rounded border border-blue-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="encryption"
                  checked={encryptionEnabled}
                  onChange={(e) => setEncryptionEnabled(e.target.checked)}
                  disabled={connectionStatus !== 'disconnected'}
                  className="w-4 h-4"
                />
                <label htmlFor="encryption" className="text-sm font-medium text-gray-700">
                  Enable End-to-End Encryption (AES-256-GCM)
                </label>
              </div>
              {encryptionEnabled && keyExchangeComplete && (
                <span className="text-xs text-green-600 font-semibold">🔒 Secured</span>
              )}
            </div>
            <p className="text-xs text-gray-600 mt-1">
              {encryptionEnabled 
                ? "Files are encrypted before transmission. Only the recipient can decrypt them."
                : "Files are sent without encryption (not recommended for sensitive data)"}
            </p>
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
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 transition-colors"
                >
                  {connectionStatus === 'connecting' ? 'Connecting...' : 'Connect'}
                </button>
              )}

              {connectionStatus === 'connecting' && (
                <button
                  onClick={disconnect}
                  className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                >
                  Abort
                </button>
              )}
            </div>
            
            <div className="text-sm flex items-center gap-4">
              <span>
                Status: <span className={`font-semibold ${
                  connectionStatus === 'connected' ? 'text-green-600' :
                  connectionStatus === 'connecting' ? 'text-yellow-600' :
                  'text-red-600'
                }`}>
                  {connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1)}
                </span>
              </span>
              {encryptionEnabled && connectionStatus === 'connected' && (
                <span className="text-xs">
                  Key Exchange: <span className={keyExchangeComplete ? 'text-green-600 font-semibold' : 'text-yellow-600'}>
                    {keyExchangeComplete ? '✓ Complete' : '⏳ In Progress...'}
                  </span>
                </span>
              )}
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
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {inputFile && (
              <div className="mt-2 text-sm text-gray-600">
                Selected: <strong>{inputFile.name}</strong> ({(inputFile.size / 1024 / 1024).toFixed(2)} MB)
              </div>
            )}
          </div>

          {/* Progress Bar */}
          {isTransferring && (
            <div className="mb-6">
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div 
                  className="bg-blue-600 h-4 rounded-full transition-all duration-300"
                  style={{ width: `${transferProgress}%` }}
                />
              </div>
              <p className="text-sm text-gray-600 mt-1 text-center">
                {transferProgress.toFixed(1)}% transferred
              </p>
            </div>
          )}

          {/* Send File Button */}
          <div className="mb-6">
            <button 
              onClick={sendFile}
              disabled={!inputFile || connectionStatus !== 'connected' || isTransferring || (encryptionEnabled && !keyExchangeComplete)}
              className="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400 transition-colors font-semibold"
            >
              {isTransferring ? 'Sending...' : `Send File${encryptionEnabled ? ' (Encrypted)' : ''}`}
            </button>
          </div>

          {/* Performance Metrics Display */}
          {metrics && (
            <div className="border-t pt-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-800 text-lg">Performance Metrics</h3>
                {metrics.encrypted && (
                  <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded font-semibold">
                    🔒 Transfer Encrypted
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded">
                <div>
                  <p className="text-xs text-gray-600">Throughput</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {metrics.throughput?.toFixed(2)} MB/s
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Total Transferred</p>
                  <p className="text-2xl font-bold text-green-600">
                    {(metrics.bytesTransferred / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
                {metrics.averageLatency !== undefined && (
                  <>
                    <div>
                      <p className="text-xs text-gray-600">Avg Latency</p>
                      <p className="text-xl font-bold text-gray-700">
                        {metrics.averageLatency.toFixed(2)} ms
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">P95 Latency</p>
                      <p className="text-xl font-bold text-orange-600">
                        {metrics.p95Latency?.toFixed(2)} ms
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">P99 Latency</p>
                      <p className="text-xl font-bold text-red-600">
                        {metrics.p99Latency?.toFixed(2)} ms
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Duration</p>
                      <p className="text-xl font-bold text-purple-600">
                        {((metrics.endTime! - metrics.startTime) / 1000).toFixed(2)}s
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* How-To Guide */}
          <div className="border-t pt-4">
            <h3 className="font-semibold mb-3 text-gray-800">How to Use:</h3>
            <div className="bg-gray-50 rounded p-4 space-y-2 text-sm text-gray-700">
              <p>1. Enable/disable encryption (must be done before connecting)</p>
              <p>2. Copy your Peer ID and share it with another user</p>
              <p>3. Enter the remote Peer ID and click "Connect"</p>
              <p>4. Wait for key exchange to complete (if encryption enabled)</p>
              <p>5. Select a file and click "Send File"</p>
              <p>6. View real-time performance metrics after transfer</p>
              <p className="text-xs text-gray-500 mt-3">
                <strong>Security:</strong> AES-256-GCM encryption, 256KB chunks, P2P (no server storage), STUN servers for NAT traversal
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PeerApp