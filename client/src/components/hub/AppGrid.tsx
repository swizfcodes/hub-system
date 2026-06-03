import { AppTile } from "./AppTile";
import type { AppModule } from "@lib/constants/modules";

interface Props {
  modules: AppModule[];
  badges?: Record<string, number | string | undefined>;
}

export function AppGrid({ modules, badges = {} }: Props) {
  return (
    <div className="grid gap-4 sm:gap-5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 stagger">
      {modules.map((m, i) => (
        <AppTile
          key={m.key}
          module={m}
          index={i}
          badge={m.badgeKey ? badges[m.badgeKey] : undefined}
        />
      ))}
    </div>
  );
}
