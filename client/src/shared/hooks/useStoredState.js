import { useEffect, useState } from "react";
import { read, write } from "../lib/storage.js";

export function useStoredState(key, fallback) {
  const [value, setValue] = useState(() => read(key, fallback));
  useEffect(() => { write(key, value); }, [key, value]);
  return [value, setValue];
}
