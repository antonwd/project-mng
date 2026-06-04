import { Boxes, Users, ScrollText, UserCircle, type LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/apps", label: "Apps", icon: Boxes },
  { href: "/users", label: "Users", icon: Users },
  { href: "/audit", label: "Audit log", icon: ScrollText },
  { href: "/account", label: "Account", icon: UserCircle },
];
