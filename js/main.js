(() => {
  'use strict';

  // Sticky navbar
  const navbar = document.querySelector('.navbar');
  const onScroll = () => {
    if (window.scrollY > 40) navbar.classList.add('scrolled');
    else navbar.classList.remove('scrolled');
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Mobile menu toggle
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => links.classList.toggle('open'));
    links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => links.classList.remove('open')));
  }

  // Active link on scroll
  const sections = document.querySelectorAll('section[id]');
  const navAs = document.querySelectorAll('.nav-links a[href^="#"]');
  const setActive = () => {
    const y = window.scrollY + 120;
    let current = '';
    sections.forEach(s => { if (s.offsetTop <= y) current = s.id; });
    navAs.forEach(a => {
      a.classList.toggle('active', a.getAttribute('href') === '#' + current);
    });
  };
  window.addEventListener('scroll', setActive, { passive: true });

  // Reveal on scroll
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.15 });
  document.querySelectorAll('[data-reveal]').forEach(el => io.observe(el));

  // Animated counters
  const counters = document.querySelectorAll('[data-count]');
  const counterIO = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const target = parseInt(el.dataset.count, 10);
      const suffix = el.dataset.suffix || '';
      const duration = 1400;
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = Math.floor(target * eased).toLocaleString('tr-TR') + suffix;
        if (t < 1) requestAnimationFrame(tick);
        else el.textContent = target.toLocaleString('tr-TR') + suffix;
      };
      requestAnimationFrame(tick);
      counterIO.unobserve(el);
    });
  }, { threshold: 0.4 });
  counters.forEach(c => counterIO.observe(c));

  // Contact form submission (front-end demo)
  const form = document.querySelector('#contact-form');
  if (form) {
    const success = form.querySelector('.form-success');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      // İletişim için WhatsApp deep-link
      const msg = encodeURIComponent(
        `Merhaba, websitenizden ulaşıyorum.\n\n` +
        `Ad Soyad: ${data.name || '-'}\n` +
        `E-posta: ${data.email || '-'}\n` +
        `Telefon: ${data.phone || '-'}\n` +
        `Konu: ${data.subject || '-'}\n\n` +
        `Mesaj:\n${data.message || ''}`
      );
      window.open(`https://wa.me/905325042544?text=${msg}`, '_blank');
      success.classList.add('show');
      form.reset();
      setTimeout(() => success.classList.remove('show'), 6000);
    });
  }

  // Set year in footer
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
