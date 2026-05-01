import chokidar from 'chokidar';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import db from '../db';
import { v4 as uuidv4 } from 'uuid';
import { createToken } from './token';

const execFileAsync = promisify(execFile);

const PDF_DIR = path.resolve(process.env.PDF_STORAGE_PATH || './pdfs');
const COMPANY = process.env.COMPANY || 'KB';
const WEB_URL = process.env.WEB_URL || 'http://localhost:3000';
const MNWISE_API_URL = process.env.MNWISE_API_URL || '';
const MNWISE_API_KEY = process.env.MNWISE_API_KEY || '';

interface PdfFileRow { id: string; file_name: string; }

function getOrRegisterFile(filePath: string): string {
  const existing = db.prepare('SELECT id FROM pdf_files WHERE file_path = ?').get(filePath) as PdfFileRow | null;
  if (existing) return existing.id;

  const id = uuidv4();
  db.prepare('INSERT INTO pdf_files (id, file_name, company, file_path) VALUES (?, ?, ?, ?)')
    .run(id, path.basename(filePath), COMPANY, filePath);
  return id;
}

async function linearize(filePath: string): Promise<void> {
  const tmp = filePath + '.tmp';
  try {
    await execFileAsync('qpdf', ['--linearize', filePath, tmp]);
    // 변환 성공 시 원본 교체
    const fs = await import('fs/promises');
    await fs.rename(tmp, filePath);
    console.log(`[watcher] Linearize 완료: ${path.basename(filePath)}`);
  } catch {
    // qpdf 없거나 실패해도 원본으로 계속 진행
    const fs = await import('fs/promises');
    await fs.unlink(tmp).catch(() => {});
    console.log(`[watcher] Linearize 생략 (qpdf 미설치 또는 오류)`);
  }
}

async function handleFile(filePath: string) {
  if (!filePath.endsWith('.pdf')) return;

  const fileName = path.basename(filePath);

  // DB에 없는 새 파일만 Linearize (재시작 시 기존 파일은 이미 변환됨)
  const isNew = !db.prepare('SELECT id FROM pdf_files WHERE file_path = ?').get(filePath);
  if (isNew) await linearize(filePath);

  const fileId = getOrRegisterFile(filePath);

  const { token } = createToken(fileId);
  const url = `${WEB_URL}/view?token=${token}`;

  console.log(`\n📄 ${fileName}`);
  console.log(`   뷰어 URL : ${url}\n`);

  if (MNWISE_API_URL) {
    try {
      const res = await fetch(MNWISE_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${MNWISE_API_KEY}` },
        body: JSON.stringify({ fileName, viewerUrl: url }),
      });
      if (!res.ok) console.error(`[watcher] 엠엔와이즈 오류: ${res.status}`);
      else console.log(`[watcher] 엠엔와이즈 발송 완료`);
    } catch (err) {
      console.error('[watcher] 엠엔와이즈 호출 실패:', err);
    }
  }
}

export function startWatcher() {
  const watcher = chokidar.watch(`${PDF_DIR}/*.pdf`, {
    persistent: true,
    ignoreInitial: false,
  });

  watcher
    .on('add', (filePath) => handleFile(filePath))
    .on('error', (err) => console.error('[watcher] 오류:', err));

  console.log(`[watcher] 감시 시작: ${PDF_DIR}`);
}
