/**
 * Config plugin: strip the "audio" UIBackgroundMode from the iOS Info.plist.
 *
 * Why this exists
 * ---------------
 * App Store Guideline 2.5.4 rejects apps that declare a background mode they do
 * not actually use. Chravel only does FOREGROUND voice notes / AI Concierge TTS
 * — audio never plays or records while the app is backgrounded — so the "audio"
 * background mode is unused and must not ship.
 *
 * Two of our dependencies' config plugins inject UIBackgroundModes: ["audio"]
 * during prebuild:
 *   - `expo-audio` (via its `enableBackgroundPlayback` option, which defaults to
 *      true). We disable that option in app.config.js so it never adds it.
 *   - `@mykin-ai/expo-audio-stream` adds it UNCONDITIONALLY with no opt-out, so
 *      we keep it out of the `plugins` array (its native module still autolinks
 *      from the dependency for Android PCM capture).
 *
 * This plugin is the durable belt-and-suspenders guard: it runs after the audio
 * plugins and removes "audio" from UIBackgroundModes (deleting the key entirely
 * if that empties it) so the mode can never regress back into a shipped build,
 * regardless of future dependency/option changes.
 *
 * Mod ordering note: @expo/config-plugins runs withInfoPlist mods in REVERSE of
 * registration order (the last-registered mod runs first). To guarantee this
 * strip runs LAST, register this plugin FIRST in the app.config.js `plugins`
 * array.
 */
const { withInfoPlist } = require('expo/config-plugins');

const withNoAudioBackgroundMode = (config) => {
  return withInfoPlist(config, (config) => {
    const modes = config.modResults.UIBackgroundModes;
    if (Array.isArray(modes)) {
      const filtered = modes.filter((mode) => mode !== 'audio');
      if (filtered.length > 0) {
        config.modResults.UIBackgroundModes = filtered;
      } else {
        delete config.modResults.UIBackgroundModes;
      }
    }
    return config;
  });
};

module.exports = withNoAudioBackgroundMode;
