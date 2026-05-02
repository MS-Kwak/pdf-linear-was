import fs from 'fs/promises';
import db from '../db';

/**
 * PDF 파일의 페이지별 텍스트를 추출해서 DB에 저장합니다.
 * 클라이언트(특히 iOS Safari)에서 텍스트 추출이 불안정하므로
 * 서버에서 한 번만 추출하고, 검색 시 DB를 조회합니다.
 */
export async function extractAndStoreText(
  fileId: string,
  filePath: string,
): Promise<number> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const data = await fs.readFile(filePath);
  const uint8 = new Uint8Array(data);

  const loadingTask = pdfjsLib.getDocument({
    data: uint8,
    useSystemFonts: true,
  });

  const doc = await loadingTask.promise;
  const totalPages = doc.numPages;

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO pdf_pages (file_id, page_index, text)
    VALUES (?, ?, ?)
  `);

  const insertMany = db.transaction((pages: { index: number; text: string }[]) => {
    for (const p of pages) {
      insertStmt.run(fileId, p.index, p.text);
    }
  });

  const pages: { index: number; text: string }[] = [];

  for (let i = 1; i <= totalPages; i++) {
    try {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .filter((it) => 'str' in it && (it as { str: string }).str.length > 0)
        .map((it) => (it as { str: string }).str)
        .join('');
      pages.push({ index: i - 1, text: pageText });
    } catch (err) {
      console.warn(`[textExtractor] 페이지 ${i} 추출 실패:`, err);
      pages.push({ index: i - 1, text: '' });
    }
  }

  insertMany(pages);

  await doc.destroy();

  return totalPages;
}

export interface SearchResult {
  pageIndex: number;
  matchCount: number;
  preview: string;
}

/**
 * 저장된 페이지 텍스트에서 검색어를 찾아 매칭 페이지를 반환합니다.
 */
export function searchInFile(fileId: string, query: string): SearchResult[] {
  if (!query.trim()) return [];

  const lower = query.toLowerCase();

  const rows = db
    .prepare('SELECT page_index, text FROM pdf_pages WHERE file_id = ? ORDER BY page_index')
    .all(fileId) as { page_index: number; text: string }[];

  const results: SearchResult[] = [];

  for (const row of rows) {
    if (!row.text) continue;
    const lowerText = row.text.toLowerCase();

    let count = 0;
    let pos = 0;
    while ((pos = lowerText.indexOf(lower, pos)) !== -1) {
      count++;
      pos++;
    }

    if (count > 0) {
      // 첫 매치 주변의 미리보기 (앞뒤 30자)
      const firstPos = lowerText.indexOf(lower);
      const start = Math.max(0, firstPos - 30);
      const end = Math.min(row.text.length, firstPos + query.length + 30);
      const preview = row.text.slice(start, end).trim();

      results.push({
        pageIndex: row.page_index,
        matchCount: count,
        preview,
      });
    }
  }

  return results;
}

/**
 * 특정 파일의 페이지 텍스트 캐시 존재 여부 확인
 */
export function hasTextCache(fileId: string): boolean {
  const row = db
    .prepare('SELECT COUNT(*) as cnt FROM pdf_pages WHERE file_id = ?')
    .get(fileId) as { cnt: number };
  return row.cnt > 0;
}
