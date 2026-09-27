import * as assert from "assert";
import { antigravityCss, antigravityGlass, claudeToolBoxes, claudeUserBar, claudeUserDot, MARK } from "../fixes/patches";
import { buildColorMap, PRESETS } from "../layers/colors";

describe("other extensions: Claude Code", () => {
  const css = ".a{mask-image:linear-gradient(to bottom,var(--app-primary-background)50px,transparent 60px)}"
    + ".b{-webkit-mask-image:linear-gradient(to bottom,var(--app-primary-background)50px,transparent 60px)}";

  it("swaps every mask colour for solid black and then counts as patched", () => {
    assert.ok(!claudeToolBoxes.isPatched(css));
    const out = claudeToolBoxes.patch(css)!;
    assert.ok(!out.includes("--app-primary-background"));
    assert.strictEqual(out.split("to bottom,#000 50px,transparent 60px").length, 3, "a space keeps 50px apart from the colour");
    assert.ok(claudeToolBoxes.isPatched(out));
  });

  it("leaves a file it doesn't recognise alone", () => {
    assert.strictEqual(claudeToolBoxes.patch(".a{color:red}"), undefined);
  });
});

describe("other extensions: Antigravity", () => {
  const js = [
    "renderIframe(webview, serverUrl, options) {",
    "  const x = 1;",
    "  return `<style>",
    "    iframe {",
    "      width: 100%;",
    "    }",
    "  </style>",
    '  <iframe id="jetski-frame" src="${u}"></iframe>`;',
    "}",
  ].join("\r\n");

  it("makes the frame see-through, routes it through the proxy, and marks the file", () => {
    const out = antigravityGlass.patch(js)!;
    assert.ok(out.includes("iframe { color-scheme: dark; background: transparent;"));
    assert.ok(out.includes('<iframe id="jetski-frame" allowtransparency="true" src='));
    assert.ok(out.includes("require(__dirname + '/translucent-glass-proxy.js')(serverUrl)"));
    assert.ok(out.includes(MARK) && antigravityGlass.isPatched(out) && !antigravityGlass.isPatched(js));
    assert.ok(out.includes("\r\n"), "line endings are kept");
  });

  it("leaves a changed extension alone", () => {
    assert.strictEqual(antigravityGlass.patch(js.replace('id="jetski-frame"', 'id="other"')), undefined);
    assert.strictEqual(antigravityGlass.patch(js.replace("renderIframe", "render")), undefined);
  });

  it("colours the chat box and bubbles with the given colour", () => {
    const css = antigravityCss("#221716cc");
    assert.ok(css.includes("--card: #221716cc !important"));
    assert.ok(css.includes("--secondary: #221716cc !important"));
  });
});

describe("layers: soft borders", () => {
  it("Forest Glass clears the dark scrollbar-side border and softens the panel edge", () => {
    const m = buildColorMap(PRESETS.forestGlass);
    assert.strictEqual(m["editorOverviewRuler.border"], "#00000000");
    assert.strictEqual(m["panel.border"], "#ffffff0f");
  });

  it("is off unless asked for", () => {
    assert.strictEqual(buildColorMap({ layers: {} })["editorOverviewRuler.border"], undefined);
  });
});

describe("other extensions: Claude user-message bar", () => {
  const css = ".userMessage_07S1Yg{border:1px solid var(--app-input-border)}";

  it("adds one bar block, swaps its colour, and takes it out again", () => {
    const green = claudeUserBar.patch(css, "#3d8a52")!;
    assert.ok(green.includes("border-left:2px solid #3d8a52") && claudeUserBar.isPatched(green, "#3d8a52"));
    assert.ok(!claudeUserBar.isPatched(green, "#fde047"), "a new colour counts as not applied yet");
    const yellow = claudeUserBar.patch(green, "#fde047")!;
    assert.ok(yellow.includes("#fde047") && !yellow.includes("#3d8a52"), "only one block, with the new colour");
    assert.strictEqual(claudeUserBar.unpatch!(yellow), css);
  });

  it("skips anything that isn't a hex colour", () => {
    assert.strictEqual(claudeUserBar.patch(css, "green; } body { display:none"), undefined);
  });
});

describe("other extensions: Claude user-message dot", () => {
  it("adds a dot block alongside the bar without disturbing it, and removes only itself", () => {
    const css = ".x{}";
    const both = claudeUserDot.patch(claudeUserBar.patch(css, "#3d8a52")!, "#fde047")!;
    assert.ok(both.includes("background-color:#fde047") && both.includes("border-left:2px solid #3d8a52"));
    assert.strictEqual(claudeUserDot.unpatch!(both), claudeUserBar.patch(css, "#3d8a52"));
  });
});

describe("other extensions: Continue auto mode", () => {
  const { continueAutoMode } = require("../fixes/patches");
  const src = [
    "function evaluateTerminalCommandSecurity(basePolicy, command) {",
    "  return basePolicy;",
    "}",
    "function evaluateSingleCommand(a, b) {",
    '  if (isSafeCommand(baseCommand, args2)) {\n    return "allowedWithoutPermission";\n  }\n  return "allowedWithPermission";\n}\n',
    "x = () => { return evaluateFileAccessPolicy(basePolicy, resolvedPath3.isWithinWorkspace); };",
  ].join("\n");

  it("patches all three places and takes itself back out exactly", () => {
    const out = continueAutoMode.patch(src);
    assert.ok(out && continueAutoMode.isPatched(out));
    assert.ok(out.includes("__tapeHardRules(__continueTerminalSecurity("));
    assert.strictEqual(continueAutoMode.unpatch(out), src);
  });

  it("the hard rules block, ask and pass as designed", () => {
    const out = continueAutoMode.patch(src);
    const fn = new Function(out.slice(0, out.indexOf("function evaluateTerminalCommandSecurity")) + "return __tapeHardRules;")();
    assert.strictEqual(fn("allowedWithoutPermission", "cat /home/mini/x"), "disabled");
    assert.strictEqual(fn("allowedWithoutPermission", "ls '/mnt/c/Local Data (NOT TO BE SHARED)'"), "disabled");
    assert.strictEqual(fn("allowedWithoutPermission", "sudo apt install x"), "allowedWithPermission");
    assert.strictEqual(fn("allowedWithoutPermission", "cat ~/.keys.env"), "allowedWithPermission");
    assert.strictEqual(fn("allowedWithoutPermission", "ls -la ~/.claude/"), "allowedWithPermission");
    assert.strictEqual(fn("allowedWithoutPermission", "git push origin main"), "allowedWithPermission");
    assert.strictEqual(fn("allowedWithoutPermission", "./venv/bin/python list_tasks.py"), "allowedWithoutPermission");
  });

  it("leaves a changed Continue alone", () => {
    assert.strictEqual(continueAutoMode.patch("nothing here"), undefined);
  });
});
