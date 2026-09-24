import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPwaChrome } from '../src/lib/pwaChrome.js';

const frozenIos = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/27.0 Mobile/15E148 Safari/604.1';
for (const [label, userAgent, standalone, native, expected] of [
  ['iOS 27 home-screen app with frozen OS token', frozenIos, true, false, true],
  ['Safari browser tab', frozenIos, false, false, false],
  ['iOS 26 home-screen app', frozenIos.replace('Version/27.0', 'Version/26.5'), true, false, false],
  ['Android installed app', 'Mozilla/5.0 (Linux; Android 16) Chrome/140.0 Mobile Safari/537.36', undefined, false, false],
  ['native shell', frozenIos, true, true, false],
  ['standalone UA without Safari version', 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148', true, false, true],
]) {
  test(label, () => {
    let applied;
    const win = { navigator: { userAgent, standalone }, Capacitor: { isNativePlatform: () => native }, document: { documentElement: { toggleAttribute: (key, value) => { assert.equal(key, 'data-pwa-ios-blur'); applied = value; } } } };
    assert.equal(applyPwaChrome(win), expected);
    assert.equal(applied, expected);
  });
}
