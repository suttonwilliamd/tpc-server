const express = require('express');
const path = require('path');

const PORT = 3000;

// Import DB module
const { initGlobalDB, cleanDB: globalCleanDB } = require('./db/database.js');

// Import route modules
const plansRouter = require('./routes/plans.js');
const thoughtsRouter = require('./routes/thoughts.js');
const contextRouter = require('./routes/context.js');
const searchRouter = require('./routes/search.js');

const errorHandler = require('./middleware/errorHandler');

// Global app setup
const globalApp = express();

// Middleware for global app
globalApp.use(express.json());
globalApp.use(express.static(path.join(__dirname, 'public')));

// Mount routers
globalApp.use('/plans', plansRouter);
globalApp.use('/thoughts', thoughtsRouter);
globalApp.use('/context', contextRouter);
globalApp.use('/search', searchRouter);

// Serve tpc.db as binary
globalApp.get('/tpc.db', (req, res) => {
  res.type('application/octet-stream');
  res.sendFile(path.join(__dirname, 'data', 'tpc.db'));
});

// 404 catch-all
globalApp.use((req, res, next) => {
  const err = new Error('Not Found');
  err.status = 404;
  next(err);
});

globalApp.use(errorHandler);

// Initialize global DB and start server if main module
if (require.main === module) {
  initGlobalDB().then(() => {
    globalApp.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  }).catch(console.error);
}

// Factory for creating isolated app (for tests)
async function createApp({ skipMigration = false } = {}) {
  const { initDB, cleanDB: localCleanDB } = require('./db/database.js');

  const dbPath = process.env.NODE_ENV === 'test' ? ':memory:' : path.join(__dirname, 'data', 'tpc.db');
  const localDb = await initDB(dbPath, skipMigration);

  const localApp = express();

  // Set local DB on requests
  localApp.use((req, res, next) => {
    req.db = localDb;
    next();
  });

  // Middleware
  localApp.use(express.json());
  localApp.use(express.static(path.join(__dirname, 'public')));

  // Mount routers (they will use req.db)
  localApp.use('/plans', plansRouter);
  localApp.use('/thoughts', thoughtsRouter);
  localApp.use('/context', contextRouter);
  localApp.use('/search', searchRouter);
  
  // 404 catch-all
  localApp.use((req, res, next) => {
    const err = new Error('Not Found');
    err.status = 404;
    next(err);
  });
  
  localApp.use(errorHandler);

  // Return local cleanDB function
  const clean = () => localCleanDB(localDb);

  return { app: localApp, db: localDb, cleanDB: clean };
}

module.exports = { app: globalApp, cleanDB: globalCleanDB, createApp };