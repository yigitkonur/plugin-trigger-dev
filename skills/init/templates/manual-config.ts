import { defineConfig } from "@trigger.dev/sdk";
// Extensions each have their own import path (config/extensions/overview), for example:
// import { prismaExtension } from "@trigger.dev/build/extensions/prisma";
// import { pythonExtension } from "@trigger.dev/python/extension";

export default defineConfig({
  project: "<proj_ref from the dashboard>",
  dirs: ["./src/trigger"], // optional; where tasks live
  maxDuration: 300, // a default is required (runs/max-duration)
  runtime: "node-24", // `node` floats with LTS; pin when reproducibility matters
  build: {
    extensions: [
      // Extensions only run in deployed builds, not in `trigger dev`.
    ],
  },
});
