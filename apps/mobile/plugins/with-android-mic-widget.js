"use strict";

// Native Android home-screen mic widget (NATIVE approach, no new dependencies).
//
// Generates a minimal RemoteViews AppWidget via prebuild: tapping the widget
// mic opens a translucent activity that captures speech with the platform
// recognizer and hands the transcript to a headless JS task
// (MicWidgetLogService), which sends it to Zoption AI and logs every entry it
// names without opening the app. The widget never opens the app itself; the
// `widget-intent` route is only reached from a "review" notification tap.
// Jetpack Glance is intentionally not used: it is not a dependency and the
// widget is a single mic button, so RemoteViews keeps the footprint minimal.
//
// The activity needs no RECORD_AUDIO permission: recognition runs through the
// platform speech activity (RecognizerIntent), and STT absence degrades to a
// graceful in-app message instead of a crash. Package visibility for
// android.speech.RecognitionService is declared alongside the widget.

const { withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const MARKER = "zoption-mic-widget";
const RECOGNITION_SERVICE_ACTION = "android.speech.RecognitionService";
const WIDGET_PACKAGE = "site.zoption.micwidget";
const PROVIDER_NAME = `${WIDGET_PACKAGE}.MicWidgetProvider`;
const ACTIVITY_NAME = `${WIDGET_PACKAGE}.MicWidgetVoiceActivity`;
const SERVICE_NAME = `${WIDGET_PACKAGE}.MicWidgetLogService`;

/** Idempotently registers the widget receiver + voice activity. Pure (jest-tested). */
function addMicWidgetToManifest(manifest) {
  const application = manifest.application && manifest.application[0];
  if (!application) {
    throw new Error(`${MARKER}: AndroidManifest has no <application> element.`);
  }
  application.receiver = application.receiver || [];
  application.activity = application.activity || [];
  application.service = application.service || [];

  const hasReceiver = application.receiver.some(
    (entry) => entry.$ && entry.$["android:name"] === PROVIDER_NAME,
  );
  if (!hasReceiver) {
    application.receiver.push({
      $: {
        "android:name": PROVIDER_NAME,
        "android:exported": "false",
        "android:label": "@string/zoption_mic_widget_label",
      },
      "intent-filter": [
        { action: [{ $: { "android:name": "android.appwidget.action.APPWIDGET_UPDATE" } }] },
      ],
      "meta-data": [
        {
          $: {
            "android:name": "android.appwidget.provider",
            "android:resource": "@xml/zoption_mic_widget_info",
          },
        },
      ],
    });
  }

  const hasActivity = application.activity.some(
    (entry) => entry.$ && entry.$["android:name"] === ACTIVITY_NAME,
  );
  if (!hasActivity) {
    // Not exported: nothing outside this app may launch the capture activity.
    // The widget's own PendingIntent.getActivity still works because a
    // PendingIntent is dispatched with its creator's identity, and the
    // activity lives in this same UID.
    application.activity.push({
      $: {
        "android:name": ACTIVITY_NAME,
        "android:exported": "false",
        "android:excludeFromRecents": "true",
        "android:launchMode": "singleTop",
        // Deliberately no android:noHistory: the platform finishes no-history
        // activities as soon as they stop, and a stopped activity never
        // receives onActivityResult. Any device whose recognizer UI covers this
        // activity instead of floating over it therefore dropped the transcript
        // silently. MicWidgetVoiceActivity finishes itself on every path.
        "android:theme": "@android:style/Theme.Translucent.NoTitleBar",
      },
    });
  }

  const hasService = application.service.some(
    (entry) => entry.$ && entry.$["android:name"] === SERVICE_NAME,
  );
  if (!hasService) {
    // Not exported: only this app's capture activity may start the logging task.
    application.service.push({
      $: { "android:name": SERVICE_NAME, "android:exported": "false" },
    });
  }
  return manifest;
}

/**
 * Declares package visibility for the platform speech recognizer.
 *
 * Android 11+ filters PackageManager.queryIntentServices, and
 * SpeechRecognizer.isRecognitionAvailable() is exactly that query, so without
 * this the widget's availability guard can read false forever and every tap
 * reports that voice input is unavailable. Idempotent, and merged into an
 * existing <queries> element because a manifest may only declare one.
 */
function addSpeechRecognitionQueries(manifest) {
  const queries = manifest.queries || (manifest.queries = []);
  const declared = queries.some((entry) =>
    (entry.intent || []).some((intent) =>
      (intent.action || []).some(
        (action) => action.$ && action.$["android:name"] === RECOGNITION_SERVICE_ACTION,
      ),
    ),
  );
  if (declared) return manifest;
  const intent = {
    action: [{ $: { "android:name": RECOGNITION_SERVICE_ACTION } }],
  };
  const existing = queries[0];
  if (existing) {
    existing.intent = existing.intent || [];
    existing.intent.push(intent);
  } else {
    queries.push({ intent: [intent] });
  }
  return manifest;
}

function widgetInfoXml() {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"`,
    '  android:minWidth="48dp"',
    '  android:minHeight="48dp"',
    '  android:targetCellWidth="1"',
    '  android:targetCellHeight="1"',
    '  android:resizeMode="horizontal|vertical"',
    '  android:minResizeWidth="48dp"',
    '  android:minResizeHeight="48dp"',
    '  android:maxResizeWidth="512dp"',
    '  android:maxResizeHeight="512dp"',
    '  android:updatePeriodMillis="0"',
    '  android:initialLayout="@layout/zoption_mic_widget"',
    '  android:previewLayout="@layout/zoption_mic_widget"',
    '  android:description="@string/zoption_mic_widget_description"',
    '  android:widgetCategory="home_screen" />',
    "",
  ].join("\n");
}

function widgetIconXml() {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    "<!-- Crisp, modern vector icon for the Zoption voice widget. -->",
    '<vector xmlns:android="http://schemas.android.com/apk/res/android"',
    '  android:width="28dp"',
    '  android:height="28dp"',
    '  android:viewportWidth="24"',
    '  android:viewportHeight="24">',
    "  <path",
    '    android:fillColor="#FFFFFF"',
    '    android:pathData="M12,2 C9.79,2 8,3.79 8,6 L8,10 C8,12.21 9.79,14 12,14 C14.21,14 16,12.21 16,10 L16,6 C16,3.79 14.21,2 12,2 Z" />',
    "  <path",
    '    android:strokeColor="#064E3B"',
    '    android:strokeWidth="1.5"',
    '    android:strokeLineCap="round"',
    '    android:strokeLineJoin="round"',
    '    android:pathData="M10,5.5 L14,5.5 L10,10.5 L14,10.5" />',
    "  <path",
    '    android:strokeColor="#FFFFFF"',
    '    android:strokeWidth="2.2"',
    '    android:strokeLineCap="round"',
    '    android:strokeLineJoin="round"',
    '    android:pathData="M5,10 C5,13.87 8.13,17 12,17 C15.87,17 19,13.87 19,10" />',
    "  <path",
    '    android:strokeColor="#FFFFFF"',
    '    android:strokeWidth="2.2"',
    '    android:strokeLineCap="round"',
    '    android:pathData="M12,17 L12,21" />',
    "  <path",
    '    android:strokeColor="#FFFFFF"',
    '    android:strokeWidth="2.2"',
    '    android:strokeLineCap="round"',
    '    android:pathData="M8,21 L16,21" />',
    "</vector>",
    "",
  ].join("\n");
}

function widgetLayoutXml() {
  // Solid background only (no gradients anywhere in the widget UI).
  // Uses a centered container that adapts between a 1x1 circle and an expanded pill.
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"',
    '  android:layout_width="match_parent"',
    '  android:layout_height="match_parent"',
    '  android:padding="4dp">',
    "  <LinearLayout",
    '    android:id="@+id/zoption_mic_widget_button"',
    '    android:layout_width="wrap_content"',
    '    android:layout_height="wrap_content"',
    '    android:layout_gravity="center"',
    '    android:background="@drawable/zoption_mic_widget_background"',
    '    android:clickable="true"',
    '    android:focusable="true"',
    '    android:gravity="center"',
    '    android:orientation="horizontal"',
    '    android:minWidth="52dp"',
    '    android:minHeight="52dp"',
    '    android:paddingStart="12dp"',
    '    android:paddingEnd="12dp"',
    '    android:paddingTop="12dp"',
    '    android:paddingBottom="12dp"',
    '    android:contentDescription="@string/zoption_mic_widget_tap_hint">',
    "    <ImageView",
    '      android:id="@+id/zoption_mic_widget_icon"',
    '      android:layout_width="28dp"',
    '      android:layout_height="28dp"',
    '      android:src="@drawable/zoption_mic_widget_icon"',
    '      android:scaleType="centerInside"',
    '      android:contentDescription="@null" />',
    "    <TextView",
    '      android:id="@+id/zoption_mic_widget_label"',
    '      android:layout_width="wrap_content"',
    '      android:layout_height="wrap_content"',
    '      android:layout_marginStart="8dp"',
    '      android:text="@string/zoption_mic_widget_action_label"',
    '      android:textColor="#FFFFFF"',
    '      android:textSize="14sp"',
    '      android:textStyle="bold"',
    '      android:visibility="gone"',
    '      android:maxLines="1"',
    '      android:ellipsize="end" />',
    "  </LinearLayout>",
    "</FrameLayout>",
    "",
  ].join("\n");
}

function widgetBackgroundXml() {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    "<!-- Solid brand rounded shape. -->",
    '<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">',
    '  <corners android:radius="28dp" />',
    '  <solid android:color="#064E3B" />',
    "</shape>",
    "",
  ].join("\n");
}

function widgetStringsXml() {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    "<resources>",
    '  <string name="zoption_mic_widget_label">Zoption mic</string>',
    '  <string name="zoption_mic_widget_description">Tap and say what you spent or earned. Zoption AI logs it without opening the app.</string>',
    '  <string name="zoption_mic_widget_tap_hint">Record a voice note for Zoption</string>',
    '  <string name="zoption_mic_widget_action_label">Speak transaction</string>',
    "</resources>",
    "",
  ].join("\n");
}

function widgetProviderKt() {
  return [
    `package ${WIDGET_PACKAGE}`,
    "",
    "import android.app.PendingIntent",
    "import android.appwidget.AppWidgetManager",
    "import android.appwidget.AppWidgetProvider",
    "import android.content.Context",
    "import android.content.Intent",
    "import android.os.Bundle",
    "import android.view.View",
    "import android.widget.RemoteViews",
    "",
    "/**",
    " * Home-screen mic widget. A tap opens the voice capture activity.",
    " * Supports dynamic resizing: displays a centered circular mic at 1x1,",
    ' * and expands with a "Speak transaction" label when resized wider.',
    " */",
    "class MicWidgetProvider : AppWidgetProvider() {",
    "  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {",
    "    for (widgetId in appWidgetIds) {",
    "      updateWidget(context, appWidgetManager, widgetId)",
    "    }",
    "  }",
    "",
    "  override fun onAppWidgetOptionsChanged(",
    "    context: Context,",
    "    appWidgetManager: AppWidgetManager,",
    "    appWidgetId: Int,",
    "    newOptions: Bundle,",
    "  ) {",
    "    super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions)",
    "    updateWidget(context, appWidgetManager, appWidgetId)",
    "  }",
    "",
    "  private fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, widgetId: Int) {",
    "    val resources = context.resources",
    "    val packageName = context.packageName",
    '    val layoutId = resources.getIdentifier("zoption_mic_widget", "layout", packageName)',
    '    val buttonId = resources.getIdentifier("zoption_mic_widget_button", "id", packageName)',
    '    val labelId = resources.getIdentifier("zoption_mic_widget_label", "id", packageName)',
    "    val tap = Intent(context, MicWidgetVoiceActivity::class.java).let { intent ->",
    "      PendingIntent.getActivity(",
    "        context,",
    "        widgetId,",
    "        intent,",
    "        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,",
    "      )",
    "    }",
    "    val options = appWidgetManager.getAppWidgetOptions(widgetId)",
    "    val minWidth = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH) ?: 0",
    "    val showLabel = minWidth >= 110",
    "    val views = RemoteViews(packageName, layoutId).apply {",
    "      setOnClickPendingIntent(buttonId, tap)",
    "      if (labelId != 0) {",
    "        setViewVisibility(labelId, if (showLabel) View.VISIBLE else View.GONE)",
    "      }",
    "    }",
    "    appWidgetManager.updateAppWidget(widgetId, views)",
    "  }",
    "}",
    "",
  ].join("\n");
}

function widgetLogServiceKt() {
  return [
    `package ${WIDGET_PACKAGE}`,
    "",
    "import android.content.Intent",
    "import com.facebook.react.HeadlessJsTaskService",
    "import com.facebook.react.bridge.Arguments",
    "import com.facebook.react.jstasks.HeadlessJsTaskConfig",
    "",
    "/**",
    " * Runs the `ZoptionWidgetVoiceLog` JS task (src/features/widget/widget-voice-task.ts)",
    " * with the transcript the voice activity captured. The task sends it to Zoption AI",
    " * and saves every entry it names; no screen opens. Every parsing and logging rule",
    " * lives in the app, so there is no native mirror to drift out of sync.",
    " */",
    "class MicWidgetLogService : HeadlessJsTaskService() {",
    "  companion object {",
    '    const val EXTRA_TRANSCRIPT = "transcript"',
    '    private const val TASK_NAME = "ZoptionWidgetVoiceLog"',
    "    private const val TASK_TIMEOUT_MS = 60_000L",
    "  }",
    "",
    "  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {",
    "    val transcript = intent?.getStringExtra(EXTRA_TRANSCRIPT)?.takeIf { it.isNotBlank() }",
    "      ?: return null",
    '    val data = Arguments.createMap().apply { putString("transcript", transcript) }',
    "    // Allowed in the foreground: the app may already be open when the widget is used.",
    "    return HeadlessJsTaskConfig(TASK_NAME, data, TASK_TIMEOUT_MS, true)",
    "  }",
    "",
    "  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {",
    "    super.onStartCommand(intent, flags, startId)",
    "    // The default redelivers the intent if the process dies mid-task, which would",
    "    // log the same spoken note twice.",
    "    return START_NOT_STICKY",
    "  }",
    "}",
    "",
  ].join("\n");
}

function widgetVoiceActivityKt() {
  return [
    `package ${WIDGET_PACKAGE}`,
    "",
    "import android.app.Activity",
    "import android.content.ActivityNotFoundException",
    "import android.content.Intent",
    "import android.os.Bundle",
    "import android.speech.RecognizerIntent",
    "import android.speech.SpeechRecognizer",
    "import android.widget.Toast",
    "",
    "/**",
    " * Tap-to-talk without opening the app. Captures one utterance through the",
    " * platform speech activity and hands the transcript to MicWidgetLogService,",
    " * which logs it in the background. Nothing is saved here, and no screen of",
    " * the app opens: failures are a toast, and the result is a notification.",
    " */",
    "class MicWidgetVoiceActivity : Activity() {",
    "  companion object {",
    "    private const val REQUEST_VOICE = 71",
    "  }",
    "",
    "  override fun onCreate(savedInstanceState: Bundle?) {",
    "    super.onCreate(savedInstanceState)",
    "    if (!SpeechRecognizer.isRecognitionAvailable(this)) {",
    '      toast("Voice input is not available on this device.")',
    "      finish()",
    "      return",
    "    }",
    "    val prompt = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {",
    "      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)",
    '      putExtra(RecognizerIntent.EXTRA_PROMPT, "Say what you spent or earned")',
    "    }",
    "    try {",
    "      startActivityForResult(prompt, REQUEST_VOICE)",
    "    } catch (e: ActivityNotFoundException) {",
    '      toast("Voice input is not available on this device.")',
    "      finish()",
    "    }",
    "  }",
    "",
    '  @Deprecated("Required for startActivityForResult on all supported API levels.")',
    "  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {",
    "    super.onActivityResult(requestCode, resultCode, data)",
    "    if (requestCode == REQUEST_VOICE && resultCode != RESULT_CANCELED) {",
    "      val transcript = if (resultCode == RESULT_OK) {",
    "        data",
    "          ?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)",
    "          ?.firstOrNull { it.isNotBlank() }",
    "          ?.trim()",
    "      } else {",
    "        null",
    "      }",
    "      if (transcript.isNullOrEmpty()) {",
    '        toast("No speech was recognized. Tap the mic and try again.")',
    "      } else {",
    "        logInBackground(transcript)",
    "      }",
    "    }",
    "    finish()",
    "  }",
    "",
    "  private fun logInBackground(transcript: String) {",
    "    try {",
    "      startService(",
    "        Intent(this, MicWidgetLogService::class.java)",
    "          .putExtra(MicWidgetLogService.EXTRA_TRANSCRIPT, transcript),",
    "      )",
    '      toast("Sending to Zoption AI...")',
    "    } catch (e: RuntimeException) {",
    '      toast("Zoption could not log the voice note.")',
    "    }",
    "  }",
    "",
    "  private fun toast(message: String) {",
    "    Toast.makeText(this, message, Toast.LENGTH_LONG).show()",
    "  }",
    "}",
    "",
  ].join("\n");
}

/** All generated files, keyed by path relative to the android project root. Pure (jest-tested). */
function widgetFileContents() {
  return {
    "app/src/main/res/xml/zoption_mic_widget_info.xml": widgetInfoXml(),
    "app/src/main/res/layout/zoption_mic_widget.xml": widgetLayoutXml(),
    "app/src/main/res/drawable/zoption_mic_widget_background.xml": widgetBackgroundXml(),
    "app/src/main/res/drawable/zoption_mic_widget_icon.xml": widgetIconXml(),
    "app/src/main/res/values/zoption_mic_widget_strings.xml": widgetStringsXml(),
    "app/src/main/java/site/zoption/micwidget/MicWidgetProvider.kt": widgetProviderKt(),
    "app/src/main/java/site/zoption/micwidget/MicWidgetLogService.kt": widgetLogServiceKt(),
    "app/src/main/java/site/zoption/micwidget/MicWidgetVoiceActivity.kt": widgetVoiceActivityKt(),
  };
}

async function writeWidgetFiles(projectRoot) {
  const files = widgetFileContents();
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(projectRoot, relativePath);
    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.promises.writeFile(absolutePath, contents);
  }
}

const withMicWidget = (config) => {
  const withManifest = withAndroidManifest(config, (mod) => {
    mod.modResults.manifest = addSpeechRecognitionQueries(mod.modResults.manifest);
    mod.modResults.manifest = addMicWidgetToManifest(mod.modResults.manifest);
    return mod;
  });
  return withDangerousMod(withManifest, [
    "android",
    async (mod) => {
      const projectRoot =
        mod.modRequest?.platformProjectRoot || mod.modRequest?.projectRoot || mod.modPath;
      if (!projectRoot) {
        throw new Error("Unable to resolve Android platform project root from modRequest");
      }
      await writeWidgetFiles(projectRoot);
      return mod;
    },
  ]);
};

module.exports = withMicWidget;
module.exports.addMicWidgetToManifest = addMicWidgetToManifest;
module.exports.addSpeechRecognitionQueries = addSpeechRecognitionQueries;
module.exports.widgetFileContents = widgetFileContents;
module.exports.widgetIconXml = widgetIconXml;
module.exports.writeWidgetFiles = writeWidgetFiles;
