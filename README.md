# AI Meet Interview Proctor & Anti-Cheating Platform

A Google Meet & Microsoft Teams-style real-time interview meeting system with AI anti-cheating proctoring, live video streaming, instant admission lobby, screen sharing, chat, recording, and automated evaluation reports.

---

## 🌟 Features

- 📹 **Google Meet / MS Teams Experience**: Host (Interviewer) and Candidate join a unified meeting room with live dual video tiles.
- 🔗 **Instant Unique Meeting Link Generation**: Generates links like `https://myapp.com/interview/SEC-INTV-8829-X91` with one-click **Copy Link**, **Share via WhatsApp**, and **Share via Email**.
- 🚪 **Pre-Join & Host Admission Lobby**: Candidate tests Camera & Mic on pre-join, requests to join, and host admits them seamlessly via real-time WebSocket signals without page refreshes.
- 🤖 **AI Fraud & Proctoring Detection**: Continuous detection running discreetly on candidate stream:
  - Eye contact & gaze tracking percentage
  - Face visibility (detecting missing faces or multiple faces)
  - Phone & unauthorized device usage
  - Tab switching & window focus monitoring
  - Audio noise & secondary voice analysis
- 📑 **Comprehensive Interview Reports**: Detailed evaluation breakdown with integrity scores, violation timelines, transcript summaries, and hiring recommendations powered by Gemini AI (with built-in fallback engine).
- 🎙️ **Meeting Controls**: Mute/Unmute, Camera On/Off, Screen Share, Live Audio Transcriber, Chat, Recording, and Meeting Timer.

---

## 📁 Project Architecture & Folder Structure

```
├── server.ts                 # Full-stack Express backend with WebSocket & API endpoints
├── index.html                # Vite HTML entry point
├── package.json              # Full dependency manifest for frontend & backend
├── tsconfig.json             # TypeScript configuration
├── vite.config.ts            # Vite bundler configuration
├── .env.example              # Environment variables template
├── README.md                 # Setup and run guide
└── src/
    ├── App.tsx               # Primary application routing & global state router
    ├── main.tsx              # React mounting entry point
    ├── index.css             # Tailwind CSS design styles
    ├── types.ts              # Global TypeScript interfaces & session models
    ├── lib/
      └── socket.ts           # Real-time WebSocket client synchronization manager
    └── components/
        ├── auth/             # Login & Authentication view
        ├── dashboard/        # Interviewer & Candidate Management Hubs
        ├── interview/        # Schedule Interview modal & Interview list
        ├── meet/             # Live Google Meet room, Pre-join lobby, Share link modal
        └── report/           # Post-interview AI Proctoring report view
```

---

## 🚀 Local Development Setup (VS Code)

### Prerequisites

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **Git**

### Installation

1. **Clone or Extract the Repository**:
   ```bash
   git clone <repository-url>
   cd ai-meet-interview-proctor
   ```

2. **Install All Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   *Edit `.env` to set `GEMINI_API_KEY` (optional for AI report generation) and `PORT=3000`.*

4. **Start the Unified Full-Stack Application**:
   ```bash
   npm run dev
   ```
   Open your browser at `http://localhost:3000`.

---

## 📜 Available NPM Scripts

- `npm run dev`: Starts the TypeScript full-stack backend and Vite frontend on port 3000.
- `npm run build`: Compiles Vite static assets and bundles `server.ts` to `dist/server.cjs` via `esbuild`.
- `npm run start`: Runs the built production bundle using Node.js (`node dist/server.cjs`).
- `npm run lint`: Runs TypeScript type validation check (`tsc --noEmit`).

---

## 🔑 Environment Variables Reference

| Variable | Required | Description |
| :--- | :--- | :--- |
| `PORT` | Optional | Port for the backend server (Default: `3000`) |
| `APP_URL` | Optional | Public app domain for generating meeting links (Default: `http://localhost:3000`) |
| `GEMINI_API_KEY` | Optional | Gemini API Key for generating AI proctoring summary reports |
| `JWT_SECRET` | Optional | Secret key used for user authentication tokens |

---

## 🗄️ Optional Database Configuration (MongoDB)

By default, the application runs with an in-memory session manager for instant zero-config execution. To persist interviews and user sessions into MongoDB:

1. Uncomment `MONGODB_URI` in `.env`:
   ```env
   MONGODB_URI="mongodb://localhost:27017/ai-interview-proctor"
   ```
2. Start MongoDB locally or connect to a MongoDB Atlas cluster.

---

## 🛡️ License & Support

Distributed under the MIT License. Built for seamless deployment on Cloud Run, Vercel, Docker, or any Node.js environment.
