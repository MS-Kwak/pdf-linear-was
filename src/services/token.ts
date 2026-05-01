import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

export interface TokenPayload {
  fileId: string;
  tokenId: string;
}

export function createToken(fileId: string): { token: string } {
  const tokenId = uuidv4();

  const token = jwt.sign(
    { fileId, tokenId } satisfies TokenPayload,
    JWT_SECRET,
  );

  db.prepare(`
    INSERT INTO tokens (id, file_id, token, expired_at)
    VALUES (?, ?, ?, ?)
  `).run(tokenId, fileId, token, 'never');

  return { token };
}

export function verifyToken(token: string): TokenPayload {
  const payload = jwt.verify(token, JWT_SECRET) as TokenPayload;

  const row = db.prepare('SELECT * FROM tokens WHERE token = ?').get(token);
  if (!row) {
    throw new Error('Token not found');
  }

  return payload;
}
