const base = "inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:opacity-50";

const variants = {
  // The only place the accent color appears.
  primary: "h-12 px-6 rounded-lg bg-accent text-on-accent hover:bg-accent-hover",
  quiet: "h-9 px-3 -mx-3 rounded-md text-ink-2 hover:text-ink hover:bg-raised"
};

export function Button({ variant = "quiet", className = "", ...props }) {
  return <button type="button" className={`${base} ${variants[variant]} ${className}`} {...props} />;
}
