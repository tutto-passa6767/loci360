// Builds the demo photo set from hand-picked Wikimedia Commons and Flickr files (free licences, author credited)
// and writes media-src/photos.json for scripts/make-demo-reels.mjs.
//
//   node scripts/fetch-demo-media.mjs            — download photos (skips files already on disk)
//   then: node scripts/make-demo-reels.mjs       — Ken Burns demo reels from the photos (needs Docker)
//   then: LOCI_PASSWORD=… node scripts/import-media.mjs media-src/manifest.json --replace
//
// Demo only: the customer replaces these with their own 4K footage and stills.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', 'media-src');
const UA = 'LOCI360-demo/0.1 (location catalogue demo; contact: scouting@loci360.kz)';

/**
 * Commons file titles per location, cover first, with the time of day. Picked by eye from contact sheets
 * (Quality / Featured images and Wiki Loves Earth entries first); every file was checked to be in Kazakhstan.
 * Free photos run out for Akyrtas (2), Kelinshektau (one shot of the ridge plus the Arpaozen petroglyphs at its foot),
 * Aktolagay, Torysh, Tuzbair, Karagiye, Khan Ordasy and the Kurmangazy delta (Ganyushkino only — the Kigach shots on
 * Commons are from the Russian side) — those wait for the customer's own shoots.
 */
const PICKS = {
  'charyn-canyon': [
    ['Charyn Canyon, Kazakhstan 03.jpg', 'DAY'],
    ['Вид сверху на долину Чарынского каньона.jpg', 'DAY'],
    ['Charyn canyon.jpg', 'DAY'],
    ['22 В долине замков.jpg', 'DAY'],
    ['Charyn Canyon, Kazakhstan 04.jpg', 'DAY'],
    ['Sharyn canyon 50.jpg', 'DAY'],
    ['Sharyn canyon 28.jpg', 'DAY'],
    ['Домик чабана.jpg', 'DAY'],
  ],
  'big-almaty-lake': [
    ['Лазурное зеркало Большого Алматинского озера.jpg', 'DAY'],
    ['БАО, Большое Алматинское озеро. ( Big Almaty Lake).jpg', 'DAY'],
    ['Big almaty lake and galactic core.jpg', 'NIGHT'],
    ['Солнечная дорожка на бирюзовой глади озера.jpg', 'DAY'],
    ['БАО ранней осенью.jpg', 'DAY'],
    ['Almaty (2) (30064026530).jpg', 'DAY'],
    ['Большое Алматинское озеро. ( Big Almaty Lake).jpg', 'DAY'],
    ['Большое Алматинское Озеро на рассвете.jpg', 'DAY'],
    ['Big Almaty Lake from Peak Titov.jpg', 'DAY'],
  ],
  'kolsai-lakes': [
    ['03 Нижнее озеро Кольсай (на высоте 1818 метров над уровнем моря).jpg', 'DAY'],
    ['02 Нижнее озеро Кольсай (на высоте 1818 метров над уровнем моря).jpg', 'DAY'],
    ['Кольсай летом.jpg', 'DAY'],
    ['Көлсай және оның таулары. Кольсай и его горы.jpg', 'DAY'],
    ['Кольсайский заповедник.jpg', 'DAY'],
    ['Kolsay landscape.jpg', 'DAY'],
    ['210804 Middle Kolsai.jpg', 'DAY'],
    ['Среднее озеро Кольсай.jpg', 'DAY'],
    ['Кольсай.jpg', 'DAY'],
  ],
  'kaindy-lake': [
    ['Озеро Кайынды вид со смотровой площадки.jpg', 'DAY'],
    ['Оз.КАИНДЫ.jpg', 'DAY'],
    ['Озеро Кайынды пейзаж.jpg', 'DAY'],
    ['Алматинская область, озеро Каинды, 2023-05-07 02.jpg', 'DAY'],
    ['Kolsay Lakes national park 1.jpg', 'DAY'],
    ['Снегопад над озером Каинды.jpg', 'DAY'],
    ['Красота озера Қайыңды.jpg', 'DAY'],
    ['НП Кольсайские озера, озеро Каинды, 2023-05-07 06.jpg', 'DAY'],
    ['Lake Kaindy, Kazakhstan.jpg', 'DAY'],
  ],
  'altyn-emel-singing-dune': [
    ['Бархан в заповеднике Алтын-Эмель.jpg', 'GOLDEN_HOUR'],
    ['Altyn Emel 2020 4.jpg', 'DAY'],
    ['Алтын-Эмель, Поющий бархан.jpg', 'DAY'],
    ['ПОЮЩИЙ БАРХАН.jpg', 'DAY'],
    ['Chalk Mountains. Aktau Mountains. Altyn-Emel National Park. Kazakhstan, April 2025 08.jpg', 'DAY'],
    ['Chalk Mountains. Aktau Mountains. Altyn-Emel National Park. Kazakhstan, April 2025 07.jpg', 'GOLDEN_HOUR'],
    ['23 Горы Актау.jpg', 'DAY'],
    ['Поющий бархан. Алтын Эмель. Вид на Или.jpg', 'DAY'],
  ],
  'assy-plateau': [
    ['Обсерватория Ассы-Тургень 31 мая 2021 года.jpg', 'DAY'],
    ['Assy-Turgen Observatory against the backdrop of the center of the Milky Way and the star-forming region around Antares.jpg', 'NIGHT'],
    ['Плато Ассы (8).jpg', 'DAY'],
    ['Обсерватория на плато Ассы-Тургень.jpg', 'DAY'],
    ['Плато Ассы, лошади (1).jpg', 'DAY'],
    ['Высокогорное пастбище на плато Ассы-Тургень.jpg', 'DAY'],
    ['Assy-Turgen observatory.jpg', 'DAY'],
    ['Высокогорное плато Ассы (весна).jpg', 'DAY'],
    ['Енбекшиказахский район, ущелье Киши-Тургень сверху (1).jpg', 'DAY'],
  ],
  'medeu-skating-rink': [
    ['Панорама катка Медео.jpg', 'DAY'],
    ['Туман над катком Медео.jpg', 'DAY'],
    ['Медео, стадион с плотины (2).jpg', 'DAY'],
    ['16 Спорткомплекс Медео.jpg', 'DAY'],
    ['Winter season in Almaty.jpg', 'NIGHT'],
    ['Medeu220425 01.jpg', 'GOLDEN_HOUR'],
    ['Барельеф на входе катка Медео.jpg', 'DAY'],
    ['10 Спорткомплекс Медео.jpg', 'DAY'],
    ['Массовые катания на катке Медео.jpg', 'DAY'],
  ],
  'almaty-soviet-modernism': [
    ['Palace of the Republic, Almaty 2022.jpg', 'DAY'],
    ['Almaty Central State Museum of Kazakhstan, July 2025.jpg', 'DAY'],
    ['Kazakhstan P9200599 14 (39253139165).jpg', 'DAY'],
    ['Almaty Fountain 2007.JPG', 'DAY'],
    ['Kazakhstan P9190561 02 (26251486288).jpg', 'DAY'],
    ['20141012 Kazakhstan 1381 Almaty (16070530498).jpg', 'DAY'],
    ['Almaty, Dec 2023 by Darafsh 20 35 27 156000.jpeg', 'DAY'],
    ['The Academy of Science of Kazakhstan in Almaty.jpg', 'DAY'],
    ['Площадь Республики в Алматы. Июль, 2015 года.JPG', 'DAY'],
  ],
  bozzhyra: [
    ['Чинки плато Устюрт. Урочище Бозжыра.jpg', 'DAY'],
    ['На рассвете. Урочище Бозжыра.jpg', 'GOLDEN_HOUR'],
    ['Бозжыра ночью.jpg', 'NIGHT'],
    ['Вид на останцы. Бозжыра.jpg', 'DAY'],
    ['Boszhira tract. Kazakhstan, Mangistau. November 2024.jpg', 'DAY'],
    ['Вид со смотровой. Бозжыра.jpg', 'DAY'],
    ['Чики урочища Бозжыра.jpg', 'GOLDEN_HOUR'],
    ['Чинки урочища Бозжыра.jpg', 'DAY'],
    ['Каньон. Бозжыра.jpg', 'DAY'],
  ],
  'torysh-valley-of-balls': [
    ['Конкреции в Западном Казахстане. Concretions. Western Kazakhstan.JPG', 'DAY'],
    ['Актау-Бузачинский заказник 01.jpg', 'DAY'],
    ['DSC 1167-Панорама-01.jpg', 'DAY'],
  ],
  'sherkala-mountain': [
    ['Sherqala.jpg', 'DAY'],
    ['Sherkala, Mangistau, Kazakhstan.jpg', 'DAY'],
  ],
  'karagiye-depression': [
    ['Меловые чинки во впадине Каракия.jpg', 'DAY'],
    ['Впадина Каракия.jpg', 'DAY'],
    ['View of Karagiye Depression.JPG', 'DAY'],
    ['Скромный оазис каракия.jpg', 'DAY'],
  ],
  'aktau-caspian-coast': [
    ['Aktau Sunset over the Caspian Sea.jpg', 'GOLDEN_HOUR'],
    ['Yacht club in Aktau.jpg', 'DAY'],
    ['Moon above the Caspian Sea in Aktau.JPG', 'NIGHT'],
    ['Yacht Shokan Ualikhanov-1.jpg', 'DAY'],
    ['Каспийское море.jpg', 'GOLDEN_HOUR'],
    ['Aktau panorama at day.jpg', 'DAY'],
    ['Aktau Panorama at Night 1.jpg', 'NIGHT'],
    ['Marine craft at Aktau seashore.jpg', 'DAY'],
    ['Aktau-lighthouse.jpg', 'DAY'],
    ['Aktau plane.jpg', 'DAY'],
  ],
  'khan-shatyr': [
    ['Khan-Shatyr shopping mall.jpg', 'DAY'],
    ['Astana-2021-10 - 1.jpg', 'DAY'],
    ['Konaev street in Astana (July 2026) - 3.jpg', 'DAY'],
    ['Khan Shatyr.jpg', 'DAY'],
    ['Astana DSC04288 (7711068540).jpg', 'DAY'],
  ],
  'expo-nur-alem': [
    ['Storm over Astana 1.jpg', 'NIGHT'],
    ['Экспо 2017 - Павльон Казахстана 2.jpg', 'DAY'],
    ['Экспо 2017 - Павильон Казахстана 4.jpg', 'DAY'],
    ['Экспо 2017 - Павльон Казахстана 3.jpg', 'DAY'],
    ['Expo 2017 "Nur Alem" Pavilion Space Exhibition.jpg', 'DAY'],
    ['Экспо 2017 - Павльон Казахстана 6.jpg', 'DAY'],
    ['Экспо 2017 - Павльон Казахстана 8.jpg', 'DAY'],
  ],
  burabay: [
    ['Жумбактас и Окжетпес.jpg', 'DAY'],
    ['Borovoe4.jpg', 'DAY'],
    ['Burabay winter.jpg', 'DAY'],
    ['Жумбактас.jpg', 'DAY'],
    ['Окжетпес вид с озера.jpg', 'DAY'],
    ['Borovoe8.jpg', 'GOLDEN_HOUR'],
    ['Бурабай 5.jpg', 'DAY'],
    ['Burabay, 05-04-2024.jpg', 'DAY'],
    ['Густой сосновый лес Бурабай.jpg', 'DAY'],
  ],
  // Only the Kazakh shore: most Commons "Aral ship graveyard" photos are from Moʻynoq, Uzbekistan
  'aral-ship-graveyard': [
    ['The Aral sea is drying up. Bay of Zhalanash, Ship Cemetery, Aralsk, Kazakhstan.jpg', 'DAY'],
    ['Корабль в песке - panoramio.jpg', 'DAY'],
    ['Aralship1-2.jpg', 'DAY'],
    ['Берег Арала - panoramio.jpg', 'DAY'],
    ['A school overtaken by the dune, Aral, Kazakhstan.jpg', 'DAY'],
    ['The Aral sea is drying up. Bay of Zhalanash, Ship Cemetery. Horse and foal, Aralsk, Kazakhstan.jpg', 'DAY'],
  ],
  'turkestan-yasawi': [
    ['Mausoleum of Khoja Ahmed Yasawi in Hazrat-e Turkestan, Kazakhstan.jpg', 'DAY'],
    ['Mausoleum to Koja Ahmad Yassaui, Turkistan, Kazakhstan (2013).jpg', 'DAY'],
    ['Architectural details of Mausoleum of Khoja Ahmed Yasawi 03.jpg', 'DAY'],
    ['Mausoleum of Khoja Ahmed Yasavi in Turkestan, Kazakhstan.jpg', 'DAY'],
    ['Mausoleum of Khoja Ahmed Yasawi.jpg', 'DAY'],
    ['Turkistan.jpg', 'DAY'],
    ['Kazakhstan, Turkestan (48182635672).jpg', 'GOLDEN_HOUR'],
    ['Mausoleums of Khoja Ahmed Yasawi and Sultan Rabiga Begim 2.jpg', 'DAY'],
    ['Architectural details of Mausoleum of Khoja Ahmed Yasawi 05.jpg', 'DAY'],
  ],
  // Regions beyond the original hubs (west, south, Saryarka, Zhetysu, Altai)
  'tuzbair-salt-flat': [
    ['Sor Tuzbair, Mangistau, Kazakhstan, November 2024.jpg', 'DAY'],
    ['Вид на Тузбайыр.jpg', 'DAY'],
    ['Тузбайыр, глазницы.jpg', 'DAY'],
    ['Сор Тузбайыр.jpg', 'DAY'],
    ['Зимний Тузбаир.jpg', 'DAY'],
    ['Меловые стены.jpg', 'DAY'],
  ],
  'beket-ata': [
    ['Beket-Ata (Oglandy).jpg', 'DAY'],
    ['Baker Ata.jpg', 'DAY'],
    ['Местность Огланды.jpg', 'DAY'],
    ['На закате. Жабайушкан.jpg', 'GOLDEN_HOUR'],
    ['Вид на долину. Заказник Жабайушкан.jpg', 'DAY'],
    ['Гора Найза.jpg', 'GOLDEN_HOUR'],
  ],
  aktolagay: [
    ['Горы Актолагай.jpg', 'GOLDEN_HOUR'],
    ['Горы Актолагай ч.2.jpg', 'DAY'],
    ['Фигуры Актолагай.jpg', 'DAY'],
    ['Ущелье Меловых гор Актолагай.jpg', 'DAY'],
    ['Актолагай.jpg', 'DAY'],
  ],
  'khan-ordasy': [
    ['Zhangir Khan Mausoleum.jpg', 'GOLDEN_HOUR'],
    ['Khan Ordasy Treasury.jpg', 'DAY'],
    ['Khan Ordasy Mosque.jpg', 'DAY'],
    ['Khan Ordasy - Typography.jpg', 'DAY'],
    ['Хан ордасы ХVІІІ-ХVІІІІғғ.jpg', 'DAY'],
    ['Бокей Орда, Лесной массив, Западно-Казахстанская область 2025.jpg', 'DAY'],
  ],
  'oral-old-town': [
    ['Церковь Уральск.jpg', 'DAY'],
    ['Kazakhstan Uralsk Mikhailo-Arkhangelskiy sobor.jpg', 'DAY'],
    ['Музей А.С. Пушкина - panoramio (7).jpg', 'DAY'],
    ['Kazakhstan Uralsk Christ the Savior church.jpg', 'DAY'],
    ['Дом атамана в Уральске - 2.jpg', 'DAY'],
    ['Здание типичной городской усадьбы (военная прокуратура).jpg', 'DAY'],
    ['ЗКГУ - Главный корпус.jpg', 'DAY'],
    ['Урал лето 2012г - panoramio.jpg', 'DAY'],
  ],
  'atyrau-ural-river': [
    ['AtyrauRiversideMay2022.jpg', 'GOLDEN_HOUR'],
    ['Ural River Atyrau.JPG', 'DAY'],
    ['Atyrau footbridge across Ural River.jpg', 'DAY'],
    ['AtyrauRiversideMay2022 13.jpg', 'GOLDEN_HOUR'],
    ['Ural river Atyrau.jpg', 'DAY'],
    ['Atyrau.jpg', 'GOLDEN_HOUR'],
    ['Набережная реки Урал в Атырау - panoramio.jpg', 'DAY'],
    ['Zhilgorodok Atyrau.JPG', 'DAY'],
    ['2 Şevçenko St, Atyrau.jpg', 'DAY'],
  ],
  // Kurmangazy uses only the team's own photos (LOCAL below)
  kelinshektau: [
    ['Гора Келиншектау.jpg', 'DAY'],
    ['Петроглифы Арпаозен в ландшафте.jpg', 'DAY'],
    ['Петроглифы Арпаозен крупно.jpg', 'DAY'],
  ],
  'aksu-canyon': [
    ['Aksu-Canyon-Shymkent-Kazakhstan.jpg', 'GOLDEN_HOUR'],
    ['Река Аксу.jpg', 'DAY'],
    ['Аксу-Жабаглинский заповедник1.jpg', 'DAY'],
    ['Аксу-Жабаглинский заповедник2.jpg', 'DAY'],
    ['Каньон реки Аксу в Туркестанской области.jpg', 'DAY'],
    ['Живописная середина.jpg', 'DAY'],
    ['Каньон Аксу-Джабаглы, южный Казахстан.jpg', 'DAY'],
    ['AD1824.jpg', 'DAY'],
  ],
  sauran: [
    ['Sauran 2.jpg', 'DAY'],
    ['Sauran 1.jpg', 'DAY'],
    ['Sauran 3.jpg', 'DAY'],
    ['Sawran, Kazakhstan 03.jpg', 'DAY'],
    ['Sawran, Kazakhstan 01.jpg', 'DAY'],
    ['Sawran, Kazakhstan 02.jpg', 'DAY'],
    ['Sawran, Kazakhstan 05.jpg', 'DAY'],
  ],
  otrar: [
    ['Otyrar.jpg', 'DAY'],
    ['Otrar aerial view-Aug-2018.jpg', 'DAY'],
    ['Otrar aerial view from May 2016.jpg', 'DAY'],
    ['Arystan Bab mausoleum center 02.jpg', 'GOLDEN_HOUR'],
    ['Городище Куйрыктобе (город Кедер) с воздуха.jpg', 'DAY'],
  ],
  baikonur: [
    ['Космодром Байконур, стартовый стол на Гагаринском старте (8).jpg', 'DAY'],
    ['Космодром Байконур, стартовый стол на Гагаринском старте (3).jpg', 'DAY'],
    ['Космодром Байконур, транспортёры Энергии (3).jpg', 'DAY'],
    ['Космодром Байконур, ангар на площадке 112а (2).jpg', 'DAY'],
    ['Космодром Байконур, въезд на Гагаринский старт.jpg', 'DAY'],
    ['Baikonur Cosmodrome IMG 2562 Baikonur (37308286245).jpg', 'GOLDEN_HOUR'],
    ['Baikonur Cosmodrome IMG 2611 Baikonur (37134957162).jpg', 'DAY'],
    ['Baikonur Cosmodrome IMG 2593 Baikonur (37134883802).jpg', 'DAY'],
    ['Космодром Байконур, стартовый стол на Гагаринском старте (6).jpg', 'DAY'],
  ],
  akyrtas: [
    ['Akyrtas.JPG', 'GOLDEN_HOUR'],
    ['Akyrtas 05-2020.jpg', 'DAY'],
  ],
  'karatau-zhanatas': [
    ['Кентау. Вид 012 2007.jpg', 'GOLDEN_HOUR'],
    ['Karatau mountains from Bestam.jpg', 'DAY'],
    ['Karatau2019.jpg', 'DAY'],
    ['Karatau.jpg', 'DAY'],
    ['Қаратау(күн шуағы).jpg', 'DAY'],
  ],
  'kapshagay-ili': [
    ['Конаев от ГЭС сверху.jpg', 'DAY'],
    ['Kapchagay - panoramio.jpg', 'DAY'],
    ['Kapchagay - panoramio (1).jpg', 'DAY'],
    ['Алтынэмель, Капчагай 3.jpg', 'DAY'],
    ['Tamgaly-Tas Petroglyphs.JPG', 'DAY'],
    ['Конаев, Капчагайская ГЭС сверху.jpg', 'DAY'],
    ['Залив на Капчагайском водохранилище.jpg', 'GOLDEN_HOUR'],
    ['Река Или - panoramio (3).jpg', 'DAY'],
    ['Конаев сверху на закате.jpg', 'NIGHT'],
  ],
  'kora-gorge': [
    ['Коринское ущелье.jpg', 'DAY'],
    ['Коринское ущелье в августе.jpg', 'DAY'],
    ['Ущелье реки Кора.jpg', 'DAY'],
    ['Закат солнца в ущелье реки Кора.jpg', 'GOLDEN_HOUR'],
    ['Yurt in Tekeli.JPG', 'DAY'],
    ['Река Кора под пасмурным небом.jpg', 'DAY'],
    ['Поляна цветов в ущелье реки Кора.jpg', 'DAY'],
    ['Коринское ущелье на закате.jpg', 'GOLDEN_HOUR'],
    ['Zhambyl Glacier (Dzungarian Alatau).jpg', 'DAY'],
  ],
  'kok-zhailau': [
    ['Кок-Жайлау летом.jpg', 'DAY'],
    ['Kok Jailau midway viewpoint.jpg', 'DAY'],
    ['Вечерний Кок Жайлау.jpg', 'GOLDEN_HOUR'],
    ['Kok Jailaoo in the morning.jpg', 'DAY'],
    ['KokZhailao 2.jpg', 'DAY'],
    ['Kok-Jailau Panorama - panoramio.jpg', 'DAY'],
    ['Кок-Жайляу в зимнее время.jpg', 'DAY'],
    ['Ile-Alatau national park, May, 2018-11.jpg', 'DAY'],
    ['На подходе к Кок Жайлау.jpg', 'DAY'],
  ],
  alakol: [
    ['Оз. Алаколь.jpg', 'DAY'],
    ['Коса у посёлка Акши.jpg', 'DAY'],
    ['Берег Алаколя.jpg', 'DAY'],
    ['Rock n set.jpg', 'GOLDEN_HOUR'],
    ['Перед грозой на озере Алаколь.jpg', 'DAY'],
    ['Панорама озера Алаколь.jpg', 'GOLDEN_HOUR'],
    ['Небольшие островки Алаколя.jpg', 'DAY'],
    ['Алаколь Аралтобе.jpg', 'GOLDEN_HOUR'],
    ['Пирс на озере Алаколь.jpg', 'NIGHT'],
  ],
  'bektau-ata': [
    ['Каменная черепаха в горном массиве Бектау-Ата - июль 2017.jpg', 'DAY'],
    ['Бектау ата.jpg', 'DAY'],
    ['Гора Бектау-Ата.jpg', 'DAY'],
    ['Bektau Ata.jpg', 'DAY'],
    ['Вид из окна. Бектау-Ата, Карагандинская область - июль 2017.jpg', 'DAY'],
    ['Исполин, массив Бектау-Ата, Карагандинская область - июль 2017.jpg', 'DAY'],
    ['Сфинкс, массив Бектау-Ата, Карагандинская область - июль 2017.jpg', 'DAY'],
    ['Тишина на озере в урочище Бектау-Ата, Карагандинская область - июль 2017.jpg', 'DAY'],
    ['Bektau Ata 005.jpg', 'DAY'],
  ],
  'balkhash-lake': [
    ['Lake Balkhash. Mynaral village. 03.jpg', 'GOLDEN_HOUR'],
    ['Balkhash lake, september 2020.jpg', 'DAY'],
    ['Озеро Балхаш (часть мыса Каратубек).jpg', 'DAY'],
    ['Lake Balkhash. Mynaral village. 01.jpg', 'GOLDEN_HOUR'],
    ['Озеро Балхаш у Приозерска.jpg', 'DAY'],
    ['Дельта реки Или при впадении в Балхаш (1).jpg', 'DAY'],
    ['Lake Balkhash. Mynaral village. 11.jpg', 'GOLDEN_HOUR'],
    ['KTZ VL80 Shyganak.jpg', 'DAY'],
    ['Lake Balkhash Sep 2007 4.JPG', 'GOLDEN_HOUR'],
  ],
  karkaraly: [
    ['Каркаралинский национальный парк озеро Пашено.jpg', 'DAY'],
    ['06 Каркаралинский национальный парк.jpg', 'DAY'],
    ['Каркаралинск вид на Чертово озеро.jpg', 'DAY'],
    ['Karkaraly District, Kazakhstan - panoramio (3).jpg', 'DAY'],
    ['24 Каркаралинский национальный парк.jpg', 'DAY'],
    ['Чертово озеро2.jpg', 'DAY'],
    ['Граниты.jpg', 'DAY'],
    ['Karkaraly District, Kazakhstan - panoramio (1).jpg', 'DAY'],
    ['07 Каркаралинский национальный парк.jpg', 'DAY'],
  ],
  bayanaul: [
    ['Лошадка в Торайгыре (недалеко от Баянаула).jpg', 'DAY'],
    ['Горы в Баянауле.jpg', 'DAY'],
    ['Kempir-Tas.jpg', 'DAY'],
    ['Konyr-Aulie, Bayanaul 1.jpg', 'DAY'],
    ['Озеро Жасыбай и окрестная природа.jpg', 'DAY'],
    ['Озеро Жасыбай ранним утром.jpg', 'DAY'],
    ['Горы Баянаула (2).jpg', 'DAY'],
    ['Горы в Баянауле 18.jpg', 'DAY'],
    ['Herd of horses.jpg', 'DAY'],
  ],
  ulytau: [
    ['Улытауский государственный природный заказник2.jpg', 'GOLDEN_HOUR'],
    ['Жошы хан кесенесі.jpg', 'DAY'],
    ['Горы Улытау 3.jpg', 'DAY'],
    ['Улытауский государственный природный заказник3.jpg', 'DAY'],
    ['Alasha-Khan Mausoleum-1.jpg', 'DAY'],
    ['Ulutay 2.jpg', 'DAY'],
    ['Ulutay 1.jpg', 'DAY'],
  ],
  'priozersk-sary-shagan': [
    ['Балхаш-9, казарма (1).jpg', 'GOLDEN_HOUR'],
    ['Приозёрск, дом офицеров.jpg', 'DAY'],
    ['Балхаш-9, главная улица (1).jpg', 'GOLDEN_HOUR'],
    ['Орта Дересин, ТЭ33АС-0215 с составом (1).jpg', 'DAY'],
    ['Орта Дересин, катер и МТЗ-82.jpg', 'DAY'],
    ['Балхаш-9, Днепр (1).jpg', 'DAY'],
    ['Балхаш-9, Днепр сверху (1).jpg', 'DAY'],
    ['Балхаш-9, овощехранилище.jpg', 'DAY'],
    ['Mikoyan-Gurevich MiG-17PF ‘01’ (30785744327).jpg', 'DAY'],
    ['Приозёрск, КС-30 у дома офицеров.jpg', 'DAY'],
  ],
  korgalzhyn: [
    ['Sunset in Korgalzhyn Nature Reserve.jpg', 'GOLDEN_HOUR'],
    ['Розовые фламинго в живой природе.jpg', 'DAY'],
    ['Korgalzhinskiy Nature Reserve.JPG', 'DAY'],
    ['Photo 5301034995810425842 w.jpg', 'DAY'],
    ['New Born Saiga in Korgalzhyn Reserve.jpg', 'DAY'],
    ['Photo 5317006359981583632 w.jpg', 'DAY'],
    ['Photo 5317006359981583653 w.jpg', 'DAY'],
  ],
  'katon-karagai': [
    ['Перевал радостный панорама.jpg', 'DAY'],
    ['Катон-Карагайский национальный парк лошади в поле.jpg', 'DAY'],
    ['Rakhmanovskie Klyuchi.jpg', 'DAY'],
    ['Soldier Kulzhan lake.jpg', 'DAY'],
    ['Yazevoye Lake.jpg', 'DAY'],
    ['Гора Белуха вид с перевала Радостный.jpg', 'DAY'],
    ['Рапсовое поле панорама.jpg', 'DAY'],
    ['Катон-Карагайский национальный парк гора с острым пиком.jpg', 'DAY'],
    ['Панорама на гору в Катон-Карагае зима.jpg', 'DAY'],
  ],
  markakol: [
    ['Озеро Маркаколь. Вид с южного берега.jpg', 'DAY'],
    ['Озеро Маркаколь. Август.jpg', 'DAY'],
    ['Markakol 1.jpg', 'GOLDEN_HOUR'],
    ['Село Урунхайка.jpg', 'DAY'],
    ['Озеро Маркаколь с южного берега.jpg', 'DAY'],
    ['Kazakhs.jpg', 'DAY'],
    ['Озеро Маркаколь. Вид на с. Урунхайка.jpg', 'GOLDEN_HOUR'],
    ['Озеро Маркаколь и село Урунхайка.jpg', 'DAY'],
    ['Гора "Самовар", Маркакольский ГПЗ.jpg', 'DAY'],
  ],
};

/**
 * Flickr photos under free licences (found through Openverse), appended after the Commons picks. Only for places
 * Commons barely covers: Flickr serves at most 1024 px without an API key, so these stay out of covers and reels.
 */
const FLICKR = {
  'sherkala-mountain': [
    { title: 'Sherkala mountain', artist: 'Valeria Bolotova', licence: 'CC BY 2.0', page: 'https://www.flickr.com/photos/75253886@N04/7138745091', url: 'https://live.staticflickr.com/7186/7138745091_49d181023e_b.jpg', timeOfDay: 'DAY' },
    { title: 'Sherkala Camel Temir', artist: 'Valeria Bolotova', licence: 'CC BY 2.0', page: 'https://www.flickr.com/photos/75253886@N04/7138752305', url: 'https://live.staticflickr.com/7258/7138752305_c90fc79303_b.jpg', timeOfDay: 'DAY' },
  ],
  'khan-shatyr': [
    { title: 'Khan Shatyr at night', artist: 'upyernoz', licence: 'CC BY 2.0', page: 'https://www.flickr.com/photos/48600082269@N01/5171281221', url: 'https://live.staticflickr.com/4124/5171281221_225e5e2f10_b.jpg', timeOfDay: 'NIGHT' },
    { title: 'Торговый центр Хан Шатыр', artist: 'ayampolsky', licence: 'CC BY-SA 2.0', page: 'https://www.flickr.com/photos/157001631@N07/48014731756', url: 'https://live.staticflickr.com/65535/48014731756_f96416c313_b.jpg', timeOfDay: 'GOLDEN_HOUR' },
    { title: 'IMG_0664 Astana', artist: 'Ninara', licence: 'CC BY 2.0', page: 'https://www.flickr.com/photos/37583176@N00/8376794291', url: 'https://live.staticflickr.com/8097/8376794291_e2fd239a04_b.jpg', timeOfDay: 'DAY' },
  ],
  otrar: [
    { title: 'Remains of a hammam, 13th - 15th cents., Otrar, southern Kazakhstan (8)', artist: 'Prof. Mortel', licence: 'CC BY 2.0', page: 'https://www.flickr.com/photos/43714545@N06/53173989352', url: 'https://live.staticflickr.com/65535/53173989352_88c4ec5d2a_b.jpg', timeOfDay: 'DAY' },
    { title: 'Khanaqa of Erzen Khan of the Mongol White Horde, 14th-15th cents., Otrar, southern Kazakhstan (4)', artist: 'Prof. Mortel', licence: 'CC BY 2.0', page: 'https://www.flickr.com/photos/43714545@N06/53175076903', url: 'https://live.staticflickr.com/65535/53175076903_a4f1e4e535_b.jpg', timeOfDay: 'DAY' },
  ],
};

/**
 * Photos the team supplied (already in media-src/<slug>/, nothing to download). They come before the Commons picks,
 * so the first one is the cover — unless marked `at: 'gallery'`, then they follow the Commons cover.
 * `credit` stays empty until the author is confirmed.
 */
const LOCAL = {
  astana: [
    { file: 'astana-expo-sphere-sunset.jpg', timeOfDay: 'GOLDEN_HOUR', en: 'The EXPO sphere and the skyline at sunset', ru: 'Сфера EXPO и небоскрёбы на закате' },
    { file: 'astana-baiterek-sunset.jpg', timeOfDay: 'GOLDEN_HOUR', en: 'Baiterek tower under a sunset sky', ru: 'Байтерек под закатным небом' },
    { file: 'astana-left-bank-towers.jpg', timeOfDay: 'DAY', en: 'A street between the Left Bank towers', ru: 'Улица между башнями Левого берега' },
    { file: 'astana-night-skyline-khan-shatyr.jpg', timeOfDay: 'NIGHT', en: 'Night skyline with Khan Shatyr', ru: 'Ночная Астана и Хан Шатыр' },
    { file: 'astana-atyrau-bridge.jpg', timeOfDay: 'DAY', en: 'Atyrau pedestrian bridge over the Ishim', ru: 'Пешеходный мост «Атырау» через Ишим' },
    { file: 'astana-lrt-towers.jpg', timeOfDay: 'DAY', en: 'The LRT line between glass towers', ru: 'Линия LRT между стеклянными башнями' },
    { file: 'astana-mural-call-your-mom.jpg', timeOfDay: 'NIGHT', en: 'Mural on a Soviet-era block: "Did you call your mom today?"', ru: 'Мурал на советской многоэтажке: «А ты звонил сегодня маме?»' },
  ],
  'aral-ship-graveyard': [
    { file: 'aral-ship-graveyard-rusty-ship-clouds.jpg', at: 'gallery', timeOfDay: 'DAY', en: 'A rusting trawler on the old seabed', ru: 'Ржавый траулер на старом дне моря' },
    { file: 'aral-ship-graveyard-three-ships-white-sand.jpg', at: 'gallery', timeOfDay: 'DAY', en: 'Three wrecks on white sand from above', ru: 'Три корабля на белом песке сверху' },
    { file: 'aral-ship-graveyard-walking-among-wrecks.jpg', at: 'gallery', timeOfDay: 'DAY', en: 'Walking among the wrecks', ru: 'Среди остовов кораблей' },
  ],
  'kurmangazy-delta': [
    { file: 'kurmangazy-delta-dunes-sunset.jpg', timeOfDay: 'GOLDEN_HOUR', en: 'Dunes at sunset above the green delta', ru: 'Барханы на закате над зелёной дельтой' },
    { file: 'kurmangazy-delta-lotus-fields-aerial.jpg', timeOfDay: 'DAY', en: 'Lotus fields from above, boats in the channels', ru: 'Лотосовые поля сверху, лодки в протоках' },
    { file: 'kurmangazy-delta-red-dune.jpg', timeOfDay: 'GOLDEN_HOUR', en: 'Rippled dune in warm evening light', ru: 'Рябь бархана в тёплом вечернем свете' },
    { file: 'kurmangazy-delta-reed-channel.jpg', timeOfDay: 'DAY', en: 'A boat channel between walls of reed', ru: 'Протока для лодок между стенами тростника' },
    { file: 'kurmangazy-delta-dune-dusk.jpg', timeOfDay: 'GOLDEN_HOUR', en: 'Dune crest after the sun has set', ru: 'Гребень дюны после заката' },
    { file: 'kurmangazy-delta-swans-reeds.jpg', timeOfDay: 'DAY', en: 'Swans by the reed beds', ru: 'Лебеди у тростниковых зарослей' },
    { file: 'kurmangazy-delta-heron.jpg', timeOfDay: 'DAY', en: 'Heron over the reeds', ru: 'Цапля над тростником' },
  ],
};

const OK_LICENCE =/^(CC0|CC BY(-SA)? [0-9.]+|Public domain|PD)/i;
const strip = (html = '') => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** Image info for up to 50 titles; thumbnails capped at 3200 px wide */
async function info(titles) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  Object.entries({
    action: 'query',
    titles: titles.map((t) => `File:${t}`).join('|'),
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '3200',
    iiextmetadatafilter: 'LicenseShortName|Artist',
    format: 'json',
  }).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`Commons ${res.status}`);
  const data = await res.json();
  // The API normalises titles (underscores, first letter); map the answers back to what was asked
  const asked = new Map((data.query?.normalized ?? []).map((n) => [n.to, n.from]));
  const out = new Map();
  for (const p of Object.values(data.query?.pages ?? {})) {
    const i = p.imageinfo?.[0];
    const m = i?.extmetadata ?? {};
    out.set((asked.get(p.title) ?? p.title).replace(/^File:/, ''), i && {
      page: i.descriptionurl,
      url: i.thumburl ?? i.url,
      mime: i.mime,
      licence: strip(m.LicenseShortName?.value),
      artist: strip(m.Artist?.value) || 'Unknown author',
    });
  }
  return out;
}

async function main() {
  const all = Object.values(PICKS).flat().map(([t]) => t);
  const found = new Map();
  for (let i = 0; i < all.length; i += 50) for (const [k, v] of await info(all.slice(i, i + 50))) found.set(k, v);

  const items = [];
  for (const slug of new Set([...Object.keys(PICKS), ...Object.keys(FLICKR), ...Object.keys(LOCAL)])) {
    await mkdir(join(ROOT, slug), { recursive: true });
    const picks = [
      ...(LOCAL[slug] ?? []).map((l) => {
        const file = `${slug}/${l.file}`;
        if (!existsSync(join(ROOT, file))) throw new Error(`${file} is missing`);
        return { file, title: l.en, altEn: l.en, altRu: l.ru, credit: l.credit ?? null, source: null, timeOfDay: l.timeOfDay, at: l.at };
      }),
      ...(PICKS[slug] ?? []).map(([title, timeOfDay]) => {
        const c = found.get(title);
        if (!c) throw new Error(`${slug}: "${title}" not found on Commons`);
        if (!/jpeg/.test(c.mime) || !OK_LICENCE.test(c.licence)) throw new Error(`${slug}: "${title}" is ${c.mime}, ${c.licence}`);
        return { key: title, url: c.url, title: title.replace(/\.jpe?g$/i, ''), credit: `${c.artist} / ${c.licence} via Wikimedia Commons`, source: c.page, timeOfDay };
      }),
      ...(FLICKR[slug] ?? []).map((f) => ({ key: f.url, url: f.url, title: f.title, credit: `${f.artist} / ${f.licence} via Flickr`, source: f.page, timeOfDay: f.timeOfDay })),
    ];
    // Team photos marked for the gallery go right after the (Commons) cover
    const later = picks.filter((p) => p.at === 'gallery');
    if (later.length) picks.splice(0, picks.length, ...picks.filter((p) => p.at !== 'gallery').slice(0, 1), ...later, ...picks.filter((p) => p.at !== 'gallery').slice(1));
    for (const [n, p] of picks.entries()) {
      // The name follows the source file, so a new pick never reuses an old upload
      const file = p.file ?? `${slug}/${slug}-${createHash('sha1').update(p.key).digest('hex').slice(0, 8)}.jpg`;
      if (!existsSync(join(ROOT, file))) {
        const res = await fetch(p.url, { headers: { 'user-agent': UA } });
        if (!res.ok) throw new Error(`${p.title}: ${res.status}`);
        await writeFile(join(ROOT, file), Buffer.from(await res.arrayBuffer()));
        await new Promise((r) => setTimeout(r, 300)); // be polite to Commons
      }
      items.push({
        file,
        kind: 'PHOTO',
        title: p.title,
        credit: p.credit,
        source: p.source,
        ...(p.altEn ? { altEn: p.altEn, altRu: p.altRu } : {}),
        location: slug,
        role: 'PHOTO',
        timeOfDay: p.timeOfDay,
        cover: n === 0,
      });
    }
    console.log(`✓ ${slug}: ${picks.length} photo(s)`);
  }
  await writeFile(join(ROOT, 'photos.json'), JSON.stringify({ items }, null, 2));
  console.log(`photos.json: ${items.length} items`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
