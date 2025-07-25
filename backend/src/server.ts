import app from "./app";

app.get('/api/health', (req, res) => {
  res.json({ message: 'Server is running!' });
});

const PORT = process.env.PORT

app.listen(PORT, () => {
console.log(`Server running on ${PORT}`);
});
