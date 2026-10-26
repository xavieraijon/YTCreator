/** Gamma-encoded sRGB, every channel in 0..1. */
export interface Rgba {
  readonly r: number
  readonly g: number
  readonly b: number
  readonly alpha: number
}

const oklchPattern = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)\s*)?\)$/

const clamp = (value: number) => Math.min(1, Math.max(0, value))

const encode = (linear: number) => (linear <= 0.0031308 ? 12.92 * linear : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055)

const decode = (channel: number) => (channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4))

/** `oklch(L C H [/ A])` → sRGB, clipping out-of-gamut channels. */
export function parseOklch(value: string): Rgba {
  const match = oklchPattern.exec(value.trim())
  if (!match) throw new Error(`Not an oklch() colour: ${value}`)
  const [, l, c, h, alpha] = match.map(Number) as [number, number, number, number, number]
  const hue = (h * Math.PI) / 180
  const a = c * Math.cos(hue)
  const b = c * Math.sin(hue)

  const lms = [
    l + 0.3963377774 * a + 0.2158037573 * b,
    l - 0.1055613458 * a - 0.0638541728 * b,
    l - 0.0894841775 * a - 1.291485548 * b,
  ].map((v) => v ** 3) as [number, number, number]
  const [L, M, S] = lms

  return {
    r: encode(clamp(4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S)),
    g: encode(clamp(-1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S)),
    b: encode(clamp(-0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S)),
    alpha: Number.isNaN(alpha) ? 1 : alpha,
  }
}

/** Paints `top` over `bottom` the way browsers do (in gamma-encoded sRGB). */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  const alpha = top.alpha + bottom.alpha * (1 - top.alpha)
  if (alpha === 0) return { r: 0, g: 0, b: 0, alpha: 0 }
  const mix = (t: number, u: number) => (t * top.alpha + u * bottom.alpha * (1 - top.alpha)) / alpha
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), alpha }
}

/** WCAG 2 relative luminance. */
export function relativeLuminance({ r, g, b }: Rgba): number {
  return 0.2126 * decode(r) + 0.7152 * decode(g) + 0.0722 * decode(b)
}

/** WCAG 2 contrast ratio. A translucent foreground is composited over the background first. */
export function contrastRatio(foreground: Rgba, background: Rgba): number {
  if (background.alpha < 1) throw new Error('The background must be opaque: composite it first')
  const fg = foreground.alpha < 1 ? composite(foreground, background) : foreground
  const [lighter, darker] = [relativeLuminance(fg), relativeLuminance(background)].sort((x, y) => y - x) as [
    number,
    number,
  ]
  return (lighter + 0.05) / (darker + 0.05)
}
