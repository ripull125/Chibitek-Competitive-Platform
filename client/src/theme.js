// client/src/theme.js
import { createTheme } from "@mantine/core";

/**
 * Dark palette goals:
 * - Deep navy body (dark[7]) for low-glare background
 * - Slightly lighter surfaces (dark[6]) for cards/panels
 * - High-contrast text (dark[0]) and readable dimmed text (dark[2-3])
 * - Teal primary to match existing brand gradient in the navbar
 *
 * Mantine uses theme.colors.dark in dark scheme (dark[7] as body background, dark[0] as text). :contentReference[oaicite:2]{index=2}
 */
export const theme = createTheme({
  primaryColor: "teal",
  primaryShade: { light: 6, dark: 5 },

  colors: {
    // dark[7] -> body background, dark[0] -> text
    dark: [
      "#E8EEF6",
      "#CAD5E3",
      "#AAB8CA",
      "#7F90A8",
      "#54657F",
      "#33415C",
      "#1E2A3D",
      "#0F172A",
      "#0B1220",
      "#070C16",
    ],
  },

  fontFamily:
    "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
  headings: {
    fontFamily:
      "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    fontWeight: "700",
  },

  defaultRadius: "md",

  components: {
    Paper: { defaultProps: { radius: "lg", withBorder: true } },
    Card: { defaultProps: { radius: "lg", withBorder: true } },
    Modal: { defaultProps: { radius: "lg" } },
    Popover: { defaultProps: { radius: "lg", shadow: "md" } },
    Menu: { defaultProps: { radius: "lg", shadow: "md" } },
    Tooltip: { defaultProps: { radius: "md" } },
    Input: { defaultProps: { radius: "md" } },
    Button: { defaultProps: { radius: "md" } },
  },
});
