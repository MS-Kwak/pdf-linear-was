import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload } from '../services/token';

// Express Request에 payload 필드 추가
declare global {
  namespace Express {
    interface Request {
      tokenPayload?: TokenPayload;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = req.params.token || req.query.token as string;

  if (!token) {
    res.status(401).json({ error: '토큰이 없습니다.' });
    return;
  }

  try {
    req.tokenPayload = verifyToken(token);
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류';

    if (message.includes('expired')) {
      res.status(401).json({ error: '토큰이 만료되었습니다.' });
    } else {
      res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
    }
  }
}
