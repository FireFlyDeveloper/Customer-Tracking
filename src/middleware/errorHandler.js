module.exports = function errorHandler(err, req, res, next) {
  console.error('[ERROR]', err.stack || err.message || err);

  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const status = err.status || 500;
  const message = err.expose ? err.message : 'Internal server error';

  res.status(status).json({ error: message });
};
