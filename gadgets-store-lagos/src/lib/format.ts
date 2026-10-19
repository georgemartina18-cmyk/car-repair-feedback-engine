const naira = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 });

/** 1250000 -> "₦1,250,000" */
export function formatNaira(amount: number): string {
  return `₦${naira.format(Math.round(amount))}`;
}

/** Whole-number percentage off, or 0 when there is no real discount. */
export function discountPercent(price: number, compareAt: number | null | undefined): number {
  if (!compareAt || compareAt <= price) return 0;
  return Math.round(((compareAt - price) / compareAt) * 100);
}

/** Link that opens WhatsApp with a message already typed. */
export function whatsappLink(whatsappNumber: string, message: string): string {
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
}

export function productWhatsappMessage(opts: {
  name: string;
  price: number;
  variant?: string;
  url?: string;
}): string {
  const lines = [
    'Hello Gadgets Store in Lagos, I want to order:',
    `• ${opts.name}${opts.variant ? ` (${opts.variant})` : ''}`,
    `• Price: ${formatNaira(opts.price)}`,
  ];
  if (opts.url) lines.push(`• Link: ${opts.url}`);
  lines.push('Is it available?');
  return lines.join('\n');
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
