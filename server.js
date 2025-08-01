require('dotenv').config()

const express = require('express')
const app = express()
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

app.use(express.json())


const posts = [
    {
        username: 'User1',
        title: 'Post 1'
    },
    {
        username: 'User2',
        title: 'Post 2'
    }
]

app.get('/posts', authenticateToken, async (req, res) => {
    res.json(posts.filter(post => post.username === req.user.name))
})

// This is called a middleware?
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization']
    // Bearer TOKEN
    const token = authHeader && authHeader.split(' ')[1]

    if (token == null) return res.sendStatus(401)

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
        if (err) return res.sendStatus(403) // No longer valid token
        req.user = user
        next()
    })
}
app.listen(3000)