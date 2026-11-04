async function request(path, options) {
  // credentials: "include" carries the session cookie on every request, so a signed-in user
  // stays signed in across page refreshes (without it the cookie is dropped and they fall back
  // to guest mode, losing their saved PANs).
  const res = await fetch(path, { ...options, credentials: "include" });
  let data;
  try { data = await res.json(); } catch { throw new Error("Unexpected response from server."); }
  if (!data.success) throw new Error(data.error || "Request failed.");
  return data;
}

export const api = {
  get: path => request(path),
  post: (path, body) => request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }),
  del: path => request(path, { method: "DELETE" })
};
