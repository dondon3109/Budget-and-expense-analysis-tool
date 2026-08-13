import NetInfo from "@react-native-community/netinfo";

import { publicConfig } from "./public-config";

let configured = false;

/** Configure Zoption-owned reachability once. API responses still decide whether sync succeeded. */
export function configureConnectivity(): void {
  if (configured) return;
  configured = true;
  NetInfo.configure({
    reachabilityUrl: new URL("/health", publicConfig.apiUrl).toString(),
    reachabilityMethod: "GET",
    reachabilityTest: (response) => Promise.resolve(response.status === 200),
    reachabilityRequestTimeout: 8_000,
    reachabilityShortTimeout: 5_000,
    reachabilityLongTimeout: 30_000,
    useNativeReachability: true,
  });
}
