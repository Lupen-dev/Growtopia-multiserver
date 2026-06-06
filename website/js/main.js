/* =========================================================
   Sarı Hafriyat — Interactions
   Tasarım: Altuncloud — Morina A.Ş.
   ========================================================= */
(function () {
  "use strict";

  const $  = (s, ctx = document) => ctx.querySelector(s);
  const $$ = (s, ctx = document) => Array.from(ctx.querySelectorAll(s));

  /* ---------- Sticky header shadow ---------- */
  const header = $("#header");
  const onScroll = () => {
    if (header) header.classList.toggle("scrolled", window.scrollY > 10);
    if (toTop) toTop.classList.toggle("show", window.scrollY > 600);
  };
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---------- Mobile nav ---------- */
  const nav = $("#nav");
  const toggle = $("#navToggle");
  const closeBtn = $("#navClose");

  const closeNav = () => {
    nav.classList.remove("open");
    document.body.classList.remove("nav-open");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  };
  const openNav = () => {
    nav.classList.add("open");
    document.body.classList.add("nav-open");
    toggle.setAttribute("aria-expanded", "true");
  };

  if (toggle) toggle.addEventListener("click", () =>
    nav.classList.contains("open") ? closeNav() : openNav());
  if (closeBtn) closeBtn.addEventListener("click", closeNav);
  $$(".nav__link, .nav__cta").forEach((l) => l.addEventListener("click", closeNav));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeNav(); });

  /* ---------- Reveal on scroll ---------- */
  const revealEls = $$(".reveal");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const delay = entry.target.dataset.delay || 0;
          entry.target.style.transitionDelay = delay + "ms";
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("in"));
  }

  /* ---------- Animated counters ---------- */
  const counters = $$("[data-count]");
  const runCounter = (el) => {
    const target = parseFloat(el.dataset.count);
    const suffix = el.dataset.suffix || "";
    const dur = 1600;
    const start = performance.now();
    const step = (now) => {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased).toLocaleString("tr-TR") + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  if ("IntersectionObserver" in window) {
    const cio = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { runCounter(e.target); cio.unobserve(e.target); }
      });
    }, { threshold: 0.6 });
    counters.forEach((c) => cio.observe(c));
  } else {
    counters.forEach(runCounter);
  }

  /* ---------- Active nav link on scroll ---------- */
  const sections = $$("section[id]");
  const navLinks = $$(".nav__link");
  const spy = () => {
    const pos = window.scrollY + 120;
    let current = "";
    sections.forEach((sec) => {
      if (pos >= sec.offsetTop) current = sec.id;
    });
    navLinks.forEach((l) =>
      l.classList.toggle("active", l.getAttribute("href") === "#" + current));
  };
  window.addEventListener("scroll", spy, { passive: true });

  /* ---------- Back to top ---------- */
  const toTop = $("#toTop");
  if (toTop) toTop.addEventListener("click", () =>
    window.scrollTo({ top: 0, behavior: "smooth" }));

  /* ---------- Contact form (demo) ---------- */
  const form = $("#contactForm");
  const note = $("#formNote");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("#name").value.trim();
      const phone = $("#phone").value.trim();
      if (name.length < 2 || phone.length < 7) {
        note.textContent = "Lütfen ad ve geçerli bir telefon numarası girin.";
        note.className = "form__note err";
        return;
      }
      const service = $("#service").value;
      const message = encodeURIComponent(
        `Merhaba, ben ${name}. ${service} için teklif almak istiyorum. Tel: ${phone}.` +
        ($("#message").value ? " " + $("#message").value : "")
      );
      note.textContent = "Talebiniz alındı! WhatsApp üzerinden yönlendiriliyorsunuz...";
      note.className = "form__note ok";
      setTimeout(() => {
        window.open("https://wa.me/905555555555?text=" + message, "_blank", "noopener");
      }, 700);
      form.reset();
    });
  }

  /* ---------- Footer year ---------- */
  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  onScroll();
  spy();
})();
