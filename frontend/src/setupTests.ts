// Mock Web Crypto API for tests
import { webcrypto } from 'crypto';

// Only set if not already defined (avoids redeclaration)
if (typeof global.crypto === 'undefined') {
  global.crypto = webcrypto as any;
}

// Mock TextEncoder/TextDecoder
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = require('util').TextEncoder;
}

if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = require('util').TextDecoder;
}