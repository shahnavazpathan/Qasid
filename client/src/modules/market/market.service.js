import { api } from "../../shared/api/client.js";

export const marketService = {
  board: (force = false) => api.get(`/api/market${force ? "?refresh=1" : ""}`),
  detail: id => api.get(`/api/market/ipo/${encodeURIComponent(id)}`).then(d => d.detail),
  filings: () => api.get("/api/market/drhp").then(d => d.filings),
  gmpHistory: path => api.get(`/api/market/gmp-history?path=${encodeURIComponent(path)}`).then(d => d.history)
};
