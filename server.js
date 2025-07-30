const express = require('express')
const app = express()
const bcrypt = require('bcrypt')

app.use(express.json())

const users = []

// First Route

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


        const user = { name: req.body.name, password: hashedPassword }
        users.push(user)
        res.status(201).send() // Successful 
    }

    catch
    {
        res.status(500).send() // Internal server error
    }
    
})

app.post('/users/login', async (req, res) => {
    // Make async since using bcrypt to compare passwords.

    const user = users.find(user => user.name = req.body.name)
    if (user == null)
    {
        return res.status(400).send('Cannot find user') // Bad request
    }

    try
    {
        // Use bcrypt to prevent timing attacks in constant time algorithms
        if (await bcrypt.compare(req.body.password, user.password))
        {
            res.status(201).send('Success')
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
app.listen(3000)