(() => {
  const params = new URLSearchParams(window.location.search);
  const moments = { morning: '08:30', day: '17:05', evening: '18:30' };
  let moment = Object.hasOwn(moments, params.get('moment')) ? params.get('moment') : 'day';
  const demoDate = '2026-09-10';
  let selectedDate = demoDate;
  const variant = document.body.dataset.variant;
  const root = document.getElementById('mockup');
  if (params.has('embed')) document.body.classList.add('embedded');

  // Времена из утверждённого HTML-эталона; отсчёт охватывает все события дня.
  const events = [
    { label: 'Сухур до', time: '02:49', kind: 'marker', until: 'До конца сухура' },
    { label: 'Фаджр в мечети', time: '03:35', kind: 'jamaat', until: 'До Фаджра в мечети' },
    { label: 'Восход', time: '05:06', kind: 'marker', until: 'До восхода' },
    { label: 'Зенит', time: '11:41', kind: 'marker', until: 'До зенита' },
    { label: 'Зухр', time: '12:00', kind: 'prayer', until: 'До Зухра' },
    { label: 'Аср', time: '16:06', kind: 'prayer', until: 'До Асра' },
    { label: 'Магриб', time: '18:15', kind: 'prayer', until: 'До Магриба' },
    { label: 'Иша', time: '20:04', kind: 'prayer', until: 'До Иши' },
  ];
  const minutes = time => {
    const [hours, mins] = time.split(':').map(Number);
    return hours * 60 + mins;
  };

  function updatePicker() {
    document.querySelectorAll('[data-moment]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.moment === moment));
    });
  }

  function render() {
    if (!root) return;
    const now = minutes(moments[moment]);
    const current = events.filter(event => minutes(event.time) <= now).at(-1);
    const next = events.find(event => minutes(event.time) > now);
    const left = minutes(next.time) - now;
    const remaining = left >= 60 ? `${Math.floor(left / 60)} ч ${left % 60} мин` : `${left} мин`;
    const countdown = `<p class="countdown-label">${next.until}</p><p class="countdown-value">${remaining}</p>`;
    const available = selectedDate === demoDate;
    const dateText = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long' }).format(new Date(`${selectedDate}T12:00:00`));
    const rows = events.map(event => {
      const active = event === current;
      const past = !active && minutes(event.time) <= now;
      return `<li class="event${past ? ' past' : ''}"${active ? ' aria-current="true"' : ''}>
        <span class="event-name"><span class="name-text${event.kind === 'jamaat' ? ' long-name' : ''}">${event.label}</span>${active ? '<small class="current-label">сейчас</small>' : ''}</span>
        <time datetime="${demoDate}T${event.time}:00+03:00">${event.time}</time>
        ${active && variant === '3' ? `<div class="inline-countdown">${countdown}</div>` : ''}
      </li>`;
    }).join('');
    root.innerHTML = `<section class="phone layout-${variant}" aria-label="Главная — вариант ${variant}">
      <div class="status" aria-hidden="true"><span>${moments[moment]}</span><span class="status-icons"><img src="assets/signal.svg" alt=""><img src="assets/wifi.svg" alt=""><img src="assets/battery-full.svg" alt=""></span></div>
      <div class="panel">
        <div class="top-actions">
          <a class="pill" href="location.html" target="_blank" rel="noopener" aria-label="Казань — выбор города в новой вкладке">Казань</a>
          <label class="pill date-control"><span>${dateText}</span><input type="date" aria-label="Дата расписания" value="${selectedDate}" min="2026-01-01" max="2026-12-31"></label>
        </div>
        <div class="content" tabindex="0" aria-label="Расписание дня">
          ${available ? `${variant === '2' ? `<section class="lead-countdown" aria-label="Следующее событие">${countdown}<p class="next-time">в ${next.time}</p></section>` : ''}<ol class="events" aria-label="События 10 сентября">${rows}</ol>` : '<div class="empty" role="status"><p>Нет расписания<br>на эту дату</p><p>Выберите другой день</p><button class="pill" type="button" data-today>Сегодня</button></div>'}
        </div>
        <div class="bottom-actions">${variant === '1' && available ? `<div aria-label="Следующее событие">${countdown}</div>` : ''}<a class="pill" href="settings.html" target="_blank" rel="noopener" aria-label="Настройки в новой вкладке">Настройки</a></div>
      </div>
      <div class="home-indicator" aria-hidden="true"></div>
    </section>`;
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.moment) {
      moment = button.dataset.moment;
      updatePicker();
      render();
      document.querySelectorAll('[data-frame]').forEach(frame => {
        frame.src = `home-variant-${frame.dataset.frame}.html?embed=1&moment=${moment}`;
      });
    }
    if (button.hasAttribute('data-today')) {
      selectedDate = demoDate;
      render();
      root.querySelector('input[type="date"]').focus({ preventScroll: true });
    }
  });
  document.addEventListener('change', event => {
    if (!event.target.matches('input[type="date"]')) return;
    if (!event.target.value || !event.target.validity.valid) {
      event.target.value = selectedDate;
      return;
    }
    selectedDate = event.target.value;
    render();
    root.querySelector('input[type="date"]').focus({ preventScroll: true });
  });
  updatePicker();
  render();
})();
