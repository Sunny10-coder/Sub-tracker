// Expo SDK 57 supports iOS-only expo-widgets. This config plugin creates a
// first-party native Android AppWidgetProvider for Expo prebuild, preserving
// the app's existing React Native / SDK versions.
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  withAndroidManifest, withMainApplication, withDangerousMod,
} = require("expo/config-plugins");

module.exports = function withSubMindAndroidWidget(config) {
  const pkg = config.android?.package;
  if (!pkg || !/^[a-zA-Z_][\w]*(\.[a-zA-Z_][\w]*)+$/.test(pkg)) {
    throw new Error("SubMind widget requires a valid android.package.");
  }

  config = withAndroidManifest(config, native => {
    const app = native.modResults.manifest.application?.[0];
    if (!app) throw new Error("Cannot find Android manifest application.");
    app.receiver ||= [];
    const name = pkg + ".SubMindWidgetProvider";
    app.receiver = app.receiver.filter(r => r?.$?.["android:name"] !== name);
    app.receiver.push({
      $: {
        "android:name": name,
        "android:label": "SubMind Overview",
        "android:exported": "true",
        "android:permission": "android.permission.BIND_APPWIDGET",
      },
      "intent-filter": [{
        action: [{ $: { "android:name": "android.appwidget.action.APPWIDGET_UPDATE" } }],
      }],
      "meta-data": [{
        $: {
          "android:name": "android.appwidget.provider",
          "android:resource": "@xml/submind_home_widget_info",
        },
      }],
    });
    return native;
  });

  config = withMainApplication(config, native => {
    let src = native.modResults.contents;
    if (native.modResults.language !== "kt" && native.modResults.language !== "java") {
      throw new Error("Unsupported MainApplication language for SubMind native widget.");
    }
    if (!src.includes("SubMindWidgetPackage")) {
      if (native.modResults.language === "kt") {
        src = src.replace(
          /^(package\s+[\w.]+\s*)/m,
          "$1\nimport " + pkg + ".SubMindWidgetPackage\n"
        );
        const anchor = /PackageList\(this\)\.packages\.apply\s*\{/;
        if (!anchor.test(src)) throw new Error("Cannot insert widget package in Expo MainApplication.kt");
        src = src.replace(anchor, "$&\n            add(SubMindWidgetPackage())");
      } else {
        src = src.replace(/^(package\s+[\w.]+;)/m,
          "$1\nimport " + pkg + ".SubMindWidgetPackage;");
        const anchor = /List<ReactPackage> packages\s*=\s*new PackageList\(this\)\.getPackages\(\);/;
        if (!anchor.test(src)) throw new Error("Cannot insert widget package in MainApplication.java");
        src = src.replace(anchor, "$&\n        packages.add(new SubMindWidgetPackage());");
      }
    }
    native.modResults.contents = src;
    return native;
  });

  config = withDangerousMod(config, ["android", async native => {
    const appRoot = path.join(native.modRequest.platformProjectRoot, "app", "src", "main");
    const javaRoot = path.join(appRoot, "java", ...pkg.split("."));
    const templateRoot = path.join(native.modRequest.projectRoot, "plugins", "submind-widget-native");
    const files = [
      ["SubMindWidgetProvider.kt", path.join(javaRoot, "SubMindWidgetProvider.kt"), true],
      ["SubMindWidgetPackage.kt", path.join(javaRoot, "SubMindWidgetPackage.kt"), true],
      ["submind_home_widget.xml", path.join(appRoot, "res", "layout", "submind_home_widget.xml"), false],
      ["submind_home_widget_info.xml", path.join(appRoot, "res", "xml", "submind_home_widget_info.xml"), false],
    ];
    for (const [source, destination, replacePackage] of files) {
      let contents = await fs.readFile(path.join(templateRoot, source), "utf8");
      if (replacePackage) contents = contents.replaceAll("__PACKAGE__", pkg);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, contents, "utf8");
    }
    return native;
  }]);
  return config;
};
