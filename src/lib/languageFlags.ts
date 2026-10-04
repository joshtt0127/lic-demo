/**
 * Un drapeau par langue du catalogue (`public.languages`), pour les listes et
 * les pastilles.
 *
 * Une langue n'est pas un pays : on prend le pays où elle est le plus
 * reconnaissable (anglais → Royaume-Uni, arabe → Arabie saoudite…), le drapeau
 * régional quand il existe (gallois, écossais), et 🌐 quand aucun ne convient.
 * C'est un repère visuel, jamais une information : le nom reste affiché.
 */

/** Code pays ISO 3166-1 → drapeau emoji (deux indicateurs régionaux). */
function countryFlag(country: string): string {
  return String.fromCodePoint(
    ...country.toUpperCase().split('').map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65),
  )
}

const WALES = '\u{1F3F4}\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}'
const SCOTLAND = '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}'

/** Code de langue du catalogue → pays du drapeau (ou drapeau déjà composé). */
const FLAG_BY_LANGUAGE: Record<string, string> = {
  en: 'GB', fr: 'FR', es: 'ES', it: 'IT', de: 'DE', pt: 'PT', ar: 'SA', he: 'IL',
  ru: 'RU', uk: 'UA', pl: 'PL', zh: 'CN', yue: 'HK', ja: 'JP', ko: 'KR', hi: 'IN',
  ur: 'PK', tr: 'TR', fa: 'IR', nl: 'NL', sv: 'SE', da: 'DK', no: 'NO', fi: 'FI',
  el: 'GR', ro: 'RO', hu: 'HU', cs: 'CZ', yo: 'NG', sw: 'KE', vi: 'VN', th: 'TH',
  id: 'ID', tl: 'PH', bn: 'BD', ta: 'LK', yi: 'IL', ca: 'AD', eu: 'ES', ga: 'IE',
  af: 'ZA', sq: 'AL', am: 'ET', hy: 'AM', az: 'AZ', be: 'BY', bs: 'BA', br: 'FR',
  bg: 'BG', my: 'MM', co: 'FR', hr: 'HR', et: 'EE', gl: 'ES', ka: 'GE', gu: 'IN',
  ht: 'HT', ha: 'NG', is: 'IS', ig: 'NG', kn: 'IN', kk: 'KZ', km: 'KH', rw: 'RW',
  ku: 'IQ', lo: 'LA', la: 'VA', lv: 'LV', ln: 'CD', lt: 'LT', lb: 'LU', mk: 'MK',
  mg: 'MG', ms: 'MY', ml: 'IN', mt: 'MT', mr: 'IN', mn: 'MN', ne: 'NP', oc: 'FR',
  ps: 'AF', pa: 'IN', sr: 'RS', si: 'LK', sk: 'SK', sl: 'SI', so: 'SO', te: 'IN',
  ti: 'ER', uz: 'UZ', wo: 'SN', xh: 'ZA', zu: 'ZA', gcf: 'GP', rcf: 'RE',
  ase: 'US', bfi: 'GB', fsl: 'FR',
}

const COMPOSED: Record<string, string> = { cy: WALES, gd: SCOTLAND }

export function languageFlag(code: string): string {
  if (COMPOSED[code]) return COMPOSED[code]
  const country = FLAG_BY_LANGUAGE[code]
  return country ? countryFlag(country) : '\u{1F310}'
}

/** « 🇫🇷 French » — pour les endroits qui n'affichent qu'un texte. */
export function withFlag(code: string, name: string): string {
  return `${languageFlag(code)} ${name}`
}
