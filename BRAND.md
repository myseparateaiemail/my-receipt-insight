# GROCER Brand Identity Guidelines

## 1. Brand Overview & Philosophy

### The Mission:
Grocer transforms the mundane task of managing receipts into a powerful financial advantage. We use smart OCR and analytics to help users track spending, reduce food waste, and identify actionable opportunities to save money.

### The Vibe:
The new Grocer identity bridges the gap between a fresh, organic kitchen assistant and a robust, trustworthy financial tool. It should feel:
*   **Smart & Analytical:** Data-driven, accurate, and insightful.
*   **Thrifty & Empowering:** Focused on growth, savings, and taking control.
*   **Fresh & Clean:** Modern, approachable, and easy to use.

### The Visual Metaphor: "The Financial Citrus"
The core icon is a cross-section of a lime that doubles as a data pie chart. The main body represents the user's total grocery activity, while the single, highlighted slice "popping out" at the top right symbolizes the unique insight, saving, or "fresh idea" that Grocer provides.

## 2. Logo Assets & Usage

These assets have been prepared for web and mobile deployment.

### A. Primary Web/Desktop Logo (Horizontal Combination Mark)
*   **Usage:** Website headers, desktop landing pages, splash screens.
*   **Composition:** The lime chart icon positioned to the left of the uppercase "GROCER" wordmark.
*   **File:** `grocer-primary-logo.png`

### B. Mobile App Icon (Symbol)
*   **Usage:** iOS/Android home screen icon, website favicon.
*   **Composition:** The isolated lime chart icon on a transparent background to ensure it blends seamlessly with different browser and OS themes.
*   **File:** `grocer-app-icon-transparent.png`

### C. Icon Versions and Specific Usage

To ensure brand consistency and optimal presentation across different digital contexts, two versions of the app icon are provided:

*   **`grocer-app-icon-transparent.png` (Primary Favicon/App Icon)**
    *   **Usage:** This is the main icon for the application. It should be used as the website favicon, for mobile home screen icons, and in any context where the background color may vary.
    *   **Rationale:** The transparent background allows the icon to blend seamlessly with different browser and operating system themes, providing a clean and integrated look.

*   **`grocer-app-icon.png` (Authentication Page Icon)**
    *   **Usage:** This version is specifically intended for use on the application's authentication page (`Auth.tsx`).
    *   **Rationale:** The authentication page has a solid white background. This version of the icon includes a built-in background or specific spacing to ensure it renders correctly and with the intended visual weight against a pure white backdrop. Using the transparent version here could result in poor visibility or incorrect layout.

## 3. Color Palette

The palette is a mature evolution of the previous bright greens, introducing depth to convey financial trust while maintaining freshness.

| Color Name              | Hex Code  | Role & Usage Guideline                                                                                                                              |
| ----------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Emerald Green (Action)** | `#00C897`   | **Primary Brand Color & Call-to-Action.** Use for main buttons (e.g., "Scan Receipt"), active states, growth indicators (positive trends), and the highlighted slice in the logo. |
| **Mint Green (Freshness)** | `#A7E8BD`  | **Secondary Brand Color & Backgrounds.** Use for the base of the logo icon, subtle background accents, and supportive graphical elements.          |
| **Dark Charcoal (Text)**   | `#374151`  | **Primary Typography Color.** Use for the main logo text, headers, and body copy. This replaces pure black for a modern, softer, yet authoritative feel. |
| **White/Light Gray**      | `#FFFFFF` / `#F3F4F6` | **Backgrounds & Cards.** Keep app backgrounds clean white or very pale gray to let the data and green accents pop.                                  |

## 4. Typography

The typography is clean, structured, and geometric to emphasize data and modernity.

### Logotype Font (The word "GROCER")
*   **Style:** Modern, geometric sans-serif.
*   **Weight:** Bold / Heavy.
*   **Case:** UPPERCASE. This implies authority and establishes Grocer as a robust tool rather than just a casual app.
*   **Suggested Web Font equivalent:** Inter Bold or Montserrat Bold.

### Recommended UI Fonts (For Developers)
For headers and body text within the application, use a clean sans-serif family that complements the logo.
*   **Primary Font Family:** Inter, Roboto, or Open Sans.
*   **Headers (H1-H3):** Use Bold weight in Dark Charcoal (`#374151`).
*   **Body Text:** Use Regular weight in Dark Charcoal (`#374151`).
