/**
 * API Routes — Smart Salinity Ingress Advisor
 * RESTful endpoints for all agent interactions and data access
 */

const express = require('express');
const router = express.Router();

const orchestratorAgent = require('../agents/orchestratorAgent');
const salinityMonitorAgent = require('../agents/salinityMonitorAgent');
const cropRecommendationAgent = require('../agents/cropRecommendationAgent');
const landReclamationAgent = require('../agents/landReclamationAgent');
const irrigationAdvisoryAgent = require('../agents/irrigationAdvisoryAgent');
const watsonxService = require('../services/watsonxService');
const {
  generateSensorReading,
  getTrendData,
  getRecommendedCrops,
  DISTRICTS
} = require('../services/salinityDataService');

// ─────────────────────────────────────────────
// HEALTH & STATUS
// ─────────────────────────────────────────────

/**
 * GET /api/health — Service health check
 */
router.get('/health', async (req, res) => {
  const watsonxStatus = await watsonxService.healthCheck();
  res.json({
    status: 'operational',
    timestamp: new Date().toISOString(),
    watsonx: watsonxStatus,
    agents: ['OrchestratorAgent', 'SalinityMonitorAgent', 'CropRecommendationAgent',
      'LandReclamationAgent', 'IrrigationAdvisoryAgent'],
    version: '1.0.0'
  });
});

// ─────────────────────────────────────────────
// ORCHESTRATOR — MAIN AI CHAT ENDPOINT
// ─────────────────────────────────────────────

/**
 * POST /api/chat — Main conversational AI endpoint
 * Body: { query: string, session_id?: string }
 */
router.post('/chat', async (req, res) => {
  const { query, session_id } = req.body;
  if (!query || query.trim().length === 0) {
    return res.status(400).json({ error: 'Query is required' });
  }

  try {
    const result = await orchestratorAgent.process(query.trim(), session_id);
    res.json(result);
  } catch (error) {
    console.error('[Chat Error]', error);
    res.status(500).json({
      error: 'Failed to process query',
      message: error.message,
      fallback: 'Please check your IBM watsonx.ai credentials in .env file'
    });
  }
});

/**
 * POST /api/session — Create a new conversation session
 */
router.post('/session', (req, res) => {
  const { user_id } = req.body;
  const session_id = orchestratorAgent.createSession(user_id);
  res.json({ session_id, created: new Date().toISOString() });
});

// ─────────────────────────────────────────────
// SALINITY DATA ENDPOINTS
// ─────────────────────────────────────────────

/**
 * GET /api/salinity/:district — Current salinity readings
 */
router.get('/salinity/:district', (req, res) => {
  const { district } = req.params;
  const { taluka } = req.query;

  if (!DISTRICTS[district.toLowerCase()]) {
    return res.status(404).json({
      error: `District '${district}' not found`,
      available: Object.keys(DISTRICTS)
    });
  }

  const reading = generateSensorReading(district, taluka);
  res.json(reading);
});

/**
 * GET /api/salinity/:district/trend — 30-day trend data for charts
 */
router.get('/salinity/:district/trend', (req, res) => {
  const { district } = req.params;
  const days = Math.min(parseInt(req.query.days) || 30, 90);

  if (!DISTRICTS[district.toLowerCase()]) {
    return res.status(404).json({ error: `District '${district}' not found` });
  }

  const trend = getTrendData(district, days);
  res.json({ district, days, data: trend });
});

/**
 * GET /api/salinity/all — Readings for all 3 districts
 */
router.get('/salinity/all/current', (req, res) => {
  const readings = Object.keys(DISTRICTS).map(d => generateSensorReading(d));
  res.json({ timestamp: new Date().toISOString(), districts: readings });
});

/**
 * GET /api/salinity/:district/assess — AI-powered assessment
 */
router.get('/salinity/:district/assess', async (req, res) => {
  const { district } = req.params;
  if (!DISTRICTS[district.toLowerCase()]) {
    return res.status(404).json({ error: `District '${district}' not found` });
  }

  try {
    const assessment = await salinityMonitorAgent.quickAssess(district);
    res.json(assessment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────
// CROP RECOMMENDATION ENDPOINTS
// ─────────────────────────────────────────────

/**
 * GET /api/crops — Get crops for given EC level
 */
router.get('/crops', (req, res) => {
  const { ec, district } = req.query;
  if (!ec) return res.status(400).json({ error: 'ec parameter required (e.g. ?ec=6.5)' });

  const recommendations = getRecommendedCrops(parseFloat(ec));
  res.json({ ec_level: parseFloat(ec), district: district || 'general', recommendations });
});

/**
 * POST /api/crops/recommend — AI-powered crop table
 */
router.post('/crops/recommend', async (req, res) => {
  const { ec_level, district } = req.body;
  if (!ec_level) return res.status(400).json({ error: 'ec_level required' });

  try {
    const result = await cropRecommendationAgent.getCropTable(
      parseFloat(ec_level),
      district || 'kutch'
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────
// LAND RECLAMATION ENDPOINTS
// ─────────────────────────────────────────────

/**
 * POST /api/reclamation/plan — Generate reclamation plan
 */
router.post('/reclamation/plan', async (req, res) => {
  const { district, area_ha, ec_level } = req.body;
  if (!district || !area_ha || !ec_level) {
    return res.status(400).json({ error: 'district, area_ha, and ec_level are required' });
  }

  try {
    const plan = await landReclamationAgent.generateReclamationPlan(
      district,
      parseFloat(area_ha),
      parseFloat(ec_level)
    );
    res.json(plan);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────
// IRRIGATION ADVISORY ENDPOINTS
// ─────────────────────────────────────────────

/**
 * POST /api/irrigation/schedule — Generate irrigation schedule
 */
router.post('/irrigation/schedule', async (req, res) => {
  const { crop, district, water_ec } = req.body;
  if (!crop || !district) {
    return res.status(400).json({ error: 'crop and district are required' });
  }

  try {
    const schedule = await irrigationAdvisoryAgent.generateWeeklySchedule(
      crop,
      district,
      parseFloat(water_ec) || 3.0
    );
    res.json(schedule);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────
// DISTRICT INFO
// ─────────────────────────────────────────────

/**
 * GET /api/districts — Get all district metadata
 */
router.get('/districts', (req, res) => {
  res.json({ districts: DISTRICTS });
});

/**
 * GET /api/districts/:name — Get specific district info
 */
router.get('/districts/:name', (req, res) => {
  const info = DISTRICTS[req.params.name.toLowerCase()];
  if (!info) return res.status(404).json({ error: 'District not found' });
  res.json(info);
});

module.exports = router;
