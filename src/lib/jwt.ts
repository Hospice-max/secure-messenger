import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiIsImtpZCI6ImJhZjRkYTQyZjQ0NGIyOGRhY2RhMmUzZTk0OWY1NTBiIn0.e30.X1PU2ZK1CB_u6KSL1aCSN-8hNu8o9pbZq4bSE9y5BR_0w0-NmKt5bRZXTqfIQKb53doduws86yUXCur5G2dB3w';

export interface JWTPayload {
  userId: string;
  username: string;
  email: string;
}

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch (error) {
    console.error('JWT verification error:', error);
    return null;
  }
}

export function getTokenFromHeaders(headers: Headers): string | null {
  const authHeader = headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}
