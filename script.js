(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touch = matchMedia('(pointer: coarse)').matches;

  // Reveal on scroll
  const reveals = document.querySelectorAll('.reveal');
  if (reduced) {
    reveals.forEach(el => el.classList.add('is-visible'));
  } else {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.1 });
    reveals.forEach(el => io.observe(el));
  }

  // Mobile menu toggle
  const menuBtn = document.getElementById('menuToggle');
  const navLinks = document.getElementById('navLinks');
  if (menuBtn && navLinks) {
    menuBtn.onclick = () => navLinks.classList.toggle('is-open');
    navLinks.querySelectorAll('a').forEach(a => (a.onclick = () => navLinks.classList.remove('is-open')));
  }

  // Custom cursor (desktop only)
  const cursor = document.querySelector('.cursor');
  if (!touch && cursor) {
    addEventListener('mousemove', e => {
      cursor.style.left = `${e.clientX}px`;
      cursor.style.top = `${e.clientY}px`;
    }, { passive: true });
    document.querySelectorAll('[data-cursor-hover], a, button').forEach(el => {
      el.addEventListener('mouseenter', () => cursor.classList.add('is-hovering'));
      el.addEventListener('mouseleave', () => cursor.classList.remove('is-hovering'));
    });
  }

  // Nav blur & subtle parallax
  const topnav = document.getElementById('topnav');
  const parallaxEls = document.querySelectorAll('[data-parallax]');
  let ticking = false;
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      topnav?.classList.toggle('is-scrolled', scrollY > 50);
      if (!reduced && !touch) {
        parallaxEls.forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.top < innerHeight && r.bottom > 0) {
            const speed = parseFloat(el.dataset.parallax);
            el.style.transform = `translateY(${(r.top + r.height / 2 - innerHeight / 2) * speed}px)`;
          }
        });
      }
      ticking = false;
    });
  }, { passive: true });
})();
