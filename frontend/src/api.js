const BASE = '/api';

function getToken() {
  return localStorage.getItem('cb_token');
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers
  };

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers
  });

  const data = await res.json().catch(() => ({ error: 'Error de conexión.' }));

  if (!res.ok) {
    throw new Error(data.error || `Error ${res.status}`);
  }

  return data;
}

// ─── Auth ────────────────────────────────────────────
export const api = {
  auth: {
    register: (body) => request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
    login:    (body) => request('/auth/login',    { method: 'POST', body: JSON.stringify(body) }),
    me:       ()     => request('/auth/me'),
    update:   (body) => request('/auth/profile',  { method: 'PATCH', body: JSON.stringify(body) })
  },

  trips: {
    list:    (params = {}) => {
      const q = new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([_, v]) => v))
      );
      return request(`/trips${q.toString() ? '?' + q : ''}`);
    },
    get:     (id)  => request(`/trips/${id}`),
    create:  (body) => request('/trips', { method: 'POST', body: JSON.stringify(body) }),
    join:    (id)  => request(`/trips/${id}/join`, { method: 'POST' }),
    leave:   (id)  => request(`/trips/${id}/leave`, { method: 'DELETE' }),
    delete:  (id)  => request(`/trips/${id}`, { method: 'DELETE' }),
    myCreated: ()  => request('/trips/my/created'),
    myJoined:  ()  => request('/trips/my/joined')
  },

  payments: {
    status: (params) => {
      const q = new URLSearchParams(params);
      return request(`/payments/status?${q}`);
    }
  },

  ratings: {
    submit:  (body) => request('/ratings', { method: 'POST', body: JSON.stringify(body) }),
    pending: ()     => request('/ratings/pending')
  }
};
