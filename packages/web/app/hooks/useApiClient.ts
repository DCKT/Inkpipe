import ky from "ky";

const API_BASE = import.meta.env.DEV ? "http://localhost:3000" : "";

export const api = ky.create({ prefixUrl: `${API_BASE}/api`, timeout: 30000 });
