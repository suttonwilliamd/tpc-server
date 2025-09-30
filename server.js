const express = require('express');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data', 'thoughts.json');

app.use(express.json());

async function readThoughts() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function writeThoughts(thoughts) {
  await fs.writeFile(DATA_FILE, JSON.stringify(thoughts, null, 2));
}

// POST /thoughts
app.post('/thoughts', async (req, res) => {
  const { content } = req.body;

  if (!content || content.trim() === '') {
    return res.status(400).json({ error: 'Content is required and cannot be empty' });
  }

  try {
    const thoughts = await readThoughts();
    const id = thoughts.length + 1;
    const timestamp = new Date().toISOString();
    const newThought = { id: id.toString(), content, timestamp };

    thoughts.push(newThought);
    await writeThoughts(thoughts);

    res.status(201).json(newThought);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Temporary GET /thoughts for testing persistence
app.get('/thoughts', async (req, res) => {
  try {
    const thoughts = await readThoughts();
    res.status(200).json(thoughts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;