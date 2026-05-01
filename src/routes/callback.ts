import { Router, Request, Response } from 'express';

const router = Router();

/**
 * POST /callback/mnwise
 * 엠엔와이즈에서 수신여부/열람여부 콜백 수신 (2단계 구현)
 */
router.post('/mnwise', (req: Request, res: Response): void => {
  const { fileId, event, timestamp } = req.body as {
    fileId: string;
    event: string;
    timestamp: string;
  };

  console.log(`[콜백] fileId=${fileId}, event=${event}, timestamp=${timestamp}`);

  // TODO: 2단계에서 DB에 수신/열람 상태 저장
  res.json({ ok: true });
});

export default router;
