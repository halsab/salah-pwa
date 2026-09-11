(() => {
  'use strict';
  const content = {
    good: {
      title: 'О благе в обоих мирах', kind: 'Дуа из Корана', source: 'Аль-Бакара, 2:201', url: 'https://quran.com/2/201',
      comment: 'В этой мольбе соединены просьба о благе в земной и будущей жизни и просьба о защите от Огня. Приведена часть аята, содержащая саму мольбу.',
      parts: [
        ['رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً', 'Раббана атина фид-дунья хасанатан', 'Господь наш! Даруй нам благо в этом мире'],
        ['وَفِي الْآخِرَةِ حَسَنَةً', 'ва филь-ахирати хасанатан', 'и благо в Последней жизни'],
        ['وَقِنَا عَذَابَ النَّارِ', 'ва кына азабан-нар.', 'и убереги нас от мучений Огня.'],
      ],
    },
    musa: {
      title: 'Дуа Мусы', kind: 'Дуа пророков', source: 'Та Ха, 20:25–28', url: 'https://quran.com/20/25-28',
      comment: 'Муса обращается к Аллаху с просьбой облегчить порученное ему дело и сделать его речь понятной. В начале опущено повествовательное «Он сказал»; далее приведена мольба.',
      parts: [
        ['رَبِّ اشْرَحْ لِي صَدْرِي', 'Раббишрах ли садри', 'Господь мой! Раскрой для меня мою грудь,'],
        ['وَيَسِّرْ لِي أَمْرِي', 'ва йассир ли амри', 'облегчи моё дело,'],
        ['وَاحْلُلْ عُقْدَةً مِنْ لِسَانِي', 'вахлюль укдатан мин лисани', 'развяжи узел на моём языке,'],
        ['يَفْقَهُوا قَوْلِي', 'йафкаху каули.', 'чтобы они поняли мою речь.'],
      ],
    },
    yunus: {
      title: 'Дуа Юнуса', kind: 'Дуа пророков', source: 'Аль-Анбия, 21:87', url: 'https://quran.com/21/87',
      comment: 'Мольба Юнуса, приведённая в Коране. Здесь показана часть аята с его обращением к Аллаху.',
      parts: [
        ['لَا إِلَٰهَ إِلَّا أَنْتَ', 'Ля иляха илля анта', 'Нет божества, кроме Тебя.'],
        ['سُبْحَانَكَ إِنِّي كُنْتُ مِنَ الظَّالِمِينَ', 'субханака инни кунту миназ-залимин.', 'Пречист Ты! Воистину, я был из числа несправедливых.'],
      ],
    },
    tarawih: {
      title: 'Тасбих таравиха', kind: 'Традиционный тасбих', source: 'Муфтият Республики Дагестан', url: 'https://muftiyatrd.ru/fatawa/chtenie-tasbiha-na-taravihah',
      comment: 'Один из вариантов тасбиха, приводимый в разъяснении Муфтията РД о перерывах во время таравиха со ссылкой на труды по фикху. Это не аят Корана. Текст и порядок чтения могут различаться по традиции общины.',
      parts: [
        ['سُبْحَانَ ذِي الْمُلْكِ وَالْمَلَكُوتِ', 'Субхана зиль-мульки валь-малякут.', 'Пречист Обладатель власти и царствия.'],
        ['سُبْحَانَ ذِي الْعِزَّةِ وَالْعَظَمَةِ وَالْقُدْرَةِ وَالْكِبْرِيَاءِ وَالْجَبَرُوتِ', 'Субхана зиль-иззати валь-азамати валь-кудрати валь-кибрияи валь-джабарут.', 'Пречист Обладатель могущества, величия, силы, возвышенности и всевластия.'],
        ['سُبْحَانَ الْمَلِكِ الْحَيِّ الَّذِي لَا يَمُوتُ', 'Субханаль-маликиль-хаййиль-лязи ля йамут.', 'Пречист Живой Владыка, Который не умирает.'],
        ['سُبُّوحٌ قُدُّوسٌ رَبُّ الْمَلَائِكَةِ وَالرُّوحِ', 'Суббухун куддусун раббуль-маляикати вар-рух.', 'Пречист и Свят Господь ангелов и Духа.'],
        ['لَا إِلَٰهَ إِلَّا اللَّهُ نَسْتَغْفِرُ اللَّهَ', 'Ля иляха илляллаху настагфируллах.', 'Нет божества, кроме Аллаха. Просим у Аллаха прощения.'],
        ['نَسْأَلُكَ الْجَنَّةَ وَنَعُوذُ بِكَ مِنَ النَّارِ', 'Насалюкаль-джанната ва наузу бика минан-нар.', 'Просим у Тебя Рая и прибегаем к Твоей защите от Огня.'],
      ],
    },
  };
  const dhikrs = [
    { title: 'Тасбих', arabic: 'سُبْحَانَ اللَّهِ', translit: 'Субханаллах', translation: 'Пречист Аллах', target: 33 },
    { title: 'Тахмид', arabic: 'الْحَمْدُ لِلَّهِ', translit: 'Альхамдулиллях', translation: 'Вся хвала Аллаху', target: 33 },
    { title: 'Такбир', arabic: 'اللَّهُ أَكْبَرُ', translit: 'Аллаху акбар', translation: 'Аллах превелик', target: 33 },
    { title: 'Завершающий зикр', arabic: 'لَا إِلَٰهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ', translit: 'Ля иляха илляллаху вахдаху ля шарика ляху, ляхуль-мульку ва ляхуль-хамду ва хува аля кулли шайин кадир.', translation: 'Нет божества, кроме одного Аллаха, у Которого нет сотоварищей. Ему принадлежит власть, Ему — хвала, и Он способен на всякую вещь.', target: 1 },
  ];
  const names = { 1: 'Библиотека', 2: 'По ситуации', 3: 'Личная полка' };
  const scenes = { library: 'Раздел', dua: 'Чтение дуа', dhikr: 'Счётчик зикра', tarawih: 'Таравих', home: 'Вход с главной' };
  const params = new URLSearchParams(location.search);
  let scene = Object.hasOwn(scenes, params.get('scene')) ? params.get('scene') : 'library';
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const pill = (label, action, attrs = '') => `<button type="button" class="pill" data-action="${action}" ${attrs}>${label}</button>`;
  const row = (title, subtitle, action, attrs = '', count = '') => `<button type="button" class="pill row" data-action="${action}" ${attrs}><span><span>${title}</span>${subtitle ? `<span class="hint">${subtitle}</span>` : ''}</span>${count ? `<span class="count">${count}</span>` : ''}</button>`;
  const arabic = text => `<p class="arabic" lang="ar" dir="rtl">${text}</p>`;
  const allDua = ['good', 'musa', 'yunus'];
  const controllers = [];

  function createPrototype(root, variant) {
    const state = { screen: 'library', id: 'good', section: 'dua', category: '', query: '', favorites: new Set(['good']), recent: ['musa'], translation: true, transcription: variant === 2, helper: 'translation', size: 34, step: 0, counts: [0, 0, 0, 0], history: [] };
    let toastTimer;
    const itemRows = ids => ids.map(id => row(content[id].title, content[id].source, 'read', `data-id="${id}"`)).join('');
    const top = (right = pill('Вид', 'settings')) => `<div class="top-actions">${pill(state.screen === 'library' ? 'Главная' : 'Назад', state.screen === 'library' ? 'home' : 'back')}${right}</div>`;
    const scroll = (html, extra = '') => `<div class="content ${extra}" tabindex="0" aria-label="Содержимое экрана">${html}</div>`;
    const footer = html => `<div class="bottom-actions">${html}</div>`;
    const searchButton = () => `<button type="button" class="pill search-launch" data-action="search">Найти дуа или зикр</button>`;
    const categoryRow = (title, subtitle, key, count) => row(title, subtitle, 'category', `data-category="${key}"`, count);
    const saveButton = () => pill(state.favorites.has(state.id) ? 'Сохранено' : 'Сохранить', 'save', `aria-pressed="${state.favorites.has(state.id)}" aria-label="${state.favorites.has(state.id) ? 'Убрать из избранного' : 'Сохранить в избранное'}"`);
    const sourceDetails = item => `<details><summary>Комментарий и источник</summary><p class="reader-copy">${item.comment}</p><a class="source-link" href="${item.url}" target="_blank" rel="noopener noreferrer">${item.source} · открыть</a></details>`;
    const helperToggles = () => `<div class="helper-toggles" role="group" aria-label="Подсказки к чтению">${pill('Перевод', 'translation', `aria-pressed="${state.translation}"`)}${pill('Транскрипция', 'transcription', `aria-pressed="${state.transcription}"`)}</div>`;
    const empty = (title, text) => `<div class="empty-state"><p>${title}</p><p class="hint">${text}</p>${pill('Открыть каталог', 'catalog')}</div>`;

    function catalogue() {
      const categories = state.section === 'dua'
        ? categoryRow('С чего начать', 'Короткие дуа на каждый день', 'start', '3') + categoryRow('Из Корана', 'Мольбы из аятов', 'quran', '3') + categoryRow('Дуа пророков', 'Муса и Юнус', 'prophets', '2')
        : categoryRow('После намаза', 'Тасбих, тахмид, такбир', 'after', '4') + categoryRow('Короткие зикры', 'Чтение и счёт', 'short', '3') + categoryRow('Таравих', 'Традиционный тасбих', 'tarawih', '1');
      return top(pill('Поиск', 'search')) + scroll(`<h1 class="page-title">Дуа и зикры</h1><div class="segments" role="group" aria-label="Раздел каталога">${pill('Дуа', 'section', `data-section="dua" aria-pressed="${state.section === 'dua'}"`)}${pill('Зикры', 'section', `data-section="dhikr" aria-pressed="${state.section === 'dhikr'}"`)}${pill('Избранное', 'section', `data-section="favorites" aria-pressed="${state.section === 'favorites'}"`)}</div>${state.section === 'favorites' ? (state.favorites.size ? `<div class="stack">${itemRows([...state.favorites])}</div>` : empty('Пока ничего нет', 'Сохраняйте нужные тексты кнопкой «Сохранить» на экране чтения.')) : `${searchButton()}<div class="stack">${categories}</div>`}`) + footer(`<p class="hint bottom-note">Арабский · перевод · транскрипция</p>`);
    }

    function library() {
      if (variant === 1) return catalogue();
      if (variant === 2) return top(pill('Каталог', 'catalog')) + scroll(`<h1 class="page-title">Дуа и зикры</h1><section class="context-feature">${arabic('سُبْحَانَ اللَّهِ')}${row('<strong>После намаза</strong>', '33 + 33 + 33 + 1 · со счётчиком', 'dhikr')}</section><h2 class="section-title">Когда читать</h2><div class="occasion-grid">${pill('Утро', 'category', 'data-category="morning"')}${pill('Вечер', 'category', 'data-category="evening"')}${pill('В трудности', 'read', 'data-id="yunus"')}${pill('Рамадан', 'category', 'data-category="tarawih"')}</div><h2 class="section-title">Обратиться с мольбой</h2><div class="quiet-list">${row('О благе в обоих мирах', 'Аль-Бакара, 2:201', 'read', 'data-id="good"')}${row('Дуа пророков', 'Муса и Юнус', 'category', 'data-category="prophets"')}</div>`) + footer(pill('Найти текст', 'search') + pill('Избранное', 'favorites'));
      return top(pill('Каталог', 'catalog')) + scroll(`<div class="shelf-intro"><h1 class="page-title">Дуа и зикры</h1><p class="hint">Ваша подборка для чтения</p></div>${state.favorites.size ? `<h2 class="section-title">Под рукой</h2><button class="shelf-feature" type="button" data-action="read" data-id="${[...state.favorites][0]}"><span class="arabic" lang="ar" dir="rtl">${content[[...state.favorites][0]].parts[0][0]}</span><span class="feature-title">${content[[...state.favorites][0]].title}</span><span class="hint">${content[[...state.favorites][0]].source} · читать</span></button>` : empty('Ваша полка пока пуста', 'Добавляйте сюда дуа из каталога.')}<div class="quiet-list">${row('Зикры после намаза', state.counts.some(Boolean) ? 'Продолжить чтение' : 'Начать чтение', 'dhikr')}${row('Таравих', 'Традиционный тасбих', 'read', 'data-id="tarawih"')}</div><h2 class="section-title">Недавно открывали</h2><div class="quiet-list">${itemRows(state.recent.slice(0, 2))}</div>`) + footer(pill('Все тексты', 'catalog') + pill('Избранное', 'favorites'));
    }

    function collection() {
      const labels = { start: 'С чего начать', quran: 'Из Корана', prophets: 'Дуа пророков', after: 'После намаза', short: 'Короткие зикры', tarawih: 'Таравих', morning: 'Утро', evening: 'Вечер' };
      let body;
      if (state.category === 'tarawih') body = `<div class="tradition-note"><p class="hint">Тексты между ракаатами.<br>Вариант чтения зависит от традиции общины.</p></div><div class="stack">${row('Тасбих таравиха', 'Традиционный текст · 6 фрагментов', 'read', 'data-id="tarawih"')}</div><h2 class="section-title">Источник подборки</h2><p class="reader-copy">Разъяснение Муфтията Республики Дагестан.</p><a class="source-link" href="${content.tarawih.url}" target="_blank" rel="noopener noreferrer">О чтении в перерывах</a>`;
      else if (['after', 'short'].includes(state.category)) body = `<p class="hint subheading">Муслим, 597a · 33 + 33 + 33 + 1</p><div class="stack">${row('Читать последовательно', 'Три коротких зикра и завершающий', 'dhikr')}${dhikrs.slice(0, 3).map((item, i) => row(item.translit, `${item.translation} · ${item.target} раза`, 'dhikr', `data-step="${i}"`)).join('')}</div>`;
      else if (['morning', 'evening'].includes(state.category)) body = `<p class="hint subheading">Пример структуры подборки</p><p class="reader-copy">Специальные утренние и вечерние азкары будут в отдельной подборке.</p><h2 class="section-title">Дуа на любое время</h2><div class="stack">${itemRows(allDua)}</div>`;
      else body = `<p class="hint subheading">${state.category === 'prophets' ? 'Мольбы пророков из Корана' : 'Дуа на каждый день'}</p><div class="stack">${itemRows(state.category === 'prophets' ? ['musa', 'yunus'] : allDua)}</div>`;
      return top(pill('Поиск', 'search')) + scroll(`<h1 class="page-title">${labels[state.category]}</h1>${body}`);
    }

    function reader() {
      const item = content[state.id];
      const fullArabic = item.parts.map(part => part[0]).join(' ');
      const fullTranslation = item.parts.map(part => part[2]).join(' ');
      const fullTranscription = item.parts.map(part => part[1]).join(' ');
      const meta = `<div class="meta"><span class="hint">${item.kind}</span><span class="hint">${state.id === 'tarawih' ? '6 фрагментов' : item.source}</span></div>`;
      const heading = `<h1 class="reader-heading">${item.title}</h1>${meta}`;
      const bottom = footer(saveButton() + pill(state.id === 'tarawih' ? 'К подборке' : 'Следующее', state.id === 'tarawih' ? 'tarawih-list' : 'next-dua'));
      if (variant === 3) {
        const helperBody = state.helper === 'translation' ? fullTranslation : state.helper === 'transcription' ? fullTranscription : state.helper === 'source' ? `${item.comment}<br><a class="source-link" href="${item.url}" target="_blank" rel="noopener noreferrer">${item.source} · открыть</a>` : '';
        return top(pill('Вид', 'settings')) + scroll(`${heading}${arabic(fullArabic)}`, 'focus-reader') + `<section class="focus-helper" aria-label="Помощь в чтении"><div class="segments">${pill('Перевод', 'helper', `data-helper="translation" aria-expanded="${state.helper === 'translation'}" aria-pressed="${state.helper === 'translation'}"`)}${pill('Чтение', 'helper', `data-helper="transcription" aria-label="Транскрипция" aria-expanded="${state.helper === 'transcription'}" aria-pressed="${state.helper === 'transcription'}"`)}${pill('Источник', 'helper', `data-helper="source" aria-expanded="${state.helper === 'source'}" aria-pressed="${state.helper === 'source'}"`)}</div>${helperBody ? `<div class="helper-body" tabindex="0">${state.helper === 'transcription' ? '<span class="copy-label">Транскрипция</span>' : ''}${helperBody}</div>` : ''}</section>${bottom}`;
      }
      const body = variant === 1
        ? `${arabic(fullArabic)}${helperToggles()}${state.translation ? `<p class="reader-copy"><span class="copy-label">Перевод смысла</span>${fullTranslation}</p>` : ''}${state.transcription ? `<p class="reader-copy transcription"><span class="copy-label">Транскрипция</span>${fullTranscription}</p>` : ''}`
        : `${helperToggles()}<div class="lesson">${item.parts.map(part => `<section class="lesson-fragment">${arabic(part[0])}${state.transcription ? `<p class="reader-copy transcription"><span class="copy-label">Транскрипция</span>${part[1]}</p>` : ''}${state.translation ? `<p class="reader-copy"><span class="copy-label">Перевод смысла</span>${part[2]}</p>` : ''}</section>`).join('')}</div>`;
      return top() + scroll(`${heading}${body}${sourceDetails(item)}<p class="hint reader-end">${state.id === 'tarawih' ? 'Традиционный текст · порядок чтения уточняйте в своей общине.' : 'Транскрипция помогает ориентироваться, но не передаёт все арабские звуки.'}</p>`) + bottom;
    }

    function counter() {
      const item = dhikrs[state.step];
      const count = state.counts[state.step];
      const reached = count >= item.target;
      const lastRemaining = dhikrs.every((entry, index) => index === state.step || state.counts[index] >= entry.target);
      return top(pill('Вид', 'settings')) + scroll(`<div class="counter-head"><p class="hint">После намаза</p><p class="hint">${state.step + 1} из 4</p></div><div class="step-track" aria-label="Зикр ${state.step + 1} из 4">${dhikrs.map((_, i) => `<span${i <= state.step ? ' class="done"' : ''}></span>`).join('')}</div><h1 class="reader-heading">${item.title}</h1><p class="hint">Муслим, 597a · ${item.target === 1 ? '1 раз' : '33 раза'}</p><div class="dhikr-copy${state.step === 3 ? ' long' : ''}">${arabic(item.arabic)}${state.transcription ? `<p class="reader-copy transcription">${item.translit}</p>` : ''}${state.translation ? `<p class="reader-copy">${item.translation}</p>` : ''}</div>${variant === 1 ? helperToggles() : ''}<a class="source-link" href="https://sunnah.com/muslim:597a" target="_blank" rel="noopener noreferrer">Хадис и порядок чтения</a>`) + `<div class="counter-zone"><button type="button" class="pill count-button${reached ? '' : ' primary'}" data-action="count" ${reached ? 'disabled' : ''} aria-label="${reached ? 'Зикр прочитан' : 'Засчитать повторение'}"><span class="count-value">${count} / ${item.target}</span><span class="count-label">${reached ? 'Прочитано' : variant === 1 ? 'Считать' : 'Коснитесь после чтения'}</span></button><div class="counter-actions">${pill('Отменить', 'undo', `${count === 0 ? 'disabled' : ''} aria-label="Отменить последнее повторение"`)}${pill(lastRemaining ? 'Завершить' : 'Следующий', 'next-dhikr', reached ? '' : 'disabled')}</div><p class="sr-only" role="status" aria-live="polite" aria-atomic="true">${count} из ${item.target}${reached ? '. Можно продолжить.' : ''}</p></div>`;
    }

    function settings() {
      return top('') + scroll(`<h1 class="page-title">Вид текста</h1><p class="hint subheading">Для всех дуа и зикров</p><div class="setting-row"><span>Размер арабского</span><div class="segments" role="group" aria-label="Размер арабского текста">${[30, 34, 40].map(size => pill(size === 30 ? 'Обычный' : size === 34 ? 'Крупный' : 'Ещё крупнее', 'size', `data-size="${size}" aria-pressed="${state.size === size}"`)).join('')}</div></div>${arabic('رَبِّ اشْرَحْ لِي صَدْرِي')}<div class="setting-row"><span>Подсказки при чтении</span>${helperToggles()}<p class="hint">Арабский оригинал виден всегда. Перевод и транскрипцию можно включить независимо.</p></div><div class="setting-row"><p class="hint">${variant === 3 ? 'В режиме фокуса подсказки открываются снизу по одной. Повторное нажатие сворачивает подсказку.' : 'Выбор применяется ко всем текстам этого макета.'}</p></div>`) + footer(pill('Готово', 'back'));
    }

    function home() {
      const events = [['Сухур до', '02:49'], ['Фаджр в мечети', '03:35'], ['Восход', '05:06'], ['Зенит', '11:41'], ['Зухр', '12:00'], ['Аср', '16:06'], ['Магриб', '18:15'], ['Иша', '20:04']];
      return `<div class="top-actions"><a class="pill" href="location.html">Казань</a><span class="pill">10 сентября</span></div>` + scroll(`<ol class="events home-events">${events.map(([name, time], i) => `<li class="event ${i < 5 ? 'past' : i === 5 ? 'current' : 'future'}"><span>${name}${i === 5 ? '<span class="current-label">сейчас</span>' : ''}</span><time>${time}</time></li>`).join('')}</ol>`) + `<div class="home-footer"><div class="home-countdown"><span class="countdown-label">До Магриба</span><span class="countdown-value">1 ч 10 мин</span></div>${pill('Дуа и зикры', 'library')}<a class="pill" href="settings.html">Настройки</a></div>`;
    }

    function render(preserve = false, focusAction = '') {
      const oldScroll = root.querySelector('.content')?.scrollTop || 0;
      let html;
      switch (state.screen) {
        case 'home': html = home(); break;
        case 'library': html = library(); break;
        case 'catalog': html = catalogue(); break;
        case 'category': html = collection(); break;
        case 'reader': html = reader(); break;
        case 'counter': html = counter(); break;
        case 'settings': html = settings(); break;
        case 'favorites': html = top(pill('Каталог', 'catalog')) + scroll(`<h1 class="page-title">Избранное</h1>${state.favorites.size ? `<div class="stack">${itemRows([...state.favorites])}</div>` : empty('Пока ничего нет', 'Сохраняйте нужные тексты во время чтения.')}`); break;
        case 'search': html = top('') + scroll(`<h1 class="page-title">Поиск</h1><label class="sr-only" for="dua-search-${variant}">Название или слова из текста</label><input id="dua-search-${variant}" class="search-input" type="search" placeholder="Название или слова" value="${escape(state.query)}" autocomplete="off"><div class="search-results" aria-live="polite"></div>`); break;
        case 'complete': html = top(pill('В раздел', 'library')) + scroll(`<div class="completed">${arabic('الْحَمْدُ لِلَّهِ')}<h1 class="page-title">Чтение завершено</h1><p class="hint">Тасбих · тахмид · такбир<br>и завершающий зикр</p><p class="reader-copy">33 + 33 + 33 + 1</p>${pill('Начать заново', 'restart')}${pill('Вернуться к счётчику', 'counter-back')}</div>`); break;
      }
      root.innerHTML = `<section class="phone dua-phone variant-${variant}" style="--arabic-size:${state.size}px" aria-label="${names[variant]}"><div class="status" aria-hidden="true"><span>17:05</span><span class="status-icons"><img src="assets/signal.svg" alt=""><img src="assets/wifi.svg" alt=""><img src="assets/battery-full.svg" alt=""></span></div><div class="panel">${html}</div><div class="home-indicator" aria-hidden="true"></div></section>`;
      if (state.screen === 'search') renderResults();
      if (preserve) root.querySelector('.content')?.scrollTo(0, oldScroll);
      if (focusAction) root.querySelector(`[data-action="${focusAction}"]:not(:disabled)`)?.focus({ preventScroll: true });
    }

    function renderResults() {
      const target = root.querySelector('.search-results');
      const normalize = value => value.toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/[\u064B-\u065F\u0670]/g, '');
      const query = normalize(state.query.trim());
      const aliases = { musa: 'Муса', yunus: 'Юнус', tarawih: 'Таравих Рамадан', good: 'благо' };
      const ids = Object.keys(content).filter(id => normalize([content[id].title, aliases[id], content[id].kind, content[id].source, ...content[id].parts.flat()].join(' ')).includes(query));
      const includeCounter = query && normalize('зикр после намаза тасбих субханаллах альхамдулиллях аллаху акбар').includes(query);
      target.innerHTML = query ? (ids.length || includeCounter ? `<p class="hint">Найдено: ${ids.length + Number(Boolean(includeCounter))}</p><div class="stack search-results">${itemRows(ids)}${includeCounter ? row('Зикры после намаза', 'Читать со счётчиком', 'dhikr') : ''}</div>` : `<div class="empty-state"><p>Ничего не найдено</p><p class="hint">Попробуйте «Муса», «благо» или первые слова на арабском.</p>${pill('Очистить поиск', 'clear-search')}</div>`) : `<p class="hint">Ищите по названию, переводу, транскрипции или арабскому тексту.</p><h2 class="section-title">Можно начать с этого</h2><div class="stack">${itemRows(allDua)}</div>`;
    }

    function navigate(screen, fields = {}) {
      state.history.push({ screen: state.screen, id: state.id, category: state.category, section: state.section, scroll: root.querySelector('.content')?.scrollTop || 0, focus: document.activeElement?.dataset?.action || '' });
      Object.assign(state, fields, { screen });
      render();
      const target = root.querySelector(screen === 'search' ? 'input' : 'h1');
      if (target) { target.tabIndex = screen === 'search' ? 0 : -1; target.focus({ preventScroll: true }); }
    }

    function back() {
      const previous = state.history.pop();
      if (previous) {
        Object.assign(state, { screen: previous.screen, id: previous.id, category: previous.category, section: previous.section });
        render(false, previous.focus);
        root.querySelector('.content')?.scrollTo(0, previous.scroll);
      } else { state.screen = state.screen === 'library' ? 'home' : 'library'; render(); }
    }

    function toast(message) {
      clearTimeout(toastTimer);
      const notice = document.createElement('div');
      notice.className = 'toast'; notice.setAttribute('role', 'status'); notice.textContent = message;
      root.querySelector('.panel').append(notice);
      toastTimer = setTimeout(() => notice.remove(), 1800);
    }

    root.addEventListener('click', event => {
      const button = event.target.closest('[data-action]');
      if (!button || button.disabled) return;
      button.focus({ preventScroll: true });
      const action = button.dataset.action;
      switch (action) {
        case 'back': back(); break;
        case 'home': state.history = []; state.screen = 'home'; render(); root.querySelector('[data-action="library"]')?.focus({ preventScroll: true }); break;
        case 'library': navigate('library'); break;
        case 'catalog': navigate('catalog', { section: 'dua' }); break;
        case 'favorites': navigate('favorites'); break;
        case 'search': navigate('search', { query: '' }); break;
        case 'settings': navigate('settings'); break;
        case 'category': navigate('category', { category: button.dataset.category }); break;
        case 'tarawih-list': navigate('category', { category: 'tarawih' }); break;
        case 'read': {
          const id = button.dataset.id;
          state.recent = [id, ...state.recent.filter(value => value !== id)].slice(0, 3);
          navigate('reader', { id }); break;
        }
        case 'section': state.section = button.dataset.section; render(true); root.querySelector(`[data-section="${state.section}"]`)?.focus({ preventScroll: true }); break;
        case 'translation': case 'transcription': state[action] = !state[action]; if (variant === 3 && action === 'translation') state.helper = state.translation ? 'translation' : ''; render(true, action); break;
        case 'helper': state.helper = state.helper === button.dataset.helper ? '' : button.dataset.helper; render(true); root.querySelector(`[data-helper="${button.dataset.helper}"]`)?.focus({ preventScroll: true }); break;
        case 'size': state.size = Number(button.dataset.size); render(true); root.querySelector(`[data-size="${state.size}"]`)?.focus({ preventScroll: true }); break;
        case 'save': if (state.favorites.has(state.id)) state.favorites.delete(state.id); else state.favorites.add(state.id); render(true, action); toast(state.favorites.has(state.id) ? 'Добавлено в избранное' : 'Убрано из избранного'); break;
        case 'next-dua': state.id = allDua[(allDua.indexOf(state.id) + 1) % allDua.length]; render(false, action); break;
        case 'dhikr': if (button.dataset.step !== undefined) state.step = Number(button.dataset.step); navigate('counter'); break;
        case 'count': state.counts[state.step] = Math.min(dhikrs[state.step].target, state.counts[state.step] + 1); render(true, state.counts[state.step] === dhikrs[state.step].target ? 'next-dhikr' : action); break;
        case 'undo': state.counts[state.step] = Math.max(0, state.counts[state.step] - 1); render(true, state.counts[state.step] ? action : 'count'); break;
        case 'next-dhikr': {
          if (state.counts[state.step] < dhikrs[state.step].target) break;
          // При входе с середины набора возвращаемся к непрочитанным зикрам.
          const remaining = [1, 2, 3, 4].map(offset => (state.step + offset) % dhikrs.length).find(index => state.counts[index] < dhikrs[index].target);
          if (remaining === undefined) navigate('complete');
          else { state.step = remaining; render(false, 'count'); }
          break;
        }
        case 'counter-back': state.screen = 'counter'; render(); break;
        case 'restart': state.counts = [0, 0, 0, 0]; state.step = 0; state.screen = 'counter'; render(false, 'count'); break;
        case 'clear-search': state.query = ''; root.querySelector('input').value = ''; renderResults(); root.querySelector('input').focus(); break;
      }
    });
    root.addEventListener('input', event => { if (event.target.matches('.search-input')) { state.query = event.target.value; renderResults(); } });
    root.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); back(); } if (event.target.matches('[data-action="count"]') && event.repeat) event.preventDefault(); });

    function setScene(value) {
      state.history = [];
      state.query = '';
      if (value === 'home') state.screen = 'home';
      else if (value === 'library') state.screen = 'library';
      else {
        state.history.push({ screen: 'library', id: 'good', category: '', section: 'dua', scroll: 0, focus: '' });
        state.screen = value === 'dhikr' ? 'counter' : 'reader';
        state.id = value === 'tarawih' ? 'tarawih' : 'good';
      }
      render();
    }
    setScene(scene);
    return { setScene };
  }

  document.querySelectorAll('[data-prototype]').forEach(root => controllers.push(createPrototype(root, Number(root.dataset.prototype))));
  document.querySelectorAll('[data-scenes]').forEach(picker => {
    picker.innerHTML = Object.entries(scenes).map(([key, label]) => `<button type="button" data-scene="${key}" aria-pressed="${key === scene}">${label}</button>`).join('');
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-scene]');
    if (!button) return;
    scene = button.dataset.scene;
    controllers.forEach(controller => controller.setScene(scene));
    document.querySelectorAll('[data-scene]').forEach(control => control.setAttribute('aria-pressed', String(control.dataset.scene === scene)));
    document.querySelectorAll('[data-preview-link]').forEach(link => { link.href = `dua-dhikr-${link.dataset.previewLink}.html?scene=${scene}`; });
    try { const url = new URL(location.href); url.searchParams.set('scene', scene); history.replaceState(null, '', url); } catch { /* Прямое открытие HTML может запрещать изменение URL. */ }
  });
})();
