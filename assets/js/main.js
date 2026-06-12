const navToggle = document.querySelector('[data-nav-toggle]');
const navLinks = document.querySelector('[data-nav-links]');

if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => {
    const expanded = navToggle.getAttribute('aria-expanded') === 'true';
    navToggle.setAttribute('aria-expanded', String(!expanded));
    navLinks.classList.toggle('open');
  });

  navLinks.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      navToggle.setAttribute('aria-expanded', 'false');
      navLinks.classList.remove('open');
    });
  });
}

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  },
  {
    threshold: 0.16
  }
);

document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

const yearSlot = document.querySelector('[data-year]');
if (yearSlot) {
  yearSlot.textContent = String(new Date().getFullYear());
}

const contactForm = document.querySelector('[data-contact-form]');
const formNote = document.querySelector('[data-form-note]');
const contactEmail = 'Bassbingebaits@gmail.com';

if (contactForm && formNote) {
  contactForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const formData = new FormData(contactForm);
    const subject = encodeURIComponent('Bass Binge contact: ' + (formData.get('topic') || 'Product Question'));
    const body = encodeURIComponent(
      [
        'Name: ' + (formData.get('name') || ''),
        'Email: ' + (formData.get('email') || ''),
        'Phone: ' + (formData.get('phone') || ''),
        'Topic: ' + (formData.get('topic') || ''),
        '',
        String(formData.get('message') || '')
      ].join('\n')
    );

    formNote.textContent = `Opening your email app... You can also email ${contactEmail} directly.`;
    window.location.href = `mailto:${contactEmail}?subject=${subject}&body=${body}`;
  });
}
