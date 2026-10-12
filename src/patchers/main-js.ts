import * as fs from "fs";
import type { EffectType } from "../utils/config";

const MARKER = "vscode-translucent-patched";
const MARKER_RE = /vscode-translucent-patched/;

export function isPatched(content: string): boolean {
  return MARKER_RE.test(content);
}

// backgroundMaterial is Windows 11 only; macOS ignores it, and a clear window with no material leaves old frames on
// screen (the fog on the Mac, 11 Oct 2026). On a Mac every effect asks for macOS's own glass instead.
const MAC_VIBRANCY: Record<Exclude<EffectType, "none">, string> = {
  mica: "hud",
  acrylic: "hud",
  tabbed: "hud",
  auto: "hud",
};

export function patch(filePath: string, effect: EffectType, platform: NodeJS.Platform = process.platform): boolean {
  const original = fs.readFileSync(filePath, "utf-8");
  let content = original;
  if (isPatched(content)) {
    content = doUnpatch(content);
  }

  const bgOptRe = /\bbackgroundColor\s*:\s*([\w$]+\.getBackgroundColor\(\))\s*,/;
  if (!bgOptRe.test(content)) {
    throw new Error(
      `Could not find expected code in main.js for patch: backgroundColor: *.getBackgroundColor(),`
    );
  }
  content = content.replace(
    bgOptRe,
    `backgroundColor:"#00000000",/*${MARKER}:$1*/`
  );

  const setBgRe = /\b([\w$]+\.setBackgroundColor\([\w$]+\.colorInfo\.background\))\s*;/;
  if (!setBgRe.test(content)) {
    throw new Error(
      `Could not find expected code in main.js for patch: *.setBackgroundColor(*.colorInfo.background);`
    );
  }
  content = content.replace(
    setBgRe,
    `0/*${MARKER}:$1*/;`
  );

  const viewBgRe = /\b((?:this|[\w$]+(?:\.[\w$]+)?)\.setBackgroundColor\()"#FFFFFF"\)/;
  if (viewBgRe.test(content)) {
    content = content.replace(
      viewBgRe,
      `$1"#00000000")/*${MARKER}*/`
    );
  }

  const expDarkRe = /\bexperimentalDarkMode\s*:\s*(!0|true)/;
  if (!expDarkRe.test(content)) {
    throw new Error(
      `Could not find expected code in main.js for patch: experimentalDarkMode: !0`
    );
  }
  if (effect !== "none" && platform === "darwin") {
    content = content.replace(
      expDarkRe,
      `experimentalDarkMode:$1,transparent:!0,vibrancy:"${MAC_VIBRANCY[effect]}",visualEffectState:"active"/*${MARKER}*/`
    );
  } else if (effect !== "none") {
    content = content.replace(
      expDarkRe,
      `experimentalDarkMode:$1,backgroundMaterial:"${effect}"/*${MARKER}*/`
    );
  } else {
    content = content.replace(
      expDarkRe,
      `experimentalDarkMode:$1,transparent:!0/*${MARKER}*/`
    );
  }

  // Unchanged: nothing to write, and nothing to reload for (returns false).
  if (content === original) {
    return false;
  }
  fs.writeFileSync(filePath, content, "utf-8");
  return true;
}

export function doUnpatch(content: string): string {
  return content.replace(
    /\bbackgroundColor\s*:\s*"#00000000"\s*,\s*\/\*vscode-translucent-patched(?::(.*?))?\*\//g,
    (_match, orig) => `backgroundColor: ${orig || "n.getBackgroundColor()"},`
  ).replace(
    /\b0\s*\/\*vscode-translucent-patched(?::(.*?))?\*\/\s*;/g,
    (_match, orig) => `${orig || "n.setBackgroundColor(t.colorInfo.background)"};`
  ).replace(
    /\b((?:this|[\w$]+(?:\.[\w$]+)?)\.setBackgroundColor\()"#00000000"\)\s*\/\*vscode-translucent-patched\*\//g,
    `$1"#FFFFFF")`
  ).replace(
    /\bexperimentalDarkMode\s*:\s*(!0|true)\s*,\s*(?:backgroundMaterial\s*:\s*"[^"]*"|transparent\s*:\s*(?:!0|true)(?:\s*,\s*vibrancy\s*:\s*"[^"]*"\s*,\s*visualEffectState\s*:\s*"[^"]*")?)\s*\/\*vscode-translucent-patched\*\//g,
    `experimentalDarkMode: $1`
  ).replace(
    // A tail stranded when an older Translucent patched over a newer one (11 Oct 2026): it kept the Mac glass on
    // under "none", and as the later duplicate key it overrode whatever material came first.
    /\s*,\s*transparent\s*:\s*(?:!0|true)\s*,\s*vibrancy\s*:\s*"[^"]*"\s*,\s*visualEffectState\s*:\s*"[^"]*"\s*\/\*vscode-translucent-patched\*\//g,
    ""
  );
}

export function unpatch(filePath: string): boolean {
  let content = fs.readFileSync(filePath, "utf-8");
  if (!isPatched(content)) {
    return false;
  }
  content = doUnpatch(content);
  fs.writeFileSync(filePath, content, "utf-8");
  return true;
}


