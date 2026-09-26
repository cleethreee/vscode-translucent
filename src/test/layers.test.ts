import * as assert from "assert";
import { buildColorMap, mergeOwned, PRESETS, withAlpha, LAYER_KEYS, ACCENT_KEYS } from "../layers/colors";
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
