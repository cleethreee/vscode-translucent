import * as assert from "assert";
import { buildColorMap, mergeOwned, PRESETS, withAlpha, LAYER_KEYS, ACCENT_KEYS, scopeMatches, SURFACE_OUTER, SURFACE_INNER, SURFACE_BORDERS, SURFACE_BARS } from "../layers/colors";
import { buildCSS } from "../styles";

describe("layers: colours", () => {
  it("withAlpha turns a hex colour and 0..1 into #rrggbbaa", () => {
    assert.strictEqual(withAlpha("#221716", 0.8), "#221716cc");
    assert.strictEqual(withAlpha("291C1A", 0.65), "#291c1aa6");
    assert.strictEqual(withAlpha("#000000", 0), "#00000000");
    assert.strictEqual(withAlpha("#ffffff", 1.7), "#ffffffff", "clamps above 1");
  });

  it("accepts the colour picker's 8-digit colours and shorthand, multiplying their transparency", () => {
    assert.strictEqual(withAlpha("#00000080", 0.5), "#00000040");
    assert.strictEqual(withAlpha("#00000000", 0.6), "#00000000", "a fully clear colour stays clear");
    assert.strictEqual(withAlpha("#1e1e1e66", 1), "#1e1e1e66");
    assert.strictEqual(withAlpha("#abc", 1), "#aabbccff");
  });

  it("withAlpha skips anything malformed instead of writing it", () => {
    assert.strictEqual(withAlpha("#12345", 0.5), undefined);
    assert.strictEqual(withAlpha("#1234567", 0.5), undefined);
    assert.strictEqual(withAlpha("green", 0.5), undefined);
    assert.strictEqual(withAlpha(undefined, 0.5), undefined);
    assert.strictEqual(withAlpha("#123456", Number.NaN), undefined);
  });

  it("Forest Glass reproduces the hand-tuned settings", () => {
    const m = buildColorMap(PRESETS.forestGlass);
    assert.strictEqual(m["input.background"], "#221716cc");
    assert.strictEqual(m["menu.background"], "#291c1aa6");
    assert.strictEqual(m["notifications.background"], "#291c1aa6");
    assert.strictEqual(m["editorGroupHeader.tabsBackground"], "#22171600");
    assert.strictEqual(m["menu.foreground"], "#3d8a52");
    assert.strictEqual(m["statusBarItem.remoteForeground"], "#446058");
    assert.strictEqual(m["statusBarItem.remoteBackground"], "#f973160d");
  });

  it("the accent keeps each key's own faintness and never touches chat", () => {
    const m = buildColorMap({ layers: {}, accent: "#3D8A52" });
    assert.strictEqual(m["activityBar.foreground"], "#3d8a52");
    assert.strictEqual(m["selection.background"], "#3d8a5240");
    assert.strictEqual(m["scrollbarSlider.hoverBackground"], "#3d8a5245");
    assert.ok(!Object.keys(ACCENT_KEYS).some((k) => k.startsWith("chat.") || k.startsWith("textPreformat")));
    assert.strictEqual(Object.keys(m).length, Object.keys(ACCENT_KEYS).length);
  });

  it("the selected-icon colour overrides the accent for the active activity-bar icon only", () => {
    const m = buildColorMap({ layers: {}, accent: "#3d8a52", activeIcon: "#FDE047" });
    assert.strictEqual(m["activityBar.foreground"], "#fde047");
    assert.strictEqual(m["activityBarTop.foreground"], "#fde047");
    assert.strictEqual(m["modernActivityBarItem.activeForeground"], "#fde047", "the modern-UI activity bar has its own key");
    assert.strictEqual(m["activityBar.inactiveForeground"], "#3d8a52");
  });

  it("the remote indicator can be clear at rest and coloured on hover", () => {
    const m = buildColorMap({ layers: {}, statusBarRemoteTint: { color: "#00000000", opacity: 1 }, statusBarRemoteHover: "#F48771" });
    assert.strictEqual(m["statusBarItem.remoteBackground"], "#00000000");
    assert.strictEqual(m["statusBarItem.remoteHoverBackground"], "#f48771");
  });

  it("a layer sets every key it owns", () => {
    const m = buildColorMap({ layers: { menus: { color: "#101010", opacity: 0.5 } } });
    for (const k of LAYER_KEYS.menus) {
      assert.strictEqual(m[k], "#10101080");
    }
    assert.strictEqual(m["input.background"], undefined);
  });
});

describe("layers: ownership", () => {
  it("first apply remembers what the user had and takes over", () => {
    const { result, owned } = mergeOwned({ "input.background": "#00000000", "editor.background": "#0000" },
      {}, { "input.background": "#221716cc" });
    assert.strictEqual(result["input.background"], "#221716cc");
    assert.strictEqual(result["editor.background"], "#0000", "keys never written are left alone");
    assert.deepStrictEqual(owned, { "input.background": "#00000000" });
  });

  it("turning a layer off puts the user's own value back", () => {
    const { result, owned } = mergeOwned({ "input.background": "#221716cc" },
      { "input.background": "#00000000" }, {});
    assert.strictEqual(result["input.background"], "#00000000");
    assert.deepStrictEqual(owned, {});
  });

  it("a key the user never had is removed, not left behind", () => {
    const { result } = mergeOwned({ "quickInput.background": "#291c1aa6" }, { "quickInput.background": null }, {});
    assert.ok(!("quickInput.background" in result));
  });

  it("re-applying keeps the original, not our own earlier value", () => {
    const first = mergeOwned({ "menu.background": "#00000000" }, {}, { "menu.background": "#291c1aa6" });
    const second = mergeOwned(first.result, first.owned, { "menu.background": "#291c1a99" });
    assert.strictEqual(second.result["menu.background"], "#291c1a99");
    assert.deepStrictEqual(second.owned, { "menu.background": "#00000000" });
  });
});

describe("layers: settings page", () => {
  it("adds a background for the Settings page only when its opacity is above 0", () => {
    const off = buildCSS({ settingsPageColor: "#221716", settingsPageOpacity: 0 });
    const on = buildCSS({ settingsPageColor: "#221716", settingsPageOpacity: 0.85 });
    assert.ok(!off.includes(".settings-editor, .settings-editor > .settings-body"));
    assert.ok(on.includes("background-color: #221716d9 !important"));
  });
});

describe("reload prompts", () => {
  it("a patch that changes nothing reports false, so no second reload is asked for", () => {
    const fs = require("fs"), os = require("os"), path = require("path");
    const html = require("../patchers/workbench-html");
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "wb-")), "workbench.html");
    fs.writeFileSync(f, "<html><head><title>x</title></head><body></body></html>");
    assert.strictEqual(html.patch(f, { opacity: 0.5 }), true, "first patch writes");
    assert.strictEqual(html.patch(f, { opacity: 0.5 }), false, "same settings: nothing to do");
    assert.strictEqual(html.patch(f, { opacity: 0.6 }), true, "a real change writes again");
  });
});

describe("theme blocks", () => {
  it("matches exact names, wildcards and ;-separated lists, ignoring case", () => {
    assert.ok(scopeMatches("[Dark+]", "Dark+"));
    assert.ok(scopeMatches("[Vira*]", "Vira Deepforest"));
    assert.ok(scopeMatches("[Monokai; Vira Teal]", "Vira Teal"));
    assert.ok(scopeMatches("[vira deepforest]", "Vira Deepforest"));
    assert.ok(!scopeMatches("[Vira*]", "Dark+"));
    assert.ok(!scopeMatches("[Dark+]", "Dark Modern"), "+ is literal, not a pattern");
    assert.ok(!scopeMatches("editor.background", "Dark+"));
  });
});

describe("surface: one colour for the whole window", () => {
  it("keeps modern pane edges clear even with the soft-border preset enabled", () => {
    const map = buildColorMap({ layers: {}, surface: "#0a0f0c33", softBorders: true });
    for (const key of ["surface.border", "editor.border", "modernPanel.border", "modernActivityBar.border", "panel.border"]) {
      assert.strictEqual(map[key], "#00000000", key);
    }
    const colored = buildColorMap({ layers: {}, surface: "#0a0f0c33", borders: "#11223344", softBorders: true });
    assert.strictEqual(colored["panel.border"], "#11223344");
  });
  it("tints every outer surface once, clears what sits on top, and draws every line in one colour", () => {
    const map = buildColorMap({ layers: {}, surface: "#0a0f0c33" });
    for (const k of SURFACE_OUTER) { assert.strictEqual(map[k], "#0a0f0c33", k); }
    for (const k of SURFACE_INNER) { assert.strictEqual(map[k], "#00000000", k); }
    for (const k of SURFACE_BORDERS) { assert.strictEqual(map[k], "#00000000", k); }
  });

  it("uses the border colour when one is given", () => {
    const map = buildColorMap({ layers: {}, surface: "#0a0f0c33", borders: "#0a0f0c33" });
    assert.strictEqual(map["sideBar.border"], "#0a0f0c33");
  });

  it("lets layers, accent and text override the surface", () => {
    const map = buildColorMap({ layers: { inputs: { color: "#0a0f0c", opacity: 0.2 } }, surface: "#0a0f0c33", accent: "#3d8a52" });
    assert.strictEqual(map["input.background"], "#0a0f0c33");
    assert.strictEqual(map["activityBar.activeBorder"], "#3d8a52");
    assert.strictEqual(map["editor.background"], "#0a0f0c33");
  });

  it("writes nothing for the surface when none is set, or when it isn't a colour", () => {
    assert.strictEqual(buildColorMap({ layers: {} })["editor.background"], undefined);
    assert.strictEqual(buildColorMap({ layers: {}, surface: "green" })["editor.background"], undefined);
  });

  it("never lists a key as both outer and inner", () => {
    for (const k of SURFACE_OUTER) { assert.ok(!SURFACE_INNER.includes(k), k); }
  });
});

describe("surface: bars", () => {
  it("gives the title and status bars the surface laid over itself, to match the two-coat panels", () => {
    const map = buildColorMap({ layers: {}, surface: "#0a0f0c33" });
    for (const k of SURFACE_BARS) { assert.strictEqual(map[k], "#0a0f0c5c", k); }
  });
});
