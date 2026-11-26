const express = require('express');
const session = require('express-session');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const path = require('path');
const { initDatabase, queryOne, queryAll, runSql, saveDb } = require('./init-db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'zcafe-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(express.static(__dirname));

app.get('/reserve', (_, res) => res.sendFile(path.join(__dirname, 'reserve.html')));
app.get('/admin', (_, res) => res.sendFile(path.join(__dirname, 'admin.html')));

let dbPromise = null;
const getDb = () => (dbPromise ??= initDatabase());

const requireAdmin = (req, res, next) =>
  req.session?.adminId ? next() : res.status(401).json({ error: 'Unauthorized. Please log in.' });

// Auth
app.post('/api/admin/login', async (req, res) => {
  const db = await getDb();
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });
  const user = queryOne(db, 'SELECT * FROM admin_users WHERE username = ?', [username]);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }
  req.session.adminId = user.id;
  req.session.adminUser = user.username;
  res.json({ success: true, username: user.username });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/admin/check', (req, res) =>
  res.json(req.session?.adminId ? { authenticated: true, username: req.session.adminUser } : { authenticated: false })
);

// Public: Create reservation
app.post('/api/reservations', async (req, res) => {
  const db = await getDb();
  const { guest_name, email, phone, date, time, guests, special_requests } = req.body;
  const partySize = parseInt(guests, 10);
  if (!guest_name || !email || !phone || !date || !time || !partySize || partySize < 1 || partySize > 10) {
    return res.status(400).json({ error: 'Please provide valid reservation details (1-10 guests).' });
  }

  const table = queryOne(db,
    `SELECT t.* FROM tables t
     WHERE t.is_active = 1 AND t.capacity >= ?
     AND t.id NOT IN (
       SELECT COALESCE(r.table_id, 0) FROM reservations r
       WHERE r.date = ? AND r.time = ? AND r.status != 'cancelled'
     )
     ORDER BY t.capacity ASC LIMIT 1`,
    [partySize, date, time]
  );

  const { lastId } = runSql(db,
    `INSERT INTO reservations (guest_name, email, phone, date, time, guests, table_id, special_requests, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [guest_name.trim(), email.trim(), phone.trim(), date, time, partySize, table ? table.id : null, (special_requests || '').trim()]
  );
  saveDb(db);

  res.status(201).json({
    success: true,
    reservation: {
      id: lastId,
      guest_name: guest_name.trim(),
      date,
      time,
      guests: partySize,
      table: table ? `${table.table_number} (${table.location})` : 'To be assigned',
      status: 'pending'
    }
  });
});

// Admin: Reservations
app.get('/api/reservations', requireAdmin, async (req, res) => {
  const db = await getDb();
  const { status, date } = req.query;
  const conds = [], params = [];
  if (status && status !== 'all') { conds.push('r.status = ?'); params.push(status); }
  if (date) { conds.push('r.date = ?'); params.push(date); }
  const where = conds.length ? ' WHERE ' + conds.join(' AND ') : '';
  res.json(queryAll(db,
    `SELECT r.*, t.table_number, t.location FROM reservations r
     LEFT JOIN tables t ON r.table_id = t.id${where}
     ORDER BY r.date DESC, r.time DESC`, params));
});

app.put('/api/reservations/:id/status', requireAdmin, async (req, res) => {
  const db = await getDb();
  const { status } = req.body;
  if (!['pending', 'confirmed', 'cancelled', 'completed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }
  const { changes } = runSql(db, 'UPDATE reservations SET status = ? WHERE id = ?', [status, parseInt(req.params.id, 10)]);
  saveDb(db);
  changes ? res.json({ success: true }) : res.status(404).json({ error: 'Reservation not found.' });
});

app.delete('/api/reservations/:id', requireAdmin, async (req, res) => {
  const db = await getDb();
  const { changes } = runSql(db, 'DELETE FROM reservations WHERE id = ?', [parseInt(req.params.id, 10)]);
  saveDb(db);
  changes ? res.json({ success: true }) : res.status(404).json({ error: 'Reservation not found.' });
});

// Tables
app.get('/api/tables', async (_, res) => {
  const db = await getDb();
  res.json(queryAll(db, 'SELECT * FROM tables ORDER BY table_number'));
});

app.post('/api/tables', requireAdmin, async (req, res) => {
  const db = await getDb();
  const { table_number, capacity, location } = req.body;
  if (!table_number || !capacity) return res.status(400).json({ error: 'Table number and capacity are required.' });
  try {
    const { lastId } = runSql(db, 'INSERT INTO tables (table_number, capacity, location) VALUES (?, ?, ?)',
      [table_number.trim(), parseInt(capacity, 10), location || 'Garden']);
    saveDb(db);
    res.status(201).json({ success: true, id: lastId });
  } catch (err) {
    res.status(err.message?.includes('UNIQUE') ? 400 : 500).json({
      error: err.message?.includes('UNIQUE') ? 'Table number already exists.' : 'Failed to add table.'
    });
  }
});

app.put('/api/tables/:id', requireAdmin, async (req, res) => {
  const db = await getDb();
  const { table_number, capacity, location, is_active } = req.body;
  const { changes } = runSql(db,
    'UPDATE tables SET table_number = ?, capacity = ?, location = ?, is_active = ? WHERE id = ?',
    [table_number.trim(), parseInt(capacity, 10), location, is_active ? 1 : 0, parseInt(req.params.id, 10)]);
  saveDb(db);
  changes ? res.json({ success: true }) : res.status(404).json({ error: 'Table not found.' });
});

app.delete('/api/tables/:id', requireAdmin, async (req, res) => {
  const db = await getDb();
  const { changes } = runSql(db, 'DELETE FROM tables WHERE id = ?', [parseInt(req.params.id, 10)]);
  saveDb(db);
  changes ? res.json({ success: true }) : res.status(404).json({ error: 'Table not found.' });
});

// Dashboard stats
app.get('/api/stats', requireAdmin, async (_, res) => {
  const db = await getDb();
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  res.json({
    totalReservations: queryOne(db, 'SELECT COUNT(*) as c FROM reservations').c,
    todayReservations: queryOne(db, 'SELECT COUNT(*) as c FROM reservations WHERE date = ?', [today]).c,
    pendingReservations: queryOne(db, "SELECT COUNT(*) as c FROM reservations WHERE status = 'pending'").c,
    confirmedToday: queryOne(db, "SELECT COUNT(*) as c FROM reservations WHERE date = ? AND status = 'confirmed'", [today]).c,
    totalTables: queryOne(db, 'SELECT COUNT(*) as c FROM tables WHERE is_active = 1').c,
    totalCapacity: queryOne(db, 'SELECT COALESCE(SUM(capacity), 0) as c FROM tables WHERE is_active = 1').c,
    recent: queryAll(db,
      `SELECT r.*, t.table_number, t.location FROM reservations r
       LEFT JOIN tables t ON r.table_id = t.id ORDER BY r.created_at DESC LIMIT 5`)
  });
});

if (require.main === module) {
  getDb().then(() => app.listen(PORT, () => console.log(`Z Cafe server running at http://localhost:${PORT}`)));
}

module.exports = app;
