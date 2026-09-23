/**
 * A second, older dictionary — search-filter copy only, kept inline.
 *
 * It duplicates `src/i18n` down to the `Locale` type. Folding it into the
 * JSON dictionaries is a cleanup of its own; for now it carries the same
 * languages, because a locale the app offers but this file has never heard
 * of falls back to English mid-screen.
 */
export type Locale = 'en' | 'es' | 'pt';

export const defaultLocale: Locale = 'es';
export const supportedLocales: Locale[] = ['en', 'es', 'pt'];

type Dict = Record<string, string>;

const en: Dict = {
  'search.placeholder': 'Search',
  'search.filters.title': 'Filters',
  'search.filters.fromUser.title': 'From a specific user',
  'search.filters.fromUser.example': 'from: user',
  'search.filters.inChannel.title': 'Sent in a specific channel',
  'search.filters.inChannel.example': 'in: channel',
  'search.filters.has.title': 'Includes a specific type of data',
  'search.filters.has.example': 'has: link, embed or file',
  'search.filters.mentions.title': 'Mentions a specific user',
  'search.filters.mentions.example': 'mentions: user',
  'search.filters.more.title': 'More filters',
  'search.filters.more.example': 'dates, author type and more',
  'search.history.title': 'History',
  'search.history.clear': 'Clear history',
  'search.history.empty': 'No recent searches',
  'search.toolbar.filters': 'Filters',
  'search.toolbar.sort': 'Sort',
  'search.sort.relevance': 'Relevance',
  'search.sort.newest': 'Newest',
  'search.sort.oldest': 'Oldest',
  'search.noResults': 'No results found',
  'search.loadMore': 'Load more results',
  'search.searching': 'Searching…',
  'search.picker.from.title': 'From which user?',
  'search.picker.in.title': 'In which channel?',
  'search.picker.mentions.title': 'Mentioning which user?',
  'search.picker.has.title': 'Containing what?',
  'search.picker.more.title': 'More filters',
  'search.picker.before': 'Before',
  'search.picker.after': 'After',
  'search.picker.searchMembers': 'Search members',
  'search.picker.searchChannels': 'Search channels',
  'search.has.link': 'Link',
  'search.has.image': 'Image',
  'search.has.video': 'Video',
  'search.has.file': 'File',
};

const es: Dict = {
  'search.placeholder': 'Buscar',
  'search.filters.title': 'Filtros',
  'search.filters.fromUser.title': 'De un usuario específico',
  'search.filters.fromUser.example': 'De: usuario',
  'search.filters.inChannel.title': 'Enviado en un canal específico',
  'search.filters.inChannel.example': 'en: canal',
  'search.filters.has.title': 'Incluye un tipo concreto de datos',
  'search.filters.has.example': 'Tiene: enlace, inserción o archivo',
  'search.filters.mentions.title': 'Menciona a un usuario en concreto',
  'search.filters.mentions.example': 'menciones: usuario',
  'search.filters.more.title': 'Más filtros',
  'search.filters.more.example': 'fechas, tipo de autor y más',
  'search.history.title': 'Historial',
  'search.history.clear': 'Borrar historial',
  'search.history.empty': 'Sin búsquedas recientes',
  'search.toolbar.filters': 'Filtros',
  'search.toolbar.sort': 'Ordenar',
  'search.sort.relevance': 'Relevancia',
  'search.sort.newest': 'Más recientes',
  'search.sort.oldest': 'Más antiguos',
  'search.noResults': 'Sin resultados',
  'search.loadMore': 'Cargar más resultados',
  'search.searching': 'Buscando…',
  'search.picker.from.title': '¿De qué usuario?',
  'search.picker.in.title': '¿En qué canal?',
  'search.picker.mentions.title': '¿Mencionando a qué usuario?',
  'search.picker.has.title': '¿Qué contiene?',
  'search.picker.more.title': 'Más filtros',
  'search.picker.before': 'Antes de',
  'search.picker.after': 'Después de',
  'search.picker.searchMembers': 'Buscar miembros',
  'search.picker.searchChannels': 'Buscar canales',
  'search.has.link': 'Enlace',
  'search.has.image': 'Imagen',
  'search.has.video': 'Video',
  'search.has.file': 'Archivo',
};

const pt: Dict = {
  'search.placeholder': 'Buscar',
  'search.filters.title': 'Filtros',
  'search.filters.fromUser.title': 'De uma pessoa específica',
  'search.filters.fromUser.example': 'from: usuário',
  'search.filters.inChannel.title': 'Enviado num canal específico',
  'search.filters.inChannel.example': 'in: canal',
  'search.filters.has.title': 'Inclui um tipo específico de conteúdo',
  'search.filters.has.example': 'has: link, embed ou arquivo',
  'search.filters.mentions.title': 'Menciona uma pessoa específica',
  'search.filters.mentions.example': 'mentions: usuário',
  'search.filters.more.title': 'Mais filtros',
  'search.filters.more.example': 'datas, tipo de autor e mais',
  'search.history.title': 'Histórico',
  'search.history.clear': 'Limpar histórico',
  'search.history.empty': 'Nenhuma busca recente',
  'search.toolbar.filters': 'Filtros',
  'search.toolbar.sort': 'Ordenar',
  'search.sort.relevance': 'Relevância',
  'search.sort.newest': 'Mais recentes',
  'search.sort.oldest': 'Mais antigos',
  'search.noResults': 'Nenhum resultado',
  'search.loadMore': 'Carregar mais resultados',
  'search.searching': 'Buscando…',
  'search.picker.from.title': 'De qual pessoa?',
  'search.picker.in.title': 'Em qual canal?',
  'search.picker.mentions.title': 'Mencionando quem?',
  'search.picker.has.title': 'Contendo o quê?',
  'search.picker.more.title': 'Mais filtros',
  'search.picker.before': 'Antes de',
  'search.picker.after': 'Depois de',
  'search.picker.searchMembers': 'Buscar membros',
  'search.picker.searchChannels': 'Buscar canais',
  'search.has.link': 'Link',
  'search.has.image': 'Imagem',
  'search.has.video': 'Vídeo',
  'search.has.file': 'Arquivo',
};

const dictionaries: Record<Locale, Dict> = { en, es, pt };

export function t(key: string, locale: Locale = defaultLocale): string {
  return dictionaries[locale]?.[key] ?? dictionaries.en[key] ?? key;
}
