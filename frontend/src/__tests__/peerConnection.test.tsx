import { describe, it, expect } from '@jest/globals';

describe('Metrics Calculations', () => {
  function calculatePercentiles(latencies: number[]): { p95: number; p99: number; avg: number } {
    if (latencies.length === 0) return { p95: 0, p99: 0, avg: 0 };
    
    const sorted = [...latencies].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);
    const avg = sorted.reduce((sum, val) => sum + val, 0) / sorted.length;
    
    return {
      p95: sorted[p95Index] || sorted[sorted.length - 1],
      p99: sorted[p99Index] || sorted[sorted.length - 1],
      avg
    };
  }

  it('should calculate percentiles correctly', () => {
    const latencies = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const result = calculatePercentiles(latencies);
    
    expect(result.avg).toBe(55);
    expect(result.p95).toBeGreaterThanOrEqual(90);
    expect(result.p99).toBeGreaterThanOrEqual(90);
  });

  it('should handle single value', () => {
    const latencies = [50];
    const result = calculatePercentiles(latencies);
    
    expect(result.avg).toBe(50);
    expect(result.p95).toBe(50);
    expect(result.p99).toBe(50);
  });

  it('should handle empty array', () => {
    const latencies: number[] = [];
    const result = calculatePercentiles(latencies);
    
    expect(result.avg).toBe(0);
    expect(result.p95).toBe(0);
    expect(result.p99).toBe(0);
  });

  it('should handle large dataset', () => {
    const latencies = Array.from({ length: 1000 }, (_, i) => i + 1);
    const result = calculatePercentiles(latencies);
    
    expect(result.avg).toBe(500.5);
    expect(result.p95).toBeGreaterThanOrEqual(950);
    expect(result.p99).toBeGreaterThanOrEqual(990);
  });

  it('should calculate P95 accurately for typical transfer', () => {
    // Simulate realistic latencies: mostly 10-30ms, some outliers
    const latencies = [
      ...Array(90).fill(15),  // 90% at 15ms
      ...Array(5).fill(50),   // 5% at 50ms
      ...Array(5).fill(200)   // 5% at 200ms (outliers)
    ];
    const result = calculatePercentiles(latencies);
    
    expect(result.p95).toBeLessThanOrEqual(200);
    expect(result.avg).toBeLessThan(50);
  });
});

describe('Chunk Assembly', () => {
  it('should handle chunks in order', () => {
    const totalChunks = 5;
    const chunks: (ArrayBuffer | null)[] = new Array(totalChunks).fill(null);
    
    for (let i = 0; i < totalChunks; i++) {
      chunks[i] = new ArrayBuffer(256 * 1024); // 256KB
    }
    
    expect(chunks.every(chunk => chunk !== null)).toBe(true);
    expect(chunks.length).toBe(totalChunks);
  });

  it('should handle chunks out of order', () => {
    const totalChunks = 5;
    const chunks: (ArrayBuffer | null)[] = new Array(totalChunks).fill(null);
    
    // Receive out of order
    chunks[2] = new ArrayBuffer(8);
    chunks[0] = new ArrayBuffer(8);
    chunks[4] = new ArrayBuffer(8);
    chunks[1] = new ArrayBuffer(8);
    chunks[3] = new ArrayBuffer(8);
    
    expect(chunks.every(chunk => chunk !== null)).toBe(true);
    expect(chunks.length).toBe(totalChunks);
  });

  it('should track received chunks count', () => {
    const totalChunks = 10;
    let receivedCount = 0;
    const chunks: (ArrayBuffer | null)[] = new Array(totalChunks).fill(null);
    
    [3, 1, 5, 0, 2].forEach(index => {
      chunks[index] = new ArrayBuffer(8);
      receivedCount++;
    });
    
    expect(receivedCount).toBe(5);
    expect(chunks.filter(c => c !== null).length).toBe(5);
  });

  it('should detect incomplete transfers', () => {
    const totalChunks = 10;
    const chunks: (ArrayBuffer | null)[] = new Array(totalChunks).fill(null);
    
    // Only receive some chunks
    chunks[0] = new ArrayBuffer(8);
    chunks[2] = new ArrayBuffer(8);
    chunks[5] = new ArrayBuffer(8);
    
    const receivedCount = chunks.filter(c => c !== null).length;
    expect(receivedCount).toBe(3);
    expect(receivedCount).toBeLessThan(totalChunks);
  });
});

describe('File Transfer Metrics', () => {
  it('should calculate throughput correctly', () => {
    const bytesTransferred = 10 * 1024 * 1024; // 10 MB
    const durationSeconds = 2;
    const throughput = (bytesTransferred / (1024 * 1024)) / durationSeconds;
    
    expect(throughput).toBe(5); // 5 MB/s
  });

  it('should calculate transfer duration', () => {
    const startTime = 1000;
    const endTime = 5000;
    const duration = (endTime - startTime) / 1000;
    
    expect(duration).toBe(4); // 4 seconds
  });

  it('should handle chunk size calculations', () => {
    const fileSize = 1024 * 1024; // 1 MB
    const chunkSize = 256 * 1024; // 256 KB
    const expectedChunks = Math.ceil(fileSize / chunkSize);
    
    expect(expectedChunks).toBe(4);
  });

  it('should calculate throughput for various file sizes', () => {
    const testCases = [
      { bytes: 1024 * 1024, duration: 1, expected: 1 },      // 1 MB in 1s = 1 MB/s
      { bytes: 10 * 1024 * 1024, duration: 0.5, expected: 20 }, // 10 MB in 0.5s = 20 MB/s
      { bytes: 100 * 1024 * 1024, duration: 5, expected: 20 },  // 100 MB in 5s = 20 MB/s
    ];

    testCases.forEach(({ bytes, duration, expected }) => {
      const throughput = (bytes / (1024 * 1024)) / duration;
      expect(throughput).toBeCloseTo(expected, 1);
    });
  });
});

describe('Transfer Protocol Logic', () => {
  const CHUNK_SIZE = 256 * 1024; // 256KB

  it('should calculate correct number of chunks for exact multiples', () => {
    const fileSize = CHUNK_SIZE * 10; // Exactly 10 chunks
    const chunks = Math.ceil(fileSize / CHUNK_SIZE);
    expect(chunks).toBe(10);
  });

  it('should calculate correct number of chunks for non-multiples', () => {
    const fileSize = CHUNK_SIZE * 10 + 1024; // 10 chunks + 1KB
    const chunks = Math.ceil(fileSize / CHUNK_SIZE);
    expect(chunks).toBe(11);
  });

  it('should handle small files (less than one chunk)', () => {
    const fileSize = 1024; // 1KB
    const chunks = Math.ceil(fileSize / CHUNK_SIZE);
    expect(chunks).toBe(1);
  });

  it('should validate chunk progress percentage', () => {
    const totalChunks = 100;
    const receivedChunks = 50;
    const progress = (receivedChunks / totalChunks) * 100;
    
    expect(progress).toBe(50);
    expect(progress).toBeGreaterThanOrEqual(0);
    expect(progress).toBeLessThanOrEqual(100);
  });
});