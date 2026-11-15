import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useId, useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { withTapSound } from "@/features/sounds/sound-effects";
import { FormField } from "@/ui/components/FormField";
import { useZoptionTheme } from "@/ui/theme-provider";
import { radii, spacing, touchTarget, typography } from "@/ui/tokens";
import { categoryColorOptions, hexToHsv, hsvToHex, type Hsv } from "./category-colors";

// NativeWind's Pressable wrapper replaces a style function with an empty style,
// so every Pressable here takes a plain style array. Colored dots are drawn
// with SVG fills rather than per-item backgroundColor styles.

const HEX_PATTERN = /^#[0-9A-F]{6}$/;
const SWATCH_SIZE = 32;
const CUSTOM_DOT_SIZE = 20;
const THUMB_SIZE = 22;
const TRACK_HEIGHT = 14;
const STEP = 0.05;

interface CategoryColorPickerProps {
  color: string;
  customOpen: boolean;
  disabled: boolean;
  onChange: (color: string) => void;
  onCustomOpenChange: (open: boolean) => void;
}

export function CategoryColorPicker({
  color,
  customOpen,
  disabled,
  onChange,
  onCustomOpenChange,
}: CategoryColorPickerProps) {
  const theme = useZoptionTheme();
  const preset = categoryColorOptions.find(
    (option) => option.value.toLowerCase() === color.toLowerCase(),
  );
  // The sliders keep their own hue so dragging vividness to zero (grey) does
  // not snap the hue slider back to red. A typed hex code that no longer
  // matches the sliders wins, so the hex field and sliders stay in step.
  const [sliderHsv, setSliderHsv] = useState<Hsv>(
    () => hexToHsv(color) ?? { h: 174, s: 0.87, v: 0.46 },
  );
  const hsv = hsvToHex(sliderHsv) === color ? sliderHsv : (hexToHsv(color) ?? sliderHsv);
  const setHsv = (next: Hsv): void => {
    setSliderHsv(next);
    onChange(hsvToHex(next));
  };
  const opacity = disabled ? 0.5 : 1;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={[typography.label, { color: theme.colors.text }]}>Color</Text>
        <Text numberOfLines={1} style={[typography.caption, { color: theme.colors.textMuted }]}>
          {preset ? preset.name : HEX_PATTERN.test(color) ? `Custom ${color}` : "Custom"}
        </Text>
      </View>
      <View accessibilityLabel="Category colors" style={[styles.swatchRow, { opacity }]}>
        {categoryColorOptions.map((option) => {
          const selected = option === preset;
          return (
            <Pressable
              key={option.value}
              accessibilityLabel={`Use ${option.name} for this category`}
              accessibilityRole="button"
              accessibilityState={{ disabled, selected }}
              disabled={disabled}
              onPress={withTapSound(() => {
                onChange(option.value);
                onCustomOpenChange(false);
              })}
              style={styles.swatchCell}
            >
              <View
                accessibilityElementsHidden
                style={[
                  styles.swatchRing,
                  { borderColor: selected ? theme.colors.text : "transparent" },
                ]}
              >
                <ColorDot color={option.value} size={SWATCH_SIZE}>
                  {selected ? (
                    <MaterialCommunityIcons color="#FFFFFF" name="check" size={17} />
                  ) : null}
                </ColorDot>
              </View>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled, expanded: customOpen }}
        disabled={disabled}
        onPress={withTapSound(() => onCustomOpenChange(!customOpen))}
        style={[styles.customToggle, { opacity }]}
      >
        {!preset && HEX_PATTERN.test(color) ? (
          <ColorDot color={color} size={CUSTOM_DOT_SIZE} />
        ) : (
          <MaterialCommunityIcons color={theme.colors.brand} name="palette-outline" size={20} />
        )}
        <Text style={[typography.label, { color: theme.colors.brand }]}>
          {customOpen ? "Hide custom color" : "Pick a custom color"}
        </Text>
      </Pressable>
      {customOpen ? (
        <View style={styles.custom}>
          <ColorSlider
            disabled={disabled}
            label="Hue"
            thumbColor={color}
            stops={[0, 60, 120, 180, 240, 300, 360].map((h) => hsvToHex({ h, s: 1, v: 1 }))}
            value={hsv.h / 360}
            onChange={(value) => setHsv({ ...hsv, h: value * 360 })}
          />
          <ColorSlider
            disabled={disabled}
            label="Vividness"
            thumbColor={color}
            stops={[hsvToHex({ ...hsv, s: 0 }), hsvToHex({ ...hsv, s: 1 })]}
            value={hsv.s}
            onChange={(value) => setHsv({ ...hsv, s: value })}
          />
          <ColorSlider
            disabled={disabled}
            label="Brightness"
            thumbColor={color}
            stops={["#000000", hsvToHex({ ...hsv, v: 1 })]}
            value={hsv.v}
            onChange={(value) => setHsv({ ...hsv, v: value })}
          />
          <FormField
            error={
              color && !HEX_PATTERN.test(color)
                ? "Use # followed by six characters from 0-9 or A-F."
                : undefined
            }
            label="Hex code"
            value={color}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!disabled}
            hint="Or type an exact code, such as #0F766E."
            maxLength={7}
            onChangeText={(value) => onChange(value.toUpperCase())}
          />
        </View>
      ) : null}
    </View>
  );
}

interface ColorSliderProps {
  label: string;
  /** Hex colors spread evenly along the track, left to right. */
  stops: string[];
  /** 0 at the left end, 1 at the right. */
  value: number;
  /** The chosen color, so each thumb doubles as a live preview. */
  thumbColor: string;
  disabled: boolean;
  onChange: (value: number) => void;
}

function ColorSlider({ label, stops, value, thumbColor, disabled, onChange }: ColorSliderProps) {
  const theme = useZoptionTheme();
  const gradientId = useId().replace(/:/g, "");
  const [width, setWidth] = useState(0);
  // Page x of the track's left edge, taken when a drag starts so moves can be
  // measured in page coordinates whatever view sits under the finger.
  const trackLeft = useRef(0);
  const usable = Math.max(width - THUMB_SIZE, 1);
  const clamp = (next: number): number => Math.min(1, Math.max(0, next));
  const valueAt = (pageX: number): number =>
    clamp((pageX - trackLeft.current - THUMB_SIZE / 2) / usable);

  return (
    <View
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      accessibilityLabel={label}
      accessibilityRole="adjustable"
      accessibilityState={{ disabled }}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "increment") onChange(clamp(value + STEP));
        if (event.nativeEvent.actionName === "decrement") onChange(clamp(value - STEP));
      }}
      style={[styles.slider, { opacity: disabled ? 0.5 : 1 }]}
    >
      <Text style={[typography.caption, styles.sliderLabel, { color: theme.colors.textMuted }]}>
        {label}
      </Text>
      <View
        testID={`color-slider-${label}`}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => !disabled}
        onMoveShouldSetResponder={() => !disabled}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(event: GestureResponderEvent) => {
          trackLeft.current = event.nativeEvent.pageX - event.nativeEvent.locationX;
          onChange(valueAt(event.nativeEvent.pageX));
        }}
        onResponderMove={(event: GestureResponderEvent) =>
          onChange(valueAt(event.nativeEvent.pageX))
        }
        style={styles.track}
      >
        <Svg height={TRACK_HEIGHT} pointerEvents="none" width="100%">
          <Defs>
            <LinearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
              {stops.map((stop, index) => (
                <Stop key={index} offset={index / (stops.length - 1)} stopColor={stop} />
              ))}
            </LinearGradient>
          </Defs>
          <Rect
            fill={`url(#${gradientId})`}
            height={TRACK_HEIGHT}
            rx={TRACK_HEIGHT / 2}
            width="100%"
          />
        </Svg>
        <View pointerEvents="none" style={[styles.thumb, { left: value * usable }]}>
          <Svg height={THUMB_SIZE} width={THUMB_SIZE}>
            <Circle
              cx={THUMB_SIZE / 2}
              cy={THUMB_SIZE / 2}
              fill={HEX_PATTERN.test(thumbColor) ? thumbColor : "#FFFFFF"}
              r={THUMB_SIZE / 2 - 2}
              stroke="#FFFFFF"
              strokeWidth={3}
            />
            <Circle
              cx={THUMB_SIZE / 2}
              cy={THUMB_SIZE / 2}
              fill="none"
              r={THUMB_SIZE / 2 - 0.5}
              stroke="#00000055"
              strokeWidth={1}
            />
          </Svg>
        </View>
      </View>
    </View>
  );
}

function ColorDot({
  color,
  size,
  children,
}: {
  color: string;
  size: number;
  children?: ReactNode;
}) {
  return (
    <View style={[styles.dot, { width: size, height: size }]}>
      <Svg height={size} style={StyleSheet.absoluteFill} width={size}>
        <Circle cx={size / 2} cy={size / 2} fill={color} r={size / 2} />
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.xs },
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  swatchRow: { flexDirection: "row" },
  // Every cell takes an equal share of the row, so spacing never depends on a label.
  swatchCell: {
    flex: 1,
    height: touchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  swatchRing: {
    padding: 2,
    borderWidth: 2,
    borderRadius: SWATCH_SIZE,
  },
  dot: { alignItems: "center", justifyContent: "center" },
  customToggle: {
    minHeight: touchTarget,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radii.sm,
  },
  custom: { gap: spacing.xs },
  slider: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sliderLabel: { width: 72 },
  track: { flex: 1, height: touchTarget, justifyContent: "center" },
  thumb: {
    position: "absolute",
    top: (touchTarget - THUMB_SIZE) / 2,
  },
});
