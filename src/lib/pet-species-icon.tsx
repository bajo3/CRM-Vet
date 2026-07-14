import { Cat, Dog, PawPrint } from "lucide-react";

/** Ícono según especie (texto libre): reconoce variantes comunes en español e inglés, con un ícono genérico como respaldo. */
export function SpeciesIcon({ species, size = 14, className }: { species: string; size?: number; className?: string }) {
  const normalized = species.trim().toLowerCase();
  if (/perr|canin|dog/.test(normalized)) return <Dog size={size} className={className} />;
  if (/gat|felin|cat/.test(normalized)) return <Cat size={size} className={className} />;
  return <PawPrint size={size} className={className} />;
}
