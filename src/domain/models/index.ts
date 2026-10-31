import { z } from "zod";

// Mirrors src-tauri/migrations. Keep enum values in sync with the SQL CHECK constraints.

export const VerificationStatus = z.enum(["verified", "unverified", "community", "user_provided"]);
export type VerificationStatus = z.infer<typeof VerificationStatus>;

/** KR/TW data may be stored, but is never treated as confirmed Global data. */
export const GameRegion = z.enum(["GLOBAL", "KR", "TW", "OTHER"]);
export type GameRegion = z.infer<typeof GameRegion>;

/** What an observed price IS (README 16.4). A listing is never a completed sale. */
export const PriceKind = z.enum(["lowest_listing", "typical_listing", "median_listing", "sale_price", "estimate", "unknown"]);
export type PriceKind = z.infer<typeof PriceKind>;

export const SourceType = z.enum(["official", "community", "user", "import", "demo"]);
export type SourceType = z.infer<typeof SourceType>;

/** Money: integer in the smallest in-game currency unit. */
export const Money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const Id = z.number().int().positive();
const IsoDate = z.iso.datetime();

export const Item = z.object({
  id: Id,
  name: z.string().trim().min(1),
  category_id: Id.nullable(),
  game_region: GameRegion,
  game_version: z.string().nullable(),
  verification_status: VerificationStatus,
  source_id: Id.nullable(),
  last_verified_at: IsoDate.nullable(),
});
export type Item = z.infer<typeof Item>;

export const RecipeIngredient = z.object({
  ingredient_item_id: Id,
  quantity: z.number().int().positive(),
});
export type RecipeIngredient = z.infer<typeof RecipeIngredient>;

export const Recipe = z.object({
  id: Id,
  output_item_id: Id,
  profession_id: Id.nullable(),
  required_level: z.number().int().nonnegative().nullable(),
  output_quantity: z.number().int().positive(),
  /** null = unknown fee, which is not the same as no fee. */
  craft_fee: Money.nullable(),
  game_region: GameRegion,
  verification_status: VerificationStatus,
  source_id: Id.nullable(),
  ingredients: z.array(RecipeIngredient).min(1),
});
export type Recipe = z.infer<typeof Recipe>;


/** Only verified Global data is presented as reliable. */
export const isReliable = (d: { game_region: GameRegion; verification_status: VerificationStatus }) =>
  d.game_region === "GLOBAL" && d.verification_status === "verified";
