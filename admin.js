(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = s => s ? new Date(...s.split('-').map((n, i) => i === 1 ? n - 1 : +n)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const fmtTime = s => { if (!s) return '—'; const [h, m] = s.split(':'); return `${+h % 12 || 12}:${m} ${+h >= 12 ? 'PM' : 'AM'}`; };

  async function api(url, opts = {}) {
    const res = await fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts });
    if (res.status === 401 && !url.includes('/login')) {
      $('loginScreen').style.display = 'flex';
      $('adminDashboard').style.display = 'none';
      throw new Error('Session expired');
    }
    return res.json();
  }

  // Auth
  api('/api/admin/check').then(d => d.authenticated && showDashboard()).catch(() => {});

  $('loginForm').onsubmit = async e => {
    e.preventDefault();
    try {
      const d = await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ username: $('loginUser').value.trim(), password: $('loginPass').value })
      });
      if (d.success) showDashboard();
      else $('loginError').textContent = d.error || 'Login failed';
    } catch { $('loginError').textContent = 'Connection error.'; }
  };

  async function logout() {
    await api('/api/admin/logout', { method: 'POST' });
    $('loginScreen').style.display = 'flex';
    $('adminDashboard').style.display = 'none';
    $('loginForm').reset();
    $('loginError').textContent = '';
  }
  $('logoutBtn').onclick = $('logoutBtnMobile').onclick = logout;

  function showDashboard() {
    $('loginScreen').style.display = 'none';
    $('adminDashboard').style.display = 'flex';
    $('currentDate').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    loadDashboard();
  }

  // Navigation
  const sidebar = $('sidebar');
  $('sidebarToggle').onclick = () => sidebar.classList.toggle('is-open');
  document.querySelectorAll('.sidebar__link').forEach(btn => {
    btn.onclick = () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.sidebar__link').forEach(b => b.classList.toggle('is-active', b === btn));
      document.querySelectorAll('.admin-tab').forEach(t => (t.style.display = t.id === `tab-${tab}` ? 'block' : 'none'));
      sidebar.classList.remove('is-open');
      if (tab === 'dashboard') loadDashboard();
      if (tab === 'reservations') loadReservations();
      if (tab === 'tables') loadTables();
    };
  });

  // Dashboard
  async function loadDashboard() {
    const s = await api('/api/stats');
    $('statTotal').textContent = s.totalReservations;
    $('statToday').textContent = s.todayReservations;
    $('statPending').textContent = s.pendingReservations;
    $('statConfirmed').textContent = s.confirmedToday;
    $('statTables').textContent = s.totalTables;
    $('statCapacity').textContent = s.totalCapacity;

    $('recentTableBody').innerHTML = s.recent.length
      ? s.recent.map(r => `<tr>
          <td>${esc(r.guest_name)}</td><td>${fmtDate(r.date)}</td><td>${fmtTime(r.time)}</td>
          <td>${r.guests}</td><td>${r.table_number ? `${esc(r.table_number)} (${esc(r.location)})` : '—'}</td>
          <td><span class="status-badge status-badge--${r.status}">${r.status}</span></td>
        </tr>`).join('')
      : '<tr><td colspan="6" class="data-table__empty">No reservations yet</td></tr>';
  }

  // Reservations
  async function loadReservations() {
    const q = new URLSearchParams();
    if ($('filterStatus').value !== 'all') q.set('status', $('filterStatus').value);
    if ($('filterDate').value) q.set('date', $('filterDate').value);
    const rows = await api('/api/reservations' + (q.toString() ? `?${q}` : ''));

    $('reservationsTableBody').innerHTML = rows.length
      ? rows.map(r => {
          const btns = [
            r.status === 'pending' ? `<button class="action-btn action-btn--confirm" data-act="status" data-id="${r.id}" data-status="confirmed">Confirm</button>` : '',
            r.status === 'confirmed' ? `<button class="action-btn action-btn--complete" data-act="status" data-id="${r.id}" data-status="completed">Complete</button>` : '',
            ['pending', 'confirmed'].includes(r.status) ? `<button class="action-btn action-btn--cancel" data-act="status" data-id="${r.id}" data-status="cancelled">Cancel</button>` : '',
            `<button class="action-btn action-btn--delete" data-act="del-res" data-id="${r.id}" data-name="${esc(r.guest_name)}">Delete</button>`
          ].join('');
          return `<tr>
            <td>${r.id}</td><td>${esc(r.guest_name)}</td>
            <td><small>${esc(r.email)}<br>${esc(r.phone)}</small></td>
            <td>${fmtDate(r.date)}</td><td>${fmtTime(r.time)}</td><td>${r.guests}</td>
            <td>${r.table_number ? esc(r.table_number) : '—'}</td>
            <td><small>${esc(r.special_requests || '—')}</small></td>
            <td><span class="status-badge status-badge--${r.status}">${r.status}</span></td>
            <td>${btns}</td>
          </tr>`;
        }).join('')
      : '<tr><td colspan="10" class="data-table__empty">No reservations found</td></tr>';
  }

  $('filterBtn').onclick = loadReservations;
  $('clearFilterBtn').onclick = () => { $('filterStatus').value = 'all'; $('filterDate').value = ''; loadReservations(); };

  $('reservationsTableBody').onclick = async e => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    if (b.dataset.act === 'status') {
      await api(`/api/reservations/${b.dataset.id}/status`, { method: 'PUT', body: JSON.stringify({ status: b.dataset.status }) });
      loadReservations();
    } else if (b.dataset.act === 'del-res') {
      showModal('Delete Reservation', `Delete reservation for "${b.dataset.name}"?`, async () => {
        await api(`/api/reservations/${b.dataset.id}`, { method: 'DELETE' });
        loadReservations();
      });
    }
  };

  // Tables
  let cachedTables = [];
  async function loadTables() {
    cachedTables = await api('/api/tables');
    $('tablesGrid').innerHTML = cachedTables.length
      ? cachedTables.map(t => `<div class="table-card${t.is_active ? '' : ' table-card--inactive'}">
          <div class="table-card__header">
            <span class="table-card__number">${esc(t.table_number)}</span>
            <span class="table-card__status"></span>
          </div>
          <div>
            <div class="table-card__info-row"><span>Capacity</span><span>${t.capacity} guests</span></div>
            <div class="table-card__info-row"><span>Location</span><span>${esc(t.location)}</span></div>
            <div class="table-card__info-row"><span>Status</span><span>${t.is_active ? 'Active' : 'Inactive'}</span></div>
          </div>
          <div class="table-card__actions">
            <button class="action-btn action-btn--edit" data-act="edit-tbl" data-id="${t.id}">Edit</button>
            <button class="action-btn action-btn--delete" data-act="del-tbl" data-id="${t.id}" data-num="${esc(t.table_number)}">Delete</button>
          </div>
        </div>`).join('')
      : '<p>No tables configured.</p>';
  }

  $('addTableBtn').onclick = () => {
    $('editTableId').value = '';
    $('tableFormTitle').textContent = 'Add New Table';
    $('tableForm').reset();
    $('tableActive').checked = true;
    $('addTableForm').style.display = 'block';
  };
  $('cancelTableBtn').onclick = () => { $('addTableForm').style.display = 'none'; $('tableForm').reset(); };

  $('tablesGrid').onclick = e => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    if (b.dataset.act === 'edit-tbl') {
      const t = cachedTables.find(x => x.id === +b.dataset.id);
      if (!t) return;
      $('editTableId').value = t.id;
      $('tableFormTitle').textContent = `Edit Table ${t.table_number}`;
      $('tableNumber').value = t.table_number;
      $('tableCapacity').value = t.capacity;
      $('tableLocation').value = t.location;
      $('tableActive').checked = !!t.is_active;
      $('addTableForm').style.display = 'block';
      $('addTableForm').scrollIntoView({ behavior: 'smooth' });
    } else if (b.dataset.act === 'del-tbl') {
      showModal('Delete Table', `Delete table "${b.dataset.num}"?`, async () => {
        await api(`/api/tables/${b.dataset.id}`, { method: 'DELETE' });
        loadTables();
      });
    }
  };

  $('tableForm').onsubmit = async e => {
    e.preventDefault();
    const id = $('editTableId').value;
    const res = await api(id ? `/api/tables/${id}` : '/api/tables', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify({
        table_number: $('tableNumber').value.trim(),
        capacity: +$('tableCapacity').value,
        location: $('tableLocation').value,
        is_active: $('tableActive').checked
      })
    });
    if (res.success) { $('addTableForm').style.display = 'none'; $('tableForm').reset(); loadTables(); }
    else alert(res.error || 'Failed to save table');
  };

  // Modal
  let onConfirm = null;
  function showModal(title, text, fn) {
    $('modalTitle').textContent = title;
    $('modalText').textContent = text;
    onConfirm = fn;
    $('modalOverlay').style.display = 'flex';
  }
  $('modalConfirm').onclick = () => { onConfirm?.(); $('modalOverlay').style.display = 'none'; };
  $('modalCancel').onclick = () => ($('modalOverlay').style.display = 'none');
  $('modalOverlay').onclick = e => { if (e.target === $('modalOverlay')) $('modalOverlay').style.display = 'none'; };
})();
