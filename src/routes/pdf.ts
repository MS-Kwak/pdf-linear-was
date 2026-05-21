import { Router, Request, Response } from 'express';
import fs from 'fs';
import { authMiddleware } from '../middleware/auth';
import { getPdfById, getPdfStream } from '../services/pdf';

const router = Router();

function fmtKB(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)}KB`;
}

/**
 * GET /pdf-info/:token
 * 파일 크기와 이름만 빠르게 반환. PDF.js 가 length 옵션으로 사용해
 * "파일 크기 탐색용 초기 GET"(abort되는 200 요청)을 건너뛰도록 한다.
 */
router.get(
  '/info/:token',
  authMiddleware,
  (req: Request, res: Response): void => {
    const { fileId } = req.tokenPayload!;
    const pdfFile = getPdfById(fileId);

    if (!pdfFile) {
      res.status(404).json({ error: 'PDF 파일을 찾을 수 없습니다.' });
      return;
    }

    const { size } = fs.statSync(pdfFile.file_path);
    res.set('Timing-Allow-Origin', '*');
    res.json({
      size,
      fileName: pdfFile.file_name,
    });
  },
);

/**
 * GET /pdf/:token
 * 토큰 검증 후 PDF 스트리밍 (Range Request 지원)
 *
 * Range Request란?
 * 브라우저가 "파일의 0~1000 바이트만 줘" 하고 요청하는 방식.
 * PDF.js가 이걸 활용해서 1페이지에 필요한 부분만 먼저 받아 즉시 표시함.
 */
router.get(
  '/:token',
  authMiddleware,
  (req: Request, res: Response): void => {
    const { fileId } = req.tokenPayload!;
    const pdfFile = getPdfById(fileId);

    if (!pdfFile) {
      res.status(404).json({ error: 'PDF 파일을 찾을 수 없습니다.' });
      return;
    }

    const rangeHeader = req.headers.range;
    const fileNameShort = pdfFile.file_name.replace(/\.pdf$/i, '');
    const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.sss

    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (!match) {
        res.status(416).send('Range Not Satisfiable');
        return;
      }

      const totalSize = fs.statSync(pdfFile.file_path).size;
      const { stream, start, end, fileSize, chunkSize } =
        getPdfStream(pdfFile.file_path, {
          start: parseInt(match[1], 10),
          end: match[2] ? parseInt(match[2], 10) : totalSize - 1,
        });

      console.log(
        `[PDF ${ts}] 206 ${fileNameShort} bytes=${start}-${end} (${fmtKB(chunkSize)} / ${fmtKB(fileSize)} 전체)`,
      );

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'application/pdf',
        // 크로스오리진(웹↔WAS)에서 브라우저가 transferSize·encodedBodySize 같은
        // 타이밍/사이즈 정보를 노출하도록 허용. (StatsOverlay 시연용)
        'Timing-Allow-Origin': '*',
      });

      stream.pipe(res);
    } else {
      const { stream, fileSize } = getPdfStream(pdfFile.file_path);

      console.log(
        `[PDF ${ts}] 200 ${fileNameShort} 전체 다운로드 (${fmtKB(fileSize)})`,
      );

      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'application/pdf',
        'Accept-Ranges': 'bytes',
        'Timing-Allow-Origin': '*',
      });

      stream.pipe(res);
    }
  },
);

export default router;
