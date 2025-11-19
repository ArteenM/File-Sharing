const config = {
  API_URL: window.location.hostname === 'localhost'
    ? 'http://localhost:4000'
    : 'https://p2p-file-transfer-backend.onrender.com'
}

export default config