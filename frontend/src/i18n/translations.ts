export type Lang = "en" | "ru";

/**
 * Static UI translations — only for UI chrome, not city names.
 * City names come from Nominatim in real-time.
 */
const translations = {
  en: {
    appName: "EarthAtmos",
    appDesc: "AI weather forecast · NASA POWER",
    search: "Search any city...",
    searchBtn: "Search",
    pickOnMap: "Map",
    myLocation: "My Location",
    selectLocation: "Select Location",
    getForecast: "Get Forecast",
    clickMap: "Click on the map to select a location",
    resolving: "Resolving...",
    loading: "Fetching NASA data...",
    today: "Today",
    tomorrow: "Tomorrow",
    temperature: "Temperature",
    humidity: "Humidity",
    wind: "Wind",
    pressure: "Pressure",
    precipitation: "Precipitation",
    sunrise: "Sunrise",
    sunset: "Sunset",
    localTime: "Local time",
    timezone: "Timezone",
    hourlyForecast: "Hourly",
    confidence: "confidence",
    normal: "Normal",
    mildAnomaly: "Mild anomaly",
    severeAnomaly: "Severe anomaly",
    anomalyScore: "Anomaly score",
    dataSource: "NASA POWER",
    lastObs: "Last obs",
    emptyTitle: "Search a city",
    emptyDesc: "Enter any city name in any language",
    close: "Close",
    days: "days",
    noResults: "No cities found",
    recentSearches: "Recent",
    lang: "Language",
    theme: "Theme",
    searching: "Searching...",
    typeToSearch: "Type to search any city worldwide",
  },
  ru: {
    appName: "EarthAtmos",
    appDesc: "ИИ-прогноз погоды · NASA POWER",
    search: "Поиск любого города...",
    searchBtn: "Найти",
    pickOnMap: "Карта",
    myLocation: "Моё место",
    selectLocation: "Выберите место",
    getForecast: "Прогноз",
    clickMap: "Нажмите на карту для выбора",
    resolving: "Определяем...",
    loading: "Загрузка данных NASA...",
    today: "Сегодня",
    tomorrow: "Завтра",
    temperature: "Температура",
    humidity: "Влажность",
    wind: "Ветер",
    pressure: "Давление",
    precipitation: "Осадки",
    sunrise: "Восход",
    sunset: "Закат",
    localTime: "Местное время",
    timezone: "Часовой пояс",
    hourlyForecast: "По часам",
    confidence: "уверенность",
    normal: "Норма",
    mildAnomaly: "Лёгкая аномалия",
    severeAnomaly: "Сильная аномалия",
    anomalyScore: "Оценка аномалии",
    dataSource: "NASA POWER",
    lastObs: "Посл. набл.",
    emptyTitle: "Найдите город",
    emptyDesc: "Введите название города на любом языке",
    close: "Закрыть",
    days: "дней",
    noResults: "Города не найдены",
    recentSearches: "Недавние",
    lang: "Язык",
    theme: "Тема",
    searching: "Поиск...",
    typeToSearch: "Введите название города",
  },
} as const;

export type TranslationKey = keyof (typeof translations)["en"];

export function t(lang: Lang, key: TranslationKey): string {
  return translations[lang]?.[key] ?? translations.en[key] ?? key;
}

/**
 * Weather type translations.
 * These are the only "hardcoded" translations we keep,
 * because they're model output labels, not user input.
 */
export const WEATHER_NAMES: Record<Lang, Record<string, string>> = {
  en: {
    clear: "Clear",
    cloudy: "Cloudy",
    rain: "Rain",
    snow: "Snow",
    storm: "Storm",
    unknown: "Unknown",
  },
  ru: {
    clear: "Ясно",
    cloudy: "Облачно",
    rain: "Дождь",
    snow: "Снег",
    storm: "Гроза",
    unknown: "Неизвестно",
  },
};

/**
 * Short weekday names.
 * We keep these because Intl.DateTimeFormat on some browsers
 * doesn't support all locales consistently.
 */
export const WEEKDAYS_SHORT: Record<Lang, string[]> = {
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  ru: ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"],
};

export const MONTHS: Record<Lang, string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  ru: ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"],
};