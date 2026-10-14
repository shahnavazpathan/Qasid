import { api } from "../../shared/api/client.js";

export const allotmentService = {
  listIpos: () => api.get("/api/ipos").then(d => d.ipos),
  registrars: () => api.get("/api/registrars").then(d => d.registrars),
  check: (ipo, pans) => api.post("/api/check", { clientId: ipo.clientId, source: ipo.source, pans }).then(d => d.results)
};
