import {
  WIDGET_REVIEW_NOTIFICATION_ID,
  isWidgetNotification,
  widgetNotificationRoute,
} from "./widget-notifications";

describe("widget notifications", () => {
  it("recognizes only its own identifiers", () => {
    expect(isWidgetNotification(WIDGET_REVIEW_NOTIFICATION_ID)).toBe(true);
    expect(isWidgetNotification("zoption-widget-1730000000")).toBe(true);
    expect(isWidgetNotification("zoption-daily-reminder-noon")).toBe(false);
    expect(isWidgetNotification(undefined)).toBe(false);
  });

  it("opens the confirm screen with the transcript for a review tap only", () => {
    expect(
      widgetNotificationRoute(WIDGET_REVIEW_NOTIFICATION_ID, {
        transcript: "update BDO balance to 5,000",
      }),
    ).toBe("/(app)/widget-intent?transcript=update%20BDO%20balance%20to%205%2C000");
    expect(widgetNotificationRoute(WIDGET_REVIEW_NOTIFICATION_ID, {})).toBeNull();
    expect(widgetNotificationRoute(WIDGET_REVIEW_NOTIFICATION_ID, { transcript: "  " })).toBeNull();
    expect(widgetNotificationRoute("zoption-widget-1", { transcript: "x" })).toBeNull();
  });
});
