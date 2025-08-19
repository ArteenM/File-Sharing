//database.js

const Database = require('better-sqlite3');
const path = require('path');
 

// require('path') fixes differences in how different OS' work with file and directory paths.

const db = new Database(path.join(__dirname, 'users.db'), { verbose: console.log });

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

const insertUser = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)');
const findUser = db.prepare('SELECT * FROM users WHERE username = ?');
const insertToken = db.prepare('INSERT INTO refresh_tokens (token, user_id) VALUES (?, ?)');
const findToken = db.prepare('SELECT * FROM refresh_tokens WHERE token = ?');
const deleteToken = db.prepare('DELETE FROM refresh_tokens WHERE token = ?');
const getAllUsers = db.prepare('SELECT id, username, created_at FROM users');

const userDb = {
    createUser: (username, hashedPassword) => {
        try {
            const result = insertUser.run(username, hashedPassword);
            return result;
        }

        catch (error)
        {
            if (error.code === 'SQLITE_CONSTRAINT_UNIQUE')
            {
                throw new Error('Username already exists');
            }

            throw error;
        }
    },

    findUser: (username) => {
        try
        {
            return findUser.get(username);
        }

        catch (error)
        {
            console.error('Error finding user: ', user);
            return null;
        }
    },

    insertToken: (token, user_id) => {
        try
        {
            return insertToken.run(token, user_id);
        }
        catch (error)
        {
            console.error('Error adding token: ', error);
            throw error;
        }
    },

    findToken: (token) => {
        try
        {
            return findToken.get(token);
        }
        catch (error)
        {
            console.error('Error finding token: ', error);
            return null;
        }
    },

    deleteToken: (token) => {
        try
        {
            return deleteToken.run(token);
        }
        catch (error)
        {
            console.error('Error deleting token: ', error);
            return null;
        }
    },

    getAllUsers: () => {
        try
        {
            return getAllUsers.all();
        }
        catch (error)
        {
            console.error('Error finding all users: ', error);
            return [];
        }
    }
}

module.exports = { userDb, db };