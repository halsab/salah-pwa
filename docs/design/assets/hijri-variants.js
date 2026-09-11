(() => {
  const demoDate = '2026-09-10';
  const firstDate = '2020-01-01';
  const lastDate = '2035-12-31';
  const hijriMonths = ['мухаррам', 'сафар', 'раби аль-авваль', 'раби ас-сани', 'джумада аль-уля', 'джумада ас-сания', 'раджаб', 'шаабан', 'рамадан', 'шавваль', 'зуль-када', 'зуль-хиджа'];
  const compactHijriMonths = ['мухаррам', 'сафар', 'раби I', 'раби II', 'джумада I', 'джумада II', 'раджаб', 'шаабан', 'рамадан', 'шавваль', 'зуль-када', 'зуль-хиджа'];
  const gregorianMonths = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  const hijriFormatter = new Intl.DateTimeFormat('en-GB', { calendar: 'islamic-umalqura', day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC', numberingSystem: 'latn' });
  const gregorianFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  const events = [['Сухур до', '02:49'], ['Фаджр в мечети', '03:35'], ['Восход', '05:06'], ['Зенит', '11:41'], ['Зухр', '12:00'], ['Аср', '16:06'], ['Магриб', '18:15'], ['Иша', '20:04']];
  const initialState = mode => ({ mode, correction: 0, selectedDate: demoDate });
  const sharedState = initialState('hijri');
  const previews = [...document.querySelectorAll('[data-preview]')].map(root => ({
    root,
    screen: root.dataset.screen,
    state: ['cyrillic', 'settings'].includes(root.dataset.preview) ? sharedState : initialState(root.dataset.calendar),
  }));
  const instant = date => new Date(`${date}T12:00:00Z`);
  const shifted = (date, days) => { const value = instant(date); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); };
  const dateIndex = new Map();
  for (let date = shifted(firstDate, -1); date <= shifted(lastDate, 1); date = shifted(date, 1)) {
    const value = instant(date);
    const hijri = Object.fromEntries(hijriFormatter.formatToParts(value).filter(part => ['day', 'month', 'year'].includes(part.type)).map(part => [part.type, Number(part.value)]));
    dateIndex.set(date, { hijri, gregorian: { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() } });
  }
  const pickerCache = new Map();
  function partsFor(state, date, calendar = state.mode) {
    return dateIndex.get(calendar === 'hijri' ? shifted(date, state.correction) : date)[calendar];
  }
  function pickerDates(state) {
    const key = `${state.mode}:${state.mode === 'hijri' ? state.correction : 0}`;
    if (!pickerCache.has(key)) {
      // Храним гражданский день отдельно: поправка меняет хиджру, но не день расписания.
      pickerCache.set(key, [...dateIndex.keys()].filter(date => date >= firstDate && date <= lastDate).map(date => ({ date, ...partsFor(state, date) })));
    }
    return pickerCache.get(key);
  }
  function dateLabel(state) {
    if (state.mode === 'gregorian') return gregorianFormatter.format(instant(state.selectedDate));
    const parts = partsFor(state, state.selectedDate);
    return `${parts.day} ${compactHijriMonths[parts.month - 1]}`;
  }
  const button = (text, action, extra = '', classes = '') => `<button type="button" class="pill ${classes}" data-action="${action}" ${extra}>${text}</button>`;
  function selectRow(name, title, values, selected) {
    const valueLabel = values.find(([value]) => value === selected)[1];
    return `<label class="pill row date-field"><span class="field-title" aria-hidden="true">${title}</span><span class="field-value" aria-hidden="true">${valueLabel}</span><select class="select-field" name="${name}" aria-label="${title}">${values.map(([value, label]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`).join('')}</select></label>`;
  }
  function dateFields(preview) {
    const { state } = preview;
    const parts = partsFor(state, state.selectedDate);
    const dates = pickerDates(state);
    const months = state.mode === 'hijri' ? hijriMonths : gregorianMonths;
    const options = {
      day: dates.filter(date => date.year === parts.year && date.month === parts.month).map(date => date.day),
      month: [...new Set(dates.filter(date => date.year === parts.year).map(date => date.month))],
      year: [...new Set(dates.map(date => date.year))],
    };
    return `<div class="date-fields">${selectRow('calendar', 'Календарь', [['gregorian', 'Григорианский'], ['hijri', 'Хиджра']], state.mode)}${[['day', 'День'], ['month', 'Месяц'], ['year', 'Год']].map(([field, label]) => selectRow(field, label, options[field].map(value => [value, field === 'month' ? months[value - 1] : value]), parts[field])).join('')}${state.mode === 'hijri' ? selectRow('correction', 'Поправка даты', [[-1, '−1 день'], [0, '0'], [1, '+1 день']], state.correction) : ''}</div>`;
  }
  function render(preview) {
    const { state } = preview;
    if (preview.screen === 'source' && preview.root.dataset.footnote) {
      preview.root.querySelector('.mockup').innerHTML = `<iframe title="Расписание · ${preview.root.dataset.footnote} px" src="source.html?mode=official&footnote=${preview.root.dataset.footnote}&embedded=1"></iframe>`;
      return;
    }
    let top, content, bottom = '', contentClass = '';
    if (preview.screen === 'home') {
      top = `<a class="pill location" href="location.html" target="_blank" rel="noopener" aria-label="Казань — выбор города в новой вкладке">Казань</a>${button(`<span class="date-text">${dateLabel(state)}</span>`, 'date', 'aria-label="Выбрать дату"', 'date-button')}`;
      content = state.selectedDate === demoDate ? `<ol class="events" aria-label="Расписание дня">${events.map(([name, time], index) => `<li class="event${index < 5 ? ' past' : ''}"${index === 5 ? ' aria-current="true"' : ''}><span class="event-name">${name}${index === 5 ? '<small class="current-label">сейчас</small>' : ''}</span><time>${time}</time></li>`).join('')}</ol>` : '<div class="empty"><p>Другой день выбран</p><p class="hint">В макете расписание показано только на 10 сентября.</p></div>';
      bottom = `${state.selectedDate === demoDate ? '<div><p class="countdown-label">До Магриба</p><p class="countdown-value">1 ч 10 мин</p></div>' : button('Сегодня', 'today')}${button('Настройки', 'settings')}`;
    } else if (preview.screen === 'date') {
      top = button('Назад', 'home');
      content = dateFields(preview);
      bottom = state.selectedDate !== demoDate ? button('Сегодня', 'today') : '';
    } else if (preview.screen === 'about') {
      top = button('Назад', 'settings');
      contentClass = ' about-content';
      content = '<h1 class="about-title">Салях</h1><p class="about-copy">Время намаза<br>для выбранного места.</p><p class="hint">Версия 0.1.0</p><p class="hint">Дата хиджры рассчитывается по календарю Умм аль-Кура.</p>';
    } else {
      top = button('Назад', 'home');
      contentClass = ' menu-content';
      const sourceRow = '<span>Расписание</span><span class="hint">ДУМ РТ</span>';
      const footnoteQuery = preview.root.dataset.footnote ? `&footnote=${preview.root.dataset.footnote}` : '';
      content = `<div class="stack">${preview.root.dataset.footnote ? button(sourceRow, 'source', '', 'row') : `<a class="pill row" href="source.html" target="_blank" rel="noopener">${sourceRow}</a>`}<a class="pill row wrap" href="settings.html?screen=privacy${footnoteQuery}" target="_blank" rel="noopener">Данные и конфиденциальность</a>${button('О приложении', 'about', '', 'row')}</div>`;
      bottom = '<a class="pill" href="share.html" target="_blank" rel="noopener">Поделиться</a>';
    }
    preview.root.querySelector('.mockup').innerHTML = `<section class="phone layout-1" aria-label="${preview.root.querySelector('h2').textContent}"><div class="status" aria-hidden="true"><span>17:05</span><span class="status-icons"><img src="assets/signal.svg" alt=""><img src="assets/wifi.svg" alt=""><img src="assets/battery-full.svg" alt=""></span></div><div class="panel"><div class="top-actions">${top}</div><div class="content${contentClass}">${content}</div>${bottom ? `<div class="bottom-actions${preview.screen === 'date' ? ' picker-actions' : ''}">${bottom}</div>` : ''}</div><div class="home-indicator" aria-hidden="true"></div></section>`;
  }
  function renderAll(preview, selector) {
    previews.forEach(render);
    if (preview && selector) preview.root.querySelector(selector)?.focus({ preventScroll: true });
  }
  function showView(view) {
    document.querySelector('.hijri-board').classList.toggle('show-settings', view === 'settings');
    document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
    previews.forEach(preview => {
      preview.root.hidden = preview.root.dataset.preview === 'settings' ? view !== 'settings' : preview.root.dataset.preview.endsWith('-picker') && view === 'settings';
    });
  }
  document.addEventListener('click', event => {
    const screenChoice = event.target.closest('[data-screen-choice]');
    if (screenChoice) {
      document.querySelectorAll('[data-screen-choice]').forEach(button => button.setAttribute('aria-pressed', String(button === screenChoice)));
      previews.forEach(preview => { preview.screen = screenChoice.dataset.screenChoice; });
      renderAll();
      return;
    }
    if (event.target.closest('[data-view]')) {
      showView(event.target.closest('[data-view]').dataset.view);
      return;
    }
    if (event.target.closest('[data-reset]')) {
      previews.forEach(preview => {
        Object.assign(preview.state, initialState(preview.root.dataset.calendar));
        preview.screen = preview.root.dataset.screen;
      });
      renderAll();
      return;
    }
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const preview = previews.find(item => item.root.contains(target));
    if (!preview) return;
    const { state } = preview;
    const action = target.dataset.action;
    let selector = '[data-action="date"]';
    if (['home', 'settings', 'about', 'source'].includes(action)) {
      if (action === 'settings') selector = preview.screen === 'about' ? '[data-action="about"]' : '[data-action="home"]';
      if (action === 'about') selector = '[data-action="settings"]';
      preview.screen = action;
    }
    if (action === 'date') { preview.screen = 'date'; selector = '[data-action="home"]'; }
    if (action === 'today') {
      state.selectedDate = demoDate;
      if (preview.screen === 'date') selector = 'select[name="day"]';
    }
    renderAll(preview, selector);
  });
  document.addEventListener('change', event => {
    const input = event.target;
    if (!input.matches('.date-field select')) return;
    const preview = previews.find(item => item.root.contains(input));
    if (input.name === 'calendar') {
      preview.state.mode = input.value;
      renderAll(preview, 'select[name="calendar"]');
      return;
    }
    if (input.name === 'correction') {
      preview.state.correction = Number(input.value);
      renderAll(preview, 'select[name="correction"]');
      return;
    }
    const desired = { ...partsFor(preview.state, preview.state.selectedDate), [input.name]: Number(input.value) };
    const yearDates = pickerDates(preview.state).filter(date => date.year === desired.year);
    desired.month = Math.max(yearDates[0].month, Math.min(desired.month, yearDates.at(-1).month));
    const monthDates = yearDates.filter(date => date.month === desired.month);
    // При смене месяца или года сохраняем день, если он существует, иначе берём ближайший допустимый.
    const day = Math.max(monthDates[0].day, Math.min(desired.day, monthDates.at(-1).day));
    preview.state.selectedDate = monthDates.find(date => date.day === day).date;
    renderAll(preview, `select[name="${input.name}"]`);
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.target.matches('select')) return;
    const preview = previews.find(item => item.root.contains(event.target));
    if (preview?.screen === 'date') { preview.screen = 'home'; renderAll(preview, '[data-action="date"]'); }
  });
  renderAll();
})();
