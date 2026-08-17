import type { CashflowTrend } from "@zoption/shared";
import { useMemo, useState } from "react";
import { Dimensions, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";

import { spacing, typography } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";
import { MoneyValue } from "./MoneyValue";
import {
  CALLOUT_HALF_WIDTH,
  CHART_GUTTER_BOTTOM,
  CHART_GUTTER_LEFT,
  CHART_GUTTER_RIGHT,
  CHART_GUTTER_TOP,
  CHART_HEIGHT,
  areaPathD,
  buildChartGeometry,
  chartSummaryLabel,
  compactDateLabel,
  createCashflowAxis,
  formatAxisTick,
  fullDateLabel,
  indexForPosition,
  linePathD,
  xAxisInterval,
} from "./cashflow-chart-geometry";

const TAP_SLOP_PX = 8;

interface CashflowChartProps {
  cashflow: CashflowTrend;
}

/**
 * Touch-first money in/out chart for the native app. Pure react-native-svg so
 * it works on Android and iOS without a webview: tap a point to pin the
 * values callout, tap the same point again to dismiss it, or drag across the
 * chart to scrub. Vertical swipes keep scrolling the screen.
 */
export function CashflowChart({ cashflow }: CashflowChartProps) {
  const theme = useZoptionTheme();
  const [width, setWidth] = useState(() =>
    Math.max(0, Dimensions.get("window").width - spacing.md * 4),
  );
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const points = cashflow.points;
  const maximumMinor = points.reduce(
    (largest, point) => Math.max(largest, point.incomeMinor, point.expenseMinor),
    0,
  );
  const axis = useMemo(() => createCashflowAxis(maximumMinor), [maximumMinor]);
  const geometry = buildChartGeometry(width, points.length, axis.domainMax);
  const tickInterval = xAxisInterval(points.length, cashflow.granularity);

  const incomeD = linePathD(points, (point) => point.incomeMinor, geometry);
  const expenseD = linePathD(points, (point) => point.expenseMinor, geometry);

  function selectAt(x: number): void {
    const index = indexForPosition(x, width, points.length);
    if (index !== null) setSelectedIndex(index);
  }

  function toggleAt(x: number): void {
    const index = indexForPosition(x, width, points.length);
    if (index === null) return;
    setSelectedIndex((current) => (current === index ? null : index));
  }

  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .onBegin((event) => selectAt(event.x))
    .onUpdate((event) => selectAt(event.x))
    .onEnd((event) => {
      if (
        Math.abs(event.translationX) < TAP_SLOP_PX &&
        Math.abs(event.translationY) < TAP_SLOP_PX
      ) {
        toggleAt(event.x);
      }
    });
  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((event) => toggleAt(event.x));
  const gesture = Gesture.Race(tap, pan);

  const selectedPoint = selectedIndex !== null ? points[selectedIndex] : undefined;
  const activeX = selectedIndex !== null ? geometry.xAt(selectedIndex) : 0;
  const calloutLeft = Math.min(
    Math.max(CALLOUT_HALF_WIDTH, activeX),
    Math.max(CALLOUT_HALF_WIDTH, width - CALLOUT_HALF_WIDTH),
  );

  return (
    <View
      style={styles.wrap}
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
    >
      {width > 0 && selectedPoint ? (
        <View
          pointerEvents="none"
          style={[
            styles.callout,
            {
              left: calloutLeft,
              backgroundColor: theme.colors.surfaceRaised,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[typography.label, { color: theme.colors.text }]}>
            {fullDateLabel(selectedPoint.date, cashflow.granularity)}
          </Text>
          <View style={styles.calloutRow}>
            <View style={[styles.calloutDot, { backgroundColor: theme.colors.income }]} />
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>Income</Text>
            <MoneyValue
              amountMinor={selectedPoint.incomeMinor}
              tone="income"
              style={styles.calloutValue}
            />
          </View>
          <View style={styles.calloutRow}>
            <View style={[styles.calloutDot, { backgroundColor: theme.colors.expense }]} />
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>Expenses</Text>
            <MoneyValue
              amountMinor={-selectedPoint.expenseMinor}
              tone="expense"
              style={styles.calloutValue}
            />
          </View>
        </View>
      ) : null}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: theme.colors.income }]} />
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>Income</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: theme.colors.expense }]} />
          <Text style={[typography.caption, { color: theme.colors.textMuted }]}>Expenses</Text>
        </View>
      </View>
      <GestureDetector gesture={gesture}>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={chartSummaryLabel(cashflow)}
          collapsable={false}
        >
          <Svg width={width} height={CHART_HEIGHT}>
            {axis.ticks.map((tick) => {
              const tickY = geometry.yAt(tick);
              return (
                <Line
                  key={tick}
                  x1={CHART_GUTTER_LEFT}
                  x2={width - CHART_GUTTER_RIGHT}
                  y1={tickY}
                  y2={tickY}
                  stroke={theme.colors.border}
                  strokeWidth={1}
                />
              );
            })}
            {axis.ticks.map((tick) => (
              <SvgText
                key={`label-${tick}`}
                x={CHART_GUTTER_LEFT - 6}
                y={geometry.yAt(tick) + 3.5}
                fontSize={10}
                fill={theme.colors.textMuted}
                textAnchor="end"
              >
                {formatAxisTick(tick)}
              </SvgText>
            ))}
            {width > 0 ? (
              <>
                <Path
                  d={areaPathD(incomeD, geometry, points.length)}
                  fill={theme.colors.income}
                  fillOpacity={0.08}
                />
                <Path
                  d={areaPathD(expenseD, geometry, points.length)}
                  fill={theme.colors.expense}
                  fillOpacity={0.07}
                />
                <Path
                  d={incomeD}
                  stroke={theme.colors.income}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <Path
                  d={expenseD}
                  stroke={theme.colors.expense}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {points.map((point, index) => {
                  const show =
                    tickInterval === 0 ||
                    index % (tickInterval + 1) === 0 ||
                    index === points.length - 1;
                  if (!show) return null;
                  const anchor =
                    index === 0 ? "start" : index === points.length - 1 ? "end" : "middle";
                  return (
                    <SvgText
                      key={point.date}
                      x={geometry.xAt(index)}
                      y={CHART_HEIGHT - 6}
                      fontSize={10}
                      fill={theme.colors.textMuted}
                      textAnchor={anchor}
                    >
                      {compactDateLabel(point.date, cashflow.granularity)}
                    </SvgText>
                  );
                })}
                {selectedIndex !== null && selectedPoint ? (
                  <>
                    <Line
                      x1={activeX}
                      x2={activeX}
                      y1={CHART_GUTTER_TOP}
                      y2={CHART_HEIGHT - CHART_GUTTER_BOTTOM}
                      stroke={theme.colors.textMuted}
                      strokeWidth={1}
                      strokeDasharray={[3, 4]}
                      opacity={0.6}
                    />
                    <Circle
                      cx={activeX}
                      cy={geometry.yAt(selectedPoint.incomeMinor)}
                      r={4.5}
                      fill={theme.colors.income}
                      stroke={theme.colors.surfaceRaised}
                      strokeWidth={2}
                    />
                    <Circle
                      cx={activeX}
                      cy={geometry.yAt(selectedPoint.expenseMinor)}
                      r={4.5}
                      fill={theme.colors.expense}
                      stroke={theme.colors.surfaceRaised}
                      strokeWidth={2}
                    />
                  </>
                ) : null}
              </>
            ) : null}
          </Svg>
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "relative",
    marginTop: spacing.sm,
  },
  legend: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  callout: {
    position: "absolute",
    top: spacing.lg,
    zIndex: 2,
    minWidth: 164,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginLeft: -CALLOUT_HALF_WIDTH,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  calloutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  calloutDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  calloutValue: {
    fontSize: 13,
    lineHeight: 17,
    marginLeft: "auto",
  },
});
