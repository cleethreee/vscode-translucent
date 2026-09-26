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

/**
 * Lines and shadows that the theme draws dark, which show up as black streaks on a see-through window: the border
 * next to the scrollbar (overview ruler), the terminal panel's top edge, and scroll and widget shadows.
 */
export const SOFT_BORDER_KEYS: Record<string, string> = {
  "editorOverviewRuler.border": "#00000000",
  "panel.border": "#ffffff0f",
  "scrollbar.shadow": "#00000000",
  "widget.shadow": "#00000000",
};

export interface Layer {
  color: string;   // "#rrggbb"
  opacity: number; // 0..1
}

export interface ColorSettings {
  layers: Partial<Record<LayerName, Layer>>;
  accent?: string;          // "#rrggbb"; empty = leave the theme's own accents alone
  menuText?: string;        // "#rrggbb"
  activeIcon?: string;      // the selected icon in the activity bar (side or top); overrides the accent there
  statusBarRemoteText?: string;
  statusBarRemoteTint?: Layer;
  statusBarRemoteHover?: string;  // background of the remote indicator on hover
  softBorders?: boolean;          // clear or faint versions of the theme's dark lines (SOFT_BORDER_KEYS)
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
    softBorders: true,
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

/**
 * "#rgb", "#rgba", "#rrggbb" or "#rrggbbaa" -> [rrggbb, alpha 0..1]. The Settings colour picker hands back the
 * 8-digit form when you drag its transparency slider, so all four are accepted.
 */
export function parseHex(color: string | undefined): [string, number] | undefined {
  const m = /^#?([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec((color ?? "").trim());
  if (!m) {
    return undefined;
  }
  let h = m[1].toLowerCase();
  if (h.length <= 4) {
    h = h.split("").map((c) => c + c).join("");
  }
  const alpha = h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1;
  return [h.slice(0, 6), alpha];
}

/**
 * Colour + 0..1 -> "#rrggbbaa". A colour that carries its own transparency is multiplied by the opacity, so
 * "#00000080" at 0.5 is a quarter solid. Anything malformed returns undefined, so a typo is skipped, not written.
 */
export function withAlpha(color: string | undefined, opacity: number): string | undefined {
  const parsed = parseHex(color);
  if (!parsed || !Number.isFinite(opacity)) {
    return undefined;
  }
  const a = Math.round(Math.min(1, Math.max(0, opacity)) * parsed[1] * 255);
  return `#${parsed[0]}${a.toString(16).padStart(2, "0")}`;
}

/** A text or accent colour: its own transparency is kept, unless the key is always drawn at a set faintness. */
function solid(color: string | undefined, alphaHex = ""): string | undefined {
  const parsed = parseHex(color);
  if (!parsed) {
    return undefined;
  }
  if (alphaHex) {
    return `#${parsed[0]}${alphaHex}`;
  }
  return parsed[1] < 1 ? withAlpha(color, 1) : `#${parsed[0]}`;
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
  const activeIcon = solid(s.activeIcon);
  if (activeIcon) {
    out["activityBar.foreground"] = activeIcon;
    out["activityBarTop.foreground"] = activeIcon;
    // VS Code's "modern UI" activity bar colours the selected icon with its own key (found 26 Sept 2026: the
    // yellow was set but the icon stayed white until this one was set too).
    out["modernActivityBarItem.activeForeground"] = activeIcon;
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
  if (s.softBorders) {
    Object.assign(out, SOFT_BORDER_KEYS);
  }
  const remoteHover = solid(s.statusBarRemoteHover);
  if (remoteHover) {
    out["statusBarItem.remoteHoverBackground"] = remoteHover;
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

/**
 * Does a theme-scoped block key ("[Dark+]", "[Vira*]", "[Vira Teal; Vira Clay]") apply to this theme name?
 * VS Code allows several names separated by ";" and "*" as a wildcard.
 */
export function scopeMatches(scopeKey: string, theme: string): boolean {
  if (!scopeKey.startsWith("[") || !scopeKey.endsWith("]")) {
    return false;
  }
  return scopeKey.slice(1, -1).split(";").map((n) => n.trim()).filter(Boolean).some((name) => {
    const re = new RegExp("^" + name.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$", "i");
    return re.test(theme);
  });
}
