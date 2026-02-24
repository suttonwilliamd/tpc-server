const errorHandler = (err, req, res, next) => {
  const status = err.status || 500;
  let message = err.message;
  if (!message) {
    message = status === 404 ? 'Not Found' : 'Internal Server Error';
  }

  // Handle tool-specific errors with enhanced response
  if (err.name === 'ToolSearchError' ||
      err.name === 'ToolValidationError' ||
      err.name === 'ToolCacheError' ||
      err.name === 'ToolNotFoundError') {
    const response = {
      error: message,
      code: err.code,
      type: err.name,
      timestamp: new Date().toISOString()
    };

    if (err.details) {
      response.details = err.details;
    }

    if (process.env.NODE_ENV === 'development') {
      response.stack = err.stack;
    }

    return res.status(status).json(response);
  }

  if (process.env.NODE_ENV === 'development') {
    res.status(status).json({ error: message, stack: err.stack });
  } else {
    res.status(status).json({ error: message });
  }
};

// Define tool-specific error classes
class ToolNotFoundError extends Error {
  constructor(message, code = 'TOOL_NOT_FOUND') {
    super(message);
    this.name = 'ToolNotFoundError';
    this.code = code;
    this.status = 404;
    this.isOperational = true;
  }
}

class CacheError extends Error {
  constructor(message, code = 'CACHE_ERROR') {
    super(message);
    this.name = 'CacheError';
    this.code = code;
    this.status = 500;
    this.isOperational = true;
  }
}

module.exports = {
  errorHandler,
  ToolNotFoundError,
  CacheError
};