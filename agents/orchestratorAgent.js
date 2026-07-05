/**
 * Orchestrator Agent — Master Coordinator
 * Routes incoming farmer queries to appropriate specialist agents,
 * synthesizes multi-agent responses, handles multi-turn conversation context
 * Implements: Plan → Delegate → Synthesize → Respond pattern
 */

const watsonxService = require('../services/watsonxService');
const salinityMonitorAgent = require('./salinityMonitorAgent');
const cropRecommendationAgent = require('./cropRecommendationAgent');
const landReclamationAgent = require('./landReclamationAgent');
const irrigationAdvisoryAgent = require('./irrigationAdvisoryAgent');
const { v4: uuidv4 } = require('uuid');

// In-memory session store (use Redis in production)
const sessions = new Map();
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

const ORCHESTRATOR_PROMPT = `You are the Smart Salinity Advisor Orchestrator for Gujarat coastal farmers.
You coordinate 4 specialist agents:
1. SalinityMonitor — EC/pH data, groundwater salinization, tidal ingress alerts
2. CropRecommendation — Salt-tolerant varieties, planting calendars, yield predictions  
3. LandReclamation — Gypsum treatment, drainage, phyto-remediation, recovery timelines
4. IrrigationAdvisory — Water quality management, drip scheduling, leaching requirements

Your job: Analyze the farmer's query and decide which agents to invoke.

Respond with a JSON routing decision:
{
  "primary_agent": "agent_name",
  "additional_agents": ["agent_name2"],
  "context": {
    "district": "district_name or null",
    "ec_level": numeric_or_null,
    "area_ha": numeric_or_null,
    "crop": "crop_name or null",
    "ec_water": numeric_or_null
  },
  "query_type": "salinity_check | crop_advice | reclamation | irrigation | general",
  "urgency": "low | medium | high | critical",
  "reasoning": "brief explanation"
}

Agent routing rules:
- Questions about soil/water quality, readings, alerts → SalinityMonitor (+ optionally CropRecommendation)
- Questions about what to grow, crop selection → CropRecommendation (+ SalinityMonitor for data)
- Questions about fixing/treating land, soil health → LandReclamation
- Questions about watering, irrigation, water quality → IrrigationAdvisory
- General/compound questions → use multiple agents
- Greeting or unclear → SalinityMonitor as default with general overview`;

class OrchestratorAgent {
  constructor() {
    this.name = 'OrchestratorAgent';
  }

  /**
   * Create a new conversation session
   */
  createSession(userId = null) {
    const sessionId = uuidv4();
    sessions.set(sessionId, {
      id: sessionId,
      userId,
      history: [],
      context: { district: null, ec_level: null, last_reading: null },
      created: Date.now(),
      lastActive: Date.now()
    });
    return sessionId;
  }

  /**
   * Get or create session
   */
  getSession(sessionId) {
    const session = sessions.get(sessionId);
    if (!session || Date.now() - session.lastActive > SESSION_TTL_MS) {
      const newId = this.createSession();
      return sessions.get(newId);
    }
    session.lastActive = Date.now();
    return session;
  }

  /**
   * Route query to appropriate agent(s)
   */
  async route(query) {
    const routingPrompt = `${ORCHESTRATOR_PROMPT}\n\nFarmer Query: "${query}"\n\nRespond with JSON only:`;

    try {
      const response = await watsonxService.generateText(routingPrompt, {
        max_new_tokens: 256,
        temperature: 0.1
      });

      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      // Fall back to default routing
    }

    // Default routing based on keyword analysis
    return this.keywordRoute(query);
  }

  /**
   * Keyword-based fallback routing
   */
  keywordRoute(query) {
    const q = query.toLowerCase();
    let primary_agent = 'SalinityMonitor';
    let query_type = 'salinity_check';
    const additional_agents = [];

    if (q.match(/\b(crop|plant|grow|sow|seed|harvest|yield|variety|kheti|fasal)\b/)) {
      primary_agent = 'CropRecommendation';
      query_type = 'crop_advice';
      additional_agents.push('SalinityMonitor');
    } else if (q.match(/\b(reclaim|restore|treat|gypsum|amend|drainage|fix|improve|recover)\b/)) {
      primary_agent = 'LandReclamation';
      query_type = 'reclamation';
    } else if (q.match(/\b(irrigat|water|drip|sprinkler|schedule|leach|pumping)\b/)) {
      primary_agent = 'IrrigationAdvisory';
      query_type = 'irrigation';
    }

    // Extract district from query
    const districtMatch = q.match(/\b(kutch|jamnagar|bhavnagar)\b/);
    const district = districtMatch ? districtMatch[1] : null;

    // Extract EC value from query
    const ecMatch = q.match(/(\d+\.?\d*)\s*ds\/m/i);
    const ec_level = ecMatch ? parseFloat(ecMatch[1]) : null;

    return {
      primary_agent,
      additional_agents,
      context: { district, ec_level, area_ha: null, crop: null, ec_water: null },
      query_type,
      urgency: 'medium',
      reasoning: 'Keyword-based routing'
    };
  }

  /**
   * Main entry point: Process a farmer query end-to-end
   */
  async process(query, sessionId = null) {
    const startTime = Date.now();
    let session;

    if (sessionId) {
      session = this.getSession(sessionId);
    } else {
      const newId = this.createSession();
      session = sessions.get(newId);
      sessionId = newId;
    }

    // Add context from session history
    const contextualQuery = session.context.district
      ? `[Context: District=${session.context.district}, Last EC=${session.context.ec_level || 'unknown'}] ${query}`
      : query;

    // Step 1: Route the query
    const routing = await this.route(contextualQuery);

    // Step 2: Execute primary agent
    const agentMap = {
      'SalinityMonitor': salinityMonitorAgent,
      'CropRecommendation': cropRecommendationAgent,
      'LandReclamation': landReclamationAgent,
      'IrrigationAdvisory': irrigationAdvisoryAgent
    };

    const primaryAgent = agentMap[routing.primary_agent];
    let primaryResult = null;
    let additionalResults = [];

    try {
      primaryResult = await primaryAgent.run(query, routing.context);
    } catch (e) {
      primaryResult = {
        agent: routing.primary_agent,
        answer: `Service temporarily unavailable. ${e.message}`,
        error: true
      };
    }

    // Step 3: Run additional agents in parallel if needed
    if (routing.additional_agents && routing.additional_agents.length > 0) {
      const additionalPromises = routing.additional_agents
        .filter(name => agentMap[name] && name !== routing.primary_agent)
        .map(name => agentMap[name].run(query, routing.context).catch(e => ({
          agent: name,
          answer: '',
          error: e.message
        })));

      additionalResults = await Promise.all(additionalPromises);
    }

    // Step 4: Synthesize if multiple agents responded
    let finalAnswer = primaryResult.answer;
    if (additionalResults.length > 0 && !primaryResult.error) {
      finalAnswer = await this.synthesize(query, primaryResult, additionalResults);
    }

    // Step 5: Update session context
    if (routing.context.district) session.context.district = routing.context.district;
    if (routing.context.ec_level) session.context.ec_level = routing.context.ec_level;

    session.history.push({
      query,
      response: finalAnswer,
      timestamp: new Date().toISOString(),
      agents_used: [routing.primary_agent, ...routing.additional_agents]
    });

    return {
      session_id: sessionId,
      query,
      routing,
      answer: finalAnswer,
      primary_agent: routing.primary_agent,
      agents_used: [routing.primary_agent, ...routing.additional_agents],
      processing_time_ms: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Synthesize responses from multiple agents into a coherent answer
   */
  async synthesize(originalQuery, primaryResult, additionalResults) {
    const allResponses = [primaryResult, ...additionalResults]
      .filter(r => r.answer && !r.error)
      .map(r => `[${r.agent}]: ${r.answer}`)
      .join('\n\n');

    const synthesisPrompt = `<|system|>
You are a helpful agricultural advisor for Gujarat coastal farmers facing salinity challenges.
Combine the specialist responses into one clear, practical answer using simple language.
<|user|>
Original farmer question: "${originalQuery}"

Specialist agent responses:
${allResponses}

Write a single unified response that directly answers the farmer's question, integrates all agent insights, includes specific numbers and timelines.
<|assistant|>`;

    try {
      const synthesized = await watsonxService.generateText(synthesisPrompt, {
        max_new_tokens: 512,
        temperature: 0.3
      });
      return synthesized.trim() || primaryResult.answer;
    } catch (e) {
      return primaryResult.answer;
    }
  }

  /**
   * Get all active sessions (for admin monitoring)
   */
  getActiveSessions() {
    const now = Date.now();
    return Array.from(sessions.values())
      .filter(s => now - s.lastActive < SESSION_TTL_MS)
      .map(s => ({
        id: s.id,
        queries: s.history.length,
        lastActive: new Date(s.lastActive).toISOString()
      }));
  }
}

module.exports = new OrchestratorAgent();
