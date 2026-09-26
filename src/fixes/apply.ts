import * as vscode from "vscode";
import { withAlpha } from "../layers/colors";
import { readColorSettings } from "../layers/apply";
import {
  ANTIGRAVITY_CSS_FILE,
  ANTIGRAVITY_PROXY_FILE,
  antigravityCss,
  antigravityGlass,
  ExtensionFix,
  FIXES,
} from "./patches";

const NS = "vscode-translucent";
const BACKUP = ".translucent-orig";

async function read(uri: vscode.Uri): Promise<string | undefined> {
  try {
    return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
  } catch {
    return undefined;
  }
}

async function write(uri: vscode.Uri, text: string): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(text));
}

async function remove(uri: vscode.Uri): Promise<void> {
  try {
    await vscode.workspace.fs.delete(uri);
  } catch {
    // already gone
  }
}

/** Antigravity's proxy and its CSS sit next to its extension.js. The CSS follows the Inputs layer colour. */
async function writeAntigravityFiles(context: vscode.ExtensionContext, dir: vscode.Uri): Promise<void> {
  const proxy = await read(vscode.Uri.joinPath(context.extensionUri, "assets", "glass-proxy.js"));
  if (proxy !== undefined && (await read(vscode.Uri.joinPath(dir, ANTIGRAVITY_PROXY_FILE))) !== proxy) {
    await write(vscode.Uri.joinPath(dir, ANTIGRAVITY_PROXY_FILE), proxy);
  }
  const inputs = readColorSettings()?.layers.inputs;
  const css = antigravityCss((inputs && withAlpha(inputs.color, inputs.opacity)) || "#221716cc");
  if ((await read(vscode.Uri.joinPath(dir, ANTIGRAVITY_CSS_FILE))) !== css) {
    await write(vscode.Uri.joinPath(dir, ANTIGRAVITY_CSS_FILE), css);
  }
}

/** Apply or take back one fix. Returns what happened, for the reload message. */
async function syncFix(context: vscode.ExtensionContext, fix: ExtensionFix): Promise<"applied" | "removed" | "failed" | undefined> {
  const ext = vscode.extensions.getExtension(fix.extensionId);
  if (!ext) {
    return undefined;
  }
  const enabled = vscode.workspace.getConfiguration(NS).get<boolean>(`extensionFixes.${fix.setting}`, false);
  const file = vscode.Uri.joinPath(ext.extensionUri, fix.file);
  const backup = file.with({ path: file.path + BACKUP });
  const text = await read(file);
  if (text === undefined) {
    return undefined;
  }

  if (enabled) {
    if (fix === antigravityGlass) {
      await writeAntigravityFiles(context, ext.extensionUri);
    }
    if (fix.isPatched(text)) {
      return undefined;
    }
    const patched = fix.patch(text);
    if (patched === undefined) {
      return "failed";
    }
    if ((await read(backup)) === undefined) {
      await write(backup, text);
    }
    await write(file, patched);
    return "applied";
  }

  // Off: put back our own backup, if this copy of the extension has one.
  const original = await read(backup);
  if (original === undefined) {
    return undefined;
  }
  if (fix.isPatched(text)) {
    await write(file, original);
  }
  await remove(backup);
  if (fix === antigravityGlass) {
    await remove(vscode.Uri.joinPath(ext.extensionUri, ANTIGRAVITY_PROXY_FILE));
    await remove(vscode.Uri.joinPath(ext.extensionUri, ANTIGRAVITY_CSS_FILE));
  }
  return "removed";
}

/**
 * Make every fix match its setting. Runs at startup and whenever extensions change, so a fix lost to an extension
 * update is put back on its own; a reload is offered only when a file actually changed.
 */
export async function syncExtensionFixes(context: vscode.ExtensionContext): Promise<void> {
  const applied: string[] = [];
  const removed: string[] = [];
  const failed: string[] = [];
  for (const fix of FIXES) {
    try {
      const r = await syncFix(context, fix);
      if (r === "applied") {
        applied.push(fix.label);
      } else if (r === "removed") {
        removed.push(fix.label);
      } else if (r === "failed") {
        failed.push(fix.label);
      }
    } catch (err: unknown) {
      failed.push(`${fix.label} (${err instanceof Error ? err.message : String(err)})`);
    }
  }
  const warned = context.globalState.get<string[]>("extensionFixes.warned") ?? [];
  const newFailures = failed.filter((f) => !warned.includes(f));
  if (newFailures.length) {
    await context.globalState.update("extensionFixes.warned", [...warned, ...newFailures]);
    vscode.window.showWarningMessage(
      `Translucent: couldn't apply the fix for ${newFailures.join(", ")}. The extension has probably changed how it draws its panel; it was left as it is.`,
    );
  }
  if (!applied.length && !removed.length) {
    return;
  }
  const parts = [
    applied.length ? `applied the fix for ${applied.join(" and ")}` : "",
    removed.length ? `put ${removed.join(" and ")} back as it was` : "",
  ].filter(Boolean);
  const choice = await vscode.window.showInformationMessage(
    `Translucent ${parts.join(" and ")}. Reload the window to see it.`,
    "Reload Window",
  );
  if (choice === "Reload Window") {
    void vscode.commands.executeCommand("workbench.action.reloadWindow");
  }
}
