import ExpoModulesCore

public final class ZoptionApkUpdaterModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ZoptionApkUpdater")

    AsyncFunction("getInstalledPackageInfoAsync") { () -> [String: Any] in
      let bundle = Bundle.main
      return [
        "packageName": bundle.bundleIdentifier ?? "",
        "versionName": bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "",
        "versionCode": 0
      ]
    }

    AsyncFunction("digestFileSha256Async") { (_: String) -> String in
      throw ApkUpdaterException("APK updates are only available on Android.")
    }

    AsyncFunction("inspectApkAsync") { (_: String) -> [String: Any] in
      throw ApkUpdaterException("APK updates are only available on Android.")
    }

    AsyncFunction("verifyApkAsync") { (_: String, _: Int) -> [String: Any] in
      throw ApkUpdaterException("APK updates are only available on Android.")
    }

    AsyncFunction("canInstallPackagesAsync") { () -> Bool in
      throw ApkUpdaterException("APK updates are only available on Android.")
    }

    AsyncFunction("openUnknownSourcesSettingsAsync") { () in
      throw ApkUpdaterException("APK updates are only available on Android.")
    }

    AsyncFunction("installApkAsync") { (_: String, _: Int) in
      throw ApkUpdaterException("APK updates are only available on Android.")
    }
  }
}

private final class ApkUpdaterException: GenericException<String> {
  override var reason: String {
    param
  }
}
