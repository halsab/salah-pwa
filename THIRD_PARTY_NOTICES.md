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

- Источники: [cities5000.zip](https://download.geonames.org/export/dump/cities5000.zip),
  [alternateNamesV2.zip](https://download.geonames.org/export/dump/alternateNamesV2.zip)
  и [admin1CodesASCII.txt](https://download.geonames.org/export/dump/admin1CodesASCII.txt).
- Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- Преобразования: порог населения 5 000, округление координат до четырёх знаков,
  выбор действующих русских имён с предпочтением preferred, нормализованный
  поисковый индекс и компактное представление записей.
- Новые административные названия импортированы из снимков GeoNames, полученных
  7 сентября 2026 года. `admin1CodesASCII.txt` связывается с существующим
  `countryCode.admin1Code`; русское название берётся по ID региона из
  `alternateNamesV2`, иначе используется исходное название admin1. Если записи нет,
  название остаётся пустым (222 города в текущем наборе).
- Несколько действующих preferred-названий региона разрешаются детерминированно:
  кратчайшее, затем лексикографически. Для городов неоднозначность preferred
  по-прежнему считается ошибкой импорта. Исторические и завершившиеся имена исключены.
- Точные SHA-256 трёх входных снимков закреплены в
  [scripts/geonames-sources.json](scripts/geonames-sources.json).
  Версия результата schema 4: `827fbdd55f3dd27a865d`. Исходная выборка 69 037 городов,
  её ID, координаты, `admin1Code`, население и timezone сохранены; дата исходной
  выборки остаётся в `source.updatedAt`. Изменены структура, названия регионов,
  поисковые ключи и упаковка по странам.
- Описание формата и лицензия всего дампа, включая административные названия:
  [GeoNames readme](https://download.geonames.org/export/dump/readme.txt).
  Региональные названия не являются данными о границах.

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
