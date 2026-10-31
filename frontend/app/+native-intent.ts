/**
 * Route ACTION_SEND text and URL shares into SubMind's save-on-share flow.
 */
export async function redirectSystemPath({path}: {path: string; initial: boolean}) {
  try { if (new URL(path).hostname === "expo-sharing") return "/handle-share"; }
  catch { /* Ordinary Expo Router path, not an external URL. */ }
  return path;
}
