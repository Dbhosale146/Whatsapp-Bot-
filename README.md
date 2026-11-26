# RealtyReach: WhatsApp Lead Campaigns

Upload a lead list (CSV/XLSX), filter it by property area, write a personalised WhatsApp message, and send it now, after a delay, or at a set IST date and time through [Whapi.Cloud](https://whapi.cloud).

- **Backend:** FastAPI, APScheduler (`Asia/Kolkata`, SQLite job store), SQLite, Pandas/OpenPyXL
- **Frontend:** React, Vite, Tailwind CSS, lucide-react

## Setup

```bash
# Backend
cd backend
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env          # then set WHAPI_TOKEN
uvicorn main:app --reload --port 8000

# Frontend (new terminal)
cd frontend
npm install
npm run dev                     # http://localhost:5173 (proxies /api to :8000)
```

The backend can run on a port other than 8000. If it does, change the proxy target in `frontend/vite.config.js`, or set `VITE_API_BASE_URL` in `frontend/.env`.

## Modes

| Mode | What happens |
| --- | --- |
| **Demo Simulation** | No call is made to Whapi. Every message is logged as Delivered with a simulated response. Use this to demo bulk uploads such as `sample_leads.csv`. |
| **Live Whapi Sandbox** | Sends `POST {WHAPI_API_URL}/messages/text`. The trial quota (5 unique chats, 150 messages) is checked when the campaign is created and again before each send. |

The phone numbers in `sample_leads.csv` are placeholders. Use them only in Demo mode.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/config/status` | Token loaded?, channel, sender, trial usage |
| POST | `/api/leads/parse` | Parse a `.csv`/`.xlsx` file; returns rows and per-area counts |
| POST | `/api/campaigns` | Create and schedule a campaign |
| GET | `/api/campaigns` | List campaigns with status and counts |
| GET | `/api/campaigns/{id}/logs` | Delivery status for each lead |
| POST | `/api/campaigns/{id}/cancel` | Cancel a scheduled campaign |

Interactive docs: http://localhost:8000/docs

## Notes

- Phone numbers are normalised to `91XXXXXXXXXX` with digits only. Invalid numbers and duplicates are flagged and skipped.
- Messages within a campaign go out 1 second apart.
- Scheduled jobs survive restarts because they are stored in `backend/scheduler_jobs.db`. If the server was down when a job was due, it runs as soon as the server starts again.
- A token override entered in the UI is kept in memory only and never written to disk. If the server restarts before a scheduled campaign runs, that campaign uses the `.env` token instead.
