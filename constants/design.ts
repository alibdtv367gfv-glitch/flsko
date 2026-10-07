/** Flsko visual rhythm — keep screens consistent */
export const Radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 28,
  full: 999,
} as const;

export const Space = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 32,
} as const;

export const Touch = {
  min: 48,
  comfortable: 52,
} as const;

export const Type = {
  hero: 30,
  title: 22,
  section: 17,
  body: 15,
  caption: 12,
  micro: 11,
} as const;

export const Shadow = {
  card: {
    shadowColor: "#0B1220",
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  soft: {
    shadowColor: "#0B1220",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  glow: (color: string) => ({
    shadowColor: color,
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  }),
} as const;
