/** Static reference data for the Nivora Home seed. */
import type { Collection } from '../src/schema';

export const REGIONS = [
  { id: 1, name: 'North' },
  { id: 2, name: 'South' },
  { id: 3, name: 'West' },
  { id: 4, name: 'East' },
] as const;

export const CITIES = [
  { id: 1, name: 'Bengaluru', state: 'Karnataka', tier: 'Tier 1', region_id: 2, weight: 20 },
  { id: 2, name: 'Chennai', state: 'Tamil Nadu', tier: 'Tier 1', region_id: 2, weight: 12 },
  { id: 3, name: 'Hyderabad', state: 'Telangana', tier: 'Tier 1', region_id: 2, weight: 13 },
  { id: 4, name: 'Mumbai', state: 'Maharashtra', tier: 'Tier 1', region_id: 3, weight: 18 },
  { id: 5, name: 'Pune', state: 'Maharashtra', tier: 'Tier 1', region_id: 3, weight: 10 },
  { id: 6, name: 'Delhi', state: 'Delhi', tier: 'Tier 1', region_id: 1, weight: 15 },
  { id: 7, name: 'Jaipur', state: 'Rajasthan', tier: 'Tier 2', region_id: 1, weight: 6 },
  { id: 8, name: 'Kolkata', state: 'West Bengal', tier: 'Tier 1', region_id: 4, weight: 6 },
] as const;

export type CategoryName = 'Kitchen' | 'Decor' | 'Bedding' | 'Lighting' | 'Storage' | 'Bath';

export const CATEGORIES: readonly {
  id: number;
  name: CategoryName;
  code: string;
  costRatio: number;
  weight: number;
}[] = [
  { id: 1, name: 'Kitchen', code: 'KIT', costRatio: 0.55, weight: 18 },
  { id: 2, name: 'Decor', code: 'DEC', costRatio: 0.4, weight: 17 },
  { id: 3, name: 'Bedding', code: 'BED', costRatio: 0.5, weight: 18 },
  { id: 4, name: 'Lighting', code: 'LGT', costRatio: 0.45, weight: 17 },
  { id: 5, name: 'Storage', code: 'STO', costRatio: 0.58, weight: 14 },
  { id: 6, name: 'Bath', code: 'BTH', costRatio: 0.42, weight: 16 },
];

export interface ProductSpec {
  name: string;
  category: CategoryName;
  subCategory: string;
  collection: Collection;
  price: number;
  /** Relative popularity within its category. */
  popularity: number;
  /** Launch, in days before the anchor date. Products without it launched long before the data window. */
  launchedDaysAgo?: number;
  breakout?: boolean;
}

const E: Collection = 'Essentials';
const F: Collection = 'Festive Edit';
const H: Collection = 'Earthy Handcrafted';
const M: Collection = 'Modern Minimal';

// prettier-ignore
export const PRODUCTS: readonly ProductSpec[] = [
  // Kitchen
  { name: 'Cast Iron Kadai 10"', category: 'Kitchen', subCategory: 'Cookware', collection: E, price: 1899, popularity: 1.4 },
  { name: 'Tri-Ply Saucepan 1.5L', category: 'Kitchen', subCategory: 'Cookware', collection: M, price: 2499, popularity: 1.0 },
  { name: 'Copper Bottom Tope Set', category: 'Kitchen', subCategory: 'Cookware', collection: H, price: 3299, popularity: 0.7 },
  { name: 'Hand-Painted Ceramic Dinner Set', category: 'Kitchen', subCategory: 'Serveware', collection: H, price: 4999, popularity: 0.8 },
  { name: 'Brass Serving Bowls (Set of 2)', category: 'Kitchen', subCategory: 'Serveware', collection: F, price: 1599, popularity: 1.0 },
  { name: 'Mango Wood Serving Platter', category: 'Kitchen', subCategory: 'Serveware', collection: H, price: 1199, popularity: 1.2 },
  { name: 'Acacia Wood Spice Box', category: 'Kitchen', subCategory: 'Kitchen Tools', collection: H, price: 899, popularity: 1.5 },
  { name: 'Marble Mortar & Pestle', category: 'Kitchen', subCategory: 'Kitchen Tools', collection: M, price: 1099, popularity: 0.9 },
  { name: 'Borosilicate Glass Tumblers (Set of 6)', category: 'Kitchen', subCategory: 'Drinkware', collection: M, price: 749, popularity: 1.6 },
  { name: 'Copper Water Bottle 1L', category: 'Kitchen', subCategory: 'Drinkware', collection: E, price: 999, popularity: 1.3, launchedDaysAgo: 400 },

  // Decor
  { name: 'Brass Diya Set of 4', category: 'Decor', subCategory: 'Festive Decor', collection: F, price: 1299, popularity: 1.6 },
  { name: 'Marigold Toran Door Hanging', category: 'Decor', subCategory: 'Festive Decor', collection: F, price: 699, popularity: 1.3 },
  { name: 'Handcrafted Rangoli Stencil Kit', category: 'Decor', subCategory: 'Festive Decor', collection: F, price: 449, popularity: 0.9 },
  { name: 'Terracotta Wall Plates (Set of 3)', category: 'Decor', subCategory: 'Wall Decor', collection: H, price: 2199, popularity: 0.8 },
  { name: 'Madhubani Framed Art Print', category: 'Decor', subCategory: 'Wall Decor', collection: H, price: 3499, popularity: 0.7 },
  { name: 'Macrame Wall Hanging', category: 'Decor', subCategory: 'Wall Decor', collection: M, price: 1499, popularity: 1.0 },
  { name: 'Ribbed Ceramic Vase', category: 'Decor', subCategory: 'Vases & Planters', collection: M, price: 1199, popularity: 1.2 },
  { name: 'Jute Planter Basket', category: 'Decor', subCategory: 'Vases & Planters', collection: E, price: 649, popularity: 1.1 },
  { name: 'Soy Wax Candle – Jasmine', category: 'Decor', subCategory: 'Candles & Holders', collection: E, price: 599, popularity: 1.4 },
  { name: 'Moroccan Lantern Candle Holder', category: 'Decor', subCategory: 'Candles & Holders', collection: F, price: 1799, popularity: 0.9, launchedDaysAgo: 250 },

  // Bedding
  { name: 'Jaipur Block-Print Bedsheet Set', category: 'Bedding', subCategory: 'Bedsheets', collection: H, price: 2299, popularity: 1.6 },
  { name: 'Egyptian Cotton Bedsheet – King', category: 'Bedding', subCategory: 'Bedsheets', collection: M, price: 3999, popularity: 1.0 },
  { name: 'Percale Fitted Sheet – Queen', category: 'Bedding', subCategory: 'Bedsheets', collection: E, price: 1499, popularity: 1.3 },
  { name: 'Kantha Stitch Quilt', category: 'Bedding', subCategory: 'Quilts & Comforters', collection: H, price: 5499, popularity: 0.7 },
  { name: 'All-Season Microfibre Comforter', category: 'Bedding', subCategory: 'Quilts & Comforters', collection: E, price: 3299, popularity: 1.1 },
  { name: 'Mulmul Cotton Dohar', category: 'Bedding', subCategory: 'Quilts & Comforters', collection: E, price: 1899, popularity: 1.2 },
  { name: 'Velvet Cushion Covers (Set of 2)', category: 'Bedding', subCategory: 'Cushions & Pillows', collection: F, price: 999, popularity: 1.4 },
  { name: 'Memory Foam Pillow', category: 'Bedding', subCategory: 'Cushions & Pillows', collection: M, price: 1799, popularity: 1.0 },
  { name: 'Ikat Cushion Cover', category: 'Bedding', subCategory: 'Cushions & Pillows', collection: H, price: 549, popularity: 1.2 },
  { name: 'Linen Duvet Cover – Queen', category: 'Bedding', subCategory: 'Quilts & Comforters', collection: M, price: 4499, popularity: 0.6, launchedDaysAgo: 400 },

  // Lighting
  { name: 'Terracotta Table Lamp', category: 'Lighting', subCategory: 'Table Lamps', collection: H, price: 2799, popularity: 1.3 },
  { name: 'Rattan Table Lamp', category: 'Lighting', subCategory: 'Table Lamps', collection: H, price: 3199, popularity: 1.0 },
  { name: 'Matte Black Desk Lamp', category: 'Lighting', subCategory: 'Table Lamps', collection: M, price: 1999, popularity: 1.1 },
  { name: 'Cane Pendant Light', category: 'Lighting', subCategory: 'Pendant Lights', collection: H, price: 3799, popularity: 0.9 },
  { name: 'Brass Dome Pendant', category: 'Lighting', subCategory: 'Pendant Lights', collection: M, price: 5999, popularity: 0.6 },
  { name: 'Copper Wire Fairy Lights 10m', category: 'Lighting', subCategory: 'Fairy Lights', collection: F, price: 499, popularity: 1.7 },
  { name: 'Cotton Ball String Lights', category: 'Lighting', subCategory: 'Fairy Lights', collection: F, price: 799, popularity: 1.4 },
  { name: 'Diwali Paper Lantern (Set of 3)', category: 'Lighting', subCategory: 'Fairy Lights', collection: F, price: 699, popularity: 1.0 },
  { name: 'Tripod Floor Lamp', category: 'Lighting', subCategory: 'Floor Lamps', collection: M, price: 7999, popularity: 0.5 },
  { name: 'Bamboo Arc Floor Lamp', category: 'Lighting', subCategory: 'Floor Lamps', collection: H, price: 9499, popularity: 0.4 },

  // Storage
  { name: 'Seagrass Storage Basket (Set of 3)', category: 'Storage', subCategory: 'Baskets', collection: H, price: 1999, popularity: 1.4 },
  { name: 'Cotton Rope Laundry Basket', category: 'Storage', subCategory: 'Baskets', collection: E, price: 1299, popularity: 1.3 },
  { name: 'Water Hyacinth Hamper', category: 'Storage', subCategory: 'Baskets', collection: H, price: 2499, popularity: 0.8 },
  { name: 'Bamboo Drawer Organiser', category: 'Storage', subCategory: 'Organisers', collection: E, price: 799, popularity: 1.5 },
  { name: 'Fabric Wardrobe Organiser', category: 'Storage', subCategory: 'Organisers', collection: E, price: 999, popularity: 1.2 },
  { name: 'Acrylic Jewellery Box', category: 'Storage', subCategory: 'Organisers', collection: M, price: 1399, popularity: 0.9 },
  { name: 'Sheesham Wall Shelf', category: 'Storage', subCategory: 'Shelving', collection: H, price: 2999, popularity: 0.8 },
  { name: 'Metal Floating Shelves (Set of 2)', category: 'Storage', subCategory: 'Shelving', collection: M, price: 1799, popularity: 1.0 },
  { name: 'Ladder Bookshelf', category: 'Storage', subCategory: 'Shelving', collection: M, price: 12999, popularity: 0.3 },
  { name: 'Under-Bed Storage Bag', category: 'Storage', subCategory: 'Organisers', collection: E, price: 899, popularity: 1.1, launchedDaysAgo: 60 },

  // Bath
  { name: 'Turkish Cotton Bath Towel', category: 'Bath', subCategory: 'Towels', collection: E, price: 1199, popularity: 1.6 },
  { name: 'Waffle Weave Towel Set', category: 'Bath', subCategory: 'Towels', collection: M, price: 1899, popularity: 1.1 },
  { name: 'Hammam Towel', category: 'Bath', subCategory: 'Towels', collection: H, price: 999, popularity: 1.0 },
  { name: 'Stoneware Soap Dispenser', category: 'Bath', subCategory: 'Bath Accessories', collection: M, price: 799, popularity: 1.2 },
  { name: 'Bamboo Bath Mat', category: 'Bath', subCategory: 'Bath Accessories', collection: E, price: 1099, popularity: 1.1 },
  { name: 'Terrazzo Bathroom Set (4 pcs)', category: 'Bath', subCategory: 'Bath Accessories', collection: M, price: 2499, popularity: 0.7 },
  { name: 'Teak Wood Bath Caddy', category: 'Bath', subCategory: 'Bath Accessories', collection: H, price: 2199, popularity: 0.6 },
  { name: 'Lemongrass Bath Salts', category: 'Bath', subCategory: 'Fragrance', collection: E, price: 449, popularity: 1.3 },
  { name: 'Vetiver Room Mist', category: 'Bath', subCategory: 'Fragrance', collection: H, price: 649, popularity: 0.9 },
  {
    name: 'Aroma Reed Diffuser – Sandalwood',
    category: 'Bath',
    subCategory: 'Fragrance',
    collection: H,
    price: 1499,
    popularity: 0.5,
    launchedDaysAgo: 160,
    breakout: true,
  },
];

export const RETURN_REASONS = [
  'Damaged in transit',
  'Not as described',
  'Changed mind',
  'Wrong item',
  'Quality issue',
] as const;

// prettier-ignore
export const FIRST_NAMES = [
  'Aarav', 'Vivaan', 'Aditya', 'Arjun', 'Sai', 'Reyansh', 'Krishna', 'Ishaan', 'Rohan', 'Kabir',
  'Ananya', 'Diya', 'Saanvi', 'Aadhya', 'Ira', 'Meera', 'Kavya', 'Priya', 'Neha', 'Riya',
  'Lakshmi', 'Karthik', 'Vikram', 'Suresh', 'Divya', 'Pooja', 'Sneha', 'Harini', 'Rahul', 'Amit',
  'Nikhil', 'Tanvi', 'Shreya', 'Aisha', 'Farhan', 'Zoya', 'Arnav', 'Ritika', 'Gaurav', 'Pallavi',
];

// prettier-ignore
export const LAST_NAMES = [
  'Sharma', 'Iyer', 'Reddy', 'Nair', 'Patel', 'Gupta', 'Menon', 'Rao', 'Singh', 'Mehta',
  'Kulkarni', 'Banerjee', 'Das', 'Chatterjee', 'Joshi', 'Agarwal', 'Pillai', 'Shetty', 'Khan', 'Verma',
  'Deshpande', 'Mukherjee', 'Krishnan', 'Bhat', 'Saxena', 'Kapoor', 'Malhotra', 'Naidu', 'Ghosh', 'Jain',
];

export const TEST_USERS = [
  { email: 'aarav@nivora.in', name: 'Aarav Sharma' },
  { email: 'diya@nivora.in', name: 'Diya Iyer' },
] as const;
export const TEST_PASSWORD = 'Nivora@123';
