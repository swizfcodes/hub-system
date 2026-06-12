/**
 * Navigation preference API — per-user pinned top-10 + role default.
 * Resolution ladder lives in useNavPriority; this is just transport.
 */
import { api } from "@services/api";

export interface MyNav {
  /** User's own pinned list, or null if they never customised. */
  pinned: string[] | null;
  /** Their role's default_nav, or null if the role has none. */
  role_default: string[] | null;
}

export async function getMyNav(): Promise<MyNav> {
  try {
    const { data } = await api.get<MyNav>("/auth/me/nav");
    return data;
  } catch {
    return { pinned: null, role_default: null };
  }
}

export async function setMyNav(pinned: string[]): Promise<void> {
  await api.put("/auth/me/nav", { pinned });
}

export async function resetMyNav(): Promise<void> {
  await api.delete("/auth/me/nav");
}

/** Admin: set a role's default navigation (role editor). */
export async function setRoleDefaultNav(
  roleId: string,
  defaultNav: string[] | null,
): Promise<void> {
  await api.put(`/security/permissions/roles/${roleId}/default-nav`, {
    default_nav: defaultNav,
  });
}
