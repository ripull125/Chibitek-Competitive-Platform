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
    // Base matches Reddit dark background (#0e1113).
    dark: [
      "#E7EAEC",
      "#C9D0D6",
      "#ABB5BE",
      "#8E9BA6",
      "#72838F",
      "#576875",
      "#3D4D5A",
      "#0E1113",
      "#0B0E10",
      "#07090A",
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
