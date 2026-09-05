# Third-party notices

Salah включает данные, шрифт и программные зависимости третьих сторон. Лицензия
самого приложения приведена в `LICENSE`.

## Данные

### ДУМ Республики Татарстан

- Источник расписаний: [официальный раздел «Время намаза» ДУМ РТ](https://dumrt.ru/ru/help-info/prayertime/).
- Опубликованные таблицы разбираются, проверяются на полноту и дубли, объединяются
  в JSON и сопровождаются manifest и SHA-256.
- Отдельная лицензия таблиц на странице источника не указана; проект не утверждает
  наличие отдельной лицензии и не является официальным приложением ДУМ РТ.

### GeoNames

- Источники: [cities5000.zip](https://download.geonames.org/export/dump/cities5000.zip)
  и [alternateNamesV2.zip](https://download.geonames.org/export/dump/alternateNamesV2.zip).
- Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- Преобразования: порог населения 5 000, округление координат до четырёх знаков,
  выбор действующих русских имён с предпочтением preferred, нормализованный
  поисковый индекс и компактное представление записей.

### OpenStreetMap и Nominatim

- Атрибуция и условия: [OpenStreetMap](https://www.openstreetmap.org/copyright).
- Лицензия базы данных: [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
- Политика конфиденциальности сервиса: [OSMF Privacy Policy](https://osmfoundation.org/wiki/Privacy_Policy).
- Nominatim возвращает название и код региона; название может сохраняться локально,
  а код региона используется для подтверждения территории.

## Шрифт

**Alegreya Sans** поставляется через `@fontsource/alegreya-sans 5.3.0` по лицензии
SIL Open Font License 1.1. Текст лицензии находится в
`public/fonts/AlegreyaSans-OFL-1.1.txt`; источник шрифта —
[Alegreya Sans](https://github.com/huertatipografica/Alegreya-Sans), пакет —
[Fontsource](https://fontsource.org/fonts/alegreya-sans).

## Прямые runtime и поставляемые зависимости

- [React / ReactDOM 19.2.8](https://github.com/react/react) — MIT.
- [Scheduler 0.27.0](https://github.com/facebook/react) — MIT.
- [adhan 4.4.6](https://github.com/batoulapps/adhan-js) — MIT.
- [idb 8.0.3](https://github.com/jakearchibald/idb) — ISC.
- [vite-plugin-pwa 1.3.0](https://github.com/vite-pwa/vite-plugin-pwa) — MIT
  (интеграция сборки и service worker).
- [Workbox 7.4.1](https://github.com/googlechrome/workbox) — MIT
  (сгенерированный service worker и offline cache).
