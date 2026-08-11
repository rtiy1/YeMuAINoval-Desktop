export type PermissionMode = "ask" | "skip_all_permission_checks" | "follow_a_plan";

export type Logger = {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
};

export type MCodeForChromeContext = {
  serverName?: string;
  logger?: Logger;
};

export const BROWSER_TOOLS: Array<{ name: string }> = [];

export function createMCodeForChromeMcpServer(_context: MCodeForChromeContext) {
  return {
    async connect() {},
    setRequestHandler() {},
    async close() {},
  };
}
