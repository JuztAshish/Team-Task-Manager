import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'task-manager-dev-secret';

export function createToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid authorization token.' });
  }

  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ message: 'Token expired or invalid.' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You are not allowed to perform this action.' });
    }
    return next();
  };
}
