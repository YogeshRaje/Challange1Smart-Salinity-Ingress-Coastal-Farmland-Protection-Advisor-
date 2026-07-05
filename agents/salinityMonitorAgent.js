/**
 * Salinity Monitor Agent — Granite-3 optimized
 * Pre-fetches live data, then asks LLM to analyse it (no tool-call loop needed).
 * Falls back to full ReAct loop for complex queries.
 */

const watsonxService = require('../services/watsonxService');
const { TOOL_REGISTRY } = require('../services/agentToolsService');

class SalinityMonitorAgent {
  constructor() {
    this.name = 'SalinityMonitorAgent';
  }

  async run(query, context = {}) {
    const district = context.district || extractDistrict(query) || 'kutch';

    // Pre-fetch live data so LLM only needs to reason, not call tools
    let liveData = '';
    try {
      const [reading, trend] = await Promise.all([
        TOOL_REGISTRY.getSalinityReadings.fn({ district }),
        TOOL_REGISTRY.getSalinityTrend.fn({ district, days: 14 })
      ]);
      liveData = `
LIVE SENSOR DATA for ${reading.data.district}:
- Soil EC (surface 0-30cm): ${reading.data.soil.ec_surface_ds_m} dS/m
- Soil EC (subsurface 30-60cm): ${reading.data.soil.ec_subsurface_ds_m} dS/m
- Soil pH: ${reading.data.soil.ph}
- SAR (Sodium Adsorption Ratio): ${reading.data.soil.sodium_adsorption_ratio}
- ESP (Exchangeable Sodium %): ${reading.data.soil.exchangeable_sodium_pct}%
- Groundwater EC: ${reading.data.groundwater.ec_ds_m} dS/m at ${reading.data.groundwater.depth_m}m depth
- Chloride: ${reading.data.groundwater.chloride_mg_l} mg/L | TDS: ${reading.data.groundwater.tds_mg_l} mg/L
- Tidal Ingress Alert: ${reading.data.tidal_ingress.alert_level}
- 14-day trend: ${trend.data.trend} (Avg EC: ${trend.data.avg_ec} dS/m, Max: ${trend.data.max_ec} dS/m)
- Season: ${reading.data.tidal_ingress.season}`;
    } catch (e) {
      liveData = `(Live sensor data unavailable: ${e.message})`;
    }

    const prompt = `<|system|>
You are a Salinity Monitor expert for Gujarat coastal farmland (Kutch, Jamnagar, Bhavnagar). 
Give clear, actionable salinity assessments using the provided sensor data.
Salinity scale: 0-2 dS/m Safe | 2-4 Low | 4-8 Moderate | 8-16 High | >16 Critical
<|user|>
${liveData}

Farmer Question: ${query}

Provide a complete assessment covering:
1. Current salinity status and risk level
2. What this means for crops right now
3. 14-day trend interpretation (is it getting worse?)
4. Immediate action recommended
<|assistant|>`;

    const answer = await watsonxService.generateText(prompt, {
      max_new_tokens: 512,
      temperature: 0.25
    });

    return {
      agent: this.name,
      query,
      answer: answer.trim(),
      district
    };
  }

  async quickAssess(district) {
    const [reading, trend] = await Promise.all([
      TOOL_REGISTRY.getSalinityReadings.fn({ district }),
      TOOL_REGISTRY.getSalinityTrend.fn({ district, days: 14 })
    ]);

    const prompt = `<|system|>
You are a salinity expert for Gujarat coastal agriculture. Be concise and practical.
<|user|>
District: ${reading.data.district}
Soil EC: ${reading.data.soil.ec_surface_ds_m} dS/m | pH: ${reading.data.soil.ph} | SAR: ${reading.data.soil.sodium_adsorption_ratio}
Groundwater EC: ${reading.data.groundwater.ec_ds_m} dS/m | Depth: ${reading.data.groundwater.depth_m}m
Alert: ${reading.data.tidal_ingress.alert_level} | 14-day trend: ${trend.data.trend}

Give a 3-sentence quick assessment: current status, trend risk, and most important immediate action.
<|assistant|>`;

    const answer = await watsonxService.generateText(prompt, { max_new_tokens: 200, temperature: 0.2 });
    return { agent: this.name, district, reading: reading.data, trend: trend.data, answer: answer.trim() };
  }
}

function extractDistrict(text) {
  const t = text.toLowerCase();
  if (t.includes('kutch')) return 'kutch';
  if (t.includes('jamnagar')) return 'jamnagar';
  if (t.includes('bhavnagar')) return 'bhavnagar';
  return null;
}

module.exports = new SalinityMonitorAgent();
