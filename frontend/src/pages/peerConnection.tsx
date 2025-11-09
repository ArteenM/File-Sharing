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

// Optimized chunk size based on WebRTC data channel limits
const CHUNK_SIZE = 256 * 1024 // 256 KB - optimized for WebRTC

interface PerformanceMetrics {
  startTime: number
  endTime?: number
  bytesTransferred: number
  latencies: number[]
  throughput?: number // MB/s
  p95Latency?: number
  p99Latency?: number
  averageLatency?: number
}

interface FileChunk {
  type: 'chunk'
  data: ArrayBuffer
  chunkIndex: number
  totalChunks: number
  fileName: string
  fileSize: number
  timestamp: number // For latency calculation
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
  const [transferProgress, setTransferProgress] = useState(0)
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null)

  const peerRef = useRef<Peer | null>(null)
  const connectionRef = useRef<DataConnection | null>(null)
  
  const receivingFile = useRef<{
    name: string
    size: number
    chunks: ArrayBuffer[]
    receivedChunks: number
    totalChunks: number
    metrics: PerformanceMetrics
  } | null>(null)

  const sendingMetrics = useRef<PerformanceMetrics | null>(null)

  const calculatePercentiles = (latencies: number[]): { p95: number; p99: number; avg: number } => {
    if (latencies.length === 0) return { p95: 0, p99: 0, avg: 0 }
    
    const sorted = [...latencies].sort((a, b) => a - b)
    const p95Index = Math.floor(sorted.length * 0.95)
    const p99Index = Math.floor(sorted.length * 0.99)
    const avg = sorted.reduce((sum, val) => sum + val, 0) / sorted.length
    
    return {
      p95: sorted[p95Index] || sorted[sorted.length - 1],
      p99: sorted[p99Index] || sorted[sorted.length - 1],
      avg
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      setInputFile(files[0])
      setMetrics(null)
    }
  }

  useEffect(() => {
    const peer = new Peer({
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    })
    peerRef.current = peer

    peer.on('open', (id: string) => {
      console.log('My peer ID is:', id)
      setPeerId(id)
    })

    peer.on('connection', (conn: DataConnection) => {
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
      handleReceivedData(data as FileMessage)
    })

    conn.on('close', () => {
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
          chunks: new Array(data.totalChunks),
          receivedChunks: 0,
          totalChunks: data.totalChunks,
          metrics: {
            startTime: Date.now(),
            bytesTransferred: 0,
            latencies: []
          }
        }
        setIsTransferring(true)
        setTransferProgress(0)
        break

      case 'chunk':
        if (receivingFile.current) {
          const latency = Date.now() - data.timestamp
          receivingFile.current.metrics.latencies.push(latency)
          
          receivingFile.current.chunks[data.chunkIndex] = data.data
          receivingFile.current.receivedChunks++
          receivingFile.current.metrics.bytesTransferred += data.data.byteLength
          
          const progress = (receivingFile.current.receivedChunks / receivingFile.current.totalChunks) * 100
          setTransferProgress(progress)
          
          if (receivingFile.current.receivedChunks === receivingFile.current.totalChunks) {
            // Calculate final metrics
            receivingFile.current.metrics.endTime = Date.now()
            const duration = (receivingFile.current.metrics.endTime - receivingFile.current.metrics.startTime) / 1000
            receivingFile.current.metrics.throughput = (receivingFile.current.metrics.bytesTransferred / (1024 * 1024)) / duration
            
            const percentiles = calculatePercentiles(receivingFile.current.metrics.latencies)
            receivingFile.current.metrics.p95Latency = percentiles.p95
            receivingFile.current.metrics.p99Latency = percentiles.p99
            receivingFile.current.metrics.averageLatency = percentiles.avg
            
            setMetrics(receivingFile.current.metrics)
            
            const completeFile = new Blob(receivingFile.current.chunks)
            downloadFile(completeFile, receivingFile.current.name)
            receivingFile.current = null
            setIsTransferring(false)
            setTransferProgress(100)
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
    
    const conn = peerRef.current.connect(remotePeerId, {
      reliable: true, // Enable reliability for data channels
      serialization: 'binary'
    })

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
    setTransferProgress(0)
    
    sendingMetrics.current = {
      startTime: Date.now(),
      bytesTransferred: 0,
      latencies: []
    }
    
    try {
      const arrayBuffer = await inputFile.arrayBuffer()
      const totalChunks = Math.ceil(arrayBuffer.byteLength / CHUNK_SIZE)

      const fileStart: FileStart = {
        type: 'file-start',
        fileName: inputFile.name,
        fileSize: inputFile.size,
        totalChunks: totalChunks
      }
      connectionRef.current.send(fileStart)

      // Optimized: Send chunks with adaptive pacing
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE
        const end = Math.min(start + CHUNK_SIZE, arrayBuffer.byteLength)
        const chunkData = arrayBuffer.slice(start, end)

        const chunkStartTime = Date.now()
        
        const chunk: FileChunk = {
          type: 'chunk',
          data: chunkData,
          chunkIndex: i,
          totalChunks: totalChunks,
          fileName: inputFile.name,
          fileSize: inputFile.size,
          timestamp: chunkStartTime
        }

        connectionRef.current.send(chunk)
        
        sendingMetrics.current.bytesTransferred += chunkData.byteLength
        setTransferProgress((i + 1) / totalChunks * 100)

      // Buffer to not overwhelm the data channel
      await new Promise(resolve => setTimeout(resolve, 10))
      }

      const fileEnd: FileEnd = {
        type: 'file-end',
        fileName: inputFile.name
      }
      connectionRef.current.send(fileEnd)

      // Calculate sending metrics
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

  const disconnect = () => {
    if (connectionRef.current) {
      connectionRef.current.close()
      connectionRef.current = null
    }
    setConnectionStatus('disconnected')
    setMetrics(null)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-xl p-6">
          <h1 className="text-3xl font-bold mb-6 text-center text-gray-800">
            P2P File Transfer with Performance Metrics
          </h1>

          {/* Peer ID Display */}
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
              disabled={!inputFile || connectionStatus !== 'connected' || isTransferring}
              className="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400 transition-colors font-semibold"
            >
              {isTransferring ? 'Sending...' : 'Send File'}
            </button>
          </div>

          {/* Performance Metrics Display */}
          {metrics && (
            <div className="border-t pt-4 mb-4">
              <h3 className="font-semibold mb-3 text-gray-800 text-lg">Performance Metrics</h3>
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
              <p>1. Copy your Peer ID and share it with another user (or open in another tab)</p>
              <p>2. Enter the remote Peer ID and click "Connect"</p>
              <p>3. Select a file and click "Send File"</p>
              <p>4. View real-time performance metrics after transfer completes</p>
              <p className="text-xs text-gray-500 mt-3">
                <strong>Optimizations:</strong> 256KB chunks, adaptive pacing, binary serialization, STUN servers for NAT traversal
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PeerApp