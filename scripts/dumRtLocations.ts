export interface DumRtLocationSource {
  id: string
  name: string
  sourceFile: string
  latitude: number
  longitude: number
}

export const DUM_RT_LOCATIONS: DumRtLocationSource[] = [
  { id: 'agriz', name: 'Агрыз', sourceFile: 'Agriz.csv', latitude: 56.525516, longitude: 52.9971643 },
  { id: 'aznakayevo', name: 'Азнакаево', sourceFile: 'Aznakay.csv', latitude: 54.8629555, longitude: 53.0792275 },
  { id: 'aksubayevo', name: 'Аксубаево', sourceFile: 'Aksubay.csv', latitude: 54.846351, longitude: 50.8055345 },
  { id: 'aktanysh', name: 'Актаныш', sourceFile: 'Aktanis.csv', latitude: 55.7221799, longitude: 54.0577272 },
  { id: 'alekseevsk', name: 'Алексеевск', sourceFile: 'Aleksey.csv', latitude: 55.3049649, longitude: 50.1129039 },
  { id: 'almetyevsk', name: 'Альметьевск', sourceFile: 'Almet.csv', latitude: 54.9005008, longitude: 52.2963777 },
  { id: 'apastovo', name: 'Апастово', sourceFile: 'Apastovo.csv', latitude: 55.2026717, longitude: 48.5068612 },
  { id: 'arsk', name: 'Арск', sourceFile: 'Arsk.csv', latitude: 56.0909916, longitude: 49.8771828 },
  { id: 'bavly', name: 'Бавлы', sourceFile: 'Bavli.csv', latitude: 54.4031069, longitude: 53.2356367 },
  { id: 'bazarnye-mataki', name: 'Базарные Матаки', sourceFile: 'BazarnyeMataki.csv', latitude: 54.9034845, longitude: 49.9275488 },
  { id: 'baltasi', name: 'Балтаси', sourceFile: 'Baltasi.csv', latitude: 56.344623, longitude: 50.2114172 },
  { id: 'bogatye-saby', name: 'Богатые Сабы', sourceFile: 'BogatyeSaby.csv', latitude: 56.0106232, longitude: 50.4467802 },
  { id: 'bolgar', name: 'Болгар', sourceFile: 'Bolgary.csv', latitude: 54.9819014, longitude: 49.0240116 },
  { id: 'bolshaya-atnya', name: 'Большая Атня', sourceFile: 'BolshAtna.csv', latitude: 56.2503047, longitude: 49.4534003 },
  { id: 'bolshie-kaybitsy', name: 'Большие Кайбицы', sourceFile: 'BolshieKaybesy.csv', latitude: 55.4061658, longitude: 48.19358 },
  { id: 'bugulma', name: 'Бугульма', sourceFile: 'Bugulma.csv', latitude: 54.5384152, longitude: 52.7955953 },
  { id: 'buinsk', name: 'Буинск', sourceFile: 'Buinsk.csv', latitude: 54.9712371, longitude: 48.2930213 },
  { id: 'verkhniy-uslon', name: 'Верхний Услон', sourceFile: 'VerhUslon.csv', latitude: 55.7685496, longitude: 48.9829213 },
  { id: 'vysokaya-gora', name: 'Высокая Гора', sourceFile: 'VicokayGora.csv', latitude: 55.9101814, longitude: 49.3072048 },
  { id: 'elabuga', name: 'Елабуга', sourceFile: 'Elabuga.csv', latitude: 55.7577131, longitude: 52.0539938 },
  { id: 'zainsk', name: 'Заинск', sourceFile: 'Zainsk.csv', latitude: 55.2866509, longitude: 52.0056047 },
  { id: 'zelenodolsk', name: 'Зеленодольск', sourceFile: 'Zelenodolsk.csv', latitude: 55.8586627, longitude: 48.5674201 },
  { id: 'kazan', name: 'Казань', sourceFile: 'Kazan.csv', latitude: 55.7946485, longitude: 49.1115022 },
  { id: 'kamskoye-ustye', name: 'Камское Устье', sourceFile: 'KamskoeUstye.csv', latitude: 55.2015629, longitude: 49.2680082 },
  { id: 'kukmor', name: 'Кукмор', sourceFile: 'Kukmor.csv', latitude: 56.1865318, longitude: 50.8972087 },
  { id: 'laishevo', name: 'Лаишево', sourceFile: 'Laish.csv', latitude: 55.4051397, longitude: 49.5556925 },
  { id: 'leninogorsk', name: 'Лениногорск', sourceFile: 'Leninogorsk.csv', latitude: 54.5994324, longitude: 52.4469099 },
  { id: 'mamadysh', name: 'Мамадыш', sourceFile: 'Mamadis.csv', latitude: 55.7180509, longitude: 51.4135059 },
  { id: 'mendeleevsk', name: 'Менделеевск', sourceFile: 'Mendeleevsk.csv', latitude: 55.894251, longitude: 52.312064 },
  { id: 'menzelinsk', name: 'Мензелинск', sourceFile: 'Menzilinsk.csv', latitude: 55.7255585, longitude: 53.1071815 },
  { id: 'muslyumovo', name: 'Муслюмово', sourceFile: 'Muslimov.csv', latitude: 55.3041209, longitude: 53.1975331 },
  { id: 'naberezhnye-chelny', name: 'Набережные Челны', sourceFile: 'NabChelny.csv', latitude: 55.7419774, longitude: 52.399207 },
  { id: 'nizhnekamsk', name: 'Нижнекамск', sourceFile: 'Nignekamsk.csv', latitude: 55.6412879, longitude: 51.8160376 },
  { id: 'novosheshminsk', name: 'Новошешминск', sourceFile: 'Novosesminsk.csv', latitude: 55.0616447, longitude: 51.224884 },
  { id: 'nurlat', name: 'Нурлат', sourceFile: 'Nurlat.csv', latitude: 54.4297351, longitude: 50.8019579 },
  { id: 'pestretsy', name: 'Пестрецы', sourceFile: 'Pestrezy.csv', latitude: 55.7502111, longitude: 49.6570913 },
  { id: 'rybnaya-sloboda', name: 'Рыбная Слобода', sourceFile: 'RibnayaSlpboda.csv', latitude: 55.4644212, longitude: 50.1406205 },
  { id: 'sarmanovo', name: 'Сарманово', sourceFile: 'Sarmanovo2.csv', latitude: 55.2607513, longitude: 52.5776774 },
  { id: 'staroe-drozhzhanoe', name: 'Старое Дрожжаное', sourceFile: 'StaroeChuprale.csv', latitude: 54.7249827, longitude: 47.5645397 },
  { id: 'tetyushi', name: 'Тетюши', sourceFile: 'Tet2.csv', latitude: 54.9342754, longitude: 48.8319574 },
  { id: 'tyulyachi', name: 'Тюлячи', sourceFile: 'Tulyachi.csv', latitude: 55.8918846, longitude: 50.2334985 },
  { id: 'urussu', name: 'Уруссу', sourceFile: 'Urussu.csv', latitude: 54.5993324, longitude: 53.4663259 },
  { id: 'cheremshan', name: 'Черемшан', sourceFile: 'Cheremsan.csv', latitude: 54.6664, longitude: 51.4833 },
  { id: 'chistopol', name: 'Чистополь', sourceFile: 'Chistop.csv', latitude: 55.3714831, longitude: 50.6367311 },
]
