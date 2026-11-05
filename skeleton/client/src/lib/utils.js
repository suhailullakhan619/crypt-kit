import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind-aware className joiner (shadcn convention). */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/** Server error → user-facing message. */
export function errorMessage(err, fallback = 'Something went bump in the night. Please try again.') {
  return err?.response?.data?.error ?? err?.message ?? fallback;
}

/** 'dueDate' → 'Due date', 'CheckedOut' → 'Checked out' */
export function humanise(s) {
  return String(s ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}
