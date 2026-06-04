// Allow require('./some-module') to resolve .ts files when called inside test bodies.
// Node 26 with --experimental-strip-types can load .ts files as CJS, but only when
// the .ts extension is explicit. Registering the extension handler makes extensionless
// require() calls fall through to the .ts file.
import { createRequire } from "module";
import { Module } from "module";

const _require = createRequire(import.meta.url);
// Register .ts as an alias of the .js handler so Node's CJS loader tries foo.ts
// when foo.js is not found.
(Module as any)._extensions[".ts"] ??= (Module as any)._extensions[".js"];
