export interface SlimeColor {
  name: string;
  hex: string;
}

export const SLIME_COLORS: SlimeColor[] = [
  { name: "purple", hex: "#96488A" },
  { name: "pink", hex: "#E86AA6" },
  { name: "yellow", hex: "#F2C200" },
  { name: "orange", hex: "#E8772E" },
  { name: "red", hex: "#D64550" },
  { name: "blue", hex: "#29a7eb" },
  { name: "green", hex: "#4fc053" },
  { name: "teal", hex: "#1fafb6" },
  { name: "navyblue", hex: "#1c4485" },
  { name: "lime", hex: "#9CCC3C" },
];

export const DEFAULT_COLOR_INDEX = 0;

export function colorAt(index: number): SlimeColor {
  const n = SLIME_COLORS.length;
  return SLIME_COLORS[((index % n) + n) % n];
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
