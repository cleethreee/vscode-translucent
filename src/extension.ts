import * as vscode from "vscode";
import * as fs from "fs";
import {
  enableTranslucent,
  disableTranslucent,
  handleError,
} from "./commands/translucent";
import { getInstallPaths } from "./utils/paths";
import { getConfig } from "./utils/config";
import * as workbenchHtml from "./patchers/workbench-html";
import * as mainJs from "./patchers/main-js";
import * as workbenchJs from "./patchers/workbench-js";
import { compareVersions } from "./utils/version";
import { applyLayers, removeLayers } from "./layers/apply";
import { fixTargetsFingerprint, syncExtensionFixes } from "./fixes/apply";

// Whether the user last chose Enable (true) or Disable (false); undefined on installs older than 0.5.5.
const WANTED_KEY = "translucent.wanted";

async function checkAutoPatchOnUpdate(context: vscode.ExtensionContext) {
  const prev = context.globalState.get<string>("version");
  const current = context.extension.packageJSON.version;
  // A VS Code update replaces main.js / workbench.html and drops the patch without this extension changing at all
  // (1 Oct 2026: 0.5.x never re-patched, because only the extension's own version was watched).
  const prevCode = context.globalState.get<string>("vscodeVersion");
  const recordVersions = async () => {
    await context.globalState.update("version", current);
    await context.globalState.update("vscodeVersion", vscode.version);
  };
  const extUpdated = !!prev && compareVersions(current, prev) > 0;
  const codeUpdated = !!prevCode && prevCode !== vscode.version;
  // Nothing changed and the choice is already known: skip reading the (large) patched files.
  if (!extUpdated && !codeUpdated && context.globalState.get<boolean>(WANTED_KEY) !== undefined) {
    return;
  }

  const paths = getInstallPaths();
  const isPatched =
    (fs.existsSync(paths.workbenchHtml) &&
      workbenchHtml.isPatched(fs.readFileSync(paths.workbenchHtml, "utf-8"))) ||
    (fs.existsSync(paths.mainJs) &&
      mainJs.isPatched(fs.readFileSync(paths.mainJs, "utf-8"))) ||
    (fs.existsSync(paths.workbenchJs) &&
      workbenchJs.isPatched(fs.readFileSync(paths.workbenchJs, "utf-8")));
  // Installs from before WANTED_KEY existed: a patch on disk means the user enabled it.
  if (isPatched && context.globalState.get<boolean>(WANTED_KEY) === undefined) {
    await context.globalState.update(WANTED_KEY, true);
  }
  if (!extUpdated && !codeUpdated) {
    await recordVersions();
    return;
  }

  // Re-patch when a patch is still there to refresh, or when the user chose Enable and an update wiped it.
  if (!isPatched && context.globalState.get<boolean>(WANTED_KEY) !== true) {
    await recordVersions();
    return;
  }

  try {
    const config = getConfig();
    // Only ask for a reload when the patch actually changed something (a new version with the same styles
    // doesn't need a second reload).
    const changed = [
      mainJs.patch(paths.mainJs, config.effect),
      workbenchHtml.patch(paths.workbenchHtml, config),
      workbenchJs.patch(paths.workbenchJs),
    ].some(Boolean);
    // A failed patch must stay pending so the next startup retries it.
    await recordVersions();
    if (!changed) {
      return;
    }

    const selection = await vscode.window.showInformationMessage(
      "Translucent updated. Reload window to apply changes.",
      "Reload Window",
    );
    if (selection === "Reload Window") {
      vscode.commands.executeCommand("workbench.action.reloadWindow");
    }
  } catch (err: unknown) {
    handleError("auto patch on update", err);
  }
}

// Settings that only change colours (Layers, accent, text) are applied live; no patch, no reload.
// Other Extensions fixes are handled on their own too.
const LIVE_SECTIONS = ["vscode-translucent.surface", "vscode-translucent.layers", "vscode-translucent.accent", "vscode-translucent.text",
  "vscode-translucent.extensionFixes"];

function syncFixes(context: vscode.ExtensionContext) {
  void syncExtensionFixes(context).catch((err: unknown) => handleError("extension fixes", err));
}

let lastTargets = "";

export function activate(context: vscode.ExtensionContext) {
  void fixTargetsFingerprint().then((f) => { lastTargets = f; }, () => undefined);
  void checkAutoPatchOnUpdate(context);
  void applyLayers(context).catch((err: unknown) => handleError("apply layers", err));
  syncFixes(context);
  context.subscriptions.push(
    // An extension update replaces its files and drops the fix; put it back. Installs on the remote side (WSL) don't
    // always raise onDidChange here, so the fixes are also re-checked when the window regains focus and every two
    // minutes. A check only reads two small files; nothing is written unless a fix is actually missing.
    // Only when a patched extension itself changed; other extensions' installs (Rooms and the rest) are left alone.
    vscode.extensions.onDidChange(async () => {
      const now = await fixTargetsFingerprint().catch(() => "");
      if (now !== lastTargets) {
        lastTargets = now;
        syncFixes(context);
      }
    }),
    vscode.window.onDidChangeWindowState((s) => { if (s.focused) { syncFixes(context); } }),
    { dispose: ((t) => () => clearInterval(t))(setInterval(() => syncFixes(context), 120_000)) },
    vscode.commands.registerCommand("vscode-translucent.reapplyExtensionFixes", () => syncFixes(context)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("vscode-translucent.extensionFixes") || e.affectsConfiguration("vscode-translucent.layers")) {
        syncFixes(context);
      }
    }),
    vscode.commands.registerCommand("vscode-translucent.applyLayers", async () => {
      const n = await applyLayers(context);
      vscode.window.showInformationMessage(n ? `Translucent: ${n} colours applied.` : "Translucent: Layers are off; your own colours are back.");
    }),
    // The OS switching light/dark under "auto detect colour scheme" changes the theme without a settings change.
    vscode.window.onDidChangeActiveColorTheme(() => {
      void applyLayers(context).catch((err: unknown) => handleError("apply layers", err));
    }),
    vscode.commands.registerCommand("vscode-translucent.removeLayers", async () => {
      await removeLayers(context);
      vscode.window.showInformationMessage("Translucent: Layers removed; your own colours are back.");
    }),
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (LIVE_SECTIONS.some((s) => e.affectsConfiguration(s)) || e.affectsConfiguration("workbench.colorTheme")
          || e.affectsConfiguration("window.autoDetectColorScheme") || e.affectsConfiguration("workbench.preferredDarkColorTheme")
          || e.affectsConfiguration("workbench.preferredLightColorTheme")) {
        await applyLayers(context).catch((err: unknown) => handleError("apply layers", err));
      }
    }),
    vscode.commands.registerCommand("vscode-translucent.enable", async () => {
      await context.globalState.update(WANTED_KEY, true);
      return enableTranslucent();
    }),
    vscode.commands.registerCommand("vscode-translucent.disable", async () => {
      await context.globalState.update(WANTED_KEY, false);
      return disableTranslucent();
    }),
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (!e.affectsConfiguration("vscode-translucent")) {
        return;
      }
      // Colour-only settings are handled live above; they don't need the workbench re-patched.
      if (LIVE_SECTIONS.some((s) => e.affectsConfiguration(s)) && !e.affectsConfiguration("vscode-translucent.effect") && !e.affectsConfiguration("vscode-translucent.surface")) {
        return;
      }

      const paths = getInstallPaths();
      const config = getConfig();

      if (e.affectsConfiguration("vscode-translucent.effect")) {
        try {
          if (fs.existsSync(paths.mainJs)) {
            const content = fs.readFileSync(paths.mainJs, "utf-8");
            if (mainJs.isPatched(content)) {
              if (!mainJs.patch(paths.mainJs, config.effect)) {
                return;
              }
              vscode.window.showInformationMessage(
                "Translucent effect updated. A full restart is required.",
              );
            }
          }
        } catch (err: unknown) {
          handleError("update effect", err);
        }
        return;
      }

      try {
        if (fs.existsSync(paths.workbenchHtml)) {
          const content = fs.readFileSync(paths.workbenchHtml, "utf-8");
          if (workbenchHtml.isPatched(content)) {
            if (!workbenchHtml.patch(paths.workbenchHtml, config)) {
              return;
            }
            const selection = await vscode.window.showInformationMessage(
              "Translucent appearance updated. Reload window to apply changes.",
              "Reload Window",
            );
            if (selection === "Reload Window") {
              vscode.commands.executeCommand("workbench.action.reloadWindow");
            }
          }
        }
      } catch (err: unknown) {
        handleError("update appearance", err);
      }
    }),
  );
}

export function deactivate() {}
