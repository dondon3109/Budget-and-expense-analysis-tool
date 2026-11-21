import type { CashflowTrend } from "@zoption/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Dimensions, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";

import { useAmountsHidden } from "@/stores/hide-amounts-store";
import { useWorkspaceCurrency } from "@/stores/workspace-currency-store";
import { spacing, typography } from "@/ui/tokens";
import { useZoptionTheme } from "@/ui/theme-provider";
import { hiddenMoney, MoneyValue } from "./MoneyValue";
import {
  CALLOUT_HALF_WIDTH,
  CHART_GUTTER_BOTTOM,
  CHART_GUTTER_LEFT,
  CHART_GUTTER_RIGHT,
  CHART_GUTTER_TOP,
  CHART_HEIGHT,
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
  const amountsHidden = useAmountsHidden();
  const currency = useWorkspaceCurrency();
  const [width, setWidth] = useState(() =>
    Math.max(0, Dimensions.get("window").width - spacing.md * 4),
  );
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const points = cashflow.points;
  const { maximumMinor, incomeTotalMinor, expenseTotalMinor } = useMemo(() => {
    let max = 0;
    let income = 0;
    let expense = 0;
    for (const point of points) {
      if (point.incomeMinor > max) max = point.incomeMinor;
      if (point.expenseMinor > max) max = point.expenseMinor;
      income += point.incomeMinor;
      expense += point.expenseMinor;
    }
    return { maximumMinor: max, incomeTotalMinor: income, expenseTotalMinor: expense };
  }, [points]);
  const axis = useMemo(() => createCashflowAxis(maximumMinor), [maximumMinor]);
  const geometry = useMemo(
    () => buildChartGeometry(width, points.length, axis.domainMax),
    [width, points.length, axis.domainMax],
  );
  const tickInterval = useMemo(
    () => xAxisInterval(points.length, cashflow.granularity),
    [points.length, cashflow.granularity],
  );
  const { incomeD, expenseD } = useMemo(
    () => ({
      incomeD: linePathD(points, (point) => point.incomeMinor, geometry),
      expenseD: linePathD(points, (point) => point.expenseMinor, geometry),
    }),
    [points, geometry],
  );
  const summaryLabel = useMemo(() => chartSummaryLabel(cashflow, currency), [cashflow, currency]);

  useEffect(() => {
    setSelectedIndex(null);
  }, [cashflow.view]);

  const selectAt = useCallback(
    (x: number): void => {
      const index = indexForPosition(x, width, points.length);
      if (index !== null) setSelectedIndex(index);
    },
    [width, points.length],
  );

  const toggleAt = useCallback(
    (x: number): void => {
      const index = indexForPosition(x, width, points.length);
      if (index === null) return;
      setSelectedIndex((current) => (current === index ? null : index));
    },
    [width, points.length],
  );

  const gesture = useMemo(() => {
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
    return Gesture.Race(tap, pan);
  }, [selectAt, toggleAt]);

  // Keep the static grid, paths, and labels memoized so scrubbing only re-renders the active cursor.
  const staticBackdrop = useMemo(
    () => (
      <>
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
            {amountsHidden ? hiddenMoney(currency) : formatAxisTick(tick, currency)}
          </SvgText>
        ))}
        {width > 0 ? (
          <>
            <Path
              testID="cashflow-income-line"
              d={incomeD}
              fill="none"
              fillOpacity={0}
              stroke={theme.colors.income}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path
              testID="cashflow-expense-line"
              d={expenseD}
              fill="none"
              fillOpacity={0}
              stroke={theme.colors.expense}
              strokeWidth={2}
              strokeDasharray={[6, 5]}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {points.map((point, index) => {
              const show =
                tickInterval === 0 ||
                index % (tickInterval + 1) === 0 ||
                index === points.length - 1;
              if (!show) return null;
              const anchor = index === 0 ? "start" : index === points.length - 1 ? "end" : "middle";
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
          </>
        ) : null}
      </>
    ),
    [
      amountsHidden,
      axis.ticks,
      cashflow.granularity,
      currency,
      expenseD,
      geometry,
      incomeD,
      points,
      theme.colors.border,
      theme.colors.expense,
      theme.colors.income,
      theme.colors.textMuted,
      tickInterval,
      width,
    ],
  );

  const selectedPoint = selectedIndex !== null ? points[selectedIndex] : undefined;
  const activeX = selectedIndex !== null ? geometry.xAt(selectedIndex) : 0;
  const calloutLeft = Math.min(
    Math.max(CALLOUT_HALF_WIDTH, activeX),
    Math.max(CALLOUT_HALF_WIDTH, width - CALLOUT_HALF_WIDTH),
  );

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    setWidth((current) => (current === nextWidth ? current : nextWidth));
  }, []);

  return (
    <View style={styles.wrap} onLayout={handleLayout}>
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
          <View style={styles.legendLabel}>
            <View style={[styles.legendDot, { backgroundColor: theme.colors.income }]} />
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>Income</Text>
          </View>
          <MoneyValue amountMinor={incomeTotalMinor} tone="income" style={styles.legendValue} />
        </View>
        <View style={styles.legendItem}>
          <View style={styles.legendLabel}>
            <View style={[styles.legendDash, { backgroundColor: theme.colors.expense }]} />
            <Text style={[typography.caption, { color: theme.colors.textMuted }]}>Expenses</Text>
          </View>
          <MoneyValue amountMinor={-expenseTotalMinor} tone="expense" style={styles.legendValue} />
        </View>
      </View>
      <Text style={[typography.caption, { color: theme.colors.textMuted }]}>
        Only {currency} entries are included.
      </Text>
      <GestureDetector gesture={gesture}>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={summaryLabel}
          collapsable={false}
        >
          <Svg width={width} height={CHART_HEIGHT}>
            {staticBackdrop}
            {width > 0 && selectedIndex !== null && selectedPoint ? (
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
    gap: spacing.lg,
    marginBottom: spacing.xs,
  },
  legendItem: {
    gap: 2,
  },
  legendLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  // Mirrors the dashed expense line so the legend matches without color alone.
  legendDash: {
    width: 12,
    height: 2,
    borderRadius: 999,
  },
  legendValue: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "700",
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
