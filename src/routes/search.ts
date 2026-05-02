import { Router, Request, Response } from 'express';
import { verifyToken } from '../services/token';
import { searchInFile, hasTextCache, extractAndStoreText } from '../services/textExtractor';
import { getPdfById } from '../services/pdf';

const router = Router();

/**
 * POST /search
 * Body: { token: string, query: string }
 * 응답: { results: [{ pageIndex, matchCount, preview }] }
 *
 * 토큰으로 파일을 식별한 뒤 서버에 저장된 페이지 텍스트에서 검색합니다.
 * iOS Safari 등 클라이언트 PDF 처리 불안정 환경을 위한 대체 검색 수단입니다.
 */
router.post('/search', async (req: Request, res: Response): Promise<void> => {
  const { token, query } = req.body as { token: string; query: string };

  if (!token || typeof query !== 'string') {
    res.status(400).json({ error: 'token과 query가 필요합니다.' });
    return;
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
    return;
  }

  const fileId = payload.fileId;

  // 텍스트 캐시가 없으면 즉시 추출 (기존 파일 대응)
  if (!hasTextCache(fileId)) {
    const pdfFile = getPdfById(fileId);
    if (!pdfFile) {
      res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
      return;
    }
    try {
      await extractAndStoreText(fileId, pdfFile.file_path);
    } catch (err) {
      const message = err instanceof Error ? err.message : '텍스트 추출 실패';
      res.status(500).json({ error: message });
      return;
    }
  }

  const results = searchInFile(fileId, query);
  const totalCount = results.reduce((sum, r) => sum + r.matchCount, 0);

  res.json({
    totalCount,
    results,
  });
});

export default router;
