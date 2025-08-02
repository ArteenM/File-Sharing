require('dotenv').config()

const express = require('express')
const app = express()
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

app.use(express.json())

// Gonna need a database for this and user info.
let refreshTokens = []

app.post('/token', (req, res) => {
    const refreshToken = req.body.token
    if (refreshToken == null) return res.sendStatus(401)
    if (!refreshTokens.includes(refreshToken)) return res.sendStatus(403)
    jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, (err, user) => {
    if (err) return res.sendStatus(403)
    const accessToken = generateAccessToken({ user: user.name }) 
    res.json({ accessToken: accessToken })
    })
})

app.delete('/logout', (req, res) => {
    refreshTokens = refreshTokens.filter(token => token !== req.body.token)
    res.sendStatus(204)
})

users = []

app.get('/users', (req, res) => {
    res.json(users)
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


        const user = { name: req.body.username, password: hashedPassword }
        users.push(user)
        res.status(201).send() // Successful 
    }

    catch
    {
        res.status(500).send() // Internal server error
    }
    
})


app.post('/login', async (req, res) => {
    // Make async since using bcrypt to compare passwords.

    const user = users.find(user => user.name === req.body.username)
    if (user == null)
    {
        return res.status(400).send('Cannot find user') // Bad request
    }

    try
    {
        // Use bcrypt to prevent timing attacks in constant time algorithms
        if (await bcrypt.compare(req.body.password, user.password))
        {   const username = req.body.username
            const user = { name: username }

            const accessToken = generateAccessToken(user)
            const refreshToken = jwt.sign(user, process.env.REFRESH_TOKEN_SECRET)
            refreshTokens.push(refreshToken)
            res.status(201).json({ accessToken: accessToken, refreshToken: refreshToken })
        }

        else
        {
            res.status(400).send('Not allowed') // Bad request
        }    
    }

    catch
    {
        res.status(500).send() // Internal server error
    }
})

function generateAccessToken(user)
{
    return jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '10m'})
}
app.listen(4000)