"use strict";

// Native Android home-screen mic widget (NATIVE approach, no new dependencies).
//
// Generates a minimal RemoteViews AppWidget via prebuild: tapping the widget
// mic opens a translucent activity that captures speech with the platform
// recognizer, builds intent JSON (expense vs reconcile, integer minor units),
// and deep-links into the expo-router `widget-intent` route for review.
// Jetpack Glance is intentionally not used: it is not a dependency and the
// widget is a single mic button, so RemoteViews keeps the footprint minimal.
//
// The activity needs no RECORD_AUDIO permission: recognition runs through the
// platform speech activity (RecognizerIntent), and STT absence degrades to a
// graceful in-app message instead of a crash.

const { withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const MARKER = "zoption-mic-widget";
const WIDGET_PACKAGE = "site.zoption.micwidget";
const PROVIDER_NAME = `${WIDGET_PACKAGE}.MicWidgetProvider`;
const ACTIVITY_NAME = `${WIDGET_PACKAGE}.MicWidgetVoiceActivity`;

const SCHEME_BY_VARIANT = {
  development: "zoption-dev",
  preview: "zoption-preview",
  production: "zoption",
};

/** Resolves the deep-link scheme for generated native sources. Pure (jest-tested). */
function resolveWidgetScheme(config) {
  const scheme = config && config.scheme;
  if (typeof scheme === "string" && scheme.length > 0) return scheme;
  if (Array.isArray(scheme) && typeof scheme[0] === "string") return scheme[0];
  const variant = process.env.APP_VARIANT;
  return SCHEME_BY_VARIANT[variant] || SCHEME_BY_VARIANT.development;
}

/** Idempotently registers the widget receiver + voice activity. Pure (jest-tested). */
function addMicWidgetToManifest(manifest) {
  const application = manifest.application && manifest.application[0];
  if (!application) {
    throw new Error(`${MARKER}: AndroidManifest has no <application> element.`);
  }
  application.receiver = application.receiver || [];
  application.activity = application.activity || [];

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
    application.activity.push({
      $: {
        "android:name": ACTIVITY_NAME,
        "android:exported": "true",
        "android:excludeFromRecents": "true",
        "android:launchMode": "singleTop",
        "android:noHistory": "true",
        "android:theme": "@android:style/Theme.Translucent.NoTitleBar",
      },
    });
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
    '  android:updatePeriodMillis="0"',
    '  android:initialLayout="@layout/zoption_mic_widget"',
    '  android:description="@string/zoption_mic_widget_description"',
    '  android:widgetCategory="home_screen" />',
    "",
  ].join("\n");
}

function widgetLayoutXml() {
  // Solid background only (no gradients anywhere in the widget UI).
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"',
    '  android:layout_width="match_parent"',
    '  android:layout_height="match_parent">',
    "  <ImageButton",
    '    android:id="@+id/zoption_mic_widget_button"',
    '    android:layout_width="match_parent"',
    '    android:layout_height="match_parent"',
    '    android:background="@drawable/zoption_mic_widget_background"',
    '    android:contentDescription="@string/zoption_mic_widget_tap_hint"',
    '    android:src="@android:drawable/ic_btn_speak_now"',
    '    android:scaleType="centerInside"',
    '    android:padding="12dp" />',
    "</FrameLayout>",
    "",
  ].join("\n");
}

function widgetBackgroundXml() {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    "<!-- Solid brand circle. -->",
    '<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="oval">',
    '  <solid android:color="#064E3B" />',
    "</shape>",
    "",
  ].join("\n");
}

function widgetStringsXml(scheme) {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    "<resources>",
    '  <string name="zoption_mic_widget_label">Zoption mic</string>',
    '  <string name="zoption_mic_widget_description">Tap to record a Zoption expense or balance update.</string>',
    '  <string name="zoption_mic_widget_tap_hint">Record a voice note for Zoption</string>',
    `  <string name="zoption_mic_widget_scheme">${scheme}</string>`,
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
    "import android.widget.RemoteViews",
    "",
    "/** Home-screen mic button. A tap opens the voice capture activity. */",
    "class MicWidgetProvider : AppWidgetProvider() {",
    "  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {",
    "    val resources = context.resources",
    "    val packageName = context.packageName",
    "    val layoutId = resources.getIdentifier(\"zoption_mic_widget\", \"layout\", packageName)",
    "    val buttonId = resources.getIdentifier(\"zoption_mic_widget_button\", \"id\", packageName)",
    "    for (widgetId in appWidgetIds) {",
    "      val tap = Intent(context, MicWidgetVoiceActivity::class.java).let { intent ->",
    "        PendingIntent.getActivity(",
    "          context,",
    "          widgetId,",
    "          intent,",
    "          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,",
    "        )",
    "      }",
    "      val views = RemoteViews(packageName, layoutId).apply {",
    "        setOnClickPendingIntent(buttonId, tap)",
    "      }",
    "      appWidgetManager.updateAppWidget(widgetId, views)",
    "    }",
    "  }",
    "}",
    "",
  ].join("\n");
}

function widgetIntentsKt() {
  return [
    `package ${WIDGET_PACKAGE}`,
    "",
    "import android.content.Context",
    "import android.net.Uri",
    "import org.json.JSONObject",
    "",
    "/**",
    " * Builds the widget-intent deep link and the best-effort intent JSON it",
    " * carries. The app re-validates the JSON with Zod and falls back to",
    " * parsing the raw transcript, so these rules intentionally mirror",
    " * `src/features/widget/widget-intent.ts` without duplicating its UI role.",
    " *",
    " * Shapes: expense {type, amountMinor, merchant, category?, account?} vs",
    " * reconcile {type, account, newBalanceMinor}. Amounts are integer minor",
    " * units (PHP centavos).",
    " */",
    "object MicWidgetIntents {",
    '  const val PARAM_PAYLOAD = "payload"',
    '  const val PARAM_TRANSCRIPT = "transcript"',
    '  const val PARAM_ERROR = "error"',
    '  const val ERROR_STT_UNAVAILABLE = "stt_unavailable"',
    '  const val ERROR_NO_SPEECH = "no_speech"',
    "",
    "  private val AMOUNT = Regex(\"\"\"₱?\\s*(\\d[\\d,]*(?:\\.\\d{1,2})?)\\s*(pesos?|php|₱)?\"\"\", RegexOption.IGNORE_CASE)",
    "  private val RECONCILE = Regex(\"\"\"\\b(reconcile|reconciliation|adjust(ment|ed)?( the balance)?|set( the)? balance|update( the)? balance|correct( the)? balance|true up)\\b\"\"\", RegexOption.IGNORE_CASE)",
    "  private val LEADER = Regex(\"\"\"^(spent|spend|paid|pay|log|logged|add|added|bought|buy|purchase|purchased|record|recorded)\\b\\s*\"\"\", RegexOption.IGNORE_CASE)",
    "  private val CURRENCY = Regex(\"\"\"\\b(pesos?|php)\\b|₱\"\"\", RegexOption.IGNORE_CASE)",
    "  private val FILLER = Regex(\"\"\"\\b(my|the|a|an|account|balance|is|to|at|of|on|for|now|current|please|today|yesterday)\\b\"\"\", RegexOption.IGNORE_CASE)",
    "",
    "  fun scheme(context: Context): String {",
    "    val id = context.resources.getIdentifier(\"zoption_mic_widget_scheme\", \"string\", context.packageName)",
    "    if (id != 0) return context.getString(id)",
    '    return "zoption"',
    "  }",
    "",
    "  fun widgetDeepLink(context: Context, payload: String?, transcript: String?, error: String?): Uri {",
    "    val builder = Uri.Builder().scheme(scheme(context)).authority(\"widget-intent\")",
    "    if (error != null) builder.appendQueryParameter(PARAM_ERROR, error)",
    "    if (payload != null) builder.appendQueryParameter(PARAM_PAYLOAD, payload)",
    "    if (transcript != null) builder.appendQueryParameter(PARAM_TRANSCRIPT, transcript)",
    "    return builder.build()",
    "  }",
    "",
    "  fun amountToMinor(raw: String): Long? {",
    '    val clean = raw.replace(",", "")',
    '    val parts = clean.split(".")',
    "    if (parts.size > 2) return null",
    "    val whole = parts[0].toLongOrNull() ?: return null",
    "    val fractionText = parts.getOrNull(1) ?: \"\"",
    "    if (fractionText.length > 2) return null",
    '    val fraction = if (fractionText.isEmpty()) 0L else (fractionText + "00").take(2).toLongOrNull() ?: return null',
    "    val total = whole * 100 + fraction",
    "    return if (total > 0) total else null",
    "  }",
    "",
    "  private fun tidy(text: String): String {",
    '    return text.split("\\\\s+".toRegex()).filter { it.isNotBlank() }.joinToString(" ").trim()',
    "  }",
    "",
    "  /** Best-effort transcript to intent JSON. Null means let the app parse the transcript. */",
    "  fun buildIntentJson(transcript: String): String? {",
    "    val text = transcript.trim()",
    "    if (text.isEmpty()) return null",
    "    val amount = AMOUNT.find(text) ?: return null",
    "    val marker = amount.groups[2]?.value",
    '    if (marker.isNullOrEmpty() && !amount.value.contains("₱")) return null',
    "    val minor = amountToMinor(amount.groups[1]?.value ?: return null) ?: return null",
    "    val withoutAmount = text.replace(amount.value, \" \")",
    "    if (RECONCILE.containsMatchIn(text)) {",
    '      val account = tidy(withoutAmount.replace(RECONCILE, " ").replace(CURRENCY, " ").replace(FILLER, " "))',
    "      if (account.isEmpty()) return null",
    '      return JSONObject().put("type", "reconcile").put("account", account).put("newBalanceMinor", minor).toString()',
    "    }",
    '    val merchant = tidy(withoutAmount.replace(CURRENCY, " ").replace(LEADER, "")).take(240)',
    "    if (merchant.isEmpty()) return null",
    '    return JSONObject().put("type", "expense").put("amountMinor", minor).put("merchant", merchant).toString()',
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
    " * platform speech activity, turns it into intent JSON, and deep-links to",
    " * the widget-intent route for review. Nothing is saved here.",
    " *",
    " * Graceful failure: when STT is unavailable the app still opens on the",
    " * widget-intent screen with an explanatory error; a user-cancelled",
    " * prompt simply finishes with no deep link.",
    " */",
    "class MicWidgetVoiceActivity : Activity() {",
    "  companion object {",
    "    private const val REQUEST_VOICE = 71",
    "  }",
    "",
    "  override fun onCreate(savedInstanceState: Bundle?) {",
    "    super.onCreate(savedInstanceState)",
    "    if (!SpeechRecognizer.isRecognitionAvailable(this)) {",
    "      openResult(error = MicWidgetIntents.ERROR_STT_UNAVAILABLE, payload = null, transcript = null)",
    "      finish()",
    "      return",
    "    }",
    "    val prompt = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {",
    "      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)",
    '      putExtra(RecognizerIntent.EXTRA_PROMPT, "Say an expense or a balance update")',
    "    }",
    "    try {",
    "      startActivityForResult(prompt, REQUEST_VOICE)",
    "    } catch (e: ActivityNotFoundException) {",
    "      openResult(error = MicWidgetIntents.ERROR_STT_UNAVAILABLE, payload = null, transcript = null)",
    "      finish()",
    "    }",
    "  }",
    "",
    "  @Deprecated(\"Required for startActivityForResult on all supported API levels.\")",
    "  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {",
    "    super.onActivityResult(requestCode, resultCode, data)",
    "    if (requestCode != REQUEST_VOICE) {",
    "      finish()",
    "      return",
    "    }",
    "    if (resultCode == RESULT_CANCELED) {",
    "      finish()",
    "      return",
    "    }",
    "    if (resultCode == RESULT_OK && data != null) {",
    "      val transcript = data",
    "        .getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)",
    "        ?.firstOrNull { it.isNotBlank() }",
    "        ?.trim()",
    "      if (transcript.isNullOrEmpty()) {",
    "        openResult(error = MicWidgetIntents.ERROR_NO_SPEECH, payload = null, transcript = null)",
    "      } else {",
    "        openResult(error = null, payload = MicWidgetIntents.buildIntentJson(transcript), transcript = transcript)",
    "      }",
    "    } else {",
    "      openResult(error = MicWidgetIntents.ERROR_NO_SPEECH, payload = null, transcript = null)",
    "    }",
    "    finish()",
    "  }",
    "",
    "  private fun openResult(error: String?, payload: String?, transcript: String?) {",
    "    val uri = MicWidgetIntents.widgetDeepLink(this, payload, transcript, error)",
    "    try {",
    "      startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))",
    "    } catch (e: ActivityNotFoundException) {",
    '      Toast.makeText(this, "Zoption could not open the voice result.", Toast.LENGTH_LONG).show()',
    "    }",
    "  }",
    "}",
    "",
  ].join("\n");
}

/** All generated files, keyed by path relative to the android project root. Pure (jest-tested). */
function widgetFileContents(scheme) {
  return {
    "app/src/main/res/xml/zoption_mic_widget_info.xml": widgetInfoXml(),
    "app/src/main/res/layout/zoption_mic_widget.xml": widgetLayoutXml(),
    "app/src/main/res/drawable/zoption_mic_widget_background.xml": widgetBackgroundXml(),
    "app/src/main/res/values/zoption_mic_widget_strings.xml": widgetStringsXml(scheme),
    "app/src/main/java/site/zoption/micwidget/MicWidgetProvider.kt": widgetProviderKt(),
    "app/src/main/java/site/zoption/micwidget/MicWidgetIntents.kt": widgetIntentsKt(),
    "app/src/main/java/site/zoption/micwidget/MicWidgetVoiceActivity.kt": widgetVoiceActivityKt(),
  };
}

async function writeWidgetFiles(projectRoot, scheme) {
  const files = widgetFileContents(scheme);
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(projectRoot, relativePath);
    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.promises.writeFile(absolutePath, contents);
  }
}

const withMicWidget = (config) => {
  const scheme = resolveWidgetScheme(config);
  const withManifest = withAndroidManifest(config, (mod) => {
    mod.modResults.manifest = addMicWidgetToManifest(mod.modResults.manifest);
    return mod;
  });
  return withDangerousMod(withManifest, [
    "android",
    async (mod) => {
      const projectRoot =
        mod.modRequest?.platformProjectRoot ||
        mod.modRequest?.projectRoot ||
        mod.modPath;
      if (!projectRoot) {
        throw new Error("Unable to resolve Android platform project root from modRequest");
      }
      await writeWidgetFiles(projectRoot, scheme);
      return mod;
    },
  ]);
};

module.exports = withMicWidget;
module.exports.resolveWidgetScheme = resolveWidgetScheme;
module.exports.addMicWidgetToManifest = addMicWidgetToManifest;
module.exports.widgetFileContents = widgetFileContents;
module.exports.writeWidgetFiles = writeWidgetFiles;
