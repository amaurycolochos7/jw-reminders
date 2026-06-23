interface StatusDotProps {
  color: "green" | "yellow" | "red" | "gray";
  pulse?: boolean;
}

export function StatusDot({ color, pulse = false }: StatusDotProps) {
  const colors = { green: "bg-emerald-500", yellow: "bg-amber-500", red: "bg-red-500", gray: "bg-slate-400" };
  return (
    <span className="relative flex h-2.5 w-2.5">
      {pulse && <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${colors[color]}`} />}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${colors[color]}`} />
    </span>
  );
}
