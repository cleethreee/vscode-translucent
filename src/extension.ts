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

async function checkAutoPatchOnUpdate(context: vscode.ExtensionContext) {
  const prev = context.globalState.get<string>("version");
  const current = context.extension.packageJSON.version;
  await context.globalState.update("version", current);

  if (!prev || compareVersions(current, prev) <= 0) {
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

  if (!isPatched) {
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
const LIVE_SECTIONS = ["vscode-translucent.layers", "vscode-translucent.accent", "vscode-translucent.text"];

export function activate(context: vscode.ExtensionContext) {
  void checkAutoPatchOnUpdate(context);
  void applyLayers(context).catch((err: unknown) => handleError("apply layers", err));
  context.subscriptions.push(
    vscode.commands.registerCommand("vscode-translucent.applyLayers", async () => {
      const n = await applyLayers(context);
      vscode.window.showInformationMessage(n ? `Translucent: ${n} colours applied.` : "Translucent: Layers are off; your own colours are back.");
    }),
    vscode.commands.registerCommand("vscode-translucent.removeLayers", async () => {
      await removeLayers(context);
      vscode.window.showInformationMessage("Translucent: Layers removed; your own colours are back.");
    }),
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (LIVE_SECTIONS.some((s) => e.affectsConfiguration(s)) || e.affectsConfiguration("workbench.colorTheme")) {
        await applyLayers(context).catch((err: unknown) => handleError("apply layers", err));
      }
    }),
    vscode.commands.registerCommand(
      "vscode-translucent.enable",
      enableTranslucent,
    ),
    vscode.commands.registerCommand(
      "vscode-translucent.disable",
      disableTranslucent,
    ),
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (!e.affectsConfiguration("vscode-translucent")) {
        return;
      }
      // Colour-only settings are handled live above; they don't need the workbench re-patched.
      if (LIVE_SECTIONS.some((s) => e.affectsConfiguration(s)) && !e.affectsConfiguration("vscode-translucent.effect")) {
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
