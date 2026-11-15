package site.zoption.shareintake

import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ZoptionShareIntakeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ZoptionShareIntake")

    AsyncFunction("consumeSharedReceiptAsync") {
      val context = appContext.reactContext
        ?: throw CodedException("The Android application context is unavailable.")
      ZoptionSharedReceiptStore.consume(context)
    }
  }
}
