// Packaged app entry. Enables the compile cache before the main bundle loads,
// so the cache also covers main.cjs itself.
// This personal build is updated from its fork; upstream releases would replace its UI.
process.env.T3CODE_DISABLE_AUTO_UPDATE = "true";
require("./compileCache.cjs");
require("./main.cjs");
