// Layers, accent and text colours (Forest Glass, 26 September 2026).
//
// The window effect makes VS Code see-through. Layers put a tinted, partly opaque surface back under the
// things you read and type in: inputs, menus, hover and suggest widgets, the command palette, notifications
// and the tab strip. They are written as workbench.colorCustomizations, not CSS, because other extensions'
// webviews (the Claude and Codex panels, for example) read VS Code's theme colours, not the workbench's CSS.
//
// This file is pure: it turns settings into a { colourKey: "#rrggbbaa" } map. apply.ts writes it.

export type LayerName = "inputs" | "menus" | "widgets" | "quickInput" | "notifications" | "tabStrip";

export const LAYER_NAMES: LayerName[] = ["inputs", "menus", "widgets", "quickInput", "notifications", "tabStrip"];

/** The theme colour keys each layer owns. */
export const LAYER_KEYS: Record<LayerName, string[]> = {
  inputs: ["input.background", "settings.textInputBackground", "settings.numberInputBackground"],
  menus: ["menu.background", "dropdown.background", "dropdown.listBackground", "settings.dropdownBackground"],
  widgets: ["editorWidget.background", "editorHoverWidget.background", "editorSuggestWidget.background"],
  quickInput: ["quickInput.background"],
  notifications: ["notifications.background", "notificationCenterHeader.background"],
  tabStrip: ["editorGroupHeader.tabsBackground"],
};

/**
 * Keys the accent colour drives, each with the alpha it is drawn at ("" = solid). Chat colours are left out on
 * purpose: chat panels keep their own look.
 */
export const ACCENT_KEYS: Record<string, string> = {
  "activityBar.foreground": "", "activityBar.inactiveForeground": "", "activityBar.activeBorder": "",
  "activityBarTop.foreground": "", "activityBarTop.inactiveForeground": "", "activityBarTop.activeBorder": "",
  "activityBarBadge.background": "",
  "icon.foreground": "", "sideBarSectionHeader.foreground": "", "descriptionForeground": "",
  "textLink.foreground": "", "notificationLink.foreground": "", "pickerGroup.foreground": "",
  "progressBar.background": "", "settings.modifiedItemIndicator": "",
  "tab.activeBorder": "", "tab.unfocusedActiveBorder": "", "panelTitle.activeBorder": "",
  "editorCursor.foreground": "", "terminalCursor.foreground": "",
  "list.highlightForeground": "", "list.activeSelectionForeground": "", "list.inactiveSelectionForeground": "",
  "list.activeSelectionIconForeground": "", "list.inactiveSelectionIconForeground": "",
  "list.activeSelectionBackground": "33", "selection.background": "40",
  "editorSuggestWidget.highlightForeground": "", "breadcrumb.activeSelectionForeground": "",
  "menu.selectionForeground": "", "menubar.selectionForeground": "",
  "editorWidget.border": "", "editorWidget.resizeBorder": "", "editor.findMatchBorder": "",
  "sash.hoverBorder": "80", "scrollbarSlider.background": "80", "scrollbarSlider.hoverBackground": "45",
  "scrollbarSlider.activeBackground": "80", "toolbar.activeBackground": "26", "actionBar.toggledBackground": "55",
  "editorStickyScroll.background": "26", "panelStickyScroll.background": "26", "terminalStickyScroll.background": "26",
  "extensionButton.foreground": "", "extensionButton.prominentForeground": "", "extensionButton.background": "14",
  "extensionButton.prominentBackground": "14", "extensionButton.border": "14", "extensionButton.separator": "33",
  "extensionButton.hoverBackground": "33", "extensionButton.prominentHoverBackground": "33",
  "gitDecoration.modifiedResourceForeground": "", "statusBar.debuggingForeground": "", "statusBar.debuggingBackground": "33",
  "notebook.inactiveFocusedCellBorder": "80",
};

export interface Layer {
  color: string;   // "#rrggbb"
  opacity: number; // 0..1
}

export interface ColorSettings {
  layers: Partial<Record<LayerName, Layer>>;
  accent?: string;          // "#rrggbb"; empty = leave the theme's own accents alone
  menuText?: string;        // "#rrggbb"
  statusBarRemoteText?: string;
  statusBarRemoteTint?: Layer;
}

/** The presets. "forestGlass" is the look set up by hand on 25-26 September 2026. */
export const PRESETS: Record<string, ColorSettings> = {
  forestGlass: {
    layers: {
      inputs: { color: "#221716", opacity: 0.8 },
      menus: { color: "#291c1a", opacity: 0.65 },
      widgets: { color: "#291c1a", opacity: 0.65 },
      quickInput: { color: "#291c1a", opacity: 0.65 },
      notifications: { color: "#291c1a", opacity: 0.65 },
      tabStrip: { color: "#221716", opacity: 0 },
    },
    accent: "#3d8a52",
    menuText: "#3d8a52",
    statusBarRemoteText: "#446058",
    statusBarRemoteTint: { color: "#f97316", opacity: 0.05 },
  },
  frostedDark: {
    layers: {
      inputs: { color: "#1b1b1f", opacity: 0.85 },
      menus: { color: "#1f1f24", opacity: 0.75 },
      widgets: { color: "#1f1f24", opacity: 0.75 },
      quickInput: { color: "#1f1f24", opacity: 0.8 },
      notifications: { color: "#1f1f24", opacity: 0.75 },
      tabStrip: { color: "#1b1b1f", opacity: 0.3 },
    },
  },
  clearGlass: {
    layers: {
      inputs: { color: "#000000", opacity: 0.35 },
      menus: { color: "#000000", opacity: 0.45 },
      widgets: { color: "#000000", opacity: 0.45 },
      quickInput: { color: "#000000", opacity: 0.5 },
      notifications: { color: "#000000", opacity: 0.45 },
      tabStrip: { color: "#000000", opacity: 0 },
    },
  },
};

const HEX6 = /^#?([0-9a-fA-F]{6})$/;

/** "#rrggbb" + 0..1 -> "#rrggbbaa". Anything malformed returns undefined, so a typo is skipped, not written. */
export function withAlpha(color: string | undefined, opacity: number): string | undefined {
  const m = HEX6.exec((color ?? "").trim());
  if (!m || !Number.isFinite(opacity)) {
    return undefined;
  }
  const a = Math.round(Math.min(1, Math.max(0, opacity)) * 255);
  return `#${m[1].toLowerCase()}${a.toString(16).padStart(2, "0")}`;
}

function solid(color: string | undefined, alphaHex = ""): string | undefined {
  const m = HEX6.exec((color ?? "").trim());
  return m ? `#${m[1].toLowerCase()}${alphaHex}` : undefined;
}

/** Settings -> the colour customizations to write. */
export function buildColorMap(s: ColorSettings): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of LAYER_NAMES) {
    const layer = s.layers[name];
    if (!layer) {
      continue;
    }
    const value = withAlpha(layer.color, layer.opacity);
    if (value) {
      for (const key of LAYER_KEYS[name]) {
        out[key] = value;
      }
    }
  }
  if (s.accent) {
    for (const [key, alpha] of Object.entries(ACCENT_KEYS)) {
      const value = solid(s.accent, alpha);
      if (value) {
        out[key] = value;
      }
    }
  }
  const menuText = solid(s.menuText);
  if (menuText) {
    out["menu.foreground"] = menuText;
  }
  const remoteText = solid(s.statusBarRemoteText);
  if (remoteText) {
    out["statusBarItem.remoteForeground"] = remoteText;
  }
  if (s.statusBarRemoteTint) {
    const tint = withAlpha(s.statusBarRemoteTint.color, s.statusBarRemoteTint.opacity);
    if (tint) {
      out["statusBarItem.remoteBackground"] = tint;
    }
  }
  return out;
}

/** Keys this extension has written, each with the value the user had there before (null = none). */
export type Owned = Record<string, unknown>;

/**
 * Apply `next` over `current`. The first time a key is taken, whatever the user had there is remembered; when a
 * key is no longer wanted (a layer switched off, or "remove"), that original value is put back. Keys this
 * extension never wrote are never touched.
 */
export function mergeOwned(
  current: Record<string, unknown>,
  owned: Owned,
  next: Record<string, string>,
): { result: Record<string, unknown>; owned: Owned } {
  const result: Record<string, unknown> = { ...current };
  const nextOwned: Owned = {};
  for (const [key, original] of Object.entries(owned)) {
    if (key in next) {
      nextOwned[key] = original;
      continue;
    }
    if (original === null || original === undefined) {
      delete result[key];
    } else {
      result[key] = original;
    }
  }
  for (const [key, value] of Object.entries(next)) {
    if (!(key in nextOwned)) {
      nextOwned[key] = key in current ? current[key] : null;
    }
    result[key] = value;
  }
  return { result, owned: nextOwned };
}
