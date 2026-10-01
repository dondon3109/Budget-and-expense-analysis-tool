// The widget's background task has to be registered before any screen mounts, so
// the entry loads it ahead of the router. Keep both bare imports: they have no
// binding to inline, so they must still run eagerly (see metro inlineRequires).
import "./src/features/widget/widget-voice-task";
import "expo-router/entry";
