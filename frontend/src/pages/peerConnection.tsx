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

interface PeerMessageProps
{
  onLogout: () => void
}

const CHUNK_SIZE = 256 * 1024 // 256 KB

// Encryption utilities using Web Crypto API
class FileEncryption {
  static async generateKey(): Promise<CryptoKey> {
    return await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    )
  }

  static async exportKey(key: CryptoKey): Promise<ArrayBuffer> {
    return await crypto.subtle.exportKey('raw', key)
  }

  static async importKey(keyData: ArrayBuffer): Promise<CryptoKey> {
    return await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    )
  }

  static async encrypt(data: ArrayBuffer, key: CryptoKey): Promise<{ encrypted: ArrayBuffer; iv: ArrayBuffer }> {
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv.buffer },
      key,
      data
    )
    return { encrypted, iv: iv.buffer }
  }

  static async decrypt(encrypted: ArrayBuffer, key: CryptoKey, iv: ArrayBuffer): Promise<ArrayBuffer> {
    return await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    )
  }
}

interface PerformanceMetrics {
  startTime: number
  endTime?: number
  bytesTransferred: number
  latencies: number[]
  throughput?: number
  p95Latency?: number
  p99Latency?: number
  averageLatency?: number
  encrypted: boolean
}

interface KeyExchange {
  type: 'key-exchange'
  keyData: ArrayBuffer
}

interface FileChunk {
  type: 'chunk'
  data: ArrayBuffer
  chunkIndex: number
  totalChunks: number
  fileName: string
  fileSize: number
  timestamp: number
  iv?: ArrayBuffer
}

interface FileStart {
  type: 'file-start'
  fileName: string
  fileSize: number
  totalChunks: number
  encrypted: boolean
}

interface FileEnd {
  type: 'file-end'
  fileName: string
}

type FileMessage = FileChunk | FileStart | FileEnd | KeyExchange

function PeerApp({ onLogout }: PeerMessageProps) {
  const [peerId, setPeerId] = useState('')
  const [remotePeerId, setRemotePeerId] = useState('')
  const [inputFile, setInputFile] = useState<File | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')
  const [isTransferring, setIsTransferring] = useState(false)
  const [transferProgress, setTransferProgress] = useState(0)
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null)
  const [encryptionEnabled, setEncryptionEnabled] = useState(true)
  const [keyExchangeComplete, setKeyExchangeComplete] = useState(false)

  const peerRef = useRef<Peer | null>(null)
  const connectionRef = useRef<DataConnection | null>(null)
  const encryptionKeyRef = useRef<CryptoKey | null>(null)
  
  const receivingFile = useRef<{
    name: string
    size: number
    chunks: ArrayBuffer[]
    receivedChunks: number
    totalChunks: number
    metrics: PerformanceMetrics
    encrypted: boolean
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

  const deleteFile = () => {
    setInputFile(null)
    setMetrics(null)
  }

  useEffect(() => {
    const peer = new Peer({
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      },
      debug: 2
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
      
      if (encryptionEnabled) {
        initializeEncryption(conn)
      }
    })

    return () => {
      if (peer) {
        peer.destroy()
      }
    }
  }, [encryptionEnabled])

  const initializeEncryption = async (conn: DataConnection) => {
    try {
      const key = await FileEncryption.generateKey()
      encryptionKeyRef.current = key
      
      const exportedKey = await FileEncryption.exportKey(key)
      
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

  const setupConnectionHandlers = (conn: DataConnection) => {
    conn.on('data', (data: unknown) => {
      handleReceivedData(data as FileMessage)
    })

    conn.on('close', () => {
      setConnectionStatus('disconnected')
      connectionRef.current = null
      encryptionKeyRef.current = null
      setKeyExchangeComplete(false)
    })

    conn.on('error', (error: any) => {
      console.error('Connection error:', error)
    })
  }

  const handleReceivedData = async (data: FileMessage) => {
    switch (data.type) {
      case 'key-exchange':
        try {
          const keyData = (data as KeyExchange).keyData
          encryptionKeyRef.current = await FileEncryption.importKey(keyData)
          setKeyExchangeComplete(true)
          console.log('Encryption key received and imported')
        } catch (error) {
          console.error('Error handling key exchange:', error)
        }
        break

      case 'file-start':
        receivingFile.current = {
          name: data.fileName,
          size: data.fileSize,
          chunks: new Array(data.totalChunks),
          receivedChunks: 0,
          totalChunks: data.totalChunks,
          encrypted: data.encrypted,
          metrics: {
            startTime: Date.now(),
            bytesTransferred: 0,
            latencies: [],
            encrypted: data.encrypted
          }
        }
        setIsTransferring(true)
        setTransferProgress(0)
        break

      case 'chunk':
        if (receivingFile.current) {
          const latency = Date.now() - data.timestamp
          receivingFile.current.metrics.latencies.push(latency)
          
          let chunkData = data.data
          
          if (receivingFile.current.encrypted && encryptionKeyRef.current && data.iv) {
            try {
              chunkData = await FileEncryption.decrypt(data.data, encryptionKeyRef.current, data.iv)
            } catch (error) {
              console.error('Error decrypting chunk:', error)
              return
            }
          }
          
          receivingFile.current.chunks[data.chunkIndex] = chunkData
          receivingFile.current.receivedChunks++
          receivingFile.current.metrics.bytesTransferred += data.data.byteLength
          
          const progress = (receivingFile.current.receivedChunks / receivingFile.current.totalChunks) * 100
          setTransferProgress(progress)
          
          if (receivingFile.current.receivedChunks === receivingFile.current.totalChunks) {
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

  const connectToPeer = async () => {
    if (!remotePeerId || !peerRef.current) {
      return
    }

    setConnectionStatus('connecting')
    
    const conn = peerRef.current.connect(remotePeerId, {
      reliable: true,
      serialization: 'binary'
    })

    conn.on('open', async () => {
      console.log('Connected to remote peer!')
      connectionRef.current = conn
      setConnectionStatus('connected')
      setupConnectionHandlers(conn)
      
      if (encryptionEnabled) {
        await initializeEncryption(conn)
      } else {
        setKeyExchangeComplete(true)
      }
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

    if (encryptionEnabled && !keyExchangeComplete) {
      alert('Waiting for encryption key exchange to complete...')
      return
    }

    setIsTransferring(true)
    setTransferProgress(0)
    
    sendingMetrics.current = {
      startTime: Date.now(),
      bytesTransferred: 0,
      latencies: [],
      encrypted: encryptionEnabled
    }
    
    try {
      const arrayBuffer = await inputFile.arrayBuffer()
      const totalChunks = Math.ceil(arrayBuffer.byteLength / CHUNK_SIZE)

      const fileStart: FileStart = {
        type: 'file-start',
        fileName: inputFile.name,
        fileSize: inputFile.size,
        totalChunks: totalChunks,
        encrypted: encryptionEnabled
      }
      connectionRef.current.send(fileStart)

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE
        const end = Math.min(start + CHUNK_SIZE, arrayBuffer.byteLength)
        let chunkData = arrayBuffer.slice(start, end)
        
        let iv: ArrayBuffer | undefined
        
        if (encryptionEnabled && encryptionKeyRef.current) {
          const encryptResult = await FileEncryption.encrypt(chunkData, encryptionKeyRef.current)
          chunkData = encryptResult.encrypted
          iv = encryptResult.iv
        }

        const chunk: FileChunk = {
          type: 'chunk',
          data: chunkData,
          chunkIndex: i,
          totalChunks: totalChunks,
          fileName: inputFile.name,
          fileSize: inputFile.size,
          timestamp: Date.now(),
          iv: iv
        }

        connectionRef.current.send(chunk)
        
        sendingMetrics.current.bytesTransferred += chunkData.byteLength
        setTransferProgress((i + 1) / totalChunks * 100)

        await new Promise(resolve => setTimeout(resolve, 10))
      }

      const fileEnd: FileEnd = {
        type: 'file-end',
        fileName: inputFile.name
      }
      connectionRef.current.send(fileEnd)

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
    encryptionKeyRef.current = null
    setKeyExchangeComplete(false)
  }

  return (
    <div className="min-h-screen min-w-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100">
      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Header / Hero */}
        <header className="mb-8">
          <div className="flex items-center gap-6 bg-white/4 backdrop-blur-md border border-white/6 rounded-2xl p-6 shadow-lg">
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-white">Encrypted P2P File Transfer</h1>
              <p className="text-sm text-slate-300 mt-1">Peer-to-peer, end-to-end encrypted file sharing — no server storage.</p>
            </div>
            <div className="ml-auto">
              <button 
              onClick={onLogout}
              className="text-sm text-slate-200 bg-white/6 hover:bg-white/10 px-3 py-2 rounded-md">Logout</button>
            </div>
          </div>
        </header>

        {/* Main grid: controls (left) + details/metrics (right) */}
        <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Controls / Transfer area */}
          <section className="lg:col-span-2 bg-white/4 backdrop-blur-md border border-white/6 rounded-2xl p-6 shadow-md">
            {/* Peer ID + status */}
            <div className="mb-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="text-xs text-slate-300">Your Peer ID</div>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="font-mono text-white bg-white/6 px-3 py-2 rounded-md min-w-[220px] truncate">
                      {peerId || 'Connecting...'}
                    </div>
                    <button
                      onClick={() => peerId && navigator.clipboard.writeText(peerId)}
                      disabled={!peerId}
                      className="px-2 py-2 bg-blue-500 text-white text-sm"
                    >
                      Copy
                    </button>

                    <div className="ml-auto flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full ${connectionStatus === 'connected' ? 'bg-emerald-400' : connectionStatus === 'connecting' ? 'bg-yellow-400 animate-pulse' : 'bg-rose-500'}`}></span>
                      <span className="text-sm text-slate-300">{connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1)}</span>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">If Peer ID doesn't appear, check DevTools network and console — PeerJS signalling may be blocked.</p>
                </div>
              </div>
            </div>

            {/* Connection + encryption controls */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="p-4 rounded-lg bg-white/5 border border-white/6">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={encryptionEnabled}
                    onChange={(e) => setEncryptionEnabled(e.target.checked)}
                    disabled={connectionStatus !== 'disconnected'}
                    className="h-4 w-4 rounded"
                  />
                  <div>
                    <div className="text-sm text-white font-medium">Enable Encryption</div>
                    <div className="text-xs text-slate-300">AES-256-GCM for confidentiality and integrity</div>
                  </div>
                </label>
              </div>

              <div className="p-4 rounded-lg bg-white/5 border border-white/6 flex flex-col justify-between">
                <div>
                  <label className="text-sm text-slate-300">Remote Peer ID</label>
                  <input
                    type="text"
                    value={remotePeerId}
                    onChange={(e) => setRemotePeerId(e.target.value)}
                    placeholder="Enter peer ID to connect"
                    className="mt-2 w-full rounded-md px-3 py-2 bg-transparent border border-white/6 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    disabled={connectionStatus === 'connected' || connectionStatus === 'connecting'}
                  />
                </div>

                <div className="mt-4 flex gap-2">
                  {connectionStatus === 'connected' ? (
                    <button onClick={disconnect} className="flex-1 px-4 py-2 rounded-md bg-rose-500 text-white font-semibold hover:opacity-95">Disconnect</button>
                  ) : (
                    <button
                      onClick={connectToPeer}
                      disabled={connectionStatus === 'connecting' || !remotePeerId}
                      className="flex-1 px-4 py-2 rounded-md bg-gradient-to-r bg-blue-500 text-white font-semibold disabled:opacity-50"
                    >
                      {connectionStatus === 'connecting' ? 'Connecting…' : 'Connect'}
                    </button>
                  )}
                  {connectionStatus === 'connecting' && (
                    <button onClick={disconnect} className="px-3 py-2 rounded-md bg-white/6 text-slate-200">Abort</button>
                  )}
                </div>
              </div>
            </div>

            {/* File input card */}
            <div className="mb-6 p-5 rounded-xl bg-gradient-to-br from-white/3 to-white/6 border border-white/6">
              <label className="block text-sm text-slate-200 mb-2">Select File</label>
              <input
                type="file"
                onChange={handleFileChange}
                className="w-full text-sm text-slate-300 file:rounded file:px-4 file:py-2 file:bg-sky-600 file:text-white file:border-0"
              />
              {inputFile && <div className="mt-3 text-sm text-slate-200">Selected: <span className="font-medium">{inputFile.name}</span> • {(inputFile.size / 1024 / 1024).toFixed(2)} MB</div>}
            </div>

            {/* Send / Reset */}
            <div className="flex items-center gap-4 mb-6">
              <button
                onClick={sendFile}
                disabled={!inputFile || connectionStatus !== 'connected' || isTransferring || (encryptionEnabled && !keyExchangeComplete)}
                className="flex-1 px-6 py-3 rounded-full bg-emerald-500 text-white font-semibold shadow-lg hover:scale-[1.01] transition-transform disabled:opacity-50"
              >
                {isTransferring ? 'Sending…' : `Send File${encryptionEnabled ? ' (Encrypted)' : ''}`}
              </button>

              <button onClick={deleteFile} className="px-4 py-3 rounded-full bg-white/6 text-slate-200">Reset</button>
            </div>

            {/* Transfer progress */}
            {isTransferring && (
              <div className="w-full h-3 bg-white/6 rounded-full overflow-hidden">
                <div className="h-3 bg-gradient-to-r from-emerald-400 to-sky-500 transition-all" style={{ width: `${transferProgress}%` }} />
              </div>
            )}
          </section>

          {/* Right: metrics / help panel */}
          <aside className="lg:col-span-1 bg-white/4 backdrop-blur-md border border-white/6 rounded-2xl p-6 shadow-md">
            <div className="mb-4">
              <h3 className="text-white font-semibold">Session</h3>
              <div className="mt-3 text-sm text-slate-300 space-y-2">
                <div><strong className="text-slate-200">Key Exchange:</strong> {keyExchangeComplete ? <span className="text-emerald-400">Complete</span> : <span className="text-yellow-400">Pending</span>}</div>
                <div><strong className="text-slate-200">Encryption:</strong> <span className="text-slate-200">{encryptionEnabled ? 'Enabled' : 'Disabled'}</span></div>
                <div><strong className="text-slate-200">PeerJS:</strong> <span className="text-slate-300">STUN signalling</span></div>
              </div>
            </div>

            <div className="mb-4">
              <h4 className="text-white font-semibold mb-3">Performance</h4>
              {metrics ? (
                <div className="space-y-3 text-sm text-slate-300">
                  <div className="p-3 bg-white/5 rounded-md">
                    <div className="text-xs text-slate-400">Throughput</div>
                    <div className="text-lg font-bold text-white">{metrics.throughput?.toFixed(2)} MB/s</div>
                  </div>
                  <div className="p-3 bg-white/5 rounded-md">
                    <div className="text-xs text-slate-400">Transferred</div>
                    <div className="text-lg font-bold text-white">{(metrics.bytesTransferred / (1024 * 1024)).toFixed(2)} MB</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 bg-white/5 rounded text-xs"><div className="text-slate-400">Avg</div><div className="text-white font-medium">{metrics.averageLatency?.toFixed(1)} ms</div></div>
                    <div className="p-2 bg-white/5 rounded text-xs"><div className="text-slate-400">P95</div><div className="text-white font-medium">{metrics.p95Latency?.toFixed(1)} ms</div></div>
                    <div className="p-2 bg-white/5 rounded text-xs"><div className="text-slate-400">P99</div><div className="text-white font-medium">{metrics.p99Latency?.toFixed(1)} ms</div></div>
                    <div className="p-2 bg-white/5 rounded text-xs"><div className="text-slate-400">Duration</div><div className="text-white font-medium">{((metrics.endTime! - metrics.startTime) / 1000).toFixed(2)}s</div></div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-400">No metrics yet — send a file to see transfer stats.</div>
              )}
            </div>

            <div className="mt-4 text-sm text-slate-400">
              <h4 className="text-white font-semibold mb-2">Quick Guide</h4>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Enable encryption before connecting if desired.</li>
                <li>Share your Peer ID with the recipient.</li>
                <li>Enter remote ID and click Connect.</li>
                <li>Select a file and click Send — recipient downloads automatically.</li>
              </ol>
            </div>
          </aside>
        </main>
      </div>
    </div>
  )
}

export default PeerApp