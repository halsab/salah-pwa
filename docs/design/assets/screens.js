(() => {
  const root = document.getElementById('salah-approved');
  root.innerHTML = `  <div class="s-picker" role="group" aria-label="Экран макета">
    <button class="s-preview-button" type="button" data-preview="home" aria-pressed="false">Главная</button>
    <button class="s-preview-button" type="button" data-preview="location" aria-pressed="false">Локация</button>
    <button class="s-preview-button" type="button" data-preview="search" aria-pressed="false">Поиск</button>
    <button class="s-preview-button" type="button" data-preview="settings" aria-pressed="false">Настройки</button>
    <button class="s-preview-button" type="button" data-preview="source" aria-pressed="false">Источник</button>
    <button class="s-preview-button" type="button" data-preview="share" aria-pressed="true">Поделиться</button>
  </div>
  <p class="s-caption" aria-live="polite">Локация · выбор одним тапом</p>
  <section class="s-phone" aria-label="Макет Салях">
    <div class="s-status" aria-hidden="true"><span>17:05</span><div class="s-system"><img src="assets/signal.svg" alt="" width="16" height="16"><img src="assets/wifi.svg" alt="" width="16" height="16"><img src="assets/battery-full.svg" alt="" width="16" height="16"></div></div>
    <div class="s-panel"></div><div class="s-home-bar" aria-hidden="true"></div>
  </section>

  <template data-template="location">
    <div class="s-top"><button class="s-pill" type="button" data-go="home">Назад</button></div>
    <div class="s-body s-edge">
      <div data-current-place><h1 class="s-hero" data-city-name>Казань</h1><p class="s-note s-small-gap" data-city-region>Татарстан, Россия</p></div>
      <button class="s-pill s-wide s-search-open s-space" type="button" data-go="search">Найти город</button>
      <button class="s-pill s-wide s-small-gap" type="button" data-gps>По геопозиции</button>
      <section data-recent-section class="s-space"><h2 class="s-heading">Недавние</h2><div class="s-cities" data-recents></div></section>
    </div>
  </template>

  <template data-template="search">
    <div class="s-top"><button class="s-pill" type="button" data-go="location">Отмена</button></div>
    <div class="s-body s-edge">
      <input class="s-input" type="search" placeholder="Найти город" aria-label="Найти город" autocomplete="off" data-search>
      <div class="s-cities s-space" data-results aria-live="polite"></div>
    </div>
  </template>

  <template data-template="settings">
    <div class="s-top"><button class="s-pill" type="button" data-go="home">Назад</button></div>
    <div class="s-body s-settings-menu"><div class="s-stack">
      <button class="s-pill s-row" type="button" data-go="source"><span>Расписание</span><span class="s-note" data-source-short>ДУМ РТ</span></button>
      <button class="s-pill s-row s-privacy-link" type="button" data-go="privacy">Данные и конфиденциальность</button>
      <button class="s-pill s-row" type="button" data-go="about">О приложении</button>
    </div></div>
    <div class="s-bottom"><span></span><button class="s-pill" type="button" data-go="share">Поделиться</button></div>
  </template>


  <template data-template="source">
    <div class="s-top"><button class="s-pill" type="button" data-go="settings">Назад</button></div>
    <div class="s-body">
      <p class="s-heading">Расписание</p><h1 class="s-title s-small-gap" data-mode-heading>Автоматически</h1>
      <div class="s-stack s-source-links">
        <button class="s-pill s-row" type="button" data-go="source-choice"><span>Способ</span><span class="s-note" data-mode-short>Авто</span></button>
        <button class="s-pill s-row" type="button" data-source-detail><span data-source-row-label>Таблица</span><span class="s-note" data-source-short>ДУМ РТ</span></button>
        <button class="s-pill s-row" type="button" data-open-manual hidden>Параметры</button>
      </div>
    </div>
    <div class="s-bottom"><button class="s-pill" type="button" data-go="source-info">О расписании</button></div>
  </template>



  <template data-template="source-choice">
    <div class="s-top"><button class="s-pill" type="button" data-go="source">Назад</button></div>
    <div class="s-body"><h1 class="s-heading">Выбор расписания</h1><div class="s-stack s-space">
      <button class="s-pill s-row s-choice" type="button" data-source-value="automatic" aria-pressed="true"><span>Автоматически</span><span class="s-note">Выбрано</span></button>
      <button class="s-pill s-row s-choice" type="button" data-source-value="official" aria-pressed="false"><span>Таблица ДУМ РТ</span><span class="s-note">Выбрано</span></button>
      <button class="s-pill s-row s-choice" type="button" data-source-value="calculated" aria-pressed="false"><span>Ручной расчёт</span><span class="s-note">Выбрано</span></button>
    </div></div>
  </template>

  <template data-template="profiles">
    <div class="s-top"><button class="s-pill" type="button" data-go="source">Назад</button></div>
    <div class="s-body"><h1 class="s-heading">Профиль расчёта</h1><div class="s-stack s-space" data-profile-list></div></div>
  </template>

  <template data-template="manual">
    <div class="s-top"><button class="s-pill" type="button" data-go="source">Назад</button></div>
    <div class="s-body">
      <div class="s-field"><label class="s-label" for="sr-asr">Аср</label><select class="s-select" id="sr-asr" data-draft="asr"><option value="hanafi">Ханафитский</option><option value="standard">Остальные мазхабы</option></select></div>
      <div class="s-field"><label class="s-label" for="sr-north">Северные правила</label><select class="s-select" id="sr-north" data-draft="north"><option value="dumRt">ДУМ РТ · 120/90 мин</option><option value="seventhOfNight">1/7 ночи</option><option value="twilightAngle">Доля ночи по углу</option><option value="nearestDay">Ближайший день</option></select></div>
    </div>
  </template>

  <template data-template="source-info">
    <div class="s-top"><button class="s-pill" type="button" data-go="source">Назад</button></div>
    <div class="s-body">
      <h1 class="s-title" data-source-short>ДУМ РТ</h1><p class="s-note s-small-gap" data-source-description>Официальная таблица</p>
      <dl class="s-compact-readout s-space"><div><dt>Место</dt><dd data-city-name>Казань</dd></div><div><dt>Дата</dt><dd data-date-text>10 сентября</dd></div></dl>
      <p class="s-copy s-space" data-source-explanation>Времена из официальной таблицы ДУМ РТ на 2026 год.</p>
      <p class="s-note s-space" data-automatic-explanation>Автоматически: сначала таблица для места и даты, затем — расчёт по региону, если таблица их не охватывает.</p>
      <button class="s-pill s-wide s-space" type="button" data-go="methodology" data-methodology-button hidden>Как считается время</button>
    </div>
  </template>

  <template data-template="methodology">
    <div class="s-top"><button class="s-pill" type="button" data-go="source-info">Назад</button></div>
    <div class="s-body"><h1 class="s-title">Расчёт времени</h1><p class="s-copy s-space">По координатам, дате и выбранному профилю.</p><p class="s-note s-space">Аср задаёт правило тени. Северные правила применяются, когда сумерки не наступают.</p></div>
  </template>

  <template data-template="privacy">
    <div class="s-top"><button class="s-pill" type="button" data-go="settings">Назад</button></div>
    <div class="s-body"><h1 class="s-heading">Данные и<br>конфиденциальность</h1><p class="s-copy s-space">Место, недавние города, настройки и расписание — на устройстве.</p><p class="s-note s-space">Без аккаунта и аналитики. Координаты приложение не отправляет.</p><p class="s-note s-space">Хостинг получает IP и технические данные запросов.</p></div>
    <div class="s-bottom"><span></span><button class="s-pill" type="button" data-go="reset">Удалить данные</button></div>
  </template>

  <template data-template="reset">
    <div class="s-top"><button class="s-pill" type="button" data-go="privacy">Отмена</button></div>
    <div class="s-body"><h1 class="s-title">Удалить данные?</h1><p class="s-copy s-space">Место, недавние города, настройки и загруженное расписание будут удалены.</p><p class="s-note s-space">Приложение и общие справочники останутся.</p></div>
    <div class="s-bottom"><span></span><button class="s-pill" type="button" data-reset>Удалить</button></div>
  </template>

  <template data-template="about">
    <div class="s-top"><button class="s-pill" type="button" data-go="settings">Назад</button></div>
    <div class="s-body"><h1 class="s-hero">Салях</h1><p class="s-copy s-space">Время намаза<br>для выбранного места.</p><p class="s-note s-space">Версия 0.1.0</p></div>
  </template>

  <template data-template="share">
    <div class="s-top"><button class="s-pill" type="button" data-go="settings">Назад</button></div>
    <div class="s-body s-share">
      <svg xmlns="http://www.w3.org/2000/svg" class="s-share-qr" role="img" aria-label="QR-код ссылки на приложение" viewBox="0 0 45 45" shape-rendering="crispEdges">
  <path fill="#FFFFFF" d="M0 0h45v45H0z"/>
  <path fill="none" stroke="#000000" d="
    M4 4.5h7m2 0h1m2 0h3m4 0h2m1 0h1m2 0h2m3 0h7
    M4 5.5h1m5 0h1m2 0h1m1 0h1m3 0h1m1 0h1m1 0h1m2 0h1m1 0h3m3 0h1m5 0h1
    M4 6.5h1m1 0h3m1 0h1m1 0h6m1 0h1m1 0h3m1 0h1m3 0h3m2 0h1m1 0h3m1 0h1
    M4 7.5h1m1 0h3m1 0h1m1 0h1m4 0h2m1 0h2m3 0h5m2 0h1m1 0h1m1 0h3m1 0h1
    M4 8.5h1m1 0h3m1 0h1m2 0h4m4 0h1m6 0h1m1 0h1m3 0h1m1 0h3m1 0h1
    M4 9.5h1m5 0h1m2 0h5m2 0h1m2 0h1m2 0h3m5 0h1m5 0h1
    M4 10.5h7m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h7
    M14 11.5h1m1 0h2m1 0h1m1 0h3m1 0h1m3 0h1m1 0h2
    M7 12.5h2m1 0h2m2 0h4m4 0h2m1 0h1m3 0h1m2 0h1m4 0h2
    M5 13.5h1m2 0h1m3 0h2m2 0h1m4 0h2m1 0h2m1 0h1m1 0h1m3 0h2m1 0h1m1 0h1
    M5 14.5h2m3 0h4m1 0h1m3 0h2m2 0h1m1 0h2m1 0h2m3 0h4m3 0h1
    M6 15.5h1m1 0h2m3 0h3m3 0h3m1 0h3m1 0h2m1 0h2m1 0h2m3 0h2
    M4 16.5h1m3 0h5m2 0h2m1 0h1m1 0h1m1 0h3m1 0h1m5 0h1m1 0h1m2 0h1
    M4 17.5h1m1 0h1m1 0h1m2 0h2m2 0h4m1 0h1m4 0h1m2 0h1m1 0h4m2 0h1m1 0h2
    M8 18.5h1m1 0h1m1 0h1m1 0h1m4 0h2m2 0h1m4 0h2m1 0h3m2 0h5
    M4 19.5h1m1 0h2m1 0h1m3 0h2m2 0h4m1 0h1m5 0h1m1 0h1m4 0h1m1 0h2m1 0h1
    M4 20.5h1m2 0h6m2 0h3m1 0h2m6 0h3m2 0h1m1 0h1m3 0h1
    M4 21.5h3m5 0h1m1 0h2m7 0h2m1 0h6m1 0h1m4 0h2
    M4 22.5h2m1 0h4m5 0h2m1 0h2m1 0h4m1 0h5m1 0h3m4 0h1
    M6 23.5h2m1 0h1m2 0h2m1 0h2m1 0h2m1 0h1m1 0h1m1 0h2m2 0h2m2 0h1m1 0h3m1 0h1
    M8 24.5h1m1 0h5m1 0h1m4 0h2m1 0h4m4 0h3m1 0h2m2 0h1
    M7 25.5h2m3 0h5m2 0h1m3 0h3m1 0h1m1 0h4m2 0h2
    M4 26.5h1m1 0h2m2 0h1m2 0h2m1 0h2m1 0h2m2 0h1m5 0h1m1 0h1m4 0h1m3 0h1
    M4 27.5h1m1 0h1m1 0h2m2 0h1m8 0h1m4 0h1m1 0h2m1 0h3m1 0h1m1 0h2
    M6 28.5h2m2 0h2m1 0h1m3 0h1m1 0h1m2 0h4m1 0h3m5 0h3m2 0h1
    M4 29.5h2m1 0h3m3 0h3m1 0h1m6 0h3m3 0h1m3 0h1m2 0h2
    M4 30.5h2m1 0h2m1 0h2m1 0h1m2 0h1m2 0h2m1 0h1m2 0h5m1 0h1m2 0h3m3 0h1
    M4 31.5h1m3 0h2m6 0h5m1 0h1m1 0h1m1 0h2m2 0h1m1 0h2m1 0h1m2 0h1
    M4 32.5h1m3 0h3m3 0h3m1 0h2m1 0h1m3 0h1m3 0h1m1 0h7m1 0h2
    M12 33.5h1m3 0h1m2 0h1m1 0h5m6 0h1m3 0h4
    M4 34.5h7m1 0h2m1 0h1m5 0h3m1 0h1m1 0h3m2 0h1m1 0h1m1 0h3m1 0h1
    M4 35.5h1m5 0h1m3 0h3m2 0h1m3 0h4m1 0h2m1 0h2m3 0h2m1 0h2
    M4 36.5h1m1 0h3m1 0h1m1 0h1m5 0h1m1 0h1m1 0h4m4 0h7m3 0h1
    M4 37.5h1m1 0h3m1 0h1m1 0h2m1 0h2m2 0h2m1 0h3m1 0h1m1 0h5m1 0h1m3 0h1
    M4 38.5h1m1 0h3m1 0h1m3 0h2m1 0h1m3 0h2m3 0h2m3 0h1m4 0h1m2 0h2
    M4 39.5h1m5 0h1m3 0h1m1 0h1m2 0h3m1 0h2m2 0h2m1 0h1m3 0h7
    M4 40.5h7m2 0h3m2 0h2m1 0h1m2 0h4m4 0h1m4 0h1m2 0h1
  "/>
</svg>
      <div>
        <label class="s-label" for="su-share">Ссылка на приложение</label>
        <textarea class="s-share-url" id="su-share" rows="2" readonly spellcheck="false" data-share-url>https://halsab.github.io/salah-pwa/</textarea>
        <p class="s-note s-small-gap" data-copy-error role="status" hidden></p>
      </div>
    </div>
    <div class="s-bottom"><button class="s-pill s-wide" type="button" data-copy-link aria-live="polite">Скопировать ссылку</button></div>
  </template>

  <template data-template="home">
    <div class="s-top"><button class="s-pill" type="button" data-go="location" data-city-name>Казань</button><label class="s-pill s-date"><span data-date-text>10 сентября</span><input type="date" aria-label="Выбрать дату" value="2026-09-10" data-date></label></div>
    <div class="s-body s-home"><dl class="s-list" data-events></dl><p class="s-copy" data-no-schedule hidden>Нет расписания<br>на эту дату</p></div>
    <div class="s-bottom"><p class="s-footer-time" data-countdown><span class="s-note">До Магриба</span><span data-countdown-value>1 ч 10 мин</span></p><button class="s-pill" type="button" data-today hidden>Сегодня</button><button class="s-pill s-end" type="button" data-go="settings">Настройки</button></div>
  </template>`;
  const panel = root.querySelector('.s-panel');
  const cities = [
    {name:'Казань', region:'Татарстан, Россия'},
    {name:'Уфа', region:'Башкортостан, Россия'},
    {name:'Москва', region:'Россия'},
    {name:'Санкт-Петербург', region:'Россия'},
    {name:'Казалы', region:'Кызылординская область, Казахстан'}
  ];
  const profiles = [
    {id:'dumRt', label:'ДУМ РТ', short:'ДУМ РТ'},
    {id:'dumRf', label:'ДУМ РФ', short:'ДУМ РФ'},
    {id:'turkey', label:'Турция · Diyanet', short:'Diyanet'},
    {id:'muslimWorldLeague', label:'Muslim World League', short:'MWL'},
    {id:'karachi', label:'Карачи', short:'Карачи'},
    {id:'northAmerica', label:'ISNA', short:'ISNA'},
    {id:'ummAlQura', label:'Умм аль-Кура', short:'Умм аль-Кура'}
  ];
  const labels = {fajr:'Фаджр',sunrise:'Восход',zenith:'Зенит',dhuhr:'Зухр',asr:'Аср',maghrib:'Магриб',isha:'Иша'};
  const official = [
    {key:'suhur',label:'Сухур до',time:'02:49',minutes:-856},
    {key:'fajrJamaat',label:'Фаджр',sub:'в мечети',time:'03:35',minutes:-810},
    {key:'sunrise',label:'Восход',time:'05:06',minutes:-719},
    {key:'zenith',label:'Зенит',time:'11:41',minutes:-324},
    {key:'dhuhr',label:'Зухр',time:'12:00',minutes:-305},
    {key:'asr',label:'Аср',time:'16:06',minutes:-59},
    {key:'maghrib',label:'Магриб',time:'18:15',minutes:70},
    {key:'isha',label:'Иша',time:'20:04',minutes:179}
  ];
  const timeFixtures = {
    'Казань':official,
    'Уфа':[['fajr','05:06',-839],['sunrise','06:39',-746],['zenith','13:13',-352],['dhuhr','13:14',-351],['asr','16:44',-141],['maghrib','19:46',41],['isha','21:20',135]],
    'Москва':[['fajr','04:18',-767],['sunrise','05:51',-674],['zenith','12:27',-278],['dhuhr','12:28',-277],['asr','15:57',-68],['maghrib','19:01',116],['isha','20:34',209]],
    'Санкт-Петербург':[['fajr','04:43',-742],['sunrise','06:15',-650],['zenith','12:56',-249],['dhuhr','12:57',-248],['asr','16:23',-42],['maghrib','19:35',150],['isha','21:07',242]],
    'Казалы':[['fajr','04:39',-866],['sunrise','06:23',-762],['zenith','12:49',-376],['dhuhr','12:50',-375],['asr','16:23',-162],['maghrib','19:13',8],['isha','20:50',105]]
  };
  for (const [city,rows] of Object.entries(timeFixtures)) if (city !== 'Казань') timeFixtures[city] = rows.map(([key,time,minutes]) => ({key,label:labels[key],time,minutes}));
  let selected = cities[0];
  let recent = cities.slice(1,4);
  const query = new URLSearchParams(window.location.search);
  let source = ['automatic','official','calculated'].includes(query.get('mode')) ? query.get('mode') : 'automatic';
  let saved = {profile:'muslimWorldLeague',asr:null,north:null};
  const requested = query.get('screen') || root.dataset.initial || 'home';
  let view = root.querySelector(`[data-template="${CSS.escape(requested)}"]`) ? requested : 'home';
  let date = '2026-09-10';
  let searchText = view === 'search' ? 'Каз' : '';
  let hasData = true;

  const setText = (selector,value) => panel.querySelectorAll(selector).forEach(node => {node.textContent=value;});
  const template = name => root.querySelector(`[data-template="${name}"]`).content.cloneNode(true);
  const currentProfile = () => profiles.find(profile => profile.id === saved.profile);
  const profileDefaults = profile => ({asr:['dumRt','dumRf','karachi'].includes(profile)?'hanafi':'standard',north:profile==='dumRt'?'dumRt':'twilightAngle'});
  function supports(profile) {
    if (profile !== 'ummAlQura') return true;
    return new Intl.DateTimeFormat('en-u-ca-islamic-umalqura').resolvedOptions().calendar === 'islamic-umalqura';
  }
  function isOfficial() { return source === 'official' || (source === 'automatic' && selected?.name === 'Казань' && date.startsWith('2026')); }
  function sourceShort() { return isOfficial() ? 'ДУМ РТ' : source === 'calculated' ? currentProfile().short : 'MWL'; }

  function updateChrome() {
    const sourceViews = ['source','source-choice','profiles','manual','source-info','methodology'];
    const category = sourceViews.includes(view) ? 'source' : ['privacy','reset','about'].includes(view) ? 'settings' : view;
    root.querySelectorAll('[data-preview]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.preview === category)));
    const names = {location:'Локация · выбор одним тапом',search:'Поиск · тап по городу завершает выбор',schedule:'Расписание · единый список',settings:'Настройки',home:'Главный экран',privacy:'Данные и конфиденциальность',about:'О приложении',share:'Поделиться',reset:'Удаление данных · пример'};
    root.querySelector('.s-caption').textContent = sourceViews.includes(view) ? 'Настройки расписания · по шагам' : names[view];
  }

  function show(name) {
    if (name === 'schedule') name = 'home';
    if (name === 'home' && !selected) name = 'location';
    view = name;
    panel.replaceChildren(template(name));
    updateChrome();
    setText('[data-city-name]',selected?.name || 'Выбрать место');
    setText('[data-city-region]',selected?.region || '');
    setText('[data-date-text]',new Intl.DateTimeFormat('ru',{day:'numeric',month:'long'}).format(new Date(`${date}T12:00:00`)));
    setText('[data-source-short]',sourceShort());
    if (view === 'location') renderLocation();
    if (view === 'search') { panel.querySelector('[data-search]').value=searchText; renderSearch(); }
    if (view === 'schedule' || view === 'home') renderTime();
    if (['source','source-choice','source-info'].includes(view)) renderSource();
    if (view === 'profiles') renderProfiles();
    if (view === 'manual') renderParameters();
    alignLabels();
  }

  function changeDate(value) {
    date=value;
    setText('[data-date-text]',new Intl.DateTimeFormat('ru',{day:'numeric',month:'long'}).format(new Date(`${date}T12:00:00`)));
    panel.querySelector('[data-date]').value=date;
    renderTime();
    alignLabels();
  }

  function alignLabels() {
    const context = document.createElement('canvas').getContext('2d');
    if (!context) return;
    context.font='400 15px "Salah Old Timey Mono"';
    const reference=context.measureText('10 сентября');
    const leftGap=16-reference.actualBoundingBoxLeft;
    const rightGap=16+reference.width-reference.actualBoundingBoxRight;
    panel.querySelectorAll('.s-pill:not(.s-city-result)').forEach(button => {
      const spans=Array.from(button.children).filter(node => node.tagName==='SPAN' && !node.hidden && getComputedStyle(node).display!=='none');
      const first=spans[0] || button, last=spans.at(-1) || button;
      context.font=getComputedStyle(first).font; const left=context.measureText(first.textContent.trim());
      context.font=getComputedStyle(last).font; const right=context.measureText(last.textContent.trim());
      // Согласуем видимые поля глифов с кнопкой даты.
      button.style.paddingLeft=`${leftGap+left.actualBoundingBoxLeft}px`;
      button.style.paddingRight=`${rightGap-right.width+right.actualBoundingBoxRight}px`;
    });
  }

  function cityButton(city,withRegion=false) {
    const button=document.createElement('button'); button.type='button'; button.className=`s-pill s-row${withRegion?' s-city-result':''}`; button.dataset.city=city.name;
    const name=document.createElement('span'); name.textContent=city.name; button.append(name);
    if (withRegion) {const region=document.createElement('span'); region.className='s-note'; region.textContent=city.region; button.append(region);}
    return button;
  }
  function renderLocation() {
    panel.querySelector('[data-current-place]').hidden=!selected;
    const list=panel.querySelector('[data-recents]');
    const shown=recent.filter(city=>city.name!==selected?.name).slice(0,3);
    panel.querySelector('[data-recent-section]').hidden=!shown.length;
    shown.forEach(city=>list.append(cityButton(city)));
  }
  function renderSearch() {
    const list=panel.querySelector('[data-results]'); list.replaceChildren();
    const query=searchText.trim().toLocaleLowerCase('ru');
    if (!query) return;
    const results=cities.filter(city=>city.name.toLocaleLowerCase('ru').includes(query));
    results.forEach(city=>list.append(cityButton(city,true)));
    if (!results.length) {const p=document.createElement('p');p.className='s-note';p.textContent='Город не найден';list.append(p);}
  }
  function chooseCity(city) {
    const previous=selected;
    recent=[previous,...recent].filter((item,index,all)=>item && item.name!==city.name && all.findIndex(other=>other?.name===item.name)===index).slice(0,3);
    selected=city; hasData=true; searchText=''; show('home');
  }

  function renderTime() {
    const rows=timeFixtures[selected?.name] || [];
    const current=rows.filter(row=>row.minutes<=0).at(-1);
    const next=rows.find(row=>row.minutes>0);
    const ready=hasData && date==='2026-09-10' && current && next;
    const list=panel.querySelector('[data-events]');
    list?.replaceChildren();
    const today=panel.querySelector('[data-today]');if(today)today.hidden=date==='2026-09-10';
    if (list && ready) rows.forEach(row=>{
      const line=document.createElement('div'); if(row.minutes<current.minutes)line.className='s-past';
      if(row===current)line.setAttribute('aria-current','true');
      const label=document.createElement('dt');label.textContent=row.sub?`${row.label} ${row.sub}`:row.label;
      if(row===current){const sub=document.createElement('span');sub.className='s-sub';sub.textContent='сейчас';label.append(sub);}
      const value=document.createElement('dd');value.textContent=row.time;line.append(label,value);list.append(line);
    });
    const empty=panel.querySelector('[data-no-schedule]');if(empty)empty.hidden=Boolean(ready);
    const footer=panel.querySelector('[data-countdown]');if(footer)footer.hidden=!ready;
    if (!ready) return;
    const minutes=Math.max(0,next.minutes),hours=Math.floor(minutes/60),rest=minutes%60;
    const remaining=hours?`${hours} ч${rest?` ${rest} мин`:''}`:`${rest} мин`;
    const genitive={maghrib:'Магриба',isha:'Иши',asr:'Асра',dhuhr:'Зухра',sunrise:'восхода',zenith:'зенита',suhur:'конца сухура',fajrJamaat:'Фаджра в мечети',fajr:'Фаджра'};
    const nextLabel=`До ${genitive[next.key] || next.label}`;
    setText('[data-countdown-value]',remaining);setText('[data-next-label]',nextLabel);
    if(footer)footer.querySelector('.s-note').textContent=nextLabel;
    const dateInput=panel.querySelector('[data-date]');if(dateInput)dateInput.value=date;
  }

  function renderSource() {
    panel.querySelectorAll('[data-source-value]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.sourceValue===source)));
    setText('[data-mode-heading]',source==='automatic'?'Автоматически':source==='official'?'Официальная таблица':'Ручной расчёт');
    setText('[data-mode-short]',source==='automatic'?'Авто':source==='official'?'ДУМ РТ':'Ручной');
    setText('[data-source-row-label]',isOfficial()?'Таблица':'Профиль');
    const detail=panel.querySelector('[data-source-detail]');
    if(detail){
      detail.hidden=source==='automatic';
      detail.querySelector('[data-source-short]').hidden=source==='official';
    }
    const parameters=panel.querySelector('[data-open-manual]');if(parameters)parameters.hidden=source!=='calculated';
    setText('[data-source-description]',isOfficial()?'Официальная таблица':'Расчётное время');
    const uncovered=source==='official'&&(selected?.name!=='Казань'||!date.startsWith('2026'));
    if(uncovered)setText('[data-source-description]','Нет таблицы для места или даты');
    setText('[data-source-explanation]',isOfficial()?(uncovered?'Выбранная таблица не охватывает место или дату.':'Времена из официальной таблицы ДУМ РТ на 2026 год. Время Москвы.'):`Профиль ${source==='calculated'?currentProfile().label:'Muslim World League'}. Время рассчитывается для выбранного места.`);
    const auto=panel.querySelector('[data-automatic-explanation]');if(auto)auto.hidden=source!=='automatic';
    const method=panel.querySelector('[data-methodology-button]');if(method)method.hidden=isOfficial();
    alignLabels();
  }
  function renderProfiles() {
    const list=panel.querySelector('[data-profile-list]');
    profiles.forEach(profile=>{const button=document.createElement('button');button.type='button';button.className='s-pill s-row';button.textContent=profile.label;button.dataset.profile=profile.id;button.disabled=!supports(profile.id);button.setAttribute('aria-pressed',String(saved.profile===profile.id));list.append(button);});
    if(!supports('ummAlQura')){const p=document.createElement('p');p.className='s-note';p.textContent='Умм аль-Кура недоступен в этом браузере.';list.append(p);}
  }
  function renderParameters() {
    const defaults=profileDefaults(saved.profile);
    panel.querySelectorAll('[data-draft]').forEach(input=>{
      input.value=saved[input.dataset.draft] ?? defaults[input.dataset.draft];
    });
  }
  function saveParameter(input) {
    const key=input.dataset.draft;
    const allowed={asr:['hanafi','standard'],north:['dumRt','seventhOfNight','twilightAngle','nearestDay']};
    if(allowed[key]?.includes(input.value)){
      saved[key]=input.value;
    }
  }

  async function copyLink(button) {
    const input=panel.querySelector('[data-share-url]');
    const message=panel.querySelector('[data-copy-error]');
    let copied=false;
    // Копирование по нажатию работает и во встроенном окне без clipboard-write.
    input.focus({preventScroll:true});input.select();
    try {copied=document.execCommand('copy');} catch { /* Буфер обмена может быть недоступен в локальном макете. */ }
    if(!copied && navigator.clipboard){
      try {await navigator.clipboard.writeText(input.value);copied=true;} catch { /* Буфер обмена может быть недоступен в локальном макете. */ }
    }
    if(!button.isConnected)return;
    if(copied){
      button.textContent='Скопировано';message.hidden=true;
      button.focus({preventScroll:true});
    } else {
      message.textContent='Скопируйте выделенную ссылку.';message.hidden=false;
    }
    alignLabels();
  }

  root.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button || !root.contains(button))return;
    if(button.dataset.preview){if(button.dataset.preview==='search')searchText='Каз';show(button.dataset.preview);}
    else if(button.hasAttribute('data-today')){changeDate('2026-09-10');panel.querySelector('[data-date]').focus();}
    else if(button.dataset.go){if(button.dataset.go==='search')searchText='';show(button.dataset.go);const focusTarget=view==='search'?panel.querySelector('[data-search]'):panel.querySelector('.s-top button');focusTarget?.focus({preventScroll:true});}
    else if(button.dataset.city)chooseCity(cities.find(city=>city.name===button.dataset.city));
    else if(button.hasAttribute('data-gps'))chooseCity(cities[0]);
    else if(button.dataset.sourceValue){source=button.dataset.sourceValue;if(view==='source-choice')show('source');else{renderSource();setText('[data-source-short]',sourceShort());}}
    else if(button.hasAttribute('data-source-detail'))show(source==='calculated'?'profiles':'source-info');
    else if(button.dataset.profile){saved.profile=button.dataset.profile;source='calculated';show('source');}
    else if(button.hasAttribute('data-open-manual') && source==='calculated')show('manual');
    else if(button.hasAttribute('data-reset')){selected=null;recent=[];hasData=false;source='automatic';saved={profile:'muslimWorldLeague',asr:null,north:null};show('location');}
    else if(button.hasAttribute('data-copy-link'))copyLink(button);
  });
  root.addEventListener('input',event=>{
    const input=event.target;
    if(input.matches('[data-search]')){searchText=input.value;renderSearch();}
  });
  root.addEventListener('change',event=>{
    const input=event.target;
    if(input.matches('select[data-draft]'))saveParameter(input);
    if(input.matches('[data-date]')){if(input.value)changeDate(input.value);else input.value=date;}
  });
  show(view);
  document.fonts.ready.then(alignLabels);
})();
