"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const withMicWidget = require("./with-android-mic-widget");
const {
  addMicWidgetToManifest,
  addSpeechRecognitionQueries,
  widgetFileContents,
  writeWidgetFiles,
} = require("./with-android-mic-widget");

function fakeManifest() {
  return {
    application: [
      { $: { "android:name": ".MainApplication" }, activity: [], receiver: [], service: [] },
    ],
  };
}

test("registers the widget receiver, voice activity, and log service exactly once", () => {
  const manifest = fakeManifest();
  addMicWidgetToManifest(manifest);
  addMicWidgetToManifest(manifest);
  const app = manifest.application[0];
  const receivers = app.receiver.filter(
    (entry) => entry.$["android:name"] === "site.zoption.micwidget.MicWidgetProvider",
  );
  const activities = app.activity.filter(
    (entry) => entry.$["android:name"] === "site.zoption.micwidget.MicWidgetVoiceActivity",
  );
  const services = app.service.filter(
    (entry) => entry.$["android:name"] === "site.zoption.micwidget.MicWidgetLogService",
  );
  expect(receivers).toHaveLength(1);
  expect(activities).toHaveLength(1);
  expect(services).toHaveLength(1);
  // Only this app's capture activity may start the logging task.
  expect(services[0].$["android:exported"]).toBe("false");
  expect(receivers[0]["intent-filter"][0].action[0].$["android:name"]).toBe(
    "android.appwidget.action.APPWIDGET_UPDATE",
  );
  expect(receivers[0]["meta-data"][0].$["android:resource"]).toBe("@xml/zoption_mic_widget_info");
});

test("declares speech-recognizer package visibility exactly once", () => {
  const manifest = fakeManifest();
  addSpeechRecognitionQueries(manifest);
  addSpeechRecognitionQueries(manifest);
  expect(manifest.queries).toHaveLength(1);
  expect(manifest.queries[0].intent).toHaveLength(1);
  expect(manifest.queries[0].intent[0].action[0].$["android:name"]).toBe(
    "android.speech.RecognitionService",
  );
});

test("merges the recognizer intent into an existing queries element", () => {
  const manifest = fakeManifest();
  manifest.queries = [
    { intent: [{ action: [{ $: { "android:name": "android.intent.action.PROCESS_TEXT" } }] }] },
  ];
  addSpeechRecognitionQueries(manifest);
  addSpeechRecognitionQueries(manifest);
  // A manifest may only declare one <queries> element.
  expect(manifest.queries).toHaveLength(1);
  expect(manifest.queries[0].intent).toHaveLength(2);
  expect(manifest.queries[0].intent[1].action[0].$["android:name"]).toBe(
    "android.speech.RecognitionService",
  );
});

test("voice activity is not noHistory so the transcript survives recognition", () => {
  const manifest = fakeManifest();
  addMicWidgetToManifest(manifest);
  const activity = manifest.application[0].activity[0];
  // A no-history activity is finished as soon as it stops, and a stopped
  // activity never receives onActivityResult: the recognizer result was lost
  // whenever the device's speech UI covered the activity instead of floating
  // over it.
  expect(activity.$["android:noHistory"]).toBeUndefined();
  expect(activity.$["android:excludeFromRecents"]).toBe("true");
  expect(activity.$["android:launchMode"]).toBe("singleTop");
  expect(activity.$["android:theme"]).toBe("@android:style/Theme.Translucent.NoTitleBar");
});

test("generated widget logs in the background and never opens the app", () => {
  const files = widgetFileContents();
  expect(Object.keys(files)).toHaveLength(11);
  expect(files["app/src/main/res/values/zoption_mic_widget_strings.xml"]).toContain(
    '<string name="zoption_mic_widget_hint">Tap and say what you spent</string>',
  );
  const infoXml = files["app/src/main/res/xml/zoption_mic_widget_info.xml"];
  expect(infoXml).toContain('android:resizeMode="horizontal|vertical"');
  expect(infoXml).toContain('android:minResizeWidth="48dp"');
  expect(infoXml).toContain('android:minResizeHeight="48dp"');
  expect(infoXml).toContain('android:previewLayout="@layout/zoption_mic_widget"');
  const iconXml = files["app/src/main/res/drawable/zoption_mic_widget_icon.xml"];
  expect(iconXml).toContain("<vector");
  expect(iconXml).toContain('android:viewportWidth="24"');
  expect(iconXml).toContain("@color/zoption_mic_widget_on_brand");
  const layoutXml = files["app/src/main/res/layout/zoption_mic_widget.xml"];
  expect(layoutXml).toContain("@drawable/zoption_mic_widget_icon");
  expect(layoutXml).not.toContain("@android:drawable/ic_btn_speak_now");
  expect(layoutXml).toContain("zoption_mic_widget_text");
  const activity = files["app/src/main/java/site/zoption/micwidget/MicWidgetVoiceActivity.kt"];
  expect(activity).toContain("RecognizerIntent.ACTION_RECOGNIZE_SPEECH");
  expect(activity).toContain("isRecognitionAvailable");
  expect(activity).toContain("startService(");
  expect(activity).toContain("MicWidgetLogService::class.java");
  // The transcript goes to the headless task, not to a deep link into the app.
  expect(activity).not.toContain("ACTION_VIEW");
  expect(activity).not.toContain("FLAG_ACTIVITY_NEW_TASK");
  const service = files["app/src/main/java/site/zoption/micwidget/MicWidgetLogService.kt"];
  expect(service).toContain("HeadlessJsTaskService()");
  expect(service).toContain('"ZoptionWidgetVoiceLog"');
  expect(service).toContain("START_NOT_STICKY");
  const provider = files["app/src/main/java/site/zoption/micwidget/MicWidgetProvider.kt"];
  expect(provider).toContain("setOnClickPendingIntent");
  expect(provider).toContain("onAppWidgetOptionsChanged");
  expect(provider).toContain("OPTION_APPWIDGET_MIN_WIDTH");
});

test("widget colors follow the app theme in light and dark", () => {
  const files = widgetFileContents();
  const light = files["app/src/main/res/values/zoption_mic_widget_colors.xml"];
  const dark = files["app/src/main/res/values-night/zoption_mic_widget_colors.xml"];
  expect(light).toContain('<color name="zoption_mic_widget_brand">#0A7556</color>');
  expect(dark).toContain('<color name="zoption_mic_widget_brand">#5FE3B8</color>');
});

test("widget UI uses a solid background, never a gradient", () => {
  const files = widgetFileContents();
  const background = files["app/src/main/res/drawable/zoption_mic_widget_background.xml"];
  expect(background).toContain("<solid");
  for (const contents of Object.values(files)) {
    expect(contents.toLowerCase()).not.toContain("gradient");
  }
});

test("writeWidgetFiles creates directory tree and writes files to platform root", async () => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "mic-widget-test-"));
  try {
    await writeWidgetFiles(tempDir);
    const manifestInfo = path.join(tempDir, "app/src/main/res/xml/zoption_mic_widget_info.xml");
    const stringsXml = path.join(tempDir, "app/src/main/res/values/zoption_mic_widget_strings.xml");
    const iconXml = path.join(tempDir, "app/src/main/res/drawable/zoption_mic_widget_icon.xml");
    const providerKt = path.join(
      tempDir,
      "app/src/main/java/site/zoption/micwidget/MicWidgetProvider.kt",
    );
    expect(fs.existsSync(manifestInfo)).toBe(true);
    expect(fs.existsSync(stringsXml)).toBe(true);
    expect(fs.existsSync(iconXml)).toBe(true);
    expect(fs.existsSync(providerKt)).toBe(true);
    expect(
      fs.existsSync(
        path.join(tempDir, "app/src/main/java/site/zoption/micwidget/MicWidgetLogService.kt"),
      ),
    ).toBe(true);
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
});

test("withMicWidget dangerous mod correctly extracts platformProjectRoot from modRequest", async () => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "mic-widget-mod-"));
  try {
    const config = withMicWidget({ name: "Test", slug: "test" });
    expect(typeof config.mods.android.dangerous).toBe("function");

    const modConfig = {
      ...config,
      modRequest: {
        platformProjectRoot: tempDir,
        projectRoot: "/fake/root",
        modName: "dangerous",
        platform: "android",
        introspect: false,
      },
    };
    await config.mods.android.dangerous(modConfig);

    const stringsXml = path.join(tempDir, "app/src/main/res/values/zoption_mic_widget_strings.xml");
    expect(fs.existsSync(stringsXml)).toBe(true);
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
});
