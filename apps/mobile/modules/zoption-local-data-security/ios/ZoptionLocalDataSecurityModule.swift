import ExpoModulesCore
import Foundation

public final class ZoptionLocalDataSecurityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ZoptionLocalDataSecurity")

    AsyncFunction("ensureSQLiteBackupExcludedAsync") { () -> Bool in
      guard let documents = FileManager.default.urls(
        for: .documentDirectory,
        in: .userDomainMask
      ).first else {
        throw LocalDataSecurityException("The application documents directory is unavailable.")
      }

      var sqliteDirectory = documents.appendingPathComponent("SQLite", isDirectory: true)
      try FileManager.default.createDirectory(
        at: sqliteDirectory,
        withIntermediateDirectories: true
      )

      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      try sqliteDirectory.setResourceValues(values)

      let verification = try sqliteDirectory.resourceValues(
        forKeys: [.isExcludedFromBackupKey]
      )
      guard verification.isExcludedFromBackup == true else {
        throw LocalDataSecurityException("iOS did not confirm the local data backup exclusion.")
      }
      return true
    }
  }
}

private final class LocalDataSecurityException: GenericException<String> {
  override var reason: String {
    param
  }
}
