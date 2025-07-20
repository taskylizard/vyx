import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["./src/index.ts"],
	shims: true,
	dts: true,
});