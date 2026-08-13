import { Redirect } from "expo-router";

export default function AuthCallbackRoute() {
  return <Redirect href="/(public)/sign-in" />;
}
