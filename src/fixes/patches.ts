// Fixes for other extensions' panels on a see-through window (26 September 2026).
//
// Some extensions draw their panels in ways that break when the workbench is transparent. These fixes edit the
// other extension's installed files, so they are opt-in (off by default) and each keeps a backup to restore from.
// An extension update replaces its files, so the fixes are checked again every time extensions change.
//
// This file is pure: text in, patched text out (undefined = the file doesn't look as expected; leave it alone).

export const MARK = "translucent-fix";

export interface ExtensionFix {
  /** The setting under vscode-translucent.extensionFixes. */
  setting: string;
  /** The extension it applies to. */
  extensionId: string;
  /** Short name used in messages. */
  label: string;
  /** The file to patch, relative to the extension's folder. */
  file: string;
  /** True when the text already has this fix (for a fix with a value, the setting's value, e.g. a colour). */
  isPatched(text: string, value?: string): boolean;
  /** The patched text, or undefined when the file doesn't match what the fix expects. */
  patch(text: string, value?: string): string | undefined;
  /**
   * For fixes that only add a marked block: the text with that block taken out. These keep no backup, so they can
   * share a file with a backup-based fix without one undoing the other.
   */
  unpatch?(text: string): string;
}

// Claude Code fades long tool output with a mask built from the panel background. With a fully transparent
// background the mask hides everything, so the IN/OUT boxes look empty. Masks only use alpha, so solid black works.
const CLAUDE_MASK = /mask-image:linear-gradient\(to bottom,var\(--app-primary-background\)(\s*\d+px)/;

export const claudeToolBoxes: ExtensionFix = {
  setting: "claudeToolBoxes",
  extensionId: "anthropic.claude-code",
  label: "Claude Code",
  file: "webview/index.css",
  isPatched: (text) => !CLAUDE_MASK.test(text) && text.includes("mask-image:linear-gradient(to bottom,#000"),
  patch(text) {
    if (!CLAUDE_MASK.test(text)) {
      return undefined;
    }
    return text.replace(new RegExp(CLAUDE_MASK.source, "g"), "mask-image:linear-gradient(to bottom,#000 $1");
  },
};

// A thin bar down the left edge of your own messages in the Claude panel, so they stand apart from Claude's
// replies without a filled bubble. Added as a marked block at the end of the stylesheet.
const BAR_START = `/* ${MARK}:user-bar */`;
const BAR_END = `/* /${MARK}:user-bar */`;
const USER_MESSAGE = '[class*="userMessage_"]:not([class*="userMessageContainer_"]):not([class*="userMessageAttachments_"])';

export function userBarCss(color: string): string {
  return `${BAR_START}${USER_MESSAGE}{border-left:2px solid ${color} !important;`
    + `border-top-left-radius:0 !important;border-bottom-left-radius:0 !important}${BAR_END}`;
}

function withoutBar(text: string): string {
  const a = text.indexOf(BAR_START);
  const b = text.indexOf(BAR_END);
  return a < 0 || b < a ? text : text.slice(0, a) + text.slice(b + BAR_END.length);
}

export const claudeUserBar: ExtensionFix = {
  setting: "claudeUserMessageBar",
  extensionId: "anthropic.claude-code",
  label: "Claude Code",
  file: "webview/index.css",
  isPatched: (text, color) => !!color && text.includes(userBarCss(color)),
  patch: (text, color) => (color && /^#[0-9a-fA-F]{3,8}$/.test(color) ? withoutBar(text) + userBarCss(color) : undefined),
  unpatch: withoutBar,
};

// Antigravity embeds its chat page (served by the agy hub on localhost) in an iframe. Chromium paints an opaque
// backdrop behind an iframe whose colour scheme differs from its embedder, so the panel came out black; declaring
// the scheme and a transparent background fixes that. The page's own colours can't be set from outside, so the
// panel also loads it through a small local proxy (assets/glass-proxy.js) that adds translucent-glass.css.
export const ANTIGRAVITY_PROXY_FILE = "translucent-glass-proxy.js";
export const ANTIGRAVITY_CSS_FILE = "translucent-glass.css";
const FRAME_TAG = '<iframe id="jetski-frame" src=';
const RENDER = /renderIframe\(webview, serverUrl, options\) \{/;

export const antigravityGlass: ExtensionFix = {
  setting: "antigravityGlass",
  extensionId: "google.google-antigravity",
  label: "Antigravity",
  file: "extension.js",
  isPatched: (text) => text.includes(`/* ${MARK} */`),
  patch(text) {
    const frame = text.indexOf(FRAME_TAG);
    const css = frame < 0 ? -1 : text.lastIndexOf("iframe {", frame);
    if (frame < 0 || css < 0 || !RENDER.test(text)) {
      return undefined;
    }
    const brace = css + "iframe {".length;
    let out = text.slice(0, brace) + ` color-scheme: dark; background: transparent; /* ${MARK} */` + text.slice(brace);
    out = out.replace(FRAME_TAG, '<iframe id="jetski-frame" allowtransparency="true" src=');
    out = out.replace(RENDER, (m) => `${m} serverUrl = require(__dirname + '/${ANTIGRAVITY_PROXY_FILE}')(serverUrl); /* ${MARK} */`);
    return out;
  },
};

// The mask fix comes before the bar: turning the mask fix off restores Claude's original stylesheet, and the bar is
// then added back in the same pass.
export const FIXES: ExtensionFix[] = [claudeToolBoxes, claudeUserBar, antigravityGlass];

/** The CSS the proxy adds to Antigravity's chat page: its input box and bubbles get the inputs layer colour. */
export function antigravityCss(inputColor: string): string {
  return [
    "/* Written by Translucent from the Inputs layer colour. */",
    ":root {",
    `  --card: ${inputColor} !important;       /* the chat input box */`,
    `  --secondary: ${inputColor} !important;  /* message bubbles and small chips */`,
    "}",
    "",
  ].join("\n");
}
