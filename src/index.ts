import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import pdfRouter from './routes/pdf';
import tokenRouter from './routes/token';
import callbackRouter from './routes/callback';
import { startWatcher } from './services/watcher';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
const WEB_URL = process.env.WEB_URL || 'http://localhost:3000';

// JSON 파싱
app.use(express.json());

// CORS: WEB 서버(Next.js)에서만 접근 허용
app.use(cors({ origin: WEB_URL }));

// 라우터 연결
app.use('/pdf', pdfRouter);
app.use('/', tokenRouter);
app.use('/callback', callbackRouter);

// 헬스체크
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

startWatcher();

app.listen(PORT, () => {
  console.log(`✅ WAS 서버 실행 중: http://localhost:${PORT}`);
  console.log(`   PDF 스트리밍: GET  /pdf/:token`);
  console.log(`   URL 발급:     POST /issue-url`);
  console.log(`   파일 목록:    GET  /files`);
  console.log(`   파일 등록:    POST /files/register`);
});
