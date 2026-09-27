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
  /** The extension's name, used in messages. */
  label: string;
  /** What the fix does, for messages ("the IN/OUT fix", "the message dot"). */
  what: string;
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
  what: "the IN/OUT box fix",
  file: "webview/index.css",
  isPatched: (text) => !CLAUDE_MASK.test(text) && text.includes("mask-image:linear-gradient(to bottom,#000"),
  patch(text) {
    if (!CLAUDE_MASK.test(text)) {
      return undefined;
    }
    return text.replace(new RegExp(CLAUDE_MASK.source, "g"), "mask-image:linear-gradient(to bottom,#000 $1");
  },
};

// Markers for your own messages in the Claude panel, so they stand apart from Claude's replies without a filled
// bubble. Each is a marked block added at the end of the stylesheet, and taken out again when its setting is cleared.
const USER_MESSAGE = '[class*="userMessage_"]:not([class*="userMessageContainer_"]):not([class*="userMessageAttachments_"])';
const USER_ROW = '[class*="message_"][class*="userMessageContainer_"]';

function blockFix(name: string, setting: string, what: string, css: (color: string) => string) {
  const start = `/* ${MARK}:${name} */`;
  const end = `/* /${MARK}:${name} */`;
  const block = (color: string) => start + css(color) + end;
  const without = (text: string) => {
    const a = text.indexOf(start);
    const b = text.indexOf(end);
    return a < 0 || b < a ? text : text.slice(0, a) + text.slice(b + end.length);
  };
  const fix: ExtensionFix = {
    setting,
    extensionId: "anthropic.claude-code",
    label: "Claude Code",
    what,
    file: "webview/index.css",
    isPatched: (text, color) => !!color && text.includes(block(color)),
    patch: (text, color) => (color && /^#[0-9a-fA-F]{3,8}$/.test(color) ? without(text) + block(color) : undefined),
    unpatch: without,
  };
  return { fix, block };
}

// A thin bar down the left edge of your messages.
const bar = blockFix("user-bar", "claudeUserMessageBar", "the message bar", (c) =>
  `${USER_MESSAGE}{border-left:2px solid ${c} !important;border-top-left-radius:0 !important;border-bottom-left-radius:0 !important}`);
export const claudeUserBar = bar.fix;
export const userBarCss = bar.block;

// A dot before your messages, in the same column and size as the dots Claude puts before its replies; your
// messages move in to line up with the replies' text. The bubble adds its own 6px padding and sits lower in its row
// than a reply's text does, hence 23px (not 30) and +26px (not +7), matched by eye on 26 Sept 2026. The 23px is a margin on the bubble,
// not padding on the row: padding on the row squeezed multi-line messages to one letter wide.
const dot = blockFix("user-dot", "claudeUserMessageDot", "the message dot", (c) =>
  `${USER_ROW} ${USER_MESSAGE}{margin-left:23px !important;max-width:calc(100% - 23px) !important}`
  + `${USER_ROW}:before{content:"";position:absolute;left:9px;top:calc(var(--message-padding-top,8px) + 26px);`
  + `width:7px;height:7px;border-radius:50%;background-color:${c};z-index:1}`);
export const claudeUserDot = dot.fix;
export const userDotCss = dot.block;

// When you scroll, Claude pins your latest message to the top of the panel. Its backing is the panel background,
// which is clear on a see-through window, so the pinned message sat on top of the text scrolling under it. Every
// message of yours can be pinned, so the backing only appears while one is actually stuck to the top: a
// scroll-state container query (Chromium 133+), drawn as a tinted, blurred layer behind the message that fades out
// over its last 12px like Claude's own. It reaches 40px above the message to also cover the thin gap between the
// panel's top edge and the pinned message. Where the query isn't supported, messages simply stay flush.
const STICKY = '[class*="message_"][class*="stickyHeader_"]';
const pinned = blockFix("pinned-message", "claudePinnedMessageBackground", "the pinned message backing", (c) =>
  `${STICKY}{container-type:scroll-state}`
  + `@container scroll-state(stuck:top){${STICKY}::after{content:"";position:absolute;inset:-40px 0 0 0;z-index:-1;`
  + `background:${c};-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);`
  + `-webkit-mask-image:linear-gradient(to bottom,#000 calc(100% - 12px),transparent);`
  + `mask-image:linear-gradient(to bottom,#000 calc(100% - 12px),transparent)}}`);
export const claudePinnedMessage = pinned.fix;

// Continue runs its agent's terminal commands in the background and reads their output, but only when VS Code is
// not connected to a remote. In a WSL window it instead types each command into a visible terminal, can't read the
// output, and opens the terminal every time. The extension runs inside WSL, so running them the local way works there.
const CONTINUE_LOCAL = 'LOCAL_ONLY = ["", "local"];';

export const continueWslCommands: ExtensionFix = {
  setting: "continueWslCommands",
  extensionId: "continue.continue",
  label: "Continue",
  what: "background terminal commands in WSL",
  file: "out/extension.js",
  isPatched: (text) => text.includes(`/* ${MARK}:continue-wsl */`),
  patch: (text) => text.includes(CONTINUE_LOCAL)
    ? text.replace(CONTINUE_LOCAL, `LOCAL_ONLY = ["", "local", "wsl"]; /* ${MARK}:continue-wsl */`)
    : undefined,
};

// Continue opens every Terminal block in its chat fully expanded, so long commands and their output flood the chat.
// This starts them folded, with a Claude Code-style header: "Bash" and a short description of what the command does
// (the model now gives one, see continueCommandDescription), or the command's first line when there is none. Click the
// arrow to see the whole command and its output; hover the header for the full command.
const TERMINAL_OPEN = 'const s=fr(),[l,c]=g.useState(!0),[u,d]=g.useState(!1),f=(i==null?void 0:i.status)==="calling"';
const TERMINAL_LABEL = 'b.jsx("span",{className:"text-description ml-2 select-none",children:"Terminal"})';
const TERMINAL_HEADER = 'b.jsxs("span",{className:"ml-2 select-none truncate",title:e,children:['
  + 'b.jsx("span",{className:"font-semibold",style:{color:"var(--vscode-foreground)"},children:"Bash"})," ",'
  + 'b.jsx("span",{className:"text-description",children:((i&&i.parsedArgs&&i.parsedArgs.description)||'
  + '((e||"").split("\\n")[0].slice(0,70)+((e||"").split("\\n")[0].length>70||(e||"").includes("\\n")?" …":"")))})]})';

export const continueCompactTerminal: ExtensionFix = {
  setting: "continueCompactTerminal",
  extensionId: "continue.continue",
  label: "Continue",
  what: "folded terminal blocks",
  file: "gui/assets/index.js",
  isPatched: (text) => text.includes(`/* ${MARK}:continue-terminal2 */`),
  patch: (text) => text.includes(TERMINAL_OPEN) && text.includes(TERMINAL_LABEL)
    ? text
      .replace(TERMINAL_OPEN, TERMINAL_OPEN.replace("g.useState(!0)", "g.useState(!1)") + `/* ${MARK}:continue-terminal2 */`)
      .replace(TERMINAL_LABEL, TERMINAL_HEADER)
    : undefined,
};

// Continue's terminal tool only takes the command, so there is nothing short to show when asking to run it. This adds
// a "description" argument (5-10 words, like Claude Code's Bash tool) that the model fills in; the folded header shows it.
const DESC_FROM = 'required: ["command"],\n          properties: {\n            command: {\n              type: "string",\n              description: "The command to run. This will be passed directly into the IDE shell."\n            },';
const DESC_TO = 'required: ["command", "description"],\n          properties: {\n            command: {\n              type: "string",\n              description: "The command to run. This will be passed directly into the IDE shell."\n            },'
  + `\n            description: { ${`/* ${MARK}:continue-desc */`}\n              type: "string",\n              description: "What this command does, in 5-10 plain words (e.g. 'List the Gmail labels', 'Run the task list script'). Shown to the user when asking to run it."\n            },`;

export const continueCommandDescription: ExtensionFix = {
  setting: "continueCompactTerminal",
  extensionId: "continue.continue",
  label: "Continue",
  what: "command descriptions",
  file: "out/extension.js",
  isPatched: (text) => text.includes(`/* ${MARK}:continue-desc */`),
  patch: (text) => (text.includes(DESC_FROM) ? text.replace(DESC_FROM, DESC_TO) : undefined),
  unpatch: (text) => text.split(DESC_TO).join(DESC_FROM),
};

// Auto mode for Continue (the user asked for this on 26 Sept 2026). Continue's "Automatic" tool policy still asks for
// any command it doesn't recognise (every script run), and never asks for file tools inside the open folder, which is
// the whole home folder here. This:
//  - lets unrecognised commands run when the tool is on Automatic (Continue's own high-risk and critical checks still
//    ask or block, and "Ask First" still asks for everything);
//  - adds hard rules on top, for commands and file paths alike: anything touching /home/mini or a "NOT TO BE SHARED"
//    folder is blocked; sudo, key and sign-in files (.keys.env, token.json, auth.json, ~/.claude, ~/.codex),
//    git push and publishing always ask.
const AUTO_MARK = `/* ${MARK}:continue-auto */`;
const AUTO_RULES = String.raw`function __tapeHardRules(policy, text) {
  const t = String(text || "");
  if (/\/home\/mini\b|NOT[ _-]TO[ _-]BE[ _-]SHARED/i.test(t)) return "disabled";
  if (policy === "disabled") return policy;
  if (/(^|[\s;&|(])sudo\b|\.keys\.env|token\.json|auth\.json|\.credentials\.json|\/\.claude\b|~\/\.claude\b|\/\.codex\b|~\/\.codex\b|\bgit\s+push\b|\bnpm\s+publish\b|\bvsce\s+publish\b|\bgh\s+(release|repo)\b/i.test(t)) {
    return "allowedWithPermission";
  }
  return policy;
}
`;
const AUTO_REPLACEMENTS: [string, string][] = [
  [
    '  if (isSafeCommand(baseCommand, args2)) {\n    return "allowedWithoutPermission";\n  }\n  return "allowedWithPermission";\n}\n',
    '  if (isSafeCommand(baseCommand, args2)) {\n    return "allowedWithoutPermission";\n  }\n  return "allowedWithoutPermission"; ' + AUTO_MARK + '\n}\n',
  ],
  [
    "function evaluateTerminalCommandSecurity(basePolicy, command) {",
    AUTO_RULES + "function evaluateTerminalCommandSecurity(basePolicy, command) { " + AUTO_MARK
      + "\n  return __tapeHardRules(__continueTerminalSecurity(basePolicy, command), command);\n}\n"
      + "function __continueTerminalSecurity(basePolicy, command) {",
  ],
  [
    "return evaluateFileAccessPolicy(basePolicy, resolvedPath3.isWithinWorkspace);",
    "return __tapeHardRules(evaluateFileAccessPolicy(basePolicy, resolvedPath3.isWithinWorkspace), JSON.stringify(resolvedPath3)); " + AUTO_MARK,
  ],
];

export const continueAutoMode: ExtensionFix = {
  setting: "continueAutoMode",
  extensionId: "continue.continue",
  label: "Continue",
  what: "auto mode with hard rules",
  file: "out/extension.js",
  isPatched: (text) => text.includes(AUTO_MARK),
  patch: (text) => {
    if (!AUTO_REPLACEMENTS.every(([from]) => text.includes(from))) {
      return undefined;
    }
    return AUTO_REPLACEMENTS.reduce((t, [from, to]) => t.split(from).join(to), text);
  },
  unpatch: (text) => AUTO_REPLACEMENTS.reduce((t, [from, to]) => t.split(to).join(from), text),
};

// Continue drops its Grep Search tool (search inside files) in any remote window, and its search function refuses to
// run there. In WSL the extension runs inside Linux next to the files and ships its own ripgrep for Linux, so both
// work. Without this the agent can only find files by name (glob) and has to read them one by one.
const GREP_MARK = `/* ${MARK}:continue-grep */`;
const GREP_REPLACEMENTS: [string, string][] = [
  [
    "if (!isRemote) {\n        tools.push(grepSearchTool);\n      }",
    "if (true) { " + GREP_MARK + "\n        tools.push(grepSearchTool);\n      }",
  ],
  [
    'if (vscode35.env.remoteName) {\n          throw new Error("Ripgrep not supported, this workspace is remote");',
    'if (vscode35.env.remoteName && vscode35.env.remoteName !== "wsl") { ' + GREP_MARK
      + '\n          throw new Error("Ripgrep not supported, this workspace is remote");',
  ],
];

export const continueWslGrep: ExtensionFix = {
  setting: "continueWslGrep",
  extensionId: "continue.continue",
  label: "Continue",
  what: "grep search in WSL",
  file: "out/extension.js",
  isPatched: (text) => text.includes(GREP_MARK),
  patch: (text) => (GREP_REPLACEMENTS.every(([from]) => text.includes(from))
    ? GREP_REPLACEMENTS.reduce((t, [from, to]) => t.split(from).join(to), text)
    : undefined),
  unpatch: (text) => GREP_REPLACEMENTS.reduce((t, [from, to]) => t.split(to).join(from), text),
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
  what: "the glass fix",
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
export const FIXES: ExtensionFix[] = [claudeToolBoxes, claudeUserBar, claudeUserDot, claudePinnedMessage, antigravityGlass,
  continueWslCommands, continueCompactTerminal, continueCommandDescription, continueAutoMode,
  continueWslGrep];

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
