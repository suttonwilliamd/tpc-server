const express = require('express');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data', 'thoughts.json');
const PLANS_FILE = path.join(__dirname, 'data', 'plans.json');

app.use(express.json());

async function readThoughts() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) {
      return [];
    }
    throw error;
  }
}

async function writeThoughts(thoughts) {
  await fs.writeFile(DATA_FILE, JSON.stringify(thoughts, null, 2));
}

async function readPlans() {
  try {
    const data = await fs.readFile(PLANS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) {
      return [];
    }
    throw error;
  }
}

async function writePlans(plans) {
  await fs.writeFile(PLANS_FILE, JSON.stringify(plans, null, 2));
}
// POST /thoughts
app.post('/thoughts', async (req, res) => {
  const { content, plan_id } = req.body;

  if (!content || content.trim() === '') {
    return res.status(400).json({ error: 'Content is required and cannot be empty' });
  }

  try {
    const thoughts = await readThoughts();
    const id = thoughts.length + 1;
    const timestamp = new Date().toISOString();
    const newThought = {
      id: id.toString(),
      content,
      timestamp,
      ...(plan_id && { plan_id })
    };

    thoughts.push(newThought);
    await writeThoughts(thoughts);
    res.status(201).json(newThought);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /plans
app.post('/plans', async (req, res) => {
  const { title, description } = req.body;

  if (!title || title.trim() === '' || !description || description.trim() === '') {
    return res.status(400).json({ error: 'Title and description are required and cannot be empty' });
  }

  try {
    const plans = await readPlans();
    const id = plans.length + 1;
    const timestamp = new Date().toISOString();
    const newPlan = { id, title, description, status: "proposed", timestamp, changelog: [] };

    plans.push(newPlan);
    await writePlans(plans);

    res.status(201).json({ id, title, description, status: "proposed" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Temporary GET /plans/:id for testing
app.get('/plans/:id', async (req, res) => {
  try {
    const plans = await readPlans();
    const plan = plans.find(p => p.id === parseInt(req.params.id));
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    res.status(200).json(plan);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /plans/:id - Update status
app.patch('/plans/:id', async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['proposed', 'in_progress', 'completed'];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Must be one of: proposed, in_progress, completed' });
  }

  try {
    const plans = await readPlans();
    const index = plans.findIndex(p => p.id === parseInt(req.params.id));
    if (index === -1) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    if (status) {
      plans[index].status = status;
    }

    await writePlans(plans);
    res.status(200).json({ status: plans[index].status });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /plans/:id/changelog
app.patch('/plans/:id/changelog', async (req, res) => {
  const { entry } = req.body;

  if (!entry || entry.trim() === '') {
    return res.status(400).json({ error: 'Entry is required and cannot be empty' });
  }

  try {
    const plans = await readPlans();
    const index = plans.findIndex(p => p.id === parseInt(req.params.id));
    if (index === -1) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    if (!plans[index].changelog) {
      plans[index].changelog = [];
    }

    const timestamp = new Date().toISOString();
    plans[index].changelog.push({ timestamp, entry: entry.trim() });

    await writePlans(plans);
    res.status(200).json(plans[index]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /plans
// GET /plans
app.get('/plans', async (req, res) => {
  try {
    const plans = await readPlans();
    plans.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    res.status(200).json(plans);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /plans/:id/thoughts
app.get('/plans/:id/thoughts', async (req, res) => {
  try {
    const plans = await readPlans();
    const plan = plans.find(p => p.id === parseInt(req.params.id));
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    const thoughts = await readThoughts();
    const linkedThoughts = thoughts
      .filter(t => t.plan_id === req.params.id)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    res.status(200).json(linkedThoughts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Temporary GET /thoughts for testing persistence
app.get('/thoughts', async (req, res) => {
  try {
    const thoughts = await readThoughts();
    thoughts.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    res.status(200).json(thoughts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /context
app.get('/context', async (req, res) => {
  try {
    const plans = await readPlans();
    const incompletePlans = plans
      .filter(p => p.status !== 'completed')
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const thoughts = await readThoughts();
    const sortedThoughts = thoughts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const last10Thoughts = sortedThoughts.slice(0, 10);

    res.status(200).json({ incompletePlans, last10Thoughts });
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