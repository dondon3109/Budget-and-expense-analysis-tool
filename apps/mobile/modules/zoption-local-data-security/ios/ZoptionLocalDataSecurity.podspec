Pod::Spec.new do |s|
  s.name = 'ZoptionLocalDataSecurity'
  s.version = '0.1.0'
  s.summary = 'Fixed native backup protection checks for Zoption local financial data'
  s.description = 'Applies and verifies platform backup controls before the encrypted workspace opens.'
  s.author = 'Zoption'
  s.homepage = 'https://zoption.site'
  s.platforms = { :ios => '16.4' }
  s.source = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
