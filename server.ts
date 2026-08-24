import express from 'express';
import path from 'path';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'ai-interview-monitor-super-secret-key-2026';
const PORT = 3000;

const app = express();
app.use(express.json({ limit: '10mb' }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Initialize Google Gemini Client (Server-side)
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Seed Users Database with required Admin account
const usersDatabase: Record<string, { id: string; name: string; email: string; passwordHash: string; role: 'admin' | 'interviewer' | 'candidate' }> = {};

async function seedInitialUsers() {
  const adminPasswordHash = await bcrypt.hash('deeksha@12', 10);
  const interviewerPasswordHash = await bcrypt.hash('interviewer123', 10);
  const candidatePasswordHash = await bcrypt.hash('candidate123', 10);

  // Admin Account as explicitly requested
  usersDatabase['deekshagowda602@gmail.com'] = {
    id: 'user_admin_01',
    name: 'Deekshitha NM',
    email: 'deekshagowda602@gmail.com',
    passwordHash: adminPasswordHash,
    role: 'admin',
  };

  // Interviewer Account
  usersDatabase['interviewer@company.com'] = {
    id: 'user_interviewer_01',
    name: 'Dr. Aris Thorne',
    email: 'interviewer@company.com',
    passwordHash: interviewerPasswordHash,
    role: 'interviewer',
  };

  // Candidate Account
  usersDatabase['alex.rivera@gmail.com'] = {
    id: 'user_candidate_01',
    name: 'Alex Rivera',
    email: 'alex.rivera@gmail.com',
    passwordHash: candidatePasswordHash,
    role: 'candidate',
  };

  console.log('[Auth] Preloaded users initialized including Admin Deekshitha NM.');
}

seedInitialUsers();

// Track OTP Reset requests
const otpStore: Record<string, { code: string; expiresAt: number }> = {};

// In-Memory Database for Active Interview Sessions
const interviewSessions: Record<string, any> = {
  'sess_demo_101': {
    id: 'sess_demo_101',
    sessionId: 'SEC-INTV-8829-X91',
    title: 'Senior AI Engineer Technical Interview',
    candidateName: 'Alex Rivera',
    candidateEmail: 'alex.rivera@gmail.com',
    interviewerName: 'Dr. Aris Thorne',
    interviewerEmail: 'interviewer@company.com',
    jobRole: 'Senior AI System Architect',
    status: 'SCHEDULED',
    scheduledTime: new Date(Date.now() + 1800000).toISOString(),
    durationMinutes: 45,
    questions: [
      { id: 'q1', text: 'Explain how you design a fault-tolerant distributed WebSocket architecture for real-time video stream monitoring.', category: 'System Architecture', timeLimitSeconds: 300 },
      { id: 'q2', text: 'How do computer vision models like MediaPipe and YOLOv8 process live webcam frames in browser environments with minimal latency?', category: 'Computer Vision', timeLimitSeconds: 300 },
      { id: 'q3', text: 'Describe an instance where you detected anomalies or security bypass attempts in a full-stack platform and how you mitigated them.', category: 'Security & Integrity', timeLimitSeconds: 240 },
    ],
    currentQuestionIndex: 0,
    fraudScore: 0,
    riskLevel: 'LOW',
    faceVisibilityPercent: 100,
    cameraStatus: false,
    micStatus: false,
    screenShareStatus: false,
    fullscreenStatus: false,
    internetStatus: 'ONLINE',
    violations: [],
    emotions: {
      happy: 15,
      neutral: 65,
      angry: 0,
      sad: 0,
      fear: 2,
      surprise: 5,
      disgust: 0,
      confused: 3,
      stressed: 5,
      nervous: 5,
    },
    eyeGaze: {
      eyeContactPercentage: 94,
      blinkCount: 14,
      excessiveLookAwayCount: 0,
      prolongedClosureCount: 0,
    },
    headPose: {
      forwardPercentage: 96,
      turnedLeftCount: 0,
      turnedRightCount: 0,
      lookingDownCount: 0,
    },
    transcript: [
      {
        id: 'tr_1',
        speaker: 'Interviewer',
        timestamp: new Date().toLocaleTimeString(),
        originalText: 'Welcome Alex. Before we begin, please ensure your camera, microphone, and entire screen sharing are active.',
        translatedText: 'Welcome Alex. Before we begin, please ensure your camera, microphone, and entire screen sharing are active.',
        language: 'en',
      }
    ]
  }
};

// WebSocket Room broadcasting
interface ConnectedClient {
  ws: WebSocket;
  role: string;
  interviewId?: string;
}

const clients: Set<ConnectedClient> = new Set();

wss.on('connection', (ws) => {
  const client: ConnectedClient = { ws, role: 'anonymous' };
  clients.add(client);

  ws.on('message', (message: string) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'subscribe') {
        client.role = data.role || 'anonymous';
        client.interviewId = data.interviewId;
        broadcastToRoom(data.interviewId, {
          type: 'participant_joined',
          interviewId: data.interviewId,
          role: client.role,
        });
      } else if (data.type === 'webrtc_signal') {
        broadcastToRoom(data.interviewId, data);
      } else if (data.type === 'media_state') {
        broadcastToRoom(data.interviewId, data);
      } else if (data.type === 'video_frame') {
        broadcastToRoom(data.interviewId, data);
      } else if (data.type === 'violation') {
        const { interviewId, violation } = data;
        const session = interviewSessions[interviewId];
        if (session) {
          session.violations.unshift(violation);
          session.fraudScore = Math.min(100, session.fraudScore + (violation.scorePenalty || 10));
          if (session.fraudScore >= 50) session.riskLevel = 'HIGH';
          else if (session.fraudScore >= 25) session.riskLevel = 'MEDIUM';
          else session.riskLevel = 'LOW';

          broadcastToRoom(interviewId, {
            type: 'fraud_update',
            interviewId,
            fraudScore: session.fraudScore,
            riskLevel: session.riskLevel,
            violation,
          });
        }
      } else if (data.type === 'metrics_update') {
        const { interviewId, metrics } = data;
        const session = interviewSessions[interviewId];
        if (session) {
          Object.assign(session, metrics);
          broadcastToRoom(interviewId, {
            type: 'metrics_synced',
            interviewId,
            metrics,
          });
        }
      } else if (data.type === 'transcript_append') {
        const { interviewId, segment } = data;
        const session = interviewSessions[interviewId];
        if (session) {
          session.transcript.push(segment);
          broadcastToRoom(interviewId, {
            type: 'transcript_updated',
            interviewId,
            segment,
          });
        }
      } else if (data.type === 'join_request') {
        broadcastToRoom(data.interviewId, {
          type: 'join_request',
          interviewId: data.interviewId,
          candidateName: data.candidateName,
          candidateId: data.candidateId,
        });
      } else if (data.type === 'admit_candidate') {
        const session = interviewSessions[data.interviewId];
        if (session) {
          session.status = 'IN_PROGRESS';
        }
        broadcastToRoom(data.interviewId, {
          type: 'admit_candidate',
          interviewId: data.interviewId,
          candidateId: data.candidateId,
        });
      } else if (data.type === 'deny_candidate') {
        broadcastToRoom(data.interviewId, {
          type: 'deny_candidate',
          interviewId: data.interviewId,
          candidateId: data.candidateId,
        });
      } else if (data.type === 'chat_message') {
        broadcastToRoom(data.interviewId, {
          type: 'chat_message',
          interviewId: data.interviewId,
          message: data.message,
        });
      }
    } catch (e) {
      console.error('[WS Error]', e);
    }
  });

  ws.on('close', () => {
    clients.delete(client);
  });
});

function broadcastToRoom(interviewId: string, payload: any) {
  const message = JSON.stringify(payload);
  for (const client of clients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      // Send to room listeners or admin monitor listeners
      if (client.interviewId === interviewId || client.role === 'admin') {
        client.ws.send(message);
      }
    }
  }
}

// REST API Routes

// 1. Auth Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password, captchaAnswer, captchaExpected } = req.body;

  if (captchaAnswer !== undefined && captchaExpected !== undefined) {
    if (String(captchaAnswer).trim() !== String(captchaExpected).trim()) {
      return res.status(400).json({ message: 'Invalid CAPTCHA verification response. Please try again.' });
    }
  }

  const user = usersDatabase[email?.toLowerCase()];
  if (!user) {
    return res.status(401).json({ message: 'Invalid email address or password.' });
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    return res.status(401).json({ message: 'Invalid email address or password.' });
  }

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
});

// 2. Auth Forgot Password OTP Request
app.post('/api/auth/forgot-password', (req, res) => {
  const { email } = req.body;
  const user = usersDatabase[email?.toLowerCase()];
  
  // Generate 6 digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore[email?.toLowerCase()] = {
    code: otp,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 mins
  };

  console.log(`[OTP Simulated Mail] Password reset OTP for ${email}: ${otp}`);

  res.json({
    message: 'OTP dispatch triggered successfully. Use demo code below or check console log.',
    otpCode: otp, // Returned for easy UI testing/demonstration
  });
});

// 3. Auth Reset Password OTP Verification
app.post('/api/auth/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;
  const storedOtp = otpStore[email?.toLowerCase()];

  if (!storedOtp || storedOtp.code !== otp || Date.now() > storedOtp.expiresAt) {
    return res.status(400).json({ message: 'Invalid or expired OTP verification code.' });
  }

  const user = usersDatabase[email?.toLowerCase()];
  if (user) {
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    delete otpStore[email?.toLowerCase()];
    return res.json({ message: 'Password reset successfully! You can now log in.' });
  }

  res.status(404).json({ message: 'User account not found.' });
});

// 4. Get Current User Session
app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const token = authHeader.substring(7);
    const decoded: any = jwt.verify(token, JWT_SECRET);
    res.json({ user: decoded });
  } catch (err) {
    res.status(401).json({ message: 'Session expired or invalid token' });
  }
});

// 5. Get All Interview Sessions (Admin & Interviewer)
app.get('/api/interviews', (req, res) => {
  res.json(Object.values(interviewSessions));
});

// 6. Schedule New Interview Session
app.post('/api/interviews/schedule', (req, res) => {
  const { title, candidateName, candidateEmail, interviewerName, interviewerEmail, jobRole, questions, scheduledTime, durationMinutes } = req.body;
  
  const id = 'sess_' + Date.now();
  const sessionId = 'SEC-INTV-' + Math.floor(1000 + Math.random() * 9000) + '-' + Math.random().toString(36).substring(2, 5).toUpperCase();

  const newSession = {
    id,
    sessionId,
    title: title || `${jobRole} Candidate Interview`,
    candidateName,
    candidateEmail,
    interviewerName,
    interviewerEmail,
    jobRole,
    status: 'SCHEDULED',
    scheduledTime: scheduledTime || new Date().toISOString(),
    durationMinutes: durationMinutes || 45,
    questions: questions || [
      { id: 'q1', text: 'Tell us about your background and core expertise.', category: 'General', timeLimitSeconds: 180 },
      { id: 'q2', text: 'Describe a challenging engineering bug you diagnosed and fixed under pressure.', category: 'Technical Problem Solving', timeLimitSeconds: 300 }
    ],
    currentQuestionIndex: 0,
    fraudScore: 0,
    riskLevel: 'LOW',
    faceVisibilityPercent: 100,
    cameraStatus: false,
    micStatus: false,
    screenShareStatus: false,
    fullscreenStatus: false,
    internetStatus: 'ONLINE',
    violations: [],
    emotions: { happy: 0, neutral: 100, angry: 0, sad: 0, fear: 0, surprise: 0, disgust: 0, confused: 0, stressed: 0, nervous: 0 },
    eyeGaze: { eyeContactPercentage: 100, blinkCount: 0, excessiveLookAwayCount: 0, prolongedClosureCount: 0 },
    headPose: { forwardPercentage: 100, turnedLeftCount: 0, turnedRightCount: 0, lookingDownCount: 0 },
    transcript: []
  };

  interviewSessions[id] = newSession;
  broadcastToRoom(id, { type: 'interview_created', session: newSession });
  res.status(201).json(newSession);
});

// 7. Get Single Interview Session (by ID or Meeting Code)
app.get('/api/interviews/code/:code', (req, res) => {
  const code = req.params.code.trim().toLowerCase();
  let session = interviewSessions[req.params.code];
  if (!session) {
    session = Object.values(interviewSessions).find(
      (s) => s.sessionId.toLowerCase() === code || s.id.toLowerCase() === code
    );
  }
  if (!session) {
    return res.status(404).json({ message: 'Meeting room link not found or expired.' });
  }
  res.json(session);
});

app.get('/api/interviews/:id', (req, res) => {
  const session = interviewSessions[req.params.id];
  if (!session) {
    return res.status(404).json({ message: 'Interview session not found.' });
  }
  res.json(session);
});

// 8. Log Violation Event with Screenshot
app.post('/api/interviews/:id/event', (req, res) => {
  const session = interviewSessions[req.params.id];
  if (!session) return res.status(404).json({ message: 'Session not found' });

  const { type, title, description, scorePenalty, confidenceScore, screenshotUrl, actionTaken } = req.body;

  const violation = {
    id: 'v_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    interviewId: req.params.id,
    timestamp: new Date().toLocaleTimeString(),
    type,
    title,
    description,
    scorePenalty: scorePenalty || 10,
    confidenceScore: confidenceScore || 0.92,
    screenshotUrl,
    actionTaken: actionTaken || 'Warning issued to candidate & recorded in fraud timeline',
  };

  session.violations.unshift(violation);
  session.fraudScore = Math.min(100, session.fraudScore + violation.scorePenalty);
  if (session.fraudScore >= 50) session.riskLevel = 'HIGH';
  else if (session.fraudScore >= 25) session.riskLevel = 'MEDIUM';
  else session.riskLevel = 'LOW';

  broadcastToRoom(req.params.id, {
    type: 'fraud_update',
    interviewId: req.params.id,
    fraudScore: session.fraudScore,
    riskLevel: session.riskLevel,
    violation,
  });

  res.json({ message: 'Violation logged', session });
});

// 9. Real-Time Gemini Translation API
app.post('/api/gemini/translate', async (req, res) => {
  const { text, targetLang = 'English' } = req.body;
  if (!text) return res.json({ translatedText: '' });

  if (!process.env.GEMINI_API_KEY) {
    return res.json({ translatedText: text });
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: `Translate the following speech transcript into clear ${targetLang}. Return ONLY the direct translation string without extra commentary or quotes: "${text}"`,
    });

    res.json({ translatedText: response.text?.trim() || text });
  } catch (err: any) {
    console.warn('[Gemini Translate Error - Graceful Fallback]', err?.message || err);
    res.json({ translatedText: text }); // Fallback to original text on API rate limit or error
  }
});

// 10. Generate Comprehensive AI Interview Report via Gemini API
app.post('/api/interviews/:id/end', async (req, res) => {
  const session = interviewSessions[req.params.id];
  if (!session) return res.status(404).json({ message: 'Session not found' });

  session.status = 'COMPLETED';
  if (req.body?.recordedVideoUrl) {
    session.recordedVideoUrl = req.body.recordedVideoUrl;
  }

  let aiReport: any = null;

  if (process.env.GEMINI_API_KEY) {
    try {
      const prompt = `
You are an expert AI Interview Proctor and HR Integrity Evaluator. Analyze the following candidate interview metadata and produce a detailed evaluation report.

Candidate: ${session.candidateName} (${session.jobRole})
Overall Fraud Score: ${session.fraudScore}/100
Risk Level: ${session.riskLevel}
Face Visibility: ${session.faceVisibilityPercent}%
Eye Contact Rate: ${session.eyeGaze?.eyeContactPercentage || 90}%
Total Violations Count: ${session.violations.length}
Violations Summary: ${JSON.stringify(session.violations.map((v: any) => ({ type: v.type, desc: v.description, time: v.timestamp })))}
Transcript Excerpts: ${JSON.stringify(session.transcript.slice(-6))}

Provide a JSON object response with:
1. "technicalCompetencyScore": integer 0-100
2. "softSkillsScore": integer 0-100
3. "aiRecommendations": list of string recommendations regarding integrity, performance, and fraud flags
4. "finalHiringDecision": one of ["RECOMMENDED", "NEEDS_REVIEW", "REJECT_SUSPECTED_FRAUD"]
5. "executiveSummary": short 2-3 sentence summary of candidate integrity and interview outcome.
`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        }
      });

      let aiParsed = {
        technicalCompetencyScore: session.fraudScore > 40 ? 55 : 88,
        softSkillsScore: 82,
        aiRecommendations: [
          session.fraudScore > 40 ? 'High risk of candidate cheating or unauthorized material reference during interview.' : 'Candidate demonstrated excellent integrity and strong domain communication.',
          'Review screenshot timeline for flagged head movement and tab switch timestamps.',
          'Verify technical depth on distributed systems questions in follow-up session.'
        ],
        finalHiringDecision: session.fraudScore >= 50 ? 'REJECT_SUSPECTED_FRAUD' : session.fraudScore >= 25 ? 'NEEDS_REVIEW' : 'RECOMMENDED',
        executiveSummary: `Interview completed with fraud score ${session.fraudScore} (${session.riskLevel} Risk). Total ${session.violations.length} anti-cheating violations were flagged.`
      };

      if (response.text) {
        try {
          const parsed = JSON.parse(response.text);
          Object.assign(aiParsed, parsed);
        } catch (pErr) {
          console.error('Failed to parse JSON response from Gemini:', pErr);
        }
      }

      aiReport = {
        id: 'rep_' + Date.now(),
        interviewId: session.id,
        generatedAt: new Date().toISOString(),
        candidateName: session.candidateName,
        jobRole: session.jobRole,
        overallFraudScore: session.fraudScore,
        riskClassification: session.riskLevel,
        faceVisibilityPercent: session.faceVisibilityPercent,
        eyeContactPercent: session.eyeGaze?.eyeContactPercentage || 92,
        emotionBreakdown: session.emotions,
        totalViolationsCount: session.violations.length,
        violationsSummary: session.violations,
        transcript: session.transcript,
        aiRecommendations: aiParsed.aiRecommendations,
        technicalCompetencyScore: aiParsed.technicalCompetencyScore,
        softSkillsScore: aiParsed.softSkillsScore,
        finalHiringDecision: aiParsed.finalHiringDecision,
      };
    } catch (err: any) {
      console.warn('[Gemini Report Error - Utilizing Intelligent Fallback]', err?.message || err);
    }
  }

  // Fallback report generation if Gemini API fails or quota exceeded
  if (!aiReport) {
    aiReport = {
      id: 'rep_' + Date.now(),
      interviewId: session.id,
      generatedAt: new Date().toISOString(),
      candidateName: session.candidateName,
      jobRole: session.jobRole,
      overallFraudScore: session.fraudScore,
      riskClassification: session.riskLevel,
      faceVisibilityPercent: session.faceVisibilityPercent,
      eyeContactPercent: session.eyeGaze?.eyeContactPercentage || 90,
      emotionBreakdown: session.emotions,
      totalViolationsCount: session.violations.length,
      violationsSummary: session.violations,
      transcript: session.transcript,
      aiRecommendations: [
        session.fraudScore > 30 ? 'Caution: Candidate flagged multiple security violations during session.' : 'Candidate verified with high facial visibility and consistent eye contact.',
        'Timestamped screenshots available for proctoring audit review.',
        'Review real-time proctoring metrics and eye contact logs.'
      ],
      technicalCompetencyScore: session.fraudScore > 40 ? 60 : 85,
      softSkillsScore: 80,
      finalHiringDecision: session.fraudScore >= 50 ? 'REJECT_SUSPECTED_FRAUD' : session.fraudScore >= 25 ? 'NEEDS_REVIEW' : 'RECOMMENDED',
    };
  }

  session.aiReport = aiReport;
  broadcastToRoom(session.id, { type: 'interview_ended', session });

  res.json({ message: 'Interview ended successfully', report: aiReport, session });
});

// Serve frontend with Vite middleware in dev, or static files in production
async function setupViteOrStatic() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

setupViteOrStatic().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[AI Monitor Server] Listening on http://0.0.0.0:${PORT}`);
  });
});
