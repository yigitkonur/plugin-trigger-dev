import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "<proj_ref from the dashboard>",
  dirs: ["./src"],
  maxDuration: 300, // seconds of CPU time; required default, see runs/max-duration
  runtime: "node-24",
});
