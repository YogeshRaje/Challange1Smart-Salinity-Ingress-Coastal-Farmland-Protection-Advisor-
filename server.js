/**
 * Server Entry Point — Smart Salinity Ingress Coastal Farmland Protection Advisor
 * Express server with WebSocket support for real-time salinity alerts
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const apiRoutes = require('./routes/api');
const { generateSensorReading, getAlertLevel, DISTRICTS } = require('./services/salinityDataService');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────────

app.use(helmet({
  contentSecurityPolicy: false // Allow inline scripts in our dashboard
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? process.env.ALLOWED_ORIGINS?.split(',') : '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', apiLimiter);

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────
// API ROUTES
// ─────────────────────────────────────────────

app.use('/api', apiRoutes);

// Catch-all: Serve frontend for all non-API routes (SPA support)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─────────────────────────────────────────────
// WEBSOCKET — REAL-TIME SALINITY ALERTS
// ─────────────────────────────────────────────

const wss = new WebSocket.Server({ server, path: '/ws' });
const wsClients = new Set();

wss.on('connection', (ws, req) => {
  wsClients.add(ws);
  console.log(`[WebSocket] Client connected. Total: ${wsClients.size}`);

  // Send initial readings for all districts
  const initialData = Object.keys(DISTRICTS).map(d => generateSensorReading(d));
  ws.send(JSON.stringify({
    type: 'initial_readings',
    data: initialData,
    timestamp: new Date().toISOString()
  }));

  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message.toString());
      if (msg.type === 'subscribe_district') {
        ws.subscribedDistrict = msg.district;
        console.log(`[WebSocket] Client subscribed to ${msg.district}`);
      }
    } catch (e) {
      // Ignore malformed messages
    }
  });

  ws.on('close', () => {
    wsClients.delete(ws);
    console.log(`[WebSocket] Client disconnected. Total: ${wsClients.size}`);
  });

  ws.on('error', (err) => {
    console.error('[WebSocket] Error:', err.message);
    wsClients.delete(ws);
  });
});

// Broadcast salinity updates every 30 seconds (simulate IoT feeds)
const broadcastInterval = setInterval(() => {
  if (wsClients.size === 0) return;

  const updates = Object.keys(DISTRICTS).map(d => {
    const reading = generateSensorReading(d);
    return {
      district: d,
      soil_ec: reading.soil.ec_surface_ds_m,
      gw_ec: reading.groundwater.ec_ds_m,
      alert_level: reading.tidal_ingress.alert_level,
      timestamp: reading.timestamp
    };
  });

  const message = JSON.stringify({
    type: 'salinity_update',
    data: updates,
    timestamp: new Date().toISOString()
  });

  wsClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}, 30000);

// ─────────────────────────────────────────────
// ERROR HANDLING
// ─────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error('[Error]', err.stack);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────

server.listen(PORT, () => {
  console.log('\n════════════════════════════════════════════════════');
  console.log('  🌊 Smart Salinity Ingress Advisor — Server Ready');
  console.log('════════════════════════════════════════════════════');
  console.log(`  🚀 Server:    http://localhost:${PORT}`);
  console.log(`  📡 WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`  🤖 LLM:       ${process.env.WATSONX_MODEL_ID || 'ibm/granite-13b-instruct-v2'}`);
  console.log(`  🌍 Districts: Kutch | Jamnagar | Bhavnagar`);
  console.log('════════════════════════════════════════════════════\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  clearInterval(broadcastInterval);
  server.close(() => process.exit(0));
});

module.exports = { app, server };
