export function normalizeScriptArguments(
  arguments_: readonly string[],
): readonly string[] {
  return arguments_[0] === "--" ? arguments_.slice(1) : arguments_;
}
