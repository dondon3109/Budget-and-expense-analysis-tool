"use strict";

const {
  addMicWidgetToManifest,
  resolveWidgetScheme,
  widgetFileContents,
} = require("./with-android-mic-widget");

function fakeManifest() {
  return { application: [{ $: { "android:name": ".MainApplication" }, activity: [], receiver: [] }] };
}

test("resolves the deep-link scheme per variant", () => {
  expect(resolveWidgetScheme({ scheme: "zoption-preview" })).toBe("zoption-preview");
  expect(resolveWidgetScheme({ scheme: ["zoption-dev"] })).toBe("zoption-dev");
  expect(resolveWidgetScheme({})).toBe("zoption-dev");
});

test("registers the widget receiver and voice activity exactly once", () => {
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
  expect(receivers).toHaveLength(1);
  expect(activities).toHaveLength(1);
  expect(receivers[0]["intent-filter"][0].action[0].$["android:name"]).toBe(
    "android.appwidget.action.APPWIDGET_UPDATE",
  );
  expect(receivers[0]["meta-data"][0].$["android:resource"]).toBe(
    "@xml/zoption_mic_widget_info",
  );
});

test("generated widget carries the scheme and deep-links the intent route", () => {
  const files = widgetFileContents("zoption-preview");
  expect(Object.keys(files)).toHaveLength(7);
  expect(files["app/src/main/res/values/zoption_mic_widget_strings.xml"]).toContain(
    "<string name=\"zoption_mic_widget_scheme\">zoption-preview</string>",
  );
  const intents = files["app/src/main/java/site/zoption/micwidget/MicWidgetIntents.kt"];
  expect(intents).toContain('authority("widget-intent")');
  expect(intents).toContain("PARAM_PAYLOAD");
  expect(intents).toContain('"type", "reconcile"');
  expect(intents).toContain('"type", "expense"');
  expect(intents).toContain("newBalanceMinor");
  expect(intents).toContain("amountMinor");
  const activity =
    files["app/src/main/java/site/zoption/micwidget/MicWidgetVoiceActivity.kt"];
  expect(activity).toContain("RecognizerIntent.ACTION_RECOGNIZE_SPEECH");
  expect(activity).toContain("isRecognitionAvailable");
  expect(activity).toContain("ERROR_STT_UNAVAILABLE");
  const provider = files["app/src/main/java/site/zoption/micwidget/MicWidgetProvider.kt"];
  expect(provider).toContain("setOnClickPendingIntent");
});

test("widget UI uses a solid background, never a gradient", () => {
  const files = widgetFileContents("zoption-dev");
  const background = files["app/src/main/res/drawable/zoption_mic_widget_background.xml"];
  expect(background).toContain("<solid");
  for (const contents of Object.values(files)) {
    expect(contents.toLowerCase()).not.toContain("gradient");
  }
});
