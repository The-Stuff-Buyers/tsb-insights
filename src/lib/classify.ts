import type { ASDLead } from './types'

// ─── PRODUCT CATEGORY RULES ─────────────────────────────────────────
const PRODUCT_CATEGORIES: [string, RegExp][] = [
  ['Apparel & Fashion', /apparel|clothing|streetwear|shirt|fashion(?! jewelry)|camo|tactical.*gear|hat|snapback|trucker/i],
  ['Beauty & Personal Care', /beauty|cosmetic|perfume|fragrance|bandaid|freshener|soap|hair product|summers eve|led cosmetic/i],
  ['Collectibles & Novelty', /collecti|barbie|diecast|figurine|fairy|dragon|fantasy|novelty|sign|mood ring|native american|pop culture|licensed.*good|trading card/i],
  ['Electronics & Tech', /electron|speaker|tech toy|monitor|beat|gaming|bluetooth|small consumer/i],
  ['Food & Beverage', /candy|food|energy drink|beverage|supplement|vitamin|health food|expired.*good/i],
  ['Home & Garden', /home.*good|home.*decor|bedding|linen|rug|curtain|textile|furniture|garden|lamp|ornate|wind chime|candle|cutlery|plastic.*utensil|file cabinet|safe|lockbox|light bulb/i],
  ['Jewelry & Accessories', /jewelry|gold.*plat|handbag|purse|bag(?!.*travelware)|travelware|luggage|wallet|clutch|accessori|leather.*link|belt/i],
  ['Kitchen & Appliances', /kitchen|appliance|small applianc|dryer|stove|refrigerat|freezer|space heater|hvac|kettle|toaster|egg cooker|stock pot|massage chair|tumbler/i],
  ['Liquidation & GM', /liquidat|closeout|surplus|excess|overstock|general merchand|wholesale.*name brand|opportunity buy|truckload|salvag/i],
  ['Security & Safety', /security|stun gun|baton|pepper spray|knife|taser/i],
  ['Toys & Games', /toy|plush|sanrio|hello kitty|sonic|stitch|bomb.ball/i],
  ['Automotive', /auto|automotive|bdk/i],
  ['Health & Wellness', /heat.*pack|cold.*pack|water.*source|aqua/i],
]

// ─── PIPELINE STAGE RULES ───────────────────────────────────────────
const PIPELINE_RULES: [string, RegExp][] = [
  ['Hot — Urgent', /high priority|time sensitive|2.week|deadline/i],
  ['Quote Submitted', /quote (already |)submitted|quote requested|quote inbound|pricing sheet captured/i],
  ['Quote Expected', /expect.*quote|will.*quote|send.*quote|filling out.*quote|wants.*quote|quote.*coming|manifest incoming|inventory sheet coming/i],
  ['Warm — Needs Outreach', /reach out|follow.up|may have|watch for inbound|possible.*quote|may.*submit|may.*interested|possible interested/i],
  ['Info Requested', /request.*list|request.*closeout|request.*spreadsheet|request.*overstock/i],
  ['Partnership / Referral', /partner|referral|network|connect.*to/i],
  ['Cold — Low Priority', /less urgent|quick intro|no contact/i],
]

// ─── BUSINESS TYPE RULES ────────────────────────────────────────────
const BUSINESS_RULES: [string, RegExp][] = [
  ['Liquidator / Closeout', /liquidat|excess|surplus|overstock|closeout.*buyer/i],
  ['Wholesaler / Distributor', /wholesale|distribut/i],
  ['Importer / Trading Co', /import|export|trading|sourcing/i],
  ['E-Commerce / Marketplace', /amazon|fba|shopify|whatnot|e.?commerce|auction/i],
  ['Brand / Manufacturer', /manufactur|brand|founder|ceo.*found|co.?found|our product|we make/i],
  ['Retailer', /retail|store|shop|outlet|barn|emporium|deals|bargain|discount/i],
  ['Investor / Capital', /broker|capital|invest|fund/i],
]

const TITLE_BUSINESS: [string, RegExp][] = [
  ['Wholesaler / Distributor', /vp.*sales|sales (rep|manager|associate|exec)|account manager|national account|director/i],
  ['Brand / Manufacturer', /owner|ceo|founder|president/i],
]

export function classifyLead(raw: Record<string, string>): ASDLead {
  const text = [raw.inventory_type, raw.notes, raw.follow_up_notes, raw.company, raw.title].filter(Boolean).join(' ')

  // Product categories
  const cats: string[] = []
  for (const [cat, rx] of PRODUCT_CATEGORIES) {
    if (rx.test(text)) cats.push(cat)
  }
  if (!cats.length) cats.push('Unclassified')

  // Pipeline stage
  const followText = [raw.follow_up_notes, raw.notes].filter(Boolean).join(' ')
  let pipeline = 'New Lead — Triage'
  for (const [stage, rx] of PIPELINE_RULES) {
    if (rx.test(followText)) { pipeline = stage; break }
  }

  // Business type
  let biz = 'General'
  for (const [type, rx] of BUSINESS_RULES) {
    if (rx.test(text)) { biz = type; break }
  }
  if (biz === 'General' && raw.title) {
    for (const [type, rx] of TITLE_BUSINESS) {
      if (rx.test(raw.title)) { biz = type; break }
    }
  }

  // Urgency
  const urgency = /time sensitive|high priority|urgent|2.week/i.test(followText) ? 'High' : 'Normal'

  return {
    captured_at: raw.captured_at || '',
    captured_by: raw.captured_by || '',
    full_name: raw.full_name || '',
    title: raw.title || '',
    company: raw.company || '',
    email: raw.email || '',
    phone: raw.phone || '',
    website: raw.website || '',
    city: raw.city || '',
    state: raw.state || '',
    inventory_type: raw.inventory_type || '',
    estimated_volume: raw.estimated_volume || '',
    follow_up: raw.follow_up || '',
    follow_up_notes: raw.follow_up_notes || '',
    notes: raw.notes || '',
    show_name: raw.show_name || '',
    source_file: raw.source_file || '',
    product_categories: cats,
    pipeline_stage: pipeline,
    business_type: biz,
    urgency,
    matched_deals: [],
    match_confidence: 'none',
    total_deals: 0,
    has_active_deal: false,
  } as ASDLead
}
