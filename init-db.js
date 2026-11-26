const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.VERCEL
  ? path.join('/tmp', 'zcafe.db')
  : path.join(__dirname, 'zcafe.db');

async function initDatabase() {
  const SQL = await initSqlJs({
    locateFile: file => path.join(__dirname, 'node_modules', 'sql.js', 'dist', file)
  });
  const db = fs.existsSync(DB_PATH)
    ? new SQL.Database(fs.readFileSync(DB_PATH))
    : new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_number TEXT UNIQUE NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 2,
      location TEXT DEFAULT 'Garden',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guest_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      guests INTEGER NOT NULL DEFAULT 2,
      table_id INTEGER,
      special_requests TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (table_id) REFERENCES tables(id)
    );
  `);

  if (!queryOne(db, 'SELECT id FROM admin_users WHERE username = ?', ['admin'])) {
    db.run('INSERT INTO admin_users (username, password) VALUES (?, ?)', ['admin', bcrypt.hashSync('zcafe2026', 10)]);
  }

  if (queryOne(db, 'SELECT COUNT(*) as c FROM tables').c === 0) {
    const seeds = [
      ['T1', 2, 'Waterfall View'], ['T2', 2, 'Waterfall View'],
      ['T3', 4, 'Garden'], ['T4', 4, 'Garden'], ['T5', 4, 'Terrace'],
      ['T6', 6, 'Garden'], ['T7', 6, 'Terrace'],
      ['T8', 8, 'Private Alcove'], ['T9', 8, 'Private Alcove'],
      ['T10', 10, 'Banquet Hall']
    ];
    seeds.forEach(t => db.run('INSERT INTO tables (table_number, capacity, location) VALUES (?, ?, ?)', t));
  }

  saveDb(db);
  return db;
}

function queryOne(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function runSql(db, sql, params = []) {
  db.run(sql, params);
  const changes = db.getRowsModified();
  const lid = queryOne(db, 'SELECT last_insert_rowid() as id');
  return { changes, lastId: lid ? lid.id : 0 };
}

function saveDb(db) {
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

module.exports = { initDatabase, queryOne, queryAll, runSql, saveDb };
