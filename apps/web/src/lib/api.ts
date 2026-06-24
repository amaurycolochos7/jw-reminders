export async function api(path: string, options: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  // Handle 401: clear token and redirect to login
  if (res.status === 401 && typeof window !== 'undefined') {
    localStorage.removeItem('token');
    window.location.href = '/login';
  }

  return res;
}
