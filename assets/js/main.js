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

const limitedDropButton = document.querySelector('[data-add-limited-drop]');

if (limitedDropButton) {
  const catalog = window.BassBingeCatalog;

  function currentDrop() {
    return catalog && catalog.getCurrentDrop
      ? catalog.getCurrentDrop()
      : catalog && catalog.getProduct('heartlander-limited-drop');
  }

  function renderLimitedDrop() {
    const drop = currentDrop();
    const card = document.querySelector('[data-limited-drop-card]');
    if (!drop || !card || !catalog) return;

    const build = catalog.getJigBuild({
      productKey: drop.key,
      colorKey: drop.defaultColorKey,
      weightKey: drop.defaultWeightKey,
      rattleKey: 'no'
    });
    const state = drop.drop && drop.drop.state;
    const canPurchase = build && build.isCheckoutable && (!state || state === 'live');
    const badge = card.querySelector('[data-drop-badge]');
    const image = card.querySelector('[data-drop-image]');
    const title = card.querySelector('[data-drop-title]');
    const description = card.querySelector('[data-drop-description]');
    const price = card.querySelector('[data-drop-price]');

    card.setAttribute('aria-label', drop.title + ' limited drop');
    if (badge) {
      badge.textContent = state === 'sold-out'
        ? 'Sold out'
        : state === 'expired' ? 'Drop ended' : (drop.badgeText || 'Limited-time drop');
    }
    if (image && drop.featuredImage) {
      image.src = catalog.assetPath(drop.featuredImage);
      image.alt = (build && build.productTitle ? build.productTitle : drop.title) +
        (build && build.colorName ? ' in ' + build.colorName : '');
    }
    if (title) title.textContent = drop.title;
    if (description && drop.shortDescription) description.textContent = drop.shortDescription;
    if (price && build) price.textContent = catalog.formatMoney(build.price);
    limitedDropButton.disabled = !canPurchase;
    limitedDropButton.textContent = canPurchase
      ? 'Add to Cart'
      : state === 'expired' ? 'Drop Ended' : state === 'sold-out' ? 'Sold Out' : 'Unavailable';
  }

  if (catalog) {
    Promise.resolve(catalog.ready).then(renderLimitedDrop);
  }

  limitedDropButton.addEventListener('click', () => {
    const cart = window.BassBingeCart;
    const drop = currentDrop();

    if (!cart || !drop) return;

    const build = cart.addJigBuild({
      productKey: drop.key,
      colorKey: drop.defaultColorKey,
      weightKey: drop.defaultWeightKey,
      rattleKey: 'no'
    }, 1);

    if (build) {
      cart.showToast((build.colorName || drop.shortTitle || drop.title) + ' added to cart');
      cart.openCart();
    }
  });
}

const contactForm = document.querySelector('[data-contact-form]');
const formNote = document.querySelector('[data-form-note]');
const contactEmail = 'Bassbingebaits@gmail.com';

if (contactForm && formNote) {
  const submitButton = contactForm.querySelector('button[type="submit"]');

  function buildMailtoUrl() {
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

    return `mailto:${contactEmail}?subject=${subject}&body=${body}`;
  }

  function setFormNote(message, state) {
    formNote.textContent = message;
    formNote.dataset.state = state || '';
  }

  function setSubmitting(isSubmitting) {
    if (!submitButton) {
      return;
    }

    submitButton.disabled = isSubmitting;
    submitButton.textContent = isSubmitting ? 'Sending...' : 'Send Message';
  }

  contactForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!contactForm.reportValidity()) {
      return;
    }

    const formData = new FormData(contactForm);
    const payload = Object.fromEntries(formData.entries());

    setSubmitting(true);
    setFormNote('Sending your message...', 'pending');

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.message || 'Message could not be sent.');
      }

      contactForm.reset();
      setFormNote('Message sent. We will reply as soon as we can.', 'success');
    } catch (error) {
      setFormNote(`We could not send it from the site. Opening your email app, or email ${contactEmail} directly.`, 'error');
      window.location.href = buildMailtoUrl();
    } finally {
      setSubmitting(false);
    }
  });
}
