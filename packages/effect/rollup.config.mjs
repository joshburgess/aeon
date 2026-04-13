import resolve from "@rollup/plugin-node-resolve";
import { swc } from "rollup-plugin-swc3";

const plugins = [
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
];

const external = [/^aeon-/, /^effect/, /^@effect\//];

const entries = [
  { input: "src/index.ts", name: "index" },
  { input: "src/Event.ts", name: "Event" },
  { input: "src/Event/Zip.ts", name: "Event/Zip" },
  { input: "src/Event/Sequential.ts", name: "Event/Sequential" },
  { input: "src/bridge.ts", name: "bridge" },
];

export default entries.map(({ input, name }) => ({
  input,
  external,
  output: [
    {
      file: `dist/${name}.js`,
      format: "es",
      sourcemap: true,
    },
    {
      file: `dist/${name}.cjs`,
      format: "cjs",
      sourcemap: true,
      exports: "named",
    },
  ],
  plugins,
}));
