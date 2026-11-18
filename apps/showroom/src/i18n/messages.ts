import type { Locale } from "@synapse/domain";
import { en } from "./en";
import { es, type Messages } from "./es";

export type { Messages };
export const MESSAGES: Record<Locale, Messages> = { es, en };
