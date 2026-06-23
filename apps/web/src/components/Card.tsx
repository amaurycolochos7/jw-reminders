interface CardProps {
  children: React.ReactNode;
  padding?: "sm" | "md" | "lg";
  hover?: boolean;
  className?: string;
}

export function Card({ children, padding = "md", hover, className = "" }: CardProps) {
  const pads = { sm: "p-4", md: "p-5", lg: "p-6" };
  return (
    <div className={`bg-white rounded-2xl shadow-soft ${pads[padding]} ${hover ? "hover:shadow-card transition-shadow duration-200" : ""} ${className}`}>
      {children}
    </div>
  );
}
