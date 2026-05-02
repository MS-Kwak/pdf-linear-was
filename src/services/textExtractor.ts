import fs from 'fs/promises';
import db from '../db';

interface TextItemData {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

/**
 * PDF 파일의 페이지별 텍스트 아이템(좌표 포함)을 추출해서 DB에 저장합니다.
 * 클라이언트(특히 iOS Safari)에서 텍스트 추출이 불안정하므로
 * 서버에서 한 번만 추출하고, 검색 시 DB를 조회합니다.
 *
 * DB 스키마:
 *   pdf_pages(file_id, page_index, text, items_json)
 *   - text: 전체 페이지 텍스트(이어붙인 문자열, 빠른 매치 확인용)
 *   - items_json: TextItemData[] JSON 직렬화 (하이라이트 좌표 계산용)
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
    INSERT OR REPLACE INTO pdf_pages (file_id, page_index, text, items_json)
    VALUES (?, ?, ?, ?)
  `);

  const insertMany = db.transaction(
    (pages: { index: number; text: string; items: TextItemData[] }[]) => {
      for (const p of pages) {
        insertStmt.run(fileId, p.index, p.text, JSON.stringify(p.items));
      }
    },
  );

  const pages: { index: number; text: string; items: TextItemData[] }[] = [];

  for (let i = 1; i <= totalPages; i++) {
    try {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();

      const items: TextItemData[] = [];
      let fullText = '';

      for (const it of textContent.items) {
        const item = it as {
          str?: string;
          transform?: number[];
          width?: number;
          height?: number;
        };
        if (typeof item.str !== 'string' || item.str.length === 0) continue;

        items.push({
          str: item.str,
          transform: item.transform ?? [0, 0, 0, 0, 0, 0],
          width: item.width ?? 0,
          height: item.height ?? 0,
        });
        fullText += item.str;
      }

      pages.push({ index: i - 1, text: fullText, items });
    } catch (err) {
      console.warn(`[textExtractor] 페이지 ${i} 추출 실패:`, err);
      pages.push({ index: i - 1, text: '', items: [] });
    }
  }

  insertMany(pages);

  await doc.destroy();

  return totalPages;
}

export interface RawMatch {
  transform: number[];
  itemWidth: number;
  itemHeight: number;
  charStart: number;
  charEnd: number;
  strLen: number;
}

export interface SearchResult {
  pageIndex: number;
  matchCount: number;
  preview: string;
  rawMatches: RawMatch[];
}

/**
 * 저장된 페이지 텍스트에서 검색어를 찾아 매칭 페이지 + 하이라이트 좌표를 반환합니다.
 */
export function searchInFile(fileId: string, query: string): SearchResult[] {
  if (!query.trim()) return [];

  const lower = query.toLowerCase();

  const rows = db
    .prepare(
      'SELECT page_index, text, items_json FROM pdf_pages WHERE file_id = ? ORDER BY page_index',
    )
    .all(fileId) as {
    page_index: number;
    text: string;
    items_json: string;
  }[];

  const results: SearchResult[] = [];

  for (const row of rows) {
    if (!row.text) continue;
    const lowerText = row.text.toLowerCase();

    if (!lowerText.includes(lower)) continue;

    let items: TextItemData[] = [];
    try {
      items = JSON.parse(row.items_json) as TextItemData[];
    } catch {
      items = [];
    }

    // 아이템 경계 재계산 (fullText 인덱스 → 아이템 경계)
    const itemRanges: {
      start: number;
      end: number;
      item: TextItemData;
    }[] = [];
    let cursor = 0;
    for (const item of items) {
      const start = cursor;
      cursor += item.str.length;
      itemRanges.push({ start, end: cursor, item });
    }

    const rawMatches: RawMatch[] = [];
    let count = 0;
    let pos = 0;
    let firstPos = -1;

    while ((pos = lowerText.indexOf(lower, pos)) !== -1) {
      count++;
      if (firstPos === -1) firstPos = pos;

      const matchEnd = pos + query.length;

      for (const { start, end, item } of itemRanges) {
        if (end <= pos || start >= matchEnd) continue;

        const charStart = Math.max(0, pos - start);
        const charEnd = Math.min(item.str.length, matchEnd - start);

        rawMatches.push({
          transform: item.transform,
          itemWidth: item.width,
          itemHeight: item.height,
          charStart,
          charEnd,
          strLen: item.str.length,
        });
      }

      pos++;
    }

    // 미리보기
    const start = Math.max(0, firstPos - 30);
    const end = Math.min(row.text.length, firstPos + query.length + 30);
    const preview = row.text.slice(start, end).trim();

    results.push({
      pageIndex: row.page_index,
      matchCount: count,
      preview,
      rawMatches,
    });
  }

  return results;
}

export function hasTextCache(fileId: string): boolean {
  const row = db
    .prepare('SELECT COUNT(*) as cnt FROM pdf_pages WHERE file_id = ?')
    .get(fileId) as { cnt: number };
  return row.cnt > 0;
}
