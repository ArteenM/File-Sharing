//authServer.js


require('dotenv').config()

const express = require('express')
const app = express()
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { userDb } = require('./database')
const cors = require('cors')

app.use(express.json())

app.use(cors({
    origin: ['http://localhost:3000', // server.js,
             'http://localhost:4173',
             'https://p2p-file-transfer-puce.vercel.app',
             'https://p2p-file-transfer-arteen-mohammadis-projects.vercel.app',
             'https://p2p-file-transfer-arteenm-arteen-mohammadis-projects.vercel.app',
             'https://p2p-file-transfer-hru5qqqqg-arteen-mohammadis-projects.vercel.app'
    ],
    credentials: true
}))
// Gonna need a database for this and user info.

app.post('/token', (req, res) => {
    const refreshToken = req.body.token
    if (refreshToken == null) return res.sendStatus(401)

    try
    {
        const dupToken = userDb.findToken(refreshToken)
        if (!dupToken) return res.sendStatus(403)

        jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, (err, user) => {
        if (err) return res.sendStatus(403)
        const accessToken = generateAccessToken({ user: user.name, id: user.id }) 
        res.json({ accessToken: accessToken })
        })
    }
    catch (error)
    {
                res.status(500).json({ error: 'Internal server error' })
    }
})

app.delete('/logout', (req, res) => {
    const refreshToken = req.body.token

    try
    {
        if (refreshToken)
        {
            userDb.deleteToken(refreshToken)
        }
    res.sendStatus(204)
    }
    catch (error)
    {
        res.status(500).json({error: 'Logout failed'})
    }
})


app.get('/users', (req, res) => {
    try
    {
        const users = userDb.getAllUsers()
        res.json(users)
    }

    catch (error)
    {
        res.status(500).send('Error fetching users')
    }
})

// Create users

app.post('/users', async (req, res) => {
    try
    {
        // Must await salt since bcrypt is asynchronous.
        const salt = await bcrypt.genSalt()
        const hashedPassword = await bcrypt.hash(req.body.password, salt)


        // Can also do this:
        // const hashedPassword = await bcrypt.hash(req.body.password, 10)
        // genSalt() defaults to 10 rounds, bcrypt.hash can automatically do it for you.

        const result = userDb.createUser(req.body.username, hashedPassword)

        res.status(201).json({ id: result.lastInsertRowid, username: req.body.username }) // Successful 
    }

    catch (error)
    {
        if (error.message === "Username already exists") {
            return res.status(409).send("Username already exists")
        }
        res.status(500).send('Internal server error') 
    }
    
})


app.post('/login', async (req, res) => {
    // Find user
    const user = userDb.findUser(req.body.username)
    
    // Check if user exists FIRST
    if (user == null) {
        return res.status(400).send() // Bad request - user doesn't exist
    }
    
    // Now it's safe to compare passwords
    const comparePass = await bcrypt.compare(req.body.password, user.password)
    
    if (!comparePass) {
        return res.status(400).send() // Bad request - wrong password
    }
    
    try {
        // User exists and password is correct
        const payload = { name: user.username, id: user.id}
        const accessToken = generateAccessToken(payload)
        const refreshToken = jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET)

        userDb.insertToken(refreshToken, user.id)

        res.status(200).json({
            accessToken: accessToken,
            refreshToken: refreshToken,
            user: { id: user.id, username: user.username }
        })
    }
    catch (error) {
        res.status(500).send() // Internal server error
    }
})

function generateAccessToken(user)
{
    return jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '10m'})
}

const PORT = process.env.PORT || 4000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Auth server running on port ${PORT}`);
  });
}

// Export app for testing
module.exports = app;