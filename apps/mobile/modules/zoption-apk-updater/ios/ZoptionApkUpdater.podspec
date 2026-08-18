Pod::Spec.new do |s|
  s.name = 'ZoptionApkUpdater'
  s.version = '0.1.0'
  s.summary = 'Android APK inspection and sideload-update handoff for Zoption Beta'
  s.description = 'Provides streaming SHA-256, APK package/signer inspection, and installer handoff. iOS exposes unavailable stubs only.'
  s.author = 'Zoption'
  s.homepage = 'https://zoption.site'
  s.platforms = { :ios => '16.4' }
  s.source = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
