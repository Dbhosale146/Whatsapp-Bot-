const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

async function request(path, options = {}) {
  let res
  try {
    res = await fetch(`${API_BASE}${path}`, options)
  } catch {
    throw new Error('Cannot reach the backend. Is FastAPI running on port 8000?')
  }

  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }

  if (!res.ok) {
    const detail = data?.detail
    const message =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((d) => d.msg?.replace(/^Value error, /, '')).join('; ')
          : `Request failed (HTTP ${res.status})`
    throw new Error(message)
  }
  return data
}

const json = (method, body, headers = {}) => ({
  method,
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
})

export const api = {
  getStatus: () => request('/api/config/status'),

  parseLeads: (file) => {
    const form = new FormData()
    form.append('file', file)
    return request('/api/leads/parse', { method: 'POST', body: form })
  },

  createCampaign: (payload) => request('/api/campaigns', json('POST', payload)),

  listCampaigns: () => request('/api/campaigns'),

  getLogs: (id) => request(`/api/campaigns/${id}/logs`),

  cancelCampaign: (id) => request(`/api/campaigns/${id}/cancel`, { method: 'POST' }),
}
