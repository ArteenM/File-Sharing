// database.js
const Database = require('better-sqlite3');
const path = require('path');

// Create or open database file
const db = new Database(path.join(__dirname, 'fileapp.db'));

// Create tables if they don't exist
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
`);

// Prepared statements for better performance
const insertUser = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)');
const findUserByUsername = db.prepare('SELECT * FROM users WHERE username = ?');
const findUserById = db.prepare('SELECT * FROM users WHERE id = ?');
const insertRefreshToken = db.prepare('INSERT INTO refresh_tokens (token, user_id) VALUES (?, ?)');
const findRefreshToken = db.prepare('SELECT * FROM refresh_tokens WHERE token = ?');
const deleteRefreshToken = db.prepare('DELETE FROM refresh_tokens WHERE token = ?');
const getAllUsers = db.prepare('SELECT id, username, created_at FROM users');

// Database functions
const userDb = {
    createUser: (username, hashedPassword) => {
        try {
            const result = insertUser.run(username, hashedPassword);
            return result;
        } catch (error) {
            if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                throw new Error('Username already exists');
            }
            throw error;
        }
    },

    findUser: (username) => {
        try {
            return findUserByUsername.get(username);
        } catch (error) {
            console.error('Error finding user:', error);
            return null;
        }
    },

    findUserById: (id) => {
        try {
            return findUserById.get(id);
        } catch (error) {
            console.error('Error finding user by ID:', error);
            return null;
        }
    },

    getAllUsers: () => {
        try {
            return getAllUsers.all();
        } catch (error) {
            console.error('Error getting all users:', error);
            return [];
        }
    },

    addRefreshToken: (token, userId) => {
        try {
            return insertRefreshToken.run(token, userId);
        } catch (error) {
            console.error('Error adding refresh token:', error);
            throw error;
        }
    },

    validateRefreshToken: (token) => {
        try {
            return findRefreshToken.get(token);
        } catch (error) {
            console.error('Error validating refresh token:', error);
            return null;
        }
    },

    removeRefreshToken: (token) => {
        try {
            return deleteRefreshToken.run(token);
        } catch (error) {
            console.error('Error removing refresh token:', error);
            return null;
        }
    }
};

module.exports = { userDb, db };