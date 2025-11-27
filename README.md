# 🔒 P2P File Transfer

Secure, real-time peer-to-peer file sharing with end-to-end encryption and performance metrics.

[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](YOUR_VERCEL_URL)
[![Tests](https://img.shields.io/badge/tests-passing-success)]()

## ✨ Features

- 🔐 **End-to-End Encryption**: AES-256-GCM with secure key exchange
- 📊 **Real-Time Metrics**: Live throughput, latency percentiles (P95/P99)
- 🚀 **Direct P2P Transfer**: No server storage, WebRTC data channels
- 📱 **Drag & Drop**: Simple file upload interface
- 🔄 **Auto-Download**: Receiver gets file automatically

## 📊 Performance

- **Throughput**: 18-20 MB/s (local network)
- **Latency**: P95 <200ms, P99 <850ms
- **Transfer Times**: 1MB in ~3.6s, 10MB in ~54s

[See full benchmarks →](./TECHNICAL.md)

## 🎯 Technical Highlights

- **Chunking**: 256KB optimal chunk size (4x less overhead than 64KB)
- **Flow Control**: 10ms adaptive pacing for stable throughput
- **Binary Protocol**: Raw ArrayBuffer (40% more efficient than JSON)
- **Authentication**: JWT + bcrypt + SQLite

[See technical details →](./TECHNICAL.md)

## 🚀 Quick Start
```bash
# Clone
git clone YOUR_REPO_URL
cd p2p-file-transfer

# Install
npm install

# Run
npm run dev  # Frontend (port 5173)
npm start    # Backend (port 4000)
```

## 🧪 Testing
```bash
npm test              # Run all tests
npm run benchmark     # Performance tests
```

## 🛠️ Tech Stack

- **Frontend**: React, TypeScript, WebRTC, Tailwind
- **Backend**: Express, SQLite, JWT
- **Deployment**: Vercel + Render
