import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

import { useReduceMotionStore } from "@/stores/reduce-motion-store";

/**
 * Whether to keep the screen still: true when either the in-app switch or the system Reduce
 * Motion setting is on. `undefined` while the system has not answered yet (it answers
 * asynchronously) and the in-app switch is off, so a caller can wait instead of starting motion
 * it would then have to stop.
 */
export function useReduceMotion(): boolean | undefined {
  const inApp = useReduceMotionStore((state) => state.enabled);
  const [system, setSystem] = useState<boolean>();
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setSystem(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setSystem);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return inApp || system;
}
