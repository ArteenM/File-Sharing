// authServer.test.js
const request = require('supertest');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Mock the database module
jest.mock('./database', () => ({
  userDb: {
    createUser: jest.fn(),
    findUser: jest.fn(),
    insertToken: jest.fn(),
    findToken: jest.fn(),
    deleteToken: jest.fn(),
    getAllUsers: jest.fn()
  }
}));

const { userDb } = require('./database');

// Set test environment variables
process.env.ACCESS_TOKEN_SECRET = 'test-access-secret';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret';

// Import app after mocks are set
const app = require('./authServer');

describe('Authentication Server Tests', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /users - User Registration', () => {
    test('should successfully create a new user', async () => {
      userDb.createUser.mockReturnValue({ lastInsertRowid: 1 });

      const response = await request(app)
        .post('/users')
        .send({
          username: 'testuser',
          password: 'testpassword123'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id', 1);
      expect(response.body).toHaveProperty('username', 'testuser');
      expect(userDb.createUser).toHaveBeenCalledTimes(1);
    });

    test('should return 409 for duplicate username', async () => {
      userDb.createUser.mockImplementation(() => {
        throw new Error('Username already exists');
      });

      const response = await request(app)
        .post('/users')
        .send({
          username: 'existinguser',
          password: 'testpassword123'
        });

      expect(response.status).toBe(409);
      expect(response.text).toBe('Username already exists');
    });

    test('should return 500 for internal server error', async () => {
      userDb.createUser.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const response = await request(app)
        .post('/users')
        .send({
          username: 'testuser',
          password: 'testpassword123'
        });

      expect(response.status).toBe(500);
    });
  });

  describe('POST /login - User Login', () => {
    test('should successfully login with valid credentials', async () => {
      const hashedPassword = await bcrypt.hash('testpassword123', 10);
      
      userDb.findUser.mockReturnValue({
        id: 1,
        username: 'testuser',
        password: hashedPassword
      });
      
      userDb.insertToken.mockReturnValue({ lastInsertRowid: 1 });

      const response = await request(app)
        .post('/login')
        .send({
          username: 'testuser',
          password: 'testpassword123'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.username).toBe('testuser');
    });

    test('should return 400 for invalid password', async () => {
      const hashedPassword = await bcrypt.hash('correctpassword', 10);
      
      userDb.findUser.mockReturnValue({
        id: 1,
        username: 'testuser',
        password: hashedPassword
      });

      const response = await request(app)
        .post('/login')
        .send({
          username: 'testuser',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(400);
    });

    test('should return 400 for non-existent user', async () => {
      userDb.findUser.mockReturnValue(null);

      const response = await request(app)
        .post('/login')
        .send({
          username: 'nonexistent',
          password: 'testpassword123'
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /token - Token Refresh', () => {
    test('should successfully refresh access token with valid refresh token', async () => {
      const refreshToken = jwt.sign(
        { name: 'testuser', id: 1 },
        process.env.REFRESH_TOKEN_SECRET
      );

      userDb.findToken.mockReturnValue({
        token: refreshToken,
        user_id: 1
      });

      const response = await request(app)
        .post('/token')
        .send({ token: refreshToken });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('accessToken');
    });

    test('should return 401 if no token provided', async () => {
      const response = await request(app)
        .post('/token')
        .send({});

      expect(response.status).toBe(401);
    });

    test('should return 403 if token not found in database', async () => {
      userDb.findToken.mockReturnValue(null);

      const response = await request(app)
        .post('/token')
        .send({ token: 'invalid-token' });

      expect(response.status).toBe(403);
    });

    test('should return 403 for invalid/expired token', async () => {
      const invalidToken = 'invalid.jwt.token';
      
      userDb.findToken.mockReturnValue({
        token: invalidToken,
        user_id: 1
      });

      const response = await request(app)
        .post('/token')
        .send({ token: invalidToken });

      expect(response.status).toBe(403);
    });
  });

  describe('DELETE /logout - User Logout', () => {
    test('should successfully logout and delete token', async () => {
      userDb.deleteToken.mockReturnValue({ changes: 1 });

      const response = await request(app)
        .delete('/logout')
        .send({ token: 'some-refresh-token' });

      expect(response.status).toBe(204);
      expect(userDb.deleteToken).toHaveBeenCalledWith('some-refresh-token');
    });

    test('should return 204 even if no token provided', async () => {
      const response = await request(app)
        .delete('/logout')
        .send({});

      expect(response.status).toBe(204);
    });
  });

  describe('GET /users - Get All Users', () => {
    test('should successfully retrieve all users', async () => {
      const mockUsers = [
        { id: 1, username: 'user1', created_at: '2024-01-01' },
        { id: 2, username: 'user2', created_at: '2024-01-02' }
      ];

      userDb.getAllUsers.mockReturnValue(mockUsers);

      const response = await request(app).get('/users');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockUsers);
      expect(response.body).toHaveLength(2);
    });

    test('should return 500 on database error', async () => {
      userDb.getAllUsers.mockImplementation(() => {
        throw new Error('Database error');
      });

      const response = await request(app).get('/users');

      expect(response.status).toBe(500);
    });
  });

  describe('JWT Token Generation and Validation', () => {
    test('access token should expire in 10 minutes', () => {
      const payload = { name: 'testuser', id: 1 };
      const token = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '10m' });
      
      const decoded = jwt.decode(token, { complete: true });
      const expiresIn = decoded.payload.exp - decoded.payload.iat;
      
      expect(expiresIn).toBe(600); // 10 minutes = 600 seconds
    });

    test('refresh token should not expire automatically', () => {
      const payload = { name: 'testuser', id: 1 };
      const token = jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET);
      
      const decoded = jwt.decode(token, { complete: true });
      
      expect(decoded.payload.exp).toBeUndefined();
    });
  });

  describe('Password Security', () => {
    test('passwords should be hashed with bcrypt', async () => {
      const password = 'testpassword123';
      const hashedPassword = await bcrypt.hash(password, 10);
      
      expect(hashedPassword).not.toBe(password);
      expect(hashedPassword).toMatch(/^\$2[aby]\$\d{2}\$/); // bcrypt hash format
    });

    test('bcrypt compare should work correctly', async () => {
      const password = 'testpassword123';
      const hashedPassword = await bcrypt.hash(password, 10);
      
      const isMatch = await bcrypt.compare(password, hashedPassword);
      const isNotMatch = await bcrypt.compare('wrongpassword', hashedPassword);
      
      expect(isMatch).toBe(true);
      expect(isNotMatch).toBe(false);
    });
  });
});

// Performance Tests
describe('Performance Benchmarks', () => {
  test('user registration should complete within 500ms', async () => {
    userDb.createUser.mockReturnValue({ lastInsertRowid: 1 });

    const startTime = Date.now();
    
    await request(app)
      .post('/users')
      .send({
        username: 'perftest',
        password: 'testpassword123'
      });
    
    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(500);
  });

  test('login should complete within 500ms', async () => {
    const hashedPassword = await bcrypt.hash('testpassword123', 10);
    
    userDb.findUser.mockReturnValue({
      id: 1,
      username: 'testuser',
      password: hashedPassword
    });
    
    userDb.insertToken.mockReturnValue({ lastInsertRowid: 1 });

    const startTime = Date.now();
    
    await request(app)
      .post('/login')
      .send({
        username: 'testuser',
        password: 'testpassword123'
      });
    
    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(500);
  });
});