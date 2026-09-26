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

/**
 * Every installed copy of an extension. Translucent runs on the Windows (UI) side, and extensions running on the
 * remote side (WSL, SSH) aren't visible through vscode.extensions there, so in a remote window their folders are
 * found directly: <home>/.vscode-server/extensions/<id>-<version> on the remote, read through the remote file system.
 * Every version found is fixed (an update leaves the old folder behind until VS Code cleans it up).
 */
async function findInstalls(extensionId: string): Promise<vscode.Uri[]> {
  const found = new Map<string, vscode.Uri>();
  const local = vscode.extensions.getExtension(extensionId);
  if (local) {
    found.set(local.extensionUri.toString(), local.extensionUri);
  }
  const prefix = extensionId.toLowerCase() + "-";
  const authorities = new Set((vscode.workspace.workspaceFolders ?? [])
    .filter((f) => f.uri.scheme === "vscode-remote").map((f) => f.uri.authority));
  for (const authority of authorities) {
    const at = (path: string) => vscode.Uri.from({ scheme: "vscode-remote", authority, path });
    const list = async (uri: vscode.Uri) => {
      try {
        return await vscode.workspace.fs.readDirectory(uri);
      } catch {
        return [];
      }
    };
    const homes = ["/root", ...(await list(at("/home"))).filter(([, t]) => t & vscode.FileType.Directory).map(([n]) => `/home/${n}`)];
    for (const home of homes) {
      const dir = `${home}/.vscode-server/extensions`;
      for (const [name, type] of await list(at(dir))) {
        if (type & vscode.FileType.Directory && name.toLowerCase().startsWith(prefix)) {
          const uri = at(`${dir}/${name}`);
          found.set(uri.toString(), uri);
        }
      }
    }
  }
  return [...found.values()];
}

type Outcome = "applied" | "removed" | "failed" | undefined;

/** Apply or take back one fix in every installed copy. Returns what happened, for the reload message. */
async function syncFix(context: vscode.ExtensionContext, fix: ExtensionFix): Promise<Outcome> {
  const results = await Promise.all((await findInstalls(fix.extensionId)).map((dir) => syncFixAt(context, fix, dir)));
  return (["failed", "applied", "removed"] as Outcome[]).find((r) => results.includes(r));
}

async function syncFixAt(context: vscode.ExtensionContext, fix: ExtensionFix, dir: vscode.Uri): Promise<Outcome> {
  // A switch (true/false) or a value such as a colour (empty = off).
  const setting = vscode.workspace.getConfiguration(NS).get<unknown>(`extensionFixes.${fix.setting}`);
  const value = typeof setting === "string" ? setting.trim() : undefined;
  const enabled = typeof setting === "string" ? value !== "" : setting === true;
  const file = vscode.Uri.joinPath(dir, fix.file);
  const backup = file.with({ path: file.path + BACKUP });
  const text = await read(file);
  if (text === undefined) {
    return undefined;
  }

  if (enabled) {
    if (fix === antigravityGlass) {
      await writeAntigravityFiles(context, dir);
    }
    if (fix.isPatched(text, value)) {
      return undefined;
    }
    const patched = fix.patch(text, value);
    if (patched === undefined) {
      return "failed";
    }
    if (!fix.unpatch && (await read(backup)) === undefined) {
      await write(backup, text);
    }
    await write(file, patched);
    return "applied";
  }

  // Off. A block-only fix just takes its block out.
  if (fix.unpatch) {
    const cleaned = fix.unpatch(text);
    if (cleaned === text) {
      return undefined;
    }
    await write(file, cleaned);
    return "removed";
  }
  // Otherwise put back our own backup, if this copy of the extension has one.
  const original = await read(backup);
  if (original === undefined) {
    return undefined;
  }
  if (fix.isPatched(text)) {
    await write(file, original);
  }
  await remove(backup);
  if (fix === antigravityGlass) {
    await remove(vscode.Uri.joinPath(dir, ANTIGRAVITY_PROXY_FILE));
    await remove(vscode.Uri.joinPath(dir, ANTIGRAVITY_CSS_FILE));
  }
  return "removed";
}

/**
 * Make every fix match its setting. Runs at startup and whenever extensions change, so a fix lost to an extension
 * update is put back on its own; a reload is offered only when a file actually changed.
 */
let running: Promise<void> | undefined;

export function syncExtensionFixes(context: vscode.ExtensionContext): Promise<void> {
  running ??= syncAll(context).finally(() => { running = undefined; });
  return running;
}

async function syncAll(context: vscode.ExtensionContext): Promise<void> {
  const applied: string[] = [];
  const removed: string[] = [];
  const failed: string[] = [];
  for (const fix of FIXES) {
    try {
      const r = await syncFix(context, fix);
      const item = `${fix.what} ${r === "removed" ? "from" : "to"} ${fix.label}`;
      if (r === "applied") {
        applied.push(item);
      } else if (r === "removed") {
        removed.push(item);
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
  // e.g. "Translucent added the message dot to Claude Code and removed the message bar from Claude Code."
  const list = (xs: string[]) => xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs[0];
  const parts = [
    applied.length ? `added ${list(applied)}` : "",
    removed.length ? `removed ${list(removed)}` : "",
  ].filter(Boolean);
  const choice = await vscode.window.showInformationMessage(
    `Translucent ${parts.join(" and ")}. Reload the window to see it.`,
    "Reload Window",
  );
  if (choice === "Reload Window") {
    void vscode.commands.executeCommand("workbench.action.reloadWindow");
  }
}
