import { api } from "../../shared/api/client.js";

export const marketService = {
  board: (force = false) => api.get(`/api/market${force ? "?refresh=1" : ""}`),
  detail: (symbol, type) => api.get(`/api/market/ipo/${encodeURIComponent(symbol)}?type=${encodeURIComponent(type || "")}`).then(d => d.detail),
  filings: () => api.get("/api/market/drhp").then(d => d.filings)
};
