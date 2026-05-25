/**
 * Real Claude vision extractor — DEFERRED / not yet wired into the pipeline.
 *
 * Documents the request shape with **prompt caching** baked in so the design is locked.
 * A static PWA can't embed a shared key, so `endpoint` is either:
 *   - a serverless proxy you deploy (recommended; holds the key server-side), or
 *   - the Anthropic API directly with a user-supplied key (bring-your-own-key), using
 *     the `anthropic-dangerous-direct-browser-access` header.
 *
 * Prompt caching: `cache_control: {type:'ephemeral'}` goes on the STATIC blocks — the
 * system instruction and the tool schema — but NOT on the per-call image. That amortises
 * the fixed instruction/schema tokens across every extraction.
 */

import type { ProductFacts, SourceResult } from './types'

export const VISION_MODEL = 'claude-haiku-4-5' // cheap; use 'claude-opus-4-7' for max accuracy

/** Anthropic Messages endpoint for direct (bring-your-own-key) calls. */
export const ANTHROPIC_DIRECT = 'https://api.anthropic.com/v1/messages'

// A deliberately thorough extraction rubric. Beyond improving accuracy, its size keeps the
// cached prefix above the model's minimum cacheable length so `cache_control` actually engages
// (a few-hundred-token prompt is silently NOT cached). Caching pays off across the many calls
// made within a scanning burst (default 5-min TTL).
const SYSTEM_INSTRUCTION = `You are an expert at reading the label of a single Ontario beverage
container (beer, cider, wine, spirit, cooler/seltzer, or non-alcoholic drink) from one photo and
returning ONLY structured data via the extract_product tool. The photo is captured live from a
phone camera aimed at a can or bottle, so expect glare, motion blur, curvature, partial framing,
tilt, and low light. Read carefully and conservatively.

GENERAL PRINCIPLES
- Report a field ONLY if you can actually read it on the label with reasonable confidence. If a
  value is unreadable, ambiguous, inferred, or guessed, OMIT that field entirely. Never fabricate.
- Prefer text printed ON the container over assumptions from brand knowledge. Do not "remember"
  product specs from training; transcribe what is visible.
- The container in frame is a SINGLE unit. If the label mentions a multipack (e.g. "6 x 355 mL",
  "case of 24", "12-pack"), the volume you report is the volume of the ONE unit (355 mL), never the
  pack total.
- Output must validate against the tool schema. Use the exact enum spellings for material and the
  lowercase category words listed under "type".

PRODUCT NAME (name) AND BRAND (brand)
- name: the full product name as printed, including the descriptor and style where shown, e.g.
  "Stella Artois", "Steam Whistle Pilsner", "Okanagan Premium Apple Cider". Keep it concise — the
  marketing product name, not every line of fine print.
- brand: the brewer/producer brand when distinct from the product name (e.g. brand "Labatt" for a
  product "Labatt Bleue"). If name and brand are effectively identical, you may set just name.
- Many Ontario labels are bilingual (English/French). Prefer the English product name when both
  appear. French descriptors like "Bière fine de luxe", "Cidre", "Vin", "Houblon", "Levure",
  "Brassée", "Embouteillé" are label text, not the product name — do not report them as the name.

CONTAINER MATERIAL (material) — describes the CONTAINER, not the contents
- "aluminum": metal cans (most beer/cooler/seltzer cans, slim cans, tallboys). Cues: "recyclable
  aluminum", a pull-tab top, brushed-metal body, "CANETTE".
- "glass": glass bottles (most 341 mL beer bottles, 750 mL wine, spirit bottles). Cues: visible
  glass, crown cap or cork, "BOUTEILLE", embossed glass.
- "plastic": PET/HDPE plastic bottles (large soft-drink/water/juice, some coolers). Cues: "PET",
  clear flexible bottle, screw cap on a plastic neck.
- "tetra": carton / Tetra Pak / aseptic brick / bag-in-box (some wine, juice). Cues: "carton",
  cardboard/composite body, "Tetra".
- If genuinely unsure between two materials, prefer the most visually evident; if you truly cannot
  tell, OMIT material rather than guessing. Do NOT use "unknown" unless the schema requires a value.

VOLUME (volumeMl) — always in MILLILITRES, integer
- Read the printed net volume and convert to mL: "355 mL" → 355, "473 mL" → 473, "500 mL" → 500,
  "341 mL" → 341, "1 L"/"1L" → 1000, "1.5 L" → 1500, "750 mL" → 750.
- Other units: cL → ×10 ("33 cl" → 330); US fl oz → ×29.5735 rounded ("12 fl oz" → 355). Round to
  the nearest whole mL.
- Common Ontario sizes you may see: 222, 250, 330, 341, 355, 440, 458, 473, 500, 568, 650, 710,
  750, 1000, 1140, 1500, 2000. Use the printed number; this list is only a sanity check.
- If the volume is obscured or you must guess, OMIT volumeMl.

ALCOHOL (abv) — percent alcohol by volume, number only
- Read printed values like "5.0% alc./vol.", "alc 4.6% vol", "5,0 % alc./vol" (comma decimal → 5.0).
  Report the number (5.0), not the string. For non-alcoholic products with "0.0%" report 0. If not
  printed, OMIT abv.

NUTRITION (nutrition) — best-effort; most Ontario alcohol labels show little or none
- Only populate sub-fields you can actually read from a nutrition facts panel or printed claims:
  - energyKcal: Calories per serving/100 mL as printed (kcal). Ignore kJ unless that's all shown,
    in which case convert kJ→kcal (÷4.184) and round.
  - carbsG: carbohydrates in grams.
  - sugarsG: sugars in grams.
  - alcoholPct: alcohol % if expressed in the nutrition panel (often equals abv).
- If no nutrition panel is visible, OMIT the entire nutrition object. Do not infer typical values.

TYPE (type) — one lowercase word: beer | cider | wine | spirit | cooler | other
- beer: lagers, ales, pilsners, IPAs, stouts. cider: apple/pear ciders. wine: still/sparkling wine.
- spirit: vodka, whisky, rum, gin, liqueurs. cooler: seltzers, vodka-sodas, RTD mixed drinks,
  flavoured malt beverages. other: anything else or non-alcoholic. Omit if unclear.

WORKED EXAMPLES (format guidance only — read the actual photo)
- A silver 355 mL can reading "Stella Artois / Bière fine de luxe / 5.0% alc./vol." →
  { name: "Stella Artois", brand: "Stella Artois", material: "aluminum", volumeMl: 355, abv: 5,
    type: "beer" }.
- A 341 mL brown glass bottle "Alexander Keith's India Pale Ale 5% alc/vol" →
  { name: "Alexander Keith's India Pale Ale", brand: "Alexander Keith's", material: "glass",
    volumeMl: 341, abv: 5, type: "beer" }.
- A 473 mL tallboy "White Claw Hard Seltzer Black Cherry 5% alc/vol" with a nutrition panel
  showing 100 Cal, 2 g carbs, 2 g sugars →
  { name: "White Claw Black Cherry", brand: "White Claw", material: "aluminum", volumeMl: 473,
    abv: 5, type: "cooler", nutrition: { energyKcal: 100, carbsG: 2, sugarsG: 2 } }.
- A blurry can where only "355 mL" and a pull-tab are legible →
  { material: "aluminum", volumeMl: 355 }  (omit everything you cannot read).

ONTARIO CONTAINER & SIZE REFERENCE (sanity-check aid; always defer to the printed number)
- Domestic/import beer cans: most commonly 355 mL; tallboys 473 mL; slim cans 355 mL; smaller
  "stubby"-style cans 222–250 mL; large single cans 568 mL (pint) or 500 mL (many European imports).
- Beer bottles: the classic Ontario long-neck is 341 mL glass; European imports often 330 mL glass;
  some craft 650 mL "bombers" glass; 750 mL glass for larger formats.
- Coolers / seltzers / RTD: typically 355 mL or 473 mL aluminum cans; occasionally 458 mL.
- Cider: 355 mL or 473 mL cans, or 500 mL / 750 mL glass.
- Wine: 750 mL glass standard; 1000 mL and 1500 mL formats; tetra/box wine 1000 mL+; small cans
  250 mL or splits 187 mL.
- Spirits: 750 mL glass standard; also 375 mL, 1140 mL, 1750 mL; small 50–200 mL "minis".
- Soft drinks / water / juice: 355 mL cans, 500 mL / 591 mL PET bottles, 1 L / 2 L PET, 1 L tetra.
These are typical, not rules — if the label clearly says a different number, use the printed number.

BILINGUAL LABEL GLOSSARY (Ontario labels are frequently English/French)
- "Bière" = beer; "Cidre" = cider; "Vin" = wine; "Panaché" = shandy; "Boisson" = beverage/drink.
- "Bouteille" = bottle (glass cue); "Canette" = can (aluminum cue); "Carton" = carton (tetra cue).
- "Teneur en alcool" / "alc./vol." = alcohol content; "Houblon" = hops; "Levure" = yeast;
  "Malt d'orge" = barley malt; "Brassée/Brassé" = brewed; "Embouteillé" = bottled;
  "Consigne/Consignée" = deposit; "Contenu net" / "Net" = net contents.
- "fine de luxe", "premium", "originale", "blonde", "rousse", "blanche", "légère" are style/marketing
  descriptors, NOT the brand or product name on their own.

COMMON ONTARIO BRANDS YOU MAY SEE (to help you READ text, never to assume specs)
- Macro beer: Labatt (Blue, Bleue, 50), Molson (Canadian, Export, Coors), Budweiser, Bud Light,
  Coors Light, Busch, Michelob; imports Stella Artois, Heineken, Corona, Guinness, Peroni, Sapporo.
- Ontario craft: Steam Whistle, Mill Street, Muskoka, Collective Arts, Amsterdam, Great Lakes,
  Sleeman, Alexander Keith's, Creemore Springs, Side Launch.
- Cider: Somersby, Strongbow, Okanagan, Brickworks, Thornbury. Coolers/seltzers: White Claw,
  Nütrl, Vizzy, Cottage Springs, Twisted Tea, Mike's Hard.
Recognizing a brand helps you transcribe blurry text correctly — but still report only what the
photo shows, and never invent a size/abv from brand memory.

READING TACTICS FOR DIFFICULT PHOTOS
- Glare/hot-spots: a flashlight reflection often washes out the center of a glossy can; read the
  edges and rotate your interpretation around the cylinder. If a digit is hidden by glare, omit it.
- Curvature: text on a cylinder compresses toward the sides — the volume and abv are usually near
  the bottom edge of the front label or on the back.
- Rotation/tilt: the label may be sideways or upside down; mentally re-orient before reading.
- Partial framing: if the product name is cut off, report only the legible portion or omit name.
- Multipack cartons: if you can tell it's a carton/fridge-pack rather than a single unit, still
  report the SINGLE-unit volume printed as "X mL" (e.g. "24 x 355 mL" → volumeMl 355).

DEPOSIT CONTEXT (for your understanding; the app computes the refund itself)
- Ontario's deposit-return program charges 10¢ on most containers ≤ 630 mL and 20¢ on larger ones
  (with different thresholds for aluminum). Accurate material + volume are what matter most for the
  app, so prioritize getting those two right over nutrition.

ANTI-HALLUCINATION REMINDERS
- Do not output a field you cannot see. An omitted field is correct; a guessed field is harmful.
- Do not copy values from these instructions or examples — they are illustrations, not the photo.
- If the image is too dark/blurry to read anything, return an empty object via the tool.

Return your answer by calling extract_product exactly once. Include only the fields you are
confident about; omitting a field is always better than guessing it.`

const EXTRACT_PRODUCT_TOOL = {
  name: 'extract_product',
  description: 'Return the product details read from the beverage container photo.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Full product name as printed' },
      brand: { type: 'string' },
      material: { type: 'string', enum: ['glass', 'aluminum', 'plastic', 'tetra', 'unknown'] },
      volumeMl: { type: 'number', description: 'Container volume in millilitres' },
      abv: { type: 'number', description: 'Alcohol % by volume' },
      type: { type: 'string', description: 'beer | cider | wine | spirit | cooler | other' },
      nutrition: {
        type: 'object',
        properties: {
          energyKcal: { type: 'number' },
          carbsG: { type: 'number' },
          sugarsG: { type: 'number' },
          alcoholPct: { type: 'number' },
        },
      },
    },
  },
}

/** Build the Messages API request body with prompt caching on the static blocks. */
export function buildClaudeVisionRequest(imageBase64: string, mediaType = 'image/jpeg', model: string = VISION_MODEL) {
  return {
    model,
    max_tokens: 512,
    // System instruction is static → cache it.
    system: [
      { type: 'text', text: SYSTEM_INSTRUCTION, cache_control: { type: 'ephemeral' } },
    ],
    // Tool schema is static → cache it (last tool carries cache_control).
    tools: [{ ...EXTRACT_PRODUCT_TOOL, cache_control: { type: 'ephemeral' } }],
    tool_choice: { type: 'tool', name: 'extract_product' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract the product details from this image:' },
          // Per-call image — intentionally NOT cached.
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
        ],
      },
    ],
  }
}

export interface ClaudeVisionConfig {
  /** Proxy URL (recommended) or 'https://api.anthropic.com/v1/messages' for BYO-key. */
  endpoint: string
  /** Only for direct BYO-key calls; omit when using a proxy that holds the key. */
  apiKey?: string
  /** Claude model id; defaults to VISION_MODEL. */
  model?: string
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i])
  return btoa(binary)
}

interface ClaudeToolUseResponse {
  content?: { type: string; name?: string; input?: ProductFacts }[]
}

/** Real extraction call. Not wired into `gatherProductFacts` yet — wire once an endpoint is chosen. */
export async function claudeVisionExtract(imageJpeg: Blob, config: ClaudeVisionConfig): Promise<SourceResult> {
  try {
    const base64 = await blobToBase64(imageJpeg)
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (config.apiKey) {
      headers['x-api-key'] = config.apiKey
      headers['anthropic-version'] = '2023-06-01'
      headers['anthropic-dangerous-direct-browser-access'] = 'true'
    }
    const res = await fetch(config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(buildClaudeVisionRequest(base64, 'image/jpeg', config.model)),
    })
    if (!res.ok) return { source: 'vision', facts: {}, confidence: 0, ok: false, note: `HTTP ${res.status}` }

    const data: ClaudeToolUseResponse = await res.json()
    const toolUse = data.content?.find(c => c.type === 'tool_use' && c.name === 'extract_product')
    const facts = (toolUse?.input ?? {}) as ProductFacts
    const ok = Object.keys(facts).length > 0
    return { source: 'vision', facts, confidence: ok ? 0.8 : 0, ok }
  } catch {
    return { source: 'vision', facts: {}, confidence: 0, ok: false, note: 'request failed' }
  }
}
