const base = "inline-flex items-center justify-center gap-2 font-semibold transition-all disabled:opacity-50 disabled:pointer-events-none select-none";

const variants = {
  primary: "brand-gradient text-white shadow-[0_8px_20px_-8px_rgb(234_88_12/.55)] hover:brightness-110 active:scale-[.98]",
  soft: "bg-brand-soft text-brand hover:brightness-95 dark:hover:brightness-125",
  ghost: "text-ink-2 hover:text-ink hover:bg-raised",
  outline: "border border-line bg-surface text-ink hover:bg-raised",
  success: "bg-open text-on-brand hover:brightness-110"
};

const sizes = {
  sm: "h-9 px-3.5 text-[13px] rounded-xl",
  md: "h-11 px-5 text-[14px] rounded-xl",
  lg: "h-13 px-7 text-[15px] rounded-2xl",
  icon: "size-10 rounded-xl"
};

export function Button({ variant = "ghost", size = "md", className = "", ...props }) {
  return <button type="button" className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props} />;
}

export function LinkButton({ variant = "outline", size = "sm", className = "", ...props }) {
  return <a target="_blank" rel="noopener noreferrer" className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props} />;
}
