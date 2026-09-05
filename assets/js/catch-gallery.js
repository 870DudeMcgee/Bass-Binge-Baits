(() => {
  const gallery = document.querySelector('[data-catch-gallery]');
  if (!gallery) return;
  const track = gallery.querySelector('.catch-track');
  const cards = [...gallery.querySelectorAll('[data-catch-photo]')];
  const previous = gallery.querySelector('[data-catch-previous]');
  const next = gallery.querySelector('[data-catch-next]');
  const dialog = gallery.querySelector('[data-catch-dialog]');
  const large = gallery.querySelector('[data-catch-large]');
  let active = 0;
  let originalOverflow;

  const updateControls = () => {
    previous.disabled = track.scrollLeft < 2;
    next.disabled = track.scrollLeft >= track.scrollWidth - track.clientWidth - 2;
  };
  const scroll = (direction) => track.scrollBy({
    left: direction * (cards[1].offsetLeft - cards[0].offsetLeft),
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
  });
  previous.addEventListener('click', () => scroll(-1));
  next.addEventListener('click', () => scroll(1));
  track.addEventListener('scroll', updateControls, { passive: true });
  track.addEventListener('keydown', (event) => {
    if (event.target !== track || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    scroll(event.key === 'ArrowRight' ? 1 : -1);
  });
  new ResizeObserver(updateControls).observe(track);
  gallery.querySelector('[data-catch-controls]').hidden = false;
  updateControls();

  const show = (index) => {
    active = (index + cards.length) % cards.length;
    const photo = cards[active].querySelector('img');
    large.src = photo.src;
    large.alt = photo.alt;
    gallery.querySelector('[data-catch-large-frame]').classList.toggle(
      'catch-photo--letterboxed', photo.parentElement.classList.contains('catch-photo--letterboxed'),
    );
    gallery.querySelector('[data-catch-counter]').textContent = `${active + 1} / ${cards.length}`;
  };
  cards.forEach((card, index) => card.addEventListener('click', (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !dialog.showModal) return;
    event.preventDefault();
    show(index);
    originalOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
  }));
  gallery.querySelector('[data-catch-close]').addEventListener('click', () => dialog.close());
  gallery.querySelector('[data-catch-large-previous]').addEventListener('click', () => show(active - 1));
  gallery.querySelector('[data-catch-large-next]').addEventListener('click', () => show(active + 1));
  dialog.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    show(active + (event.key === 'ArrowRight' ? 1 : -1));
  });
  dialog.addEventListener('click', (event) => {
    const box = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) dialog.close();
  });
  dialog.addEventListener('close', () => { document.body.style.overflow = originalOverflow; });
})();
