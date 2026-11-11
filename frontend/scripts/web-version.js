// Web paketi kimliği: web-<commit tarihi UTC YYYYMMDDHHMM>-<kısa SHA>.
// Aynı commit'ten yapılan TestFlight build'i ile OTA paketi aynı kimliği taşır (gereksiz indirme olmaz);
// tarih önde olduğu için kimlikler metin olarak sıralanabilir (yalnız daha yeni paket indirilir).
const { execSync } = require("child_process");

function webVersion() {
  try {
    const out = execSync("git log -1 --format=%cd~%H --date=format-local:%Y%m%d%H%M", {
      cwd: __dirname,
      env: { ...process.env, TZ: "UTC" },
      stdio: ["ignore", "pipe", "ignore"],
    }).toString().trim();
    const [date, sha] = out.split("~");
    return `web-${date}-${sha.slice(0, 7)}`;
  } catch {
    return "web-dev";
  }
}

module.exports = webVersion;
if (require.main === module) console.log(webVersion());
