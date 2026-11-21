import { z } from "zod";

/** `?page=1&limit=50` for list endpoints. Defaults are generous because the UI filters client-side. */
export const paginationShape = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(200),
};

export const skipOf = ({ page, limit }) => (page - 1) * limit;

/** Escape user text before putting it in a RegExp (search boxes). */
export const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
