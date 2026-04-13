import resolve from "@rollup/plugin-node-resolve"
import { swc } from "rollup-plugin-swc3"

export function createRollupConfig({ input = "src/index.ts", external = [] }) {
  return {
    input,
    external: [...external, /^@pulse\//],
    output: [
      {
        file: "dist/index.js",
        format: "es",
        sourcemap: true,
      },
      {
        file: "dist/index.cjs",
        format: "cjs",
        sourcemap: true,
        exports: "named",
      },
    ],
    plugins: [
      resolve({ extensions: [".ts", ".js"] }),
      swc({
        jsc: {
          parser: { syntax: "typescript", decorators: false },
          target: "es2022",
          loose: true,
          keepClassNames: true,
          assumptions: {
            noClassCalls: true,
            setPublicClassFields: true,
            ignoreFunctionLength: true,
            ignoreFunctionName: true,
          },
        },
        sourceMaps: true,
      }),
    ],
  }
}
