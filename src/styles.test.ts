import { describe, expect, it } from "vitest";
import styles from "./styles.css?inline";

const darkRoot = styles.match(
  /:root\[data-theme="dark"\]\s*\{([\s\S]*?)\}/,
)?.[1];

if (!darkRoot) throw new Error("Dark theme variables were not found in styles.css");

const darkColors = new Map(
  [...darkRoot.matchAll(/--([\w-]+):\s*(#[\da-f]{6})\s*;/gi)].map((match) => [match[1], match[2]]),
);

function resolveColor(color: `--${string}` | `#${string}`): string {
  if (color.startsWith("#")) return color;
  const resolved = darkColors.get(color.slice(2));
  if (!resolved) throw new Error(`Dark theme color ${color} is not defined as a six-digit hex color`);
  return resolved;
}

function relativeLuminance(color: string): number {
  const channels = color
    .slice(1)
    .match(/../g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

type ContrastPair = {
  background: `--${string}` | `#${string}`;
  foreground: `--${string}` | `#${string}`;
  label: string;
  minimum: number;
};

const contrastPairs: ContrastPair[] = [
  { label: "default text on panels", foreground: "--ink", background: "--surface", minimum: 4.5 },
  { label: "secondary text on panels", foreground: "--ink-soft", background: "--surface", minimum: 4.5 },
  { label: "muted text on panels", foreground: "--muted", background: "--surface", minimum: 4.5 },
  { label: "muted text in fields", foreground: "--muted", background: "--field", minimum: 4.5 },
  { label: "primary button text", foreground: "--on-accent", background: "--accent", minimum: 4.5 },
  { label: "primary button hover text", foreground: "--on-accent", background: "--accent-dark", minimum: 4.5 },
  { label: "success status text", foreground: "--green", background: "--green-soft", minimum: 4.5 },
  { label: "danger status text", foreground: "--danger", background: "--danger-soft", minimum: 4.5 },
  { label: "balance warning text", foreground: "--accent-dark", background: "--accent-soft", minimum: 4.5 },
  { label: "dashboard supporting text", foreground: "--strong-muted", background: "--strong-surface", minimum: 4.5 },
  { label: "dashboard eyebrow text", foreground: "--strong-accent", background: "--strong-surface", minimum: 4.5 },
  { label: "field border", foreground: "--line", background: "--field", minimum: 3 },
  { label: "panel border", foreground: "--line", background: "--surface", minimum: 3 },
  { label: "underlined field border", foreground: "--line-soft", background: "--field", minimum: 3 },
  { label: "table row separator", foreground: "--line-soft", background: "--surface", minimum: 3 },
  { label: "warning state border", foreground: "--accent-border", background: "--accent-soft", minimum: 3 },
  { label: "success state border", foreground: "--green-border", background: "--green-subtle", minimum: 3 },
  { label: "keyboard focus ring", foreground: "--focus-ring", background: "--surface", minimum: 3 },
  { label: "sidebar control border", foreground: "--sidebar-line", background: "--sidebar-surface", minimum: 3 },
];

describe("dark theme contrast", () => {
  it.each(contrastPairs)("meets WCAG AA for $label", ({ background, foreground, label, minimum }) => {
    const ratio = contrastRatio(resolveColor(foreground), resolveColor(background));
    expect(ratio, `${label} has a contrast ratio of ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(minimum);
  });
});

function cssRule(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

describe("transaction choice card text containment", () => {
  it("allows the button and its copy column to shrink and wrap", () => {
    const buttonRule = cssRule(".simple-kind-button");
    const copyRule = cssRule(".simple-kind-button > span:nth-child(2)");
    const textRule = cssRule(".simple-kind-button strong, .simple-kind-button small");

    expect(buttonRule).toMatch(/min-width:\s*0\s*;/);
    expect(buttonRule).toMatch(/white-space:\s*normal\s*;/);
    expect(copyRule).toMatch(/min-width:\s*0\s*;/);
    expect(copyRule).toMatch(/overflow:\s*hidden\s*;/);
    expect(textRule).toMatch(/overflow-wrap:\s*anywhere\s*;/);
    expect(textRule).toMatch(/white-space:\s*normal\s*;/);
  });
});
