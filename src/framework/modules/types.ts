import { z } from 'zod'

const SearchCategorySchema = z.enum([
  'general',
  'images',
  'videos',
  'news',
  'map',
  'music',
  'it',
  'science',
  'files',
  'social media'
])
type SearchEngineCategory = z.infer<typeof SearchCategorySchema>

const SearchEngineSchema = z.enum([
  '9gag',
  'annas archive',
  'apk mirror',
  'apple app store',
  'ahmia',
  'anaconda',
  'arch linux wiki',
  'arctic',
  'arxiv',
  'ask',
  'bandcamp',
  'wikipedia',
  'bilibili',
  'bing',
  'bing images',
  'bing news',
  'bing videos',
  'bitbucket',
  'bpb',
  'btdigg',
  'ccc-tv',
  'openverse',
  'chefkoch',
  'crossref',
  'crowdview',
  'yep',
  'yep images',
  'yep news',
  'curlie',
  'currency',
  'bahnhof',
  'deezer',
  'destatis',
  'deviantart',
  'ddg definitions',
  'docker hub',
  'erowid',
  'wikidata',
  'duckduckgo',
  'duckduckgo images',
  'duckduckgo videos',
  'duckduckgo news',
  'duckduckgo weather',
  'apple maps',
  'emojipedia',
  'tineye',
  'etymonline',
  '1x',
  'fdroid',
  'flickr',
  'free software directory',
  'frinkiac',
  'fyyd',
  'genius',
  'gentoo',
  'gitlab',
  'github',
  'codeberg',
  'goodreads',
  'google',
  'google images',
  'google news',
  'google videos',
  'google scholar',
  'google play apps',
  'google play movies',
  'material icons',
  'gpodder',
  'habrahabr',
  'hackernews',
  'hoogle',
  'imdb',
  'imgur',
  'ina',
  'invidious',
  'jisho',
  'kickass',
  'lemmy communities',
  'lemmy users',
  'lemmy posts',
  'lemmy comments',
  'library genesis',
  'z-library',
  'library of congress',
  'lingva',
  'lobste.rs',
  'mastodon users',
  'mastodon hashtags',
  'mdn',
  'metacpan',
  'mixcloud',
  'mozhi',
  'mwmbl',
  'npm',
  'nyaa',
  'mankier',
  'odysee',
  'openairedatasets',
  'openairepublications',
  'openstreetmap',
  'openrepos',
  'packagist',
  'pdbe',
  'photon',
  'pinterest',
  'piped',
  'piped.music',
  'piratebay',
  'podcastindex',
  'presearch',
  'presearch images',
  'presearch videos',
  'presearch news',
  'pub.dev',
  'pubmed',
  'pypi',
  'qwant',
  'qwant news',
  'qwant images',
  'qwant videos',
  'radio browser',
  'reddit',
  'rottentomatoes',
  'sepiasearch',
  'soundcloud',
  'stackoverflow',
  'askubuntu',
  'internetarchivescholar',
  'superuser',
  'searchcode code',
  'semantic scholar',
  'startpage',
  'tokyotoshokan',
  'solidtorrents',
  'tagesschau',
  'tmdb',
  'torch',
  'unsplash',
  'yandex music',
  'yahoo',
  'yahoo news',
  'youtube',
  'dailymotion',
  'vimeo',
  'wiby',
  'alexandria',
  'wikibooks',
  'wikinews',
  'wikiquote',
  'wikisource',
  'wikispecies',
  'wiktionary',
  'wikiversity',
  'wikivoyage',
  'wikicommons.images',
  'wolframalpha',
  'dictzone',
  'mymemory translated',
  '1337x',
  'duden',
  'seznam',
  'mojeek',
  'moviepilot',
  'naver',
  'rubygems',
  'peertube',
  'mediathekviewweb',
  'yacy',
  'yacy images',
  'rumble',
  'livespace',
  'wordnik',
  'woxikon.de synonyme',
  'seekr news',
  'seekr images',
  'seekr videos',
  'sjp.pwn',
  'stract',
  'svgrepo',
  'tootfinder',
  'wallhaven',
  'wikimini',
  'wttr.in',
  'yummly',
  'brave',
  'brave.images',
  'brave.videos',
  'brave.news',
  'lib.rs',
  'sourcehut',
  'goo',
  'bt4g',
  'pkg.go.dev'
])
type SearchEngineType = z.infer<typeof SearchEngineSchema>

const SearchOptionsSchema = z.object({
  query: z.string().describe('search query'),
  categories: z
    .array(SearchCategorySchema)
    .optional()
    .nullish()
    .describe(
      'narrows the search to only use search engines in an array of specific categories, optional'
    ),
  engines: z
    .array(SearchEngineSchema)
    .optional()
    .nullish()
    .describe(
      'narrows the search to only use an array of specific search engines names, optional'
    ),
  language: z
    .string()
    .optional()
    .nullish()
    .describe('the language to search in, optional'),
  pageno: z
    .number()
    .int()
    .optional()
    .nullish()
    .describe('the page number to search for, optional')
})

type SearchEngineOptions = z.infer<typeof SearchOptionsSchema>

interface SearchEngineResult {
  title: string
  url: string
  img_src?: string
  thumbnail_src?: string
  thumbnail?: string
  content?: string
  author?: string
  iframe_src?: string
  category?: SearchEngineCategory
  engine?: SearchEngineType
  publishedDate?: string
}

interface SearchEngineResponse {
  results: SearchEngineResult[]
  suggestions: string[]
  query: string
}

// Wikipedia tool types.
// https://www.mediawiki.org/wiki/API:REST_API
interface WikipediaSearchOptions {
  query: string
  limit?: number
}

interface WikipediaPageSearchResponse {
  pages: WikipediaPage[]
}

interface WikipediaPage {
  id: number
  key: string
  title: string
  matched_title: null
  excerpt: string
  description: null | string
  thumbnail: WikipediaThumbnail | null
}

interface WikipediaThumbnail {
  url: string
  width: number
  height: number
  mimetype: string
  duration: null
}

interface WikipediaPageSummaryOptions {
  title: string
  redirect?: boolean
  acceptLanguage?: string
}

interface WikipediaPageSummaryResponse {
  ns?: number
  index?: number
  type: string
  title: string
  displaytitle: string
  namespace: { id: number; text: string }
  wikibase_item: string
  titles: { canonical: string; normalized: string; display: string }
  pageid: number
  thumbnail: {
    source: string
    width: number
    height: number
  }
  originalimage: {
    source: string
    width: number
    height: number
  }
  lang: string
  dir: string
  revision: string
  tid: string
  timestamp: string
  description: string
  description_source: string
  content_urls: {
    desktop: {
      page: string
      revisions: string
      edit: string
      talk: string
    }
    mobile: {
      page: string
      revisions: string
      edit: string
      talk: string
    }
  }
  extract: string
  extract_html: string
  normalizedtitle?: string
  coordinates?: {
    lat: number
    lon: number
  }
}

export type {
  SearchEngineCategory,
  SearchEngineType,
  SearchEngineOptions,
  SearchEngineResult,
  SearchEngineResponse,
  WikipediaPage,
  WikipediaPageSummaryResponse,
  WikipediaSearchOptions,
  WikipediaThumbnail,
  WikipediaPageSummaryOptions,
  WikipediaPageSearchResponse
}

export { SearchOptionsSchema, SearchEngineSchema, SearchCategorySchema }
