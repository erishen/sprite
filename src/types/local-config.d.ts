// Type declarations for local (gitignored) config files
// These files are optional and may not exist in fresh checkouts / CI

declare module "*/launchers.local.json" {
  const value: Array<{
    kind: string;
    label: string;
    url?: string;
    app?: string;
    command?: string;
    [key: string]: unknown;
  }>;
  export default value;
}

declare module "*/prompts.local.json" {
  const value: Array<{
    label: string;
    text: string;
    [key: string]: unknown;
  }>;
  export default value;
}
