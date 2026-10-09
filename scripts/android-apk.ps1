# Android APK'sını bu PC'de derler: Android Studio'nun JDK'sı + SDK'sı kullanılır.
# Çıktı: android\app\build\outputs\apk\release\app-release.apk -> KontrolMerkezi.apk (depo kökü, git'e girmez)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
# Java'nın iç borusu kullanıcı adındaki boşluklu geçici dizinde açılamıyor ("Unable to establish loopback connection").
New-Item -ItemType Directory -Force C:\Temp\jdk | Out-Null
$env:JAVA_TOOL_OPTIONS = '-Djdk.net.unixdomain.tmpdir=C:\Temp\jdk'
Push-Location $root
try {
  npx cap sync android
  $gradle = Start-Process -FilePath "$root\android\gradlew.bat" -ArgumentList 'assembleRelease', '--no-daemon', '-q' -WorkingDirectory "$root\android" -NoNewWindow -Wait -PassThru
  if ($gradle.ExitCode -ne 0) { throw "Gradle derlemesi başarısız ($($gradle.ExitCode))" }
  Copy-Item "$root\android\app\build\outputs\apk\release\app-release.apk" "$root\KontrolMerkezi.apk" -Force
  Write-Host "Hazır: $root\KontrolMerkezi.apk"
} finally {
  Pop-Location
}
