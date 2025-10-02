const errorHandler = (err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  let message = err.message;
  if (!message) {
    message = status === 404 ? 'Not Found' : 'Internal Server Error';
  }
  if (process.env.NODE_ENV === 'development') {
    res.status(status).json({ error: message, stack: err.stack });
  } else {
    res.status(status).json({ error: message });
  }
};

module.exports = errorHandler;