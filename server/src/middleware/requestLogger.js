import crypto from 'crypto';

export const requestCorrelation = (req, res, next) => {
  const incomingId = req.header('x-request-id');
  const requestId = incomingId || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
};

export default requestCorrelation;
