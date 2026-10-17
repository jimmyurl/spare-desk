export const CATEGORIES = ["Bearings", "Body, Guards & Mirrors", "Brakes", "Cables", "Clutch & Gearbox", "Electrical & Lighting", "Gaskets & Seals", "Other Spares", "Pistons & Engine", "Sprockets & Chains", "Suspension & Steering", "Tyres & Tubes"] as const;
export type Category = (typeof CATEGORIES)[number];
