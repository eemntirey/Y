import { useEffect, useMemo, useRef, useState } from 'react';
import { isSeed, seedName } from '../lib/format';

const PALETTES: Record<string, [string, string, string]> = {
  sunset: ['#ff5f6d', '#ffc371', '#ff2d55'],
  ocean: ['#0f2027', '#2c5364', '#25f4ee'],
  forest: ['#134e5e', '#71b280', '#a8e6a1'],
  candy: ['#ff9a9e', '#fad0c4', '#fbc2eb'],
  neon: ['#00f2fe', '#4facfe', '#fe2c55'],
  mono: ['#2b2b2b', '#8e8e93', '#e5e5e7'],
  ember: ['#870000', '#190a05', '#ff7a18'],
  violet: ['#7b2ff7', '#f107a3', '#2c1a4d'],
  mint: ['#d9fff2', '#74ebd5', '#17a67a'],
  coral: ['#ff758c', '#ff7eb3', '#7a2b3f'],
  sky: ['#a8edea', '#c9d6ff', '#4f7cff'],
  grape: ['#4b1d6f', '#8e44ad', '#e056fd'],
  sand: ['#e9d8c6', '#b08d6f', '#7a5230'],
  rose: ['#fbc7bd', '#a6c0c0', '#c94b6d'],
  lime: ['#d4fc79', '#96e6a1', '#4caf50'],
  steel: ['#4b6cb7', '#182848', '#b8c6db'],
};

interface SeedArtProps {
  src: string;
  /** 0 -> 1, utilisé pour simuler la progression de lecture. */
  progress?: number;
  letter?: string;
  paused?: boolean;
  className?: string;
}

/**
 * Visuel animé généré pour les contenus sans fichier vidéo réel.
 * Évite tout encodage : dégradés animés + grain, pilotés par la progression.
 */
export function SeedArt({ src, progress = 0, letter, paused, className }: SeedArtProps) {
  const name = seedName(src);
  const palette = PALETTES[name] ?? PALETTES.neon!;
  const [time, setTime] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    if (paused) return;
    let start = performance.now();
    const tick = (t: number) => {
      setTime((t - start) / 1000);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [paused]);

  const hueShift = useMemo(() => (time * 6) % 360, [time]);

  return (
    <div className={`seedart ${className ?? ''}`} aria-hidden="true">
      <div
        className="seedart__layer seedart__layer--1"
        style={{ background: `linear-gradient(135deg, ${palette[0]}, ${palette[1]})` }}
      />
      <div
        className="seedart__layer seedart__layer--2"
        style={{
          background: `linear-gradient(225deg, ${palette[1]}, ${palette[2]})`,
          filter: `hue-rotate(${hueShift}deg)`,
        }}
      />
      <div
        className="seedart__layer seedart__layer--3"
        style={{
          background: `radial-gradient(circle at 30% 30%, ${palette[2]}, ${palette[0]} 70%)`,
          filter: `hue-rotate(${(360 - hueShift) % 360}deg)`,
        }}
      />
      <div className="seedart__pulse" />
      <div className="seedart__grain" />
      {letter ? <div className="seedart__initial">{letter}</div> : null}
      <div className="seedart__playhead" style={{ transform: `scaleX(${Math.min(1, Math.max(0, progress))})` }} />
    </div>
  );
}

interface MediaProps {
  src: string;
  poster?: string | null;
  letter?: string;
  className?: string;
  /** Rendu statique (pas d'animation) pour les vignettes de grille. */
  still?: boolean;
  progress?: number;
}

/** Affiche soit un <video>, soit le visuel généré, selon la source. */
export function Media({ src, poster, letter, className, still, progress = 0 }: MediaProps) {
  if (isSeed(src)) return <SeedArt src={src} progress={progress} letter={letter} className={className} />;
  return (
    <video
      className={className}
      src={/^https?:\/\//.test(src) ? src : `/media/${src.replace(/^\/+/, '')}`}
      poster={poster ?? undefined}
      muted
      loop
      playsInline
      preload={still ? 'metadata' : 'auto'}
      aria-hidden="true"
    />
  );
}
