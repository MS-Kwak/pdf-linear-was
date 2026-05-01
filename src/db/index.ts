import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const dbPath = path.resolve(process.env.DB_PATH || './db/pdf-viewer.db');

// db 폴더가 없으면 자동 생성
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// WAL 모드: 동시 읽기 성능 향상
db.pragma('journal_mode = WAL');

// 테이블 초기화
db.exec(`
  CREATE TABLE IF NOT EXISTS pdf_files (
    id          TEXT PRIMARY KEY,
    file_name   TEXT NOT NULL,
    company     TEXT NOT NULL,
    file_path   TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tokens (
    id          TEXT PRIMARY KEY,
    file_id     TEXT NOT NULL,
    token       TEXT NOT NULL UNIQUE,
    expired_at  TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (file_id) REFERENCES pdf_files(id)
  );
`);

export default db;
