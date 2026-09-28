import * as vscode from "vscode";
import {
  buildColorMap,
  ColorSettings,
  LAYER_NAMES,
  Layer,
  mergeOwned,
  Owned,
  PRESETS,
  scopeMatches,
} from "./colors";

const NS = "vscode-translucent";
const STATE_KEY = "layers.owned";

interface OwnedState {
  global: Owned;
  scoped: Record<string, Owned>; // "[Theme Name]" -> owned keys in that theme's own block
}

/** A setting's value only if the user actually set it (so a preset can fill in the rest). */
function explicit<T>(cfg: vscode.WorkspaceConfiguration, key: string): T | undefined {
  const i = cfg.inspect<T>(key);
  return i?.workspaceFolderValue ?? i?.workspaceValue ?? i?.globalValue;
}

/** What the settings ask for: the preset, with anything the user set explicitly layered on top. */
export function readColorSettings(): ColorSettings | undefined {
  const cfg = vscode.workspace.getConfiguration(NS);
  const surface = explicit<string>(cfg, "surface.color") || undefined;
  const layersOn = cfg.get<boolean>("layers.enabled", false);
  if (!layersOn && !surface) {
    return undefined;
  }
  // With layers off, a surface still applies on its own (plus any accent or text colour you set yourself).
  const presetName = cfg.get<string>("layers.preset", "forestGlass");
  const base: ColorSettings = layersOn ? JSON.parse(JSON.stringify(PRESETS[presetName] ?? { layers: {} })) : { layers: {} };
  base.surface = surface;
  base.borders = explicit<string>(cfg, "surface.borderColor") || undefined;
  for (const name of layersOn ? LAYER_NAMES : []) {
    const color = explicit<string>(cfg, `layers.${name}.color`);
    const opacity = explicit<number>(cfg, `layers.${name}.opacity`);
    if (color === undefined && opacity === undefined) {
      continue;
    }
    const prev: Layer = base.layers[name] ?? { color: "#000000", opacity: 0.5 };
    base.layers[name] = { color: color ?? prev.color, opacity: opacity ?? prev.opacity };
  }
  const accent = explicit<string>(cfg, "accent.color");
  if (accent !== undefined) {
    base.accent = accent || undefined;
  }
  const activeIcon = explicit<string>(cfg, "text.activeIconColor");
  if (activeIcon !== undefined) {
    base.activeIcon = activeIcon || undefined;
  }
  const menuText = explicit<string>(cfg, "text.menuColor");
  if (menuText !== undefined) {
    base.menuText = menuText || undefined;
  }
  const remoteBg = explicit<string>(cfg, "text.remoteIndicatorBackground");
  if (remoteBg !== undefined) {
    base.statusBarRemoteTint = remoteBg ? { color: remoteBg, opacity: 1 } : undefined;
  }
  const remoteHover = explicit<string>(cfg, "text.remoteIndicatorHoverBackground");
  if (remoteHover !== undefined) {
    base.statusBarRemoteHover = remoteHover || undefined;
  }
  const softBorders = explicit<boolean>(cfg, "layers.softBorders");
  if (softBorders !== undefined) {
    base.softBorders = softBorders;
  }
  const remoteText = explicit<string>(cfg, "text.remoteIndicatorColor");
  if (remoteText !== undefined) {
    base.statusBarRemoteText = remoteText || undefined;
  }
  return base;
}

/**
 * Write (or, with nothing wanted, take back) this extension's colours in the user's
 * workbench.colorCustomizations. The active theme's own block ("[Dark+]") overrides the global one, so any key
 * this extension manages that also sits in that block is set there too.
 */
export async function applyLayers(context: vscode.ExtensionContext): Promise<number> {
  const wanted = readColorSettings();
  const next = wanted ? buildColorMap(wanted) : {};
  const workbench = vscode.workspace.getConfiguration("workbench");
  const current = { ...(workbench.inspect<Record<string, unknown>>("colorCustomizations")?.globalValue ?? {}) };
  const state = context.globalState.get<OwnedState>(STATE_KEY) ?? { global: {}, scoped: {} };

  const globalPart: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(current)) {
    if (!k.startsWith("[")) {
      globalPart[k] = v;
    }
  }
  const g = mergeOwned(globalPart, state.global, next);
  const result: Record<string, unknown> = { ...current, ...g.result };
  for (const k of Object.keys(current)) {
    if (!k.startsWith("[") && !(k in g.result)) {
      delete result[k];
    }
  }

  // The theme actually showing. With "auto detect colour scheme" on, VS Code shows the preferred dark or light
  // theme, not workbench.colorTheme (found 26 Sept 2026: Leaf profile showed Vira Deepforest, settings said Dark+).
  const theme = activeThemeName();
  const exact = `[${theme}]`;
  const scopedOwned: Record<string, Owned> = {};
  const blocks: Record<string, Record<string, unknown>> = {};
  for (const [scope, block] of Object.entries(current)) {
    if (scope.startsWith("[") && typeof block === "object" && block !== null) {
      blocks[scope] = block as Record<string, unknown>;
    }
  }
  if (theme && Object.keys(next).length && !blocks[exact]) {
    blocks[exact] = {};
  }
  for (const [scope, b] of Object.entries(blocks)) {
    // A theme-scoped block beats the global colours. Our colours go into the active theme's own block in full,
    // and override any matching wildcard block ("[Vira*]") where it sets the same keys. Blocks for other themes
    // get back whatever this extension changed in them.
    const inBlock: Record<string, string> = {};
    if (scope === exact) {
      Object.assign(inBlock, next);
    } else if (theme && scopeMatches(scope, theme)) {
      for (const [k, v] of Object.entries(next)) {
        if (k in b || k in (state.scoped[scope] ?? {})) {
          inBlock[k] = v;
        }
      }
    }
    const s = mergeOwned(b, state.scoped[scope] ?? {}, inBlock);
    if (Object.keys(s.result).length || scope in current) {
      result[scope] = s.result;
    }
    if (Object.keys(s.owned).length) {
      scopedOwned[scope] = s.owned;
    }
  }

  // Only write when something changed. Every write goes through settings.json, and another extension writing at the
  // same moment (the Vira theme does at startup) makes VS Code fail one of them with "the file has unsaved changes".
  if (JSON.stringify(result) !== JSON.stringify(current)) {
    await workbench.update("colorCustomizations", result, vscode.ConfigurationTarget.Global);
  }
  await context.globalState.update(STATE_KEY, { global: g.owned, scoped: scopedOwned });
  return Object.keys(next).length;
}

/** The colour theme on screen, following "auto detect colour scheme" when it's on. */
function activeThemeName(): string {
  const window = vscode.workspace.getConfiguration("window");
  const workbench = vscode.workspace.getConfiguration("workbench");
  if (window.get<boolean>("autoDetectColorScheme", false)) {
    const kind = vscode.window.activeColorTheme.kind;
    if (kind === vscode.ColorThemeKind.Light) {
      return workbench.get<string>("preferredLightColorTheme", "") || workbench.get<string>("colorTheme", "");
    }
    if (kind === vscode.ColorThemeKind.HighContrast) {
      return workbench.get<string>("preferredHighContrastColorTheme", "") || workbench.get<string>("colorTheme", "");
    }
    if (kind === vscode.ColorThemeKind.HighContrastLight) {
      return workbench.get<string>("preferredHighContrastLightColorTheme", "") || workbench.get<string>("colorTheme", "");
    }
    return workbench.get<string>("preferredDarkColorTheme", "") || workbench.get<string>("colorTheme", "");
  }
  return workbench.get<string>("colorTheme", "");
}

/** Hand every colour back: the command behind "Remove Layers". */
export async function removeLayers(context: vscode.ExtensionContext): Promise<void> {
  const cfg = vscode.workspace.getConfiguration(NS);
  if (cfg.get<boolean>("layers.enabled", false)) {
    await cfg.update("layers.enabled", false, vscode.ConfigurationTarget.Global);
  }
  await applyLayers(context);
}
