/**
 * Chart colours. The same attribute value always gets the same colour in every chart:
 * small-domain attributes use the fixed maps below, everything else a stable hash.
 */
export const BRAND = {
  primary: '#0F766E',
  accent: '#F59E0B',
  success: '#16A34A',
  danger: '#DC2626',
} as const;

export const CHART_PALETTE = [
  '#0D9488', // teal (brand family; #0F766E is too low-chroma for a series colour)
  '#F59E0B', // amber (brand)
  '#6366F1', // indigo
  '#EC4899', // pink
  '#0EA5E9', // sky
  '#84CC16', // lime
  '#A855F7', // purple
  '#F97316', // orange
  '#B45309', // bronze
  '#0891B2', // cyan
] as const;
// Validated with the dataviz palette validator (light surface): lightness band, chroma floor,
// adjacent CVD separation and normal-vision floor all pass. Amber, sky, lime and orange are under 3:1
// against white, so charts always carry tooltips, data labels or a table view.

export const OTHER_COLOR = '#CBD5E1';
export const OTHER_LABEL = 'Other';

export const VALUE_COLORS: Record<string, Record<string, string>> = {
  category: {
    Kitchen: '#0D9488',
    Decor: '#F59E0B',
    Bedding: '#6366F1',
    Lighting: '#EC4899',
    Storage: '#0EA5E9',
    Bath: '#84CC16',
  },
  channel: { Website: '#0D9488', App: '#F59E0B', Marketplace: '#6366F1' },
  payment_method: { UPI: '#0D9488', Card: '#6366F1', COD: '#F59E0B' },
  region: { North: '#6366F1', South: '#0D9488', West: '#F59E0B', East: '#EC4899' },
  order_status: {
    Delivered: '#0D9488',
    Shipped: '#0EA5E9',
    Processing: '#A855F7',
    Returned: '#DC2626',
    Cancelled: '#94A3B8',
  },
  platform: {
    Desktop: '#0D9488',
    'Mobile Web': '#0891B2',
    Android: '#F59E0B',
    iOS: '#F97316',
    Amazon: '#6366F1',
    Flipkart: '#0EA5E9',
  },
  customer_type: { New: '#F59E0B', Returning: '#0D9488' },
  acquisition_source: {
    Organic: '#0D9488',
    Instagram: '#EC4899',
    'Google Ads': '#0EA5E9',
    Referral: '#84CC16',
    Influencer: '#A855F7',
    Marketplace: '#6366F1',
  },
  coupon_used: { Yes: '#F59E0B', No: '#0D9488' },
  collection: {
    Essentials: '#0D9488',
    'Festive Edit': '#F59E0B',
    'Earthy Handcrafted': '#F97316',
    'Modern Minimal': '#6366F1',
  },
  price_band: {
    '< ₹500': '#5EEAD4',
    '₹500–1,499': '#14B8A6',
    '₹1,500–4,999': '#0F766E',
    '₹5,000+': '#134E4A',
  },
};

/** FNV-1a — stable across runs and platforms. */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function hashColor(value: string): string {
  return CHART_PALETTE[hashString(value) % CHART_PALETTE.length]!;
}

/** Default colour for an attribute value (before any widget override). */
export function valueColor(attributeKey: string, value: string): string {
  if (value === OTHER_LABEL) return OTHER_COLOR;
  return VALUE_COLORS[attributeKey]?.[value] ?? hashColor(`${attributeKey}:${value}`);
}

/** Default colour for the n-th measure series. */
export function seriesColor(index: number): string {
  return CHART_PALETTE[index % CHART_PALETTE.length]!;
}

/** Dark or light label text for a background colour (WCAG relative luminance). */
export function contrastText(hex: string): '#0F172A' | '#FFFFFF' {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#0F172A';
  const n = parseInt(m[1]!, 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  // Pick whichever gives the higher contrast ratio.
  return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? '#0F172A' : '#FFFFFF';
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}
