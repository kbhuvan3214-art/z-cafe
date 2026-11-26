(() => {
  const $ = id => document.getElementById(id);
  const form = $('reserveForm');
  const guestsInput = $('guests');

  // Local date minimum (fixes UTC timezone off-by-one bug)
  const now = new Date();
  $('date').min = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  $('guestsMinus').onclick = () => { if (+guestsInput.value > 1) guestsInput.value = +guestsInput.value - 1; };
  $('guestsPlus').onclick = () => { if (+guestsInput.value < 10) guestsInput.value = +guestsInput.value + 1; };

  function validate() {
    const checks = [
      ['guest_name', 'error_name', v => v.trim().length > 0, 'Please enter your name'],
      ['email', 'error_email', v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Please enter a valid email'],
      ['phone', 'error_phone', v => v.trim().length >= 8, 'Please enter a valid phone number'],
      ['date', 'error_date', v => !!v, 'Please select a date'],
      ['time', 'error_time', v => !!v, 'Please select a time']
    ];
    let ok = true;
    checks.forEach(([id, errId, fn, msg]) => {
      const valid = fn($(id).value);
      $(errId).textContent = valid ? '' : msg;
      if (!valid) ok = false;
    });
    return ok;
  }

  form.querySelectorAll('input, select, textarea').forEach(el =>
    el.addEventListener('input', () => {
      const err = el.parentElement.querySelector('.reserve-form__error');
      if (err) err.textContent = '';
    })
  );

  form.onsubmit = async e => {
    e.preventDefault();
    if (!validate()) return;

    const btn = $('submitBtn');
    btn.classList.add('is-loading');
    btn.disabled = true;

    try {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guest_name: $('guest_name').value.trim(),
          email: $('email').value.trim(),
          phone: $('phone').value.trim(),
          date: $('date').value,
          time: $('time').value,
          guests: +guestsInput.value,
          special_requests: $('special_requests').value.trim()
        })
      });
      const result = await res.json();
      if (!result.success) return alert(result.error || 'Booking failed.');

      const r = result.reservation;
      const [y, m, d] = r.date.split('-');
      const fDate = new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const [hh, mm] = r.time.split(':');
      const h = +hh;
      const fTime = `${h % 12 || 12}:${mm} ${h >= 12 ? 'PM' : 'AM'}`;

      $('reserveFormWrap').style.display = 'none';
      document.querySelector('.reserve-form-section__info').style.display = 'none';
      $('reserveSuccess').style.display = 'block';
      $('successDetails').innerHTML = [
        ['NAME', r.guest_name], ['DATE', fDate], ['TIME', fTime], ['GUESTS', r.guests], ['TABLE', r.table]
      ].map(([k, v]) => `<div><span class="micro-text">${k}</span><p class="body-text mt-1">${v}</p></div>`).join('');
      $('reserveSuccess').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch {
      alert('Connection error. Please try again.');
    } finally {
      btn.classList.remove('is-loading');
      btn.disabled = false;
    }
  };
})();
