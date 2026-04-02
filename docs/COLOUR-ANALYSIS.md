# Colour Analysis

This document captures all colour definitions, theming architecture, and runtime colour behaviour for the claude-code project.

---

## Theme System Overview

Colours are centralised in [src/utils/theme.ts](src/utils/theme.ts). The app supports **4 themes**:

| Theme Name | Description |
|---|---|
| `dark` | Default dark theme |
| `light` | Light theme |
| `dark-daltonized` | Dark theme optimised for colour-blind users |
| `light-daltonized` | Light theme optimised for colour-blind users |

The active theme is a user-configurable setting stored in global config (default: `dark`). It is never auto-detected or changed at runtime based on the terminal environment.

The `Theme` interface defines the following tokens:

```typescript
interface Theme {
  bashBorder: string
  claude: string
  permission: string
  secondaryBorder: string
  text: string
  secondaryText: string
  suggestion: string
  success: string
  error: string
  warning: string
  diff: {
    added: string
    removed: string
    addedDimmed: string
    removedDimmed: string
  }
}
```

All components consume colours via the `getTheme()` function.

---

## Colour Palettes

### Dark Theme (default)

| Token | Hex | Description |
|---|---|---|
| `bashBorder` | `#fd5db1` | Light pink |
| `claude` | `#D97757` | Rust orange (brand colour) |
| `permission` | `#b1b9f9` | Light purple/blue |
| `secondaryBorder` | `#888` | Medium gray |
| `text` | `#fff` | White |
| `secondaryText` | `#999` | Light gray |
| `suggestion` | `#b1b9f9` | Light purple/blue |
| `success` | `#4eba65` | Light green |
| `error` | `#ff6b80` | Light red/pink |
| `warning` | `#ffc107` | Amber |
| `diff.added` | `#225c2b` | Dark green |
| `diff.removed` | `#7a2936` | Dark red |
| `diff.addedDimmed` | `#47584a` | Muted dark green |
| `diff.removedDimmed` | `#69484d` | Muted dark red |

---

### Light Theme

| Token | Hex | Description |
|---|---|---|
| `bashBorder` | `#ff0087` | Hot pink |
| `claude` | `#D97757` | Rust orange (brand colour) |
| `permission` | `#5769f7` | Blue |
| `secondaryBorder` | `#999` | Gray |
| `text` | `#000` | Black |
| `secondaryText` | `#666` | Dark gray |
| `suggestion` | `#5769f7` | Blue |
| `success` | `#2c7a39` | Dark green |
| `error` | `#ab2b3f` | Dark red |
| `warning` | `#966c1e` | Brown/gold |
| `diff.added` | `#69db7c` | Light green |
| `diff.removed` | `#ffa8b4` | Light pink |
| `diff.addedDimmed` | `#c7e1cb` | Very light green |
| `diff.removedDimmed` | `#fdd2d8` | Very light pink |

---

### Dark Daltonized Theme

| Token | Hex | Description |
|---|---|---|
| `bashBorder` | `#3399ff` | Bright blue |
| `claude` | `#ff9933` | Orange |
| `permission` | `#99ccff` | Light blue |
| `secondaryBorder` | `#888` | Medium gray |
| `text` | `#fff` | White |
| `secondaryText` | `#999` | Light gray |
| `suggestion` | `#99ccff` | Light blue |
| `success` | `#3399ff` | Bright blue (replaces green) |
| `error` | `#ff6666` | Bright red |
| `warning` | `#ffcc00` | Yellow |
| `diff.added` | `#004466` | Dark blue (replaces green) |
| `diff.removed` | `#660000` | Dark red |
| `diff.addedDimmed` | `#3e515b` | Muted dark blue |
| `diff.removedDimmed` | `#3e2c2c` | Muted dark red |

---

### Light Daltonized Theme

| Token | Hex | Description |
|---|---|---|
| `bashBorder` | `#0066cc` | Blue |
| `claude` | `#ff9933` | Orange |
| `permission` | `#3366ff` | Bright blue |
| `secondaryBorder` | `#999` | Gray |
| `text` | `#000` | Black |
| `secondaryText` | `#666` | Dark gray |
| `suggestion` | `#3366ff` | Bright blue |
| `success` | `#006699` | Dark blue (replaces green) |
| `error` | `#cc0000` | Pure red |
| `warning` | `#ff9900` | Orange |
| `diff.added` | `#99ccff` | Light blue (replaces green) |
| `diff.removed` | `#ffcccc` | Light red |
| `diff.addedDimmed` | `#d1e7fd` | Very light blue |
| `diff.removedDimmed` | `#ffe9e9` | Very light red |

---

## Hardcoded Colours (Outside Theme)

A small number of components bypass the theme system and use named Ink.js colours directly:

| File | Value | Usage |
|---|---|---|
| [src/components/Bug.tsx](src/components/Bug.tsx) | `"red"` | Named Ink colour |
| [src/components/Config.tsx](src/components/Config.tsx) | `"blue"` | Selection indicator |
| [src/components/Onboarding.tsx](src/components/Onboarding.tsx) | `"gray"` | Border colour |
| [src/tools/NotebookEditTool/NotebookEditTool.tsx](src/tools/NotebookEditTool/NotebookEditTool.tsx) | `"red"` | Named Ink colour |
| [src/screens/REPL.tsx](src/screens/REPL.tsx) | `"green"` / `"red"` | Diff borders |

---

## Colour Usage by Area

### Brand Colour

`claude` (`#D97757` rust orange) is consistent across all light and dark themes. It only changes in the Daltonized variants (`#ff9933` orange), where red-green ambiguity is a concern. Used in:

- [src/components/AnimatedClaudeAsterisk.tsx](src/components/AnimatedClaudeAsterisk.tsx)
- [src/components/AsciiLogo.tsx](src/components/AsciiLogo.tsx)
- [src/components/Spinner.tsx](src/components/Spinner.tsx)
- [src/components/Help.tsx](src/components/Help.tsx)
- [src/components/Logo.tsx](src/components/Logo.tsx)
- [src/components/StickerRequestForm.tsx](src/components/StickerRequestForm.tsx)

### Risk-Based Colour Mapping

[src/components/permissions/PermissionRequestTitle.tsx](src/components/permissions/PermissionRequestTitle.tsx) maps risk scores to semantic colours dynamically:

| Risk Score | Colour Token |
|---|---|
| < 30 (low) | `success` + `permission` |
| 30–70 (moderate) | `warning` |
| >= 70 (high) | `error` |

This applies to all permission request components under [src/components/permissions/](src/components/permissions/).

### Message Components

All components in [src/components/messages/](src/components/messages/) use theme tokens:

| Component | Tokens Used |
|---|---|
| `AssistantLocalCommandOutputMessage` | `text`, `error`, `secondaryText` |
| `AssistantRedactedThinkingMessage` | `secondaryText` |
| `AssistantTextMessage` | `error` |
| `AssistantThinkingMessage` | `secondaryText` |
| `AssistantToolUseMessage` | `secondaryText` |
| `UserBashInputMessage` | `bashBorder`, `secondaryText` |
| `UserCommandMessage` | `secondaryText` |
| `UserPromptMessage` | `secondaryText` |
| `UserToolCanceledMessage` | `error` |
| `UserToolErrorMessage` | `error`, `secondaryText` |

### Syntax Highlighting

Code blocks in [src/components/HighlightedCode.tsx](src/components/HighlightedCode.tsx) and [src/utils/markdown.ts](src/utils/markdown.ts) use the `cli-highlight` library. These colours are managed entirely by that library and are not part of the theme system.

### `dimColor` Prop

The Ink.js `dimColor` prop is used extensively (~44 instances across the codebase) to de-emphasise secondary text. This complements the `secondaryText` token as an additional layer of visual hierarchy.

---

## Runtime Colour Behaviour

### What the app does

- **Chalk handles colour capability automatically.** The app uses `chalk.hex()` with theme hex values (e.g. in [src/commands/terminalSetup.ts](src/commands/terminalSetup.ts)) but never configures `chalk.level` or sets `FORCE_COLOR`/`NO_COLOR`. Chalk auto-detects truecolor, 256-colour, or basic ANSI support and degrades silently.
- **Terminal type is detected** via `process.env.TERM_PROGRAM` in [src/utils/env.ts](src/utils/env.ts), but only to gate non-colour features. For example, [src/components/Link.tsx](src/components/Link.tsx) uses it to decide whether to render clickable hyperlinks (`iTerm.app`, `WezTerm`, `Hyper`, `VSCode`). It does not affect colour selection.

### What the app does not do

- No auto-detection of terminal background colour (no automatic light/dark switching)
- No colour manipulation (no lighten, darken, opacity, or saturation transforms)
- No checks for `COLORTERM`, `NO_COLOR`, or `FORCE_COLOR` environment variables
- No runtime colour adjustment of any kind
- No use of advanced colour libraries (`color`, `tinycolor`, `chroma-js`, `colorette`, etc.)

### Summary

The active theme is purely a user preference. The colours defined in `theme.ts` are used as-is at all times. If the terminal cannot render the requested hex colours, chalk degrades on its own — the app itself does not participate in that process.
