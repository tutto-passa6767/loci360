// Russian labels for the CMS

export const LEAD_STATUS: Record<string, { label: string; tone: 'blue' | 'yellow' | 'green' | 'red' | 'gray' }> = {
  NEW: { label: 'Новая', tone: 'blue' },
  IN_PROGRESS: { label: 'В работе', tone: 'yellow' },
  PROPOSAL: { label: 'Отправлено предложение', tone: 'yellow' },
  WON: { label: 'Съёмки согласованы', tone: 'green' },
  LOST: { label: 'Не состоялась', tone: 'gray' },
  SPAM: { label: 'Спам', tone: 'red' },
};
export const LEAD_STATUSES = Object.keys(LEAD_STATUS);

export const PROJECT_TYPE: Record<string, string> = {
  FEATURE: 'Полнометражный фильм',
  SERIES: 'Сериал',
  COMMERCIAL: 'Реклама',
  MUSIC_VIDEO: 'Клип',
  DOCUMENTARY: 'Документальный',
  OTHER: 'Другое',
};

export const BUDGET: Record<string, string> = {
  UNDER_500K: 'до $500 тыс.',
  FROM_500K_TO_2M: '$500 тыс. – $2 млн',
  FROM_2M_TO_10M: '$2 – 10 млн',
  OVER_10M: 'более $10 млн',
  UNDISCLOSED: 'не указан',
};

export const PUBLISH_STATUS: Record<string, { label: string; tone: 'green' | 'gray' | 'yellow' }> = {
  PUBLISHED: { label: 'Опубликована', tone: 'green' },
  DRAFT: { label: 'Черновик', tone: 'yellow' },
  ARCHIVED: { label: 'В архиве', tone: 'gray' },
};

export const ASSET_KIND: Record<string, string> = { VIDEO: 'Видео', PHOTO: 'Фото', PANORAMA: 'Панорама 360°' };

export const ASSET_STATE: Record<string, { label: string; tone: 'green' | 'yellow' | 'red' | 'blue' | 'gray' }> = {
  UPLOADING: { label: 'Загружается', tone: 'blue' },
  PENDING: { label: 'В очереди', tone: 'gray' },
  RUNNING: { label: 'Обрабатывается', tone: 'yellow' },
  READY: { label: 'Готово', tone: 'green' },
  FAILED: { label: 'Ошибка', tone: 'red' },
};

export const MEDIA_ROLE: Record<string, string> = { SHOWREEL: 'Шоурил', BROLL: 'B-roll', PHOTO: 'Фото', PANORAMA: 'Панорама 360°' };
export const TIME_OF_DAY: Record<string, string> = { DAY: 'День', GOLDEN_HOUR: 'Золотой час', NIGHT: 'Ночь' };
export const TERM_KIND: Record<string, string> = { GENRE: 'Жанры', LANDSCAPE: 'Ландшафт и архитектура', ERA: 'Эпохи', TAG: 'Быстрые теги (главная)' };
export const SEASON: Record<string, string> = { SPRING: 'Весна', SUMMER: 'Лето', AUTUMN: 'Осень', WINTER: 'Зима' };
export const ACCESS: Record<string, string> = {
  FULL: 'Асфальт — грузовики и прицепы',
  LIMITED: 'Грунт / сезонно — грузовики с осторожностью',
  OFFROAD: 'Только 4×4',
  NONE: 'Без подъезда техники',
};
export const CONNECTIVITY: Record<string, string> = { NONE: 'Нет связи', G2: '2G', G3: '3G', G4: '4G / LTE', G5: '5G' };
export const POWER: Record<string, string> = { GRID: 'Сеть на площадке', NEARBY: 'Сеть в нескольких км', GENERATOR: 'Только генераторы' };
export const DRONE: Record<string, string> = { ALLOWED: 'Обычная регистрация', PERMIT: 'Нужно спецразрешение', RESTRICTED: 'Запретная зона' };
export const SERVICE_CATEGORY: Record<string, string> = {
  PRODUCTION_SERVICES: 'Продакшн-сервис',
  RENTAL: 'Прокат техники',
  CATERING: 'Кейтеринг',
  CAST: 'Кастинг',
  TRANSPORT: 'Транспорт',
  ACCOMMODATION: 'Проживание',
};

export const options = (map: Record<string, string>) => Object.entries(map).map(([value, label]) => ({ value, label }));

export const countryName = (code: string) => {
  try {
    return new Intl.DisplayNames(['ru'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
};
