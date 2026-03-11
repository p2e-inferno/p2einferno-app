// @ts-nocheck
const fs = require("fs");
const Module = require("module");
const path = require("path");
const ts = require("typescript");

const projectRoot = process.cwd();
const originalResolveFilename = Module._resolveFilename;

function resolveWithTsExtensions(candidate) {
  const extensions = [".ts", ".tsx", ".js", ".jsx"];

  for (const ext of extensions) {
    const filePath = `${candidate}${ext}`;
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return filePath;
    }
  }

  for (const ext of extensions) {
    const indexPath = path.join(candidate, `index${ext}`);
    if (fs.existsSync(indexPath) && fs.statSync(indexPath).isFile()) {
      return indexPath;
    }
  }

  return candidate;
}

Module._resolveFilename = function patchedResolveFilename(
  request,
  parent,
  isMain,
  options,
) {
  if (request.startsWith("@/")) {
    request = path.join(projectRoot, request.slice(2));
  } else if ((request.startsWith("./") || request.startsWith("../") || request.startsWith("/")) &&
    !path.extname(request)) {
    const baseDir = parent?.filename ? path.dirname(parent.filename) : projectRoot;
    const candidate = path.resolve(baseDir, request);
    request = resolveWithTsExtensions(candidate);
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};

function compileTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      esModuleInterop: true,
      resolveJsonModule: true,
      jsx: ts.JsxEmit.React,
      allowJs: true,
    },
    fileName: filename,
  });

  module._compile(outputText, filename);
}

require.extensions[".ts"] = compileTs;
require.extensions[".tsx"] = compileTs;
