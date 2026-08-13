import { ThemePicker } from "@/ui/theme-picker";
import { Screen } from "@/ui/screen";

export default function MoreScreen() {
  return (
    <Screen
      title="More"
      description="Appearance is device-local and never contains financial records."
    >
      <ThemePicker />
    </Screen>
  );
}
