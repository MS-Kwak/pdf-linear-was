import { Router, Request, Response } from 'express';
import { createToken } from '../services/token';
import { getPdfById, getAllPdfs, registerPdf } from '../services/pdf';

const router = Router();

const WEB_URL = process.env.WEB_URL || 'http://localhost:3000';

/**
 * POST /issue-url
 * Body: { "fileId": "abc-123" }
 * 뷰어 URL 반환
 */
router.post('/issue-url', (req: Request, res: Response): void => {
  const { fileId } = req.body as { fileId: string };

  if (!fileId) {
    res.status(400).json({ error: 'fileId가 필요합니다.' });
    return;
  }

  const pdfFile = getPdfById(fileId);
  if (!pdfFile) {
    res.status(404).json({ error: '해당 PDF 파일이 없습니다.' });
    return;
  }

  const { token } = createToken(fileId);
  const url = `${WEB_URL}/view?token=${token}`;

  res.json({ url });
});

/**
 * GET /files
 * 등록된 PDF 파일 목록 (개발 편의용)
 */
router.get('/files', (_req: Request, res: Response): void => {
  const files = getAllPdfs();
  res.json(files);
});

/**
 * POST /files/register
 * Body: { "fileName": "sample.pdf", "company": "KB" }
 * pdfs/ 폴더에 있는 PDF를 DB에 등록
 */
router.post('/files/register', (req: Request, res: Response): void => {
  const { fileName, company } = req.body as { fileName: string; company: string };

  if (!fileName || !company) {
    res.status(400).json({ error: 'fileName과 company가 필요합니다.' });
    return;
  }

  try {
    const file = registerPdf(fileName, company);
    res.json(file);
  } catch (err) {
    const message = err instanceof Error ? err.message : '등록 실패';
    res.status(400).json({ error: message });
  }
});

export default router;
