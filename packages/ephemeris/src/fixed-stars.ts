/**
 * Fixed Stars, Star-Planet Conjunctions, and Sabian Symbols
 *
 * Provides precession-corrected positions for 30 major fixed stars,
 * detects conjunctions between stars and natal planets, and returns
 * Sabian symbol interpretations for any ecliptic degree.
 */

import type { Planet, Position, ZodiacSign } from './engine'
import { angleBetween, longitudeToSign, PLANET_LIST, SIGN_NAMES } from './engine'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FixedStarData {
  name: string
  j2000Longitude: number
  magnitude: number
  nature: string
}

export interface FixedStarPosition extends FixedStarData {
  longitude: number
  sign: ZodiacSign
  degree: number
}

export interface StarConjunction {
  star: string
  planet: Planet
  orb: number
}

export interface DegreeSymbol {
  degree: number
  sign: ZodiacSign
  text: string
}

// ─── Fixed Star Catalogue (J2000.0 ecliptic longitudes) ─────────────────────

const STAR_CATALOGUE: FixedStarData[] = [
  { name: 'Algol', j2000Longitude: 56.17, magnitude: 2.1, nature: 'Mars/Saturn' },
  { name: 'Aldebaran', j2000Longitude: 69.47, magnitude: 0.85, nature: 'Mars' },
  { name: 'Rigel', j2000Longitude: 76.97, magnitude: 0.12, nature: 'Jupiter/Saturn' },
  { name: 'Betelgeuse', j2000Longitude: 88.64, magnitude: 0.5, nature: 'Mars/Mercury' },
  { name: 'Sirius', j2000Longitude: 104.0, magnitude: -1.46, nature: 'Jupiter/Mars' },
  { name: 'Canopus', j2000Longitude: 104.72, magnitude: -0.74, nature: 'Saturn/Jupiter' },
  { name: 'Castor', j2000Longitude: 110.13, magnitude: 1.6, nature: 'Mercury' },
  { name: 'Pollux', j2000Longitude: 113.13, magnitude: 1.14, nature: 'Mars' },
  { name: 'Procyon', j2000Longitude: 115.62, magnitude: 0.34, nature: 'Mercury/Mars' },
  { name: 'Praesepe', j2000Longitude: 127.25, magnitude: 3.7, nature: 'Mars/Moon' },
  { name: 'Alphard', j2000Longitude: 147.17, magnitude: 1.98, nature: 'Saturn/Venus' },
  { name: 'Regulus', j2000Longitude: 149.83, magnitude: 1.35, nature: 'Mars/Jupiter' },
  { name: 'Zosma', j2000Longitude: 161.32, magnitude: 2.56, nature: 'Saturn/Venus' },
  { name: 'Denebola', j2000Longitude: 171.57, magnitude: 2.14, nature: 'Saturn/Venus' },
  { name: 'Vindemiatrix', j2000Longitude: 189.94, magnitude: 2.83, nature: 'Saturn/Mercury' },
  { name: 'Spica', j2000Longitude: 203.83, magnitude: 0.97, nature: 'Venus/Mars' },
  { name: 'Arcturus', j2000Longitude: 204.14, magnitude: -0.05, nature: 'Mars/Jupiter' },
  { name: 'Zuben Elgenubi', j2000Longitude: 225.05, magnitude: 2.75, nature: 'Saturn/Mars' },
  { name: 'Zuben Elschemali', j2000Longitude: 229.17, magnitude: 2.61, nature: 'Jupiter/Mercury' },
  { name: 'Unukalhai', j2000Longitude: 241.95, magnitude: 2.63, nature: 'Saturn/Mars' },
  { name: 'Antares', j2000Longitude: 249.76, magnitude: 0.96, nature: 'Mars/Jupiter' },
  { name: 'Ras Alhague', j2000Longitude: 262.21, magnitude: 2.08, nature: 'Saturn/Venus' },
  { name: 'Vega', j2000Longitude: 275.28, magnitude: 0.03, nature: 'Venus/Mercury' },
  { name: 'Deneb Algedi', j2000Longitude: 293.55, magnitude: 2.85, nature: 'Saturn/Jupiter' },
  { name: 'Altair', j2000Longitude: 301.43, magnitude: 0.77, nature: 'Mars/Jupiter' },
  { name: 'Sadalsuud', j2000Longitude: 323.36, magnitude: 2.91, nature: 'Saturn/Mercury' },
  { name: 'Fomalhaut', j2000Longitude: 333.55, magnitude: 1.16, nature: 'Venus/Mercury' },
  { name: 'Deneb Adige', j2000Longitude: 335.28, magnitude: 1.25, nature: 'Venus/Mercury' },
  { name: 'Achernar', j2000Longitude: 345.32, magnitude: 0.46, nature: 'Jupiter' },
  { name: 'Scheat', j2000Longitude: 349.19, magnitude: 2.42, nature: 'Mars/Mercury' },
]

// ─── Precession ─────────────────────────────────────────────────────────────

const J2000_JD = 2451545.0
const PRECESSION_RATE = 0.01397 // degrees per year (50.29 arcseconds)

function jdToYear(jd: number): number {
  return 2000 + (jd - J2000_JD) / 365.25
}

// ─── Fixed Star Calculations ────────────────────────────────────────────────

/**
 * Calculate precession-corrected positions for all 30 catalogue stars.
 *
 * @param jd - Julian Day for the target date
 * @returns array of star positions with current ecliptic longitudes
 */
export function calcFixedStars(jd: number): FixedStarPosition[] {
  const year = jdToYear(jd)
  const precessionOffset = PRECESSION_RATE * (year - 2000)

  return STAR_CATALOGUE.map((star) => {
    const lon = (((star.j2000Longitude + precessionOffset) % 360) + 360) % 360
    const signInfo = longitudeToSign(lon)

    return {
      ...star,
      longitude: lon,
      sign: signInfo.sign,
      degree: signInfo.degree,
    }
  })
}

// ─── Star-Planet Conjunctions ───────────────────────────────────────────────

/**
 * Find conjunctions between fixed stars and natal planets.
 *
 * @param stars - precession-corrected star positions
 * @param planets - natal planet positions
 * @param orb - maximum orb in degrees (default 1.5)
 * @returns array of conjunctions within the specified orb
 */
export function fixedStarConjunctions(
  stars: FixedStarPosition[],
  planets: Record<Planet, Position>,
  orb: number = 1.5,
): StarConjunction[] {
  const conjunctions: StarConjunction[] = []

  for (const star of stars) {
    for (const p of PLANET_LIST) {
      const pos = planets[p]
      if (!pos) continue

      const diff = angleBetween(star.longitude, pos.longitude)
      if (diff <= orb) {
        conjunctions.push({
          star: star.name,
          planet: p,
          orb: Math.round(diff * 100) / 100,
        })
      }
    }
  }

  conjunctions.sort((a, b) => a.orb - b.orb)
  return conjunctions
}

// ─── Sabian Symbols ─────────────────────────────────────────────────────────

/**
 * Sabian symbol texts for a representative subset of degrees.
 * Based on the Marc Edmund Jones / Dane Rudhyar formulations.
 *
 * Sabian degrees are numbered 1-30 within each sign (not 0-29).
 * The degree for a longitude is ceil(lon % 30), except when lon % 30 === 0,
 * which corresponds to degree 30 of the previous sign. However, the
 * conventional approach treats it as degree 1 if exactly on the cusp, so
 * we use: degree = floor(lon % 30) + 1, clamped to 1-30.
 */

const SABIAN_TEXTS: Record<string, string> = {
  // ── Aries ──
  'Aries 1': 'A woman rises from the sea; a seal embraces her.',
  'Aries 2': 'A comedian entertaining a group.',
  'Aries 3': 'A cameo profile of a man in the outline of his country.',
  'Aries 4': 'Two lovers strolling through a secluded walk.',
  'Aries 5': 'A triangle with wings.',
  'Aries 6': 'A square brightly lit on one side.',
  'Aries 7': 'A man succeeds in expressing himself in two realms at once.',
  'Aries 8': 'A large hat with streamers flying, facing east.',
  'Aries 9': 'A crystal gazer.',
  'Aries 10': 'A man teaching new forms for old symbols.',
  'Aries 11': 'The president of the country.',
  'Aries 12': 'A flock of wild geese.',

  // ── Taurus ──
  'Taurus 1': 'A clear mountain stream.',
  'Taurus 2': 'An electrical storm.',
  'Taurus 3': 'Steps up to a lawn blooming with clover.',
  'Taurus 4': "The rainbow's pot of gold.",
  'Taurus 5': 'A youthful widow, fresh and soul-cleansed, kneels at a grave.',
  'Taurus 6': 'A bridge being built across a gorge.',
  'Taurus 7': 'A Samaritan woman at the ancestral well.',
  'Taurus 8': 'A sleigh without snow.',
  'Taurus 9': 'A Christmas tree decorated.',
  'Taurus 10': 'A red cross nurse.',
  'Taurus 11': 'A woman watering flowers in her garden.',
  'Taurus 12': 'A young couple window-shopping.',

  // ── Gemini ──
  'Gemini 1': 'A glass-bottomed boat in still water.',
  'Gemini 2': 'Santa Claus filling stockings furtively.',
  'Gemini 3': 'The Garden of the Tuileries in Paris.',
  'Gemini 4': 'Holly and mistletoe bring Christmas spirit to a home.',
  'Gemini 5': 'A radical magazine.',
  'Gemini 6': 'Workmen drilling for oil.',
  'Gemini 7': 'An old-fashioned well.',
  'Gemini 8': 'Aroused strikers surround a factory.',
  'Gemini 9': 'A quiver filled with arrows.',
  'Gemini 10': 'An airplane performing a nose dive.',
  'Gemini 11': 'Newly opened lands offer the pioneer new opportunities.',
  'Gemini 12': 'A Black slave girl demands her rights of her mistress.',

  // ── Cancer ──
  'Cancer 1': 'On a ship, sailors lower an old flag and raise a new one.',
  'Cancer 2': 'A man on a magic carpet observes vast vistas below him.',
  'Cancer 3': 'A man all bundled up in fur leading a shaggy deer.',
  'Cancer 4': 'A cat arguing with a mouse.',
  'Cancer 5': 'An automobile wrecked by a train.',
  'Cancer 6': 'Game birds feathering their nests.',
  'Cancer 7': 'Two fairies on a moonlit night.',
  'Cancer 8': 'Rabbits dressed in clothes and on parade.',
  'Cancer 9': 'A tiny nude miss reaching in the water for a fish.',
  'Cancer 10': 'A large diamond not completely cut.',
  'Cancer 11': 'A clown making grimaces.',
  'Cancer 12': 'A Chinese woman nursing a baby with a message.',

  // ── Leo ──
  'Leo 1': "Blood rushes to a man's head as his vital energies are mobilized.",
  'Leo 2': 'An epidemic of mumps.',
  'Leo 3': 'A woman having her hair bobbed.',
  'Leo 4': 'A formal dinner party for adults.',
  'Leo 5': 'Rock formations at the edge of a precipice.',
  'Leo 6': 'A conservative old-fashioned lady confronted by a hippie girl.',
  'Leo 7': 'The constellations in the sky.',
  'Leo 8': 'A Bolshevik propagandist.',
  'Leo 9': 'Glass blowers.',
  'Leo 10': 'Early morning dew.',
  'Leo 11': 'Children on a swing in a huge oak tree.',
  'Leo 12': 'An evening party of adults on a lawn lit by fancy lanterns.',

  // ── Virgo ──
  'Virgo 1': "A man's head.",
  'Virgo 2': 'A large white cross upraised.',
  'Virgo 3': 'Two angels bringing protection.',
  'Virgo 4': 'A colored child playing with white children.',
  'Virgo 5': 'A man dreaming of fairies.',
  'Virgo 6': 'A merry-go-round.',
  'Virgo 7': 'A harem.',
  'Virgo 8': 'A girl takes her first dancing instruction.',
  'Virgo 9': 'An expressionist painter making a futuristic drawing.',
  'Virgo 10': 'Two heads looking out and beyond the shadows.',
  'Virgo 11': "A boy molded in his mother's aspirations for him.",
  'Virgo 12': 'A bride with her veil snatched away.',

  // ── Libra ──
  'Libra 1': 'A butterfly made perfect by a dart through it.',
  'Libra 2': 'The light of the sixth race transmuted to the seventh.',
  'Libra 3': 'The dawn of a new day reveals everything changed.',
  'Libra 4': 'A group around a campfire.',
  'Libra 5': 'A man revealing to his students the foundation of an inner knowledge.',
  'Libra 6': 'A man watches his ideals being projected on a screen.',
  'Libra 7': 'A woman feeding chickens and protecting them from the hawks.',
  'Libra 8': 'A blazing fireplace in a deserted home.',
  'Libra 9': 'Three old masters hanging in a special room in an art gallery.',
  'Libra 10': 'A canoe approaching safety through dangerous waters.',
  'Libra 11': 'A professor peering over his glasses at his students.',
  'Libra 12': 'Miners emerging from a deep coal mine.',

  // ── Scorpio ──
  'Scorpio 1': 'A sight-seeing bus.',
  'Scorpio 2': 'A broken bottle and spilled perfume.',
  'Scorpio 3': 'A house-raising party in a small village.',
  'Scorpio 4': 'A youth holding a lighted candle.',
  'Scorpio 5': 'A massive rocky shore.',
  'Scorpio 6': 'A gold rush.',
  'Scorpio 7': 'Deep-sea divers.',
  'Scorpio 8': 'The Moon shining across a lake.',
  'Scorpio 9': 'A dentist at work.',
  'Scorpio 10': 'A fellowship supper.',
  'Scorpio 11': 'A drowning man is being rescued.',
  'Scorpio 12': 'An official embassy ball.',

  // ── Sagittarius ──
  'Sagittarius 1': 'Retired army veterans gather to reawaken old memories.',
  'Sagittarius 2': 'The ocean covered with whitecaps.',
  'Sagittarius 3': 'Two men playing chess.',
  'Sagittarius 4': 'A little child learning to walk.',
  'Sagittarius 5': 'An old owl up in a tree.',
  'Sagittarius 6': 'A game of cricket.',
  'Sagittarius 7': 'Cupid knocking at the door of a human heart.',
  'Sagittarius 8': 'Deep within the depths of the earth, new elements are being formed.',
  'Sagittarius 9': 'A mother leads her small child step by step up a steep stairway.',
  'Sagittarius 10': 'A theatrical representation of a golden-haired goddess of opportunity.',
  'Sagittarius 11': 'The lamp of physical enlightenment at the left temple.',
  'Sagittarius 12': 'A flag turns into an eagle; the eagle into a chanticleer.',

  // ── Capricorn ──
  'Capricorn 1': 'An Indian chief claims power from the assembled tribe.',
  'Capricorn 2': 'Three stained-glass windows in a Gothic church, one damaged by war.',
  'Capricorn 3': 'The human soul, in its eagerness for new experiences, seeks embodiment.',
  'Capricorn 4': 'A group of people outfitting a large canoe at the start of a journey.',
  'Capricorn 5': 'Indians on the warpath rowing a canoe.',
  'Capricorn 6': 'Ten logs lie under an archway leading to darker woods.',
  'Capricorn 7': 'A veiled prophet speaks, seized by the power of a god.',
  'Capricorn 8': 'In a sun-lit home, domesticated birds sing joyously.',
  'Capricorn 9': 'An angel carrying a harp.',
  'Capricorn 10': 'An albatross feeding from the hand of a sailor.',
  'Capricorn 11': 'A large group of pheasant on a private estate.',
  'Capricorn 12': 'A student of nature lecturing, revealing little-known aspects of life.',

  // ── Aquarius ──
  'Aquarius 1': 'An old adobe mission in California.',
  'Aquarius 2': 'An unexpected thunderstorm.',
  'Aquarius 3': 'A deserter from the navy.',
  'Aquarius 4': 'A Hindu healer.',
  'Aquarius 5': 'A council of ancestors has been called to guide a man.',
  'Aquarius 6': 'A masked figure performs ritualistic acts in a mystery play.',
  'Aquarius 7': 'A child is seen being born out of an egg.',
  'Aquarius 8': 'Beautifully gowned wax figures on display.',
  'Aquarius 9': 'A flag is seen turning into an eagle.',
  'Aquarius 10': 'A man who had for a time become the embodiment of a popular ideal.',
  'Aquarius 11': 'During a silent hour, a man receives a new inspiration.',
  'Aquarius 12': 'People on stairs graduated upward.',

  // ── Pisces ──
  'Pisces 1': 'A public market.',
  'Pisces 2': 'A squirrel hiding from hunters.',
  'Pisces 3': 'Petrified tree trunks lie broken on desert sand.',
  'Pisces 4': 'Heavy car traffic on a narrow isthmus.',
  'Pisces 5': 'A church bazaar.',
  'Pisces 6': 'A parade of army officers in full dress.',
  'Pisces 7': 'Illuminated by a shaft of light, a large cross lies on rocks.',
  'Pisces 8': 'A girl blowing a bugle.',
  'Pisces 9': 'A jockey spurs his horse, intent on outdistancing his rivals.',
  'Pisces 10': 'An aviator pursues his journey, flying through ground-obscuring clouds.',
  'Pisces 11': 'Men traveling a narrow path, seeking illumination.',
  'Pisces 12': 'An examination of initiates in the sanctuary of an occult brotherhood.',
}

// ─── Sabian Symbol Lookup ───────────────────────────────────────────────────

/**
 * Return the Sabian symbol for a given ecliptic longitude.
 *
 * Sabian degrees are numbered 1 through 30 within each sign.
 * For a longitude of, say, 15.7 Aries (15.7 degrees), the Sabian degree
 * is 16 Aries (ceil of the fractional position within the sign).
 * A special case: exactly 0.00 within a sign maps to degree 1.
 *
 * If the specific degree text is not in the built-in subset, a generic
 * placeholder indicating the degree and sign is returned.
 *
 * @param longitude - ecliptic longitude (0-360)
 * @returns DegreeSymbol with degree, sign, and text
 */
export function sabianSymbol(longitude: number): DegreeSymbol {
  const normalized = ((longitude % 360) + 360) % 360
  const signIndex = Math.floor(normalized / 30)
  const sign = SIGN_NAMES[signIndex]
  const degreeInSign = normalized % 30

  // Sabian degrees are 1-30; a planet at e.g. 0.5 of a sign is degree 1
  const sabianDegree = degreeInSign === 0 ? 1 : Math.ceil(degreeInSign)

  const key = `${sign} ${sabianDegree}`
  const text =
    SABIAN_TEXTS[key] ??
    `${sabianDegree}\u00B0 ${sign}: Sabian symbol data not loaded for this degree.`

  return {
    degree: sabianDegree,
    sign,
    text,
  }
}
