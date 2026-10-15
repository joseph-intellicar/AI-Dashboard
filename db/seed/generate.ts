/**
 * Deterministic sales-data generator. Pure: no database access.
 *
 * Produces 24 months of orders ending at the anchor date with realistic trends:
 * growth, weekend peaks, Diwali spikes led by Decor, a Lighting stock-out ~2 months ago,
 * App growing / Marketplace shrinking, high COD returns, a breakout product, coupon effects,
 * acquisition-source loyalty differences and a South-heavy regional mix.
 */
import type {
  AcquisitionSource,
  Channel,
  Gender,
  NewCustomer,
  NewOrder,
  NewOrderItem,
  NewProduct,
  OrderStatus,
  PaymentMethod,
  Platform,
  ReturnReason,
} from '../src/schema';
import { addDays, daysBetween, istToUtc, isoWeekday, monthDay } from './dates';
import { Rng } from './random';
import {
  CATEGORIES,
  CITIES,
  FIRST_NAMES,
  LAST_NAMES,
  PRODUCTS,
  type CategoryName,
  type ProductSpec,
} from './reference';

export const SEED = 20261015;
export const WINDOW_DAYS = 730;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const DIP_FROM_DAYS_AGO = 70;
const DIP_TO_DAYS_AGO = 50;
const LIGHTING_DIP_DROP = 0.85;
const BREAKOUT_RAMP_DAYS = 90;

const CHANNELS: Channel[] = ['Website', 'App', 'Marketplace'];
const PAYMENTS: PaymentMethod[] = ['UPI', 'Card', 'COD'];
const PLATFORMS: Record<Channel, Record<string, number>> = {
  Website: { Desktop: 40, 'Mobile Web': 60 },
  App: { Android: 70, iOS: 30 },
  Marketplace: { Amazon: 60, Flipkart: 40 },
};
const SOURCE_WEIGHTS: Record<AcquisitionSource, number> = {
  Instagram: 25,
  Organic: 22,
  'Google Ads': 20,
  Marketplace: 13,
  Referral: 10,
  Influencer: 10,
};
/** How likely a past customer is to come back, by acquisition source. */
const SOURCE_LOYALTY: Record<AcquisitionSource, number> = {
  Referral: 1.0,
  Organic: 0.7,
  'Google Ads': 0.5,
  Marketplace: 0.45,
  Influencer: 0.4,
  Instagram: 0.25,
};
const RETURN_RATE: Record<PaymentMethod, number> = { COD: 0.22, Card: 0.07, UPI: 0.05 };
const RETURN_REASONS_COD: Record<ReturnReason, number> = {
  'Changed mind': 45,
  'Damaged in transit': 15,
  'Not as described': 15,
  'Wrong item': 10,
  'Quality issue': 15,
};
const RETURN_REASONS_PREPAID: Record<ReturnReason, number> = {
  'Changed mind': 15,
  'Damaged in transit': 25,
  'Not as described': 25,
  'Wrong item': 12,
  'Quality issue': 23,
};
const COUPON_PCT: Record<string, number> = { WELCOME10: 0.1, FESTIVE20: 0.2, MONSOON15: 0.15, NIVORA10: 0.1 };
const HOUR_WEIGHTS = [
  1, 0.6, 0.3, 0.2, 0.2, 0.3, 0.6, 1.2, 2, 2.6, 3, 3.2, 3.4, 3.2, 3, 3, 3.2, 3.6, 4.2, 5, 5.6, 5.4, 4.2, 2.4,
];
const SOUTH_REGION_ID = 2;
const NORTH_REGION_ID = 1;

export interface GenerateOptions {
  /** IST calendar date treated as "today" (YYYY-MM-DD). */
  anchor: string;
  /** Instant after which nothing has happened yet. Defaults to the end of the anchor day. */
  cutoff?: Date;
  seed?: number;
}

export interface SeedData {
  products: NewProduct[];
  customers: NewCustomer[];
  orders: NewOrder[];
  orderItems: NewOrderItem[];
  range: { from: string; to: string };
}

interface CustomerState {
  row: NewCustomer & { id: number };
  regionId: number;
  tier: string;
  hasOrdered: boolean;
  /** Personal tendency to come back (0..1), on top of the acquisition-source effect. */
  propensity: number;
}

interface ProductState {
  row: NewProduct & { id: number };
  spec: ProductSpec;
  category: CategoryName;
}

/** 0..1 bell centred on 30 Oct, spanning roughly 10 Oct – 19 Nov. */
export function festiveIntensity(date: string): number {
  const { month, day } = monthDay(date);
  const dayOfYear = month === 10 ? day : month === 11 ? 31 + day : null;
  if (dayOfYear === null) return 0;
  const distance = Math.abs(dayOfYear - 30);
  const halfWidth = 20;
  if (distance >= halfWidth) return 0;
  return 0.5 * (1 + Math.cos((Math.PI * distance) / halfWidth));
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Rounds a price up to the next value ending in 99 (e.g. 1,834 → 1,899). */
function priceEnding99(n: number): number {
  return Math.ceil((n + 1) / 100) * 100 - 1;
}

function buildProducts(rng: Rng, anchor: string): ProductState[] {
  const counters = new Map<string, number>();
  return PRODUCTS.map((spec, index) => {
    const category = CATEGORIES.find((c) => c.name === spec.category)!;
    const n = (counters.get(category.code) ?? 100) + 1;
    counters.set(category.code, n);
    const launchedDaysAgo = spec.launchedDaysAgo ?? WINDOW_DAYS + 60 + rng.int(0, 700);
    const mrp = Math.max(spec.price, priceEnding99(spec.price * rng.float(1.0, 1.35)));
    const cost = Math.round(spec.price * (category.costRatio + rng.float(-0.05, 0.05)));
    return {
      spec,
      category: spec.category,
      row: {
        id: index + 1,
        sku: `NV-${category.code}-${n}`,
        name: spec.name,
        category_id: category.id,
        sub_category: spec.subCategory,
        collection: spec.collection,
        mrp,
        price: spec.price,
        cost,
        launch_date: addDays(anchor, -launchedDaysAgo),
        is_active: true,
      },
    };
  });
}

export function generateSeedData({ anchor, cutoff, seed = SEED }: GenerateOptions): SeedData {
  const rng = new Rng(seed);
  const end = cutoff ?? new Date(istToUtc(anchor, 23, 59).getTime() + 59_000);
  const start = addDays(anchor, -(WINDOW_DAYS - 1));

  const products = buildProducts(rng, anchor);
  const customers: CustomerState[] = [];
  const orders: NewOrder[] = [];
  const orderItems: NewOrderItem[] = [];
  /** Customers who have placed a non-cancelled order, by region (for returning picks). */
  const returningPool: CustomerState[] = [];
  /** Signed up before the data window but not yet ordered. */
  const dormant: CustomerState[] = [];

  // ---------- customers ----------
  function createCustomer(
    signupDate: string,
    opts: { regionId?: number; channel?: Channel } = {},
  ): CustomerState {
    const cityChoices = opts.regionId ? CITIES.filter((c) => c.region_id === opts.regionId) : CITIES;
    const city = rng.weightedFrom(cityChoices, (c) => c.weight);
    const source: AcquisitionSource =
      opts.channel === 'Marketplace' && rng.chance(0.55) ? 'Marketplace' : rng.weighted(SOURCE_WEIGHTS);
    const first = rng.pick(FIRST_NAMES);
    const last = rng.pick(LAST_NAMES);
    const id = customers.length + 1;
    const gender: Gender = rng.weighted({ Female: 58, Male: 37, Undisclosed: 5 });
    const state: CustomerState = {
      row: {
        id,
        name: `${first} ${last}`,
        email: `${first}.${last}${id}@example.com`.toLowerCase(),
        gender,
        city_id: city.id,
        acquisition_source: source,
        signup_date: signupDate,
      },
      regionId: city.region_id,
      tier: city.tier,
      hasOrdered: false,
      propensity: rng.chance(0.3) ? rng.float(0.6, 1) : rng.float(0, 0.15),
    };
    customers.push(state);
    return state;
  }

  for (let i = 0; i < 500; i++) {
    dormant.push(createCustomer(addDays(start, -rng.int(30, 400))));
  }

  function pickReturning(regionId?: number): CustomerState | undefined {
    const pool = regionId ? returningPool.filter((c) => c.regionId === regionId) : returningPool;
    if (pool.length === 0) return undefined;
    for (let attempt = 0; attempt < 200; attempt++) {
      const candidate = rng.pick(pool);
      if (rng.chance(SOURCE_LOYALTY[candidate.row.acquisition_source] * candidate.propensity))
        return candidate;
    }
    return rng.pick(pool);
  }

  function pickCustomer(date: string, channel: Channel, regionId?: number): CustomerState {
    if (!rng.chance(0.55)) {
      const returning = pickReturning(regionId);
      if (returning) return returning;
    }
    if (rng.chance(0.12)) {
      const idx = dormant.findIndex((c) => !regionId || c.regionId === regionId);
      if (idx >= 0) return dormant.splice(idx, 1)[0]!;
    }
    const signup = addDays(date, -rng.int(0, 20));
    return createCustomer(signup < start ? start : signup, { regionId, channel });
  }

  // ---------- products ----------
  function categoryWeights(date: string, regionId: number, festive: number): Record<CategoryName, number> {
    const w = Object.fromEntries(CATEGORIES.map((c) => [c.name, c.weight])) as Record<CategoryName, number>;
    if (regionId === SOUTH_REGION_ID) w.Bedding *= 1.4;
    if (festive > 0) {
      w.Decor *= 1 + 5 * festive * (regionId === NORTH_REGION_ID ? 1.3 : 1);
      w.Lighting *= 1 + 0.25 * festive;
    }
    return w;
  }

  function productWeight(p: ProductState, daysAgo: number): number {
    if (!p.spec.breakout || daysAgo > BREAKOUT_RAMP_DAYS) return p.spec.popularity;
    return p.spec.popularity * (1 + 11 * ((BREAKOUT_RAMP_DAYS - daysAgo) / BREAKOUT_RAMP_DAYS));
  }

  // ---------- orders ----------
  const monthCombos = new Map<string, Set<string>>();
  const comboKey = (channel: Channel, payment: PaymentMethod, regionId: number) =>
    `${channel}|${payment}|${regionId}`;

  function createOrder(
    date: string,
    at: Date,
    force: { channel?: Channel; payment?: PaymentMethod; regionId?: number } = {},
  ): void {
    const daysAgo = daysBetween(date, anchor);
    const t = daysBetween(start, date) / (WINDOW_DAYS - 1);
    const festive = festiveIntensity(date);
    const inDip = daysAgo >= DIP_TO_DAYS_AGO && daysAgo <= DIP_FROM_DAYS_AGO;

    const appShare = 0.2 + 0.2 * t;
    const marketplaceShare = 0.32 - 0.17 * t;
    const channel =
      force.channel ??
      rng.weighted<Channel>({
        Website: 1 - appShare - marketplaceShare,
        App: appShare,
        Marketplace: marketplaceShare,
      });
    const platform = rng.weighted(PLATFORMS[channel]) as Platform;

    const customer = pickCustomer(date, channel, force.regionId);
    const isFirstOrder = !customer.hasOrdered;
    const cod = customer.tier === 'Tier 2' ? 0.3 : 0.2;
    const payment = force.payment ?? rng.weighted<PaymentMethod>({ UPI: 0.75 - cod, Card: 0.25, COD: cod });

    const { month } = monthDay(date);
    let coupon: string | null = null;
    if (isFirstOrder && rng.chance(0.3)) coupon = 'WELCOME10';
    else if (festive > 0.15 && rng.chance(0.45 * festive + 0.1)) coupon = 'FESTIVE20';
    else if ((month === 7 || month === 8) && rng.chance(0.18)) coupon = 'MONSOON15';
    else if (rng.chance(0.05)) coupon = 'NIVORA10';

    let itemCount = Number(rng.weighted({ 1: 55, 2: 30, 3: 11, 4: 4 }));
    if (coupon && rng.chance(0.45)) itemCount += 1;

    const weights = categoryWeights(date, customer.regionId, festive);
    const lines: { product: ProductState; quantity: number }[] = [];
    for (let i = 0; i < itemCount; i++) {
      const category = rng.weighted(weights);
      if (category === 'Lighting' && inDip && rng.chance(LIGHTING_DIP_DROP)) continue; // out of stock
      const available = products.filter((p) => p.category === category && p.row.launch_date <= date);
      if (available.length === 0) continue;
      const product = rng.weightedFrom(available, (p) => productWeight(p, daysAgo));
      const quantity = Number(rng.weighted({ 1: 85, 2: 12, 3: 3 }));
      const existing = lines.find((l) => l.product === product);
      if (existing) existing.quantity += quantity;
      else lines.push({ product, quantity });
    }
    if (lines.length === 0) return;

    const orderId = orders.length + 1;
    const pct = coupon ? COUPON_PCT[coupon]! : 0;
    let net = 0;
    let discountTotal = 0;
    for (const line of lines) {
      const gross = line.quantity * line.product.row.price;
      const discount = roundMoney(gross * pct);
      net += gross - discount;
      discountTotal += discount;
      orderItems.push({
        id: orderItems.length + 1,
        order_id: orderId,
        product_id: line.product.row.id,
        quantity: line.quantity,
        unit_price: line.product.row.price,
        unit_cost: line.product.row.cost,
        discount_amount: discount,
      });
    }

    // ---------- lifecycle ----------
    let status: OrderStatus;
    let deliveredAt: Date | null = null;
    let returnedAt: Date | null = null;
    let returnReason: ReturnReason | null = null;
    if (rng.chance(0.05)) {
      status = 'Cancelled';
    } else {
      const transitDays = customer.tier === 'Tier 2' ? rng.int(3, 7) : rng.int(2, 5);
      const delivered = new Date(at.getTime() + transitDays * DAY + rng.int(0, 10) * HOUR);
      if (delivered > end) {
        status = at.getTime() + DAY > end.getTime() ? 'Processing' : 'Shipped';
      } else {
        status = 'Delivered';
        deliveredAt = delivered;
        if (rng.chance(RETURN_RATE[payment])) {
          const returned = new Date(delivered.getTime() + rng.int(1, 10) * DAY + rng.int(0, 12) * HOUR);
          if (returned <= end) {
            status = 'Returned';
            returnedAt = returned;
            returnReason = rng.weighted(payment === 'COD' ? RETURN_REASONS_COD : RETURN_REASONS_PREPAID);
          }
        }
      }
    }

    orders.push({
      id: orderId,
      order_number: `NV-${100000 + orderId}`,
      customer_id: customer.row.id,
      ordered_at: at,
      channel,
      platform,
      payment_method: payment,
      status,
      coupon_code: coupon,
      discount_amount: roundMoney(discountTotal),
      shipping_fee: net >= 999 ? 0 : 79,
      delivered_at: deliveredAt,
      returned_at: returnedAt,
      return_reason: returnReason,
      is_first_order: isFirstOrder,
    });

    if (status !== 'Cancelled' && !customer.hasOrdered) {
      customer.hasOrdered = true;
      returningPool.push(customer);
    }
    const monthKey = date.slice(0, 7);
    if (!monthCombos.has(monthKey)) monthCombos.set(monthKey, new Set());
    monthCombos.get(monthKey)!.add(comboKey(channel, payment, customer.regionId));
  }

  function randomTimeOn(date: string, latest: Date): Date {
    for (let attempt = 0; attempt < 20; attempt++) {
      const hour = Number(rng.weightedFrom([...HOUR_WEIGHTS.keys()], (h) => HOUR_WEIGHTS[h]!));
      const at = istToUtc(date, hour, rng.int(0, 59));
      if (at <= latest) return at;
    }
    // Early in the anchor day: spread uniformly over the elapsed time.
    const dayStart = istToUtc(date, 0, 0).getTime();
    return new Date(dayStart + rng.float(0, Math.max(60_000, latest.getTime() - dayStart)));
  }

  for (let i = 0; i < WINDOW_DAYS; i++) {
    const date = addDays(start, i);
    const t = i / (WINDOW_DAYS - 1);
    const weekday = isoWeekday(date);
    const weekdayFactor = weekday >= 6 ? 1.25 : weekday === 5 ? 1.1 : 0.92;
    const lambda = (7.6 + 6.6 * t) * weekdayFactor * (1 + 0.6 * festiveIntensity(date));
    const daysAgo = daysBetween(date, anchor);
    let count = rng.poisson(lambda);
    if (daysAgo <= 1) count = Math.max(count, 3);

    const latest = date === anchor ? end : new Date(istToUtc(date, 23, 59).getTime() + 59_000);
    const times = Array.from({ length: count }, () => randomTimeOn(date, latest)).sort(
      (a, b) => a.getTime() - b.getTime(),
    );
    for (const at of times) createOrder(date, at);
    let lastTime = times.length ? times[times.length - 1]!.getTime() : istToUtc(date, 0, 0).getTime();

    // Coverage: on the last day of each month (and on the anchor day), make sure every
    // channel × payment × region combination has at least one order that month.
    const isMonthEnd = addDays(date, 1).slice(0, 7) !== date.slice(0, 7);
    if (isMonthEnd || date === anchor) {
      const seen = monthCombos.get(date.slice(0, 7)) ?? new Set<string>();
      for (const channel of CHANNELS) {
        for (const payment of PAYMENTS) {
          for (const regionId of [1, 2, 3, 4]) {
            if (!seen.has(comboKey(channel, payment, regionId))) {
              // Keep orders chronological so is_first_order stays correct.
              lastTime = Math.min(latest.getTime(), lastTime + rng.int(1, 20) * 60_000);
              createOrder(date, new Date(lastTime), { channel, payment, regionId });
            }
          }
        }
      }
    }
  }

  // Customers who signed up recently but never ordered.
  for (let i = 0; i < 300; i++) createCustomer(addDays(start, rng.int(0, WINDOW_DAYS - 1)));

  return {
    products: products.map((p) => p.row),
    customers: customers.map((c) => c.row),
    orders,
    orderItems,
    range: { from: start, to: anchor },
  };
}
