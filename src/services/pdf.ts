import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';

const PDF_DIR = path.resolve(process.env.PDF_STORAGE_PATH || './pdfs');

export interface PdfFile {
  id: string;
  file_name: string;
  company: string;
  file_path: string;
  created_at: string;
}

export function registerPdf(fileName: string, company: string): PdfFile {
  const filePath = path.join(PDF_DIR, fileName);

  if (!fs.existsSync(filePath)) {
    throw new Error(`PDF 파일을 찾을 수 없습니다: ${fileName}`);
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO pdf_files (id, file_name, company, file_path)
    VALUES (?, ?, ?, ?)
  `).run(id, fileName, company, filePath);

  return getPdfById(id)!;
}

export function getPdfById(fileId: string): PdfFile | undefined {
  return db.prepare('SELECT * FROM pdf_files WHERE id = ?').get(fileId) as PdfFile | undefined;
}

export function getAllPdfs(): PdfFile[] {
  return db.prepare('SELECT * FROM pdf_files ORDER BY created_at DESC').all() as PdfFile[];
}

export function getPdfStream(filePath: string, range?: { start: number; end: number }) {
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;

  if (range) {
    const { start, end } = range;
    return {
      stream: fs.createReadStream(filePath, { start, end }),
      start,
      end,
      fileSize,
      chunkSize: end - start + 1,
    };
  }

  return {
    stream: fs.createReadStream(filePath),
    start: 0,
    end: fileSize - 1,
    fileSize,
    chunkSize: fileSize,
  };
}
