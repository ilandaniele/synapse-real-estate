import { z } from "zod";
import { Uuid } from "@synapse/contracts";

export const IdParams = z.object({ id: Uuid });
export const SlugParams = z.object({ slug: z.string().min(1).max(80) });

export function slugify(text: string): string {
  const slug = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "item";
}
