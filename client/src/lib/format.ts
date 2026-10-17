const UNITS = [
  { limit: 1_000_000_000, suffix: ' Md' },
  { limit: 1_000_000, suffix: ' M' },
  { limit: 1_000, suffix: ' k' },
];

export function compact(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const abs = Math.abs(n);
  for (const { limit, suffix } of UNITS) {
    if (abs >= limit) {
      const value = n / limit;
      const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
      return String(rounded).replace('.0', '') + suffix;
    }
  }
  return String(n);
}

export function money(cents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(cents / 100);
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 45) return "à l'instant";
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `il y a ${d} j`;
  const w = Math.floor(d / 7);
  if (w < 5) return `il y a ${w} sem.`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `il y a ${mo} mois`;
  return `il y a ${Math.floor(d / 365)} an${Math.floor(d / 365) > 1 ? 's' : ''}`;
}

export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function dayMonth(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

export function duration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const initials = (name: string): string =>
  name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?';

const TONES = ['#fe2c55', '#25f4ee', '#7b5cff', '#00c2a8', '#ff9500', '#e1306c', '#0a84ff', '#ffd60a'];

export const toneFor = (seed: string): string => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return TONES[hash % TONES.length] ?? '#fe2c55';
};

export function splitHashtags(text: string): Array<{ type: 'text' | 'tag' | 'at'; value: string }> {
  const out: Array<{ type: 'text' | 'tag' | 'at'; value: string }> = [];
  const re = /([#@])([\p{L}\p{N}_.]{1,40})/gu;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > last) out.push({ type: 'text', value: text.slice(last, match.index) });
    out.push({ type: match[1] === '#' ? 'tag' : 'at', value: match[2] ?? '' });
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
  return out;
}

export const isSeed = (src: string): boolean => src.startsWith('seed:');
export const seedName = (src: string): string => src.replace(/^seed:/, '');
