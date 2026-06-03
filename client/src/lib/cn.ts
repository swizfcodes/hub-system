import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Concatenate Tailwind classes with intelligent dedupe. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
