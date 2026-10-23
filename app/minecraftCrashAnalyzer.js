const MAX_CRASH_LOG_BYTES = 2 * 1024 * 1024;

const SIGNATURES = [
  {
    pattern: /OutOfMemoryError|Java heap space|GC overhead limit exceeded/i,
    severity: "high",
    title: "Java ran out of memory",
    guidance:
      "Check the Java heap allocation and reduce memory-heavy resource packs or mods. Avoid allocating more memory than the system can provide.",
  },
  {
    pattern: /Mixin apply failed|InjectionError|Critical injection failure/i,
    severity: "high",
    title: "Mixin injection failed",
    guidance:
      "A mod could not apply a code transformation. Check that the mod supports this Minecraft version and loader, then inspect the named mixin and mod in the surrounding log lines.",
  },
  {
    pattern: /NoSuchMethodError|NoSuchFieldError/i,
    severity: "high",
    title: "Incompatible API or mod versions",
    guidance:
      "A mod expects a method or field that is absent. Verify Minecraft, loader, and dependency versions, especially after updating one mod.",
  },
  {
    pattern: /ClassNotFoundException|NoClassDefFoundError/i,
    severity: "medium",
    title: "Missing class or dependency",
    guidance:
      "A required class was not available. Check the named class, required library, and whether the mod is installed for the active loader.",
  },
  {
    pattern:
      /Missing or unsupported mandatory dependencies|depends on .* which is missing/i,
    severity: "high",
    title: "Required mod dependency is missing",
    guidance:
      "Install a compatible version of the named dependency or remove the mod that requires it.",
  },
  {
    pattern: /Duplicate .* (?:registry|id)|Registry Object.*already exists/i,
    severity: "medium",
    title: "Duplicate registry entry",
    guidance:
      "Two registrations appear to conflict. Check for duplicate mod versions or mods registering the same identifier.",
  },
  {
    pattern: /UnsupportedClassVersionError|class file version/i,
    severity: "medium",
    title: "Java runtime version mismatch",
    guidance:
      "The installed Java runtime may be older than the version required by a mod or loader. Use the Java version required by the selected Minecraft/loader target.",
  },
  {
    pattern:
      /An exception occurred in the .* loop|Exception in server tick loop|Exception in client tick loop/i,
    severity: "medium",
    title: "Minecraft tick loop exception",
    guidance:
      "The game failed during a client, server, or other tick loop. Review nearby 'Caused by' lines and the first mod-specific stack frame to narrow down the source.",
  },
];

function analyzeMinecraftCrashLog(text) {
  if (typeof text !== "string") {
    throw new Error("Crash log contents must be text.");
  }
  if (Buffer.byteLength(text, "utf8") > MAX_CRASH_LOG_BYTES) {
    throw new Error("Crash logs must be 2 MB or smaller.");
  }

  const lines = text.split(/\r?\n/);
  const findings = [];
  const matched = new Set();

  for (let index = 0; index < lines.length; index += 1) {
    for (const signature of SIGNATURES) {
      if (
        matched.has(signature.title) ||
        !signature.pattern.test(lines[index])
      ) {
        continue;
      }
      matched.add(signature.title);
      findings.push({
        severity: signature.severity,
        title: signature.title,
        line: index + 1,
        excerpt: lines[index].trim().slice(0, 500),
        guidance: signature.guidance,
      });
    }
  }

  return {
    findingCount: findings.length,
    findings,
    summary:
      findings.length > 0
        ? `Found ${findings.length} recognizable issue signature${findings.length === 1 ? "" : "s"}. These are clues, not a definitive diagnosis.`
        : "No supported error signatures were recognized. The log may still contain useful clues; review it around the first error or crash report section.",
  };
}

module.exports = { MAX_CRASH_LOG_BYTES, analyzeMinecraftCrashLog };
