interface BadgeProps {
  variant?: "success" | "warning" | "error" | "info" | "neutral";
  dot?: boolean;
  children: React.ReactNode;
}

export function Badge({ variant = "neutral", dot, children }: BadgeProps) {
  const variants = {
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    error: "bg-red-50 text-red-700",
    info: "bg-primary-50 text-primary-700",
    neutral: "bg-slate-100 text-slate-600",
  };
  const dots = {
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    error: "bg-red-500",
    info: "bg-primary-500",
    neutral: "bg-slate-400",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${variants[variant]}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dots[variant]}`} />}
      {children}
    </span>
  );
}
