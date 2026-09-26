import * as vscode from "vscode";
import {
  buildColorMap,
  ColorSettings,
  LAYER_NAMES,
  Layer,
  mergeOwned,
  Owned,
  PRESETS,
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
  if (!cfg.get<boolean>("layers.enabled", false)) {
    return undefined;
  }
  const presetName = cfg.get<string>("layers.preset", "forestGlass");
  const base: ColorSettings = JSON.parse(JSON.stringify(PRESETS[presetName] ?? { layers: {} }));
  for (const name of LAYER_NAMES) {
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

  const theme = `[${workbench.get<string>("colorTheme", "")}]`;
  const scopedOwned: Record<string, Owned> = {};
  for (const [scope, block] of Object.entries(current)) {
    if (!scope.startsWith("[") || typeof block !== "object" || block === null) {
      continue;
    }
    const b = block as Record<string, unknown>;
    // Only the active theme gets our keys; any other block we touched before gets its own values back.
    const inBlock: Record<string, string> = {};
    if (scope === theme) {
      for (const [k, v] of Object.entries(next)) {
        if (k in b || k in (state.scoped[scope] ?? {})) {
          inBlock[k] = v;
        }
      }
    }
    const s = mergeOwned(b, state.scoped[scope] ?? {}, inBlock);
    result[scope] = s.result;
    if (Object.keys(s.owned).length) {
      scopedOwned[scope] = s.owned;
    }
  }

  await workbench.update("colorCustomizations", result, vscode.ConfigurationTarget.Global);
  await context.globalState.update(STATE_KEY, { global: g.owned, scoped: scopedOwned });
  return Object.keys(next).length;
}

/** Hand every colour back: the command behind "Remove Layers". */
export async function removeLayers(context: vscode.ExtensionContext): Promise<void> {
  const cfg = vscode.workspace.getConfiguration(NS);
  if (cfg.get<boolean>("layers.enabled", false)) {
    await cfg.update("layers.enabled", false, vscode.ConfigurationTarget.Global);
  }
  await applyLayers(context);
}
