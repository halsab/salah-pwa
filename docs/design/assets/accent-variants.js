(() => {
  const params = new URLSearchParams(window.location.search);
  document.body.classList.toggle('neutral-preview', params.get('neutral') === '1');

  const frames = document.querySelectorAll('[data-accent-frame]');
  if (!frames.length) return;

  let moment = 'day';
  const neutral = document.getElementById('neutral-preview');
  function updateFrames() {
    const query = new URLSearchParams({ embed: '1', moment });
    if (neutral.checked) query.set('neutral', '1');
    for (const frame of frames) {
      frame.src = `accent-${frame.dataset.accentFrame}.html?${query}`;
    }
  }

  document.querySelectorAll('[data-moment]').forEach(button => {
    button.addEventListener('click', () => {
      moment = button.dataset.moment;
      document.querySelectorAll('[data-moment]').forEach(item => {
        item.setAttribute('aria-pressed', String(item === button));
      });
      updateFrames();
    });
  });
  neutral.addEventListener('change', updateFrames);
})();
