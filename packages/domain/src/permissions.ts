export const ROLES = ["OWNER", "EDITOR", "SALES", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const ACTIONS = [
  "development:read",
  "development:write",
  "development:publish",
  "unit:write",
  "unit:availability",
  "scene:write",
  "asset:upload",
  "job:create",
  "lead:read",
  "lead:export",
  "member:manage",
] as const;
export type Action = (typeof ACTIONS)[number];

const GRANTS: Record<Role, readonly Action[]> = {
  OWNER: ACTIONS,
  EDITOR: [
    "development:read",
    "development:write",
    "development:publish",
    "unit:write",
    "unit:availability",
    "scene:write",
    "asset:upload",
    "job:create",
    "lead:read",
  ],
  SALES: ["development:read", "unit:availability", "lead:read", "lead:export"],
  VIEWER: ["development:read"],
};

export function can(role: Role, action: Action): boolean {
  return GRANTS[role].includes(action);
}
