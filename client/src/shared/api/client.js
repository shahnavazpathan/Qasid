async function request(path, options) {
  const res = await fetch(path, options);
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
  })
};
