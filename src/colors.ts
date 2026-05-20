export interface SlimeColor {
  name: string;
  hex: string;
}

export const slimeColors: SlimeColor[] = [
  { name: "purple", hex: "#96488A" },
  { name: "pink", hex: "#e08ce6" },
  { name: "orange", hex: "#E8772E" },
  { name: "red", hex: "#D64550" },
  { name: "blue", hex: "#459ed6" },
  { name: "green", hex: "#5cbe65" },
];

export const defaultColorIndex = 0;

export function colorAt(index: number): SlimeColor {
  const n = slimeColors.length;
  return slimeColors[((index % n) + n) % n];
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
