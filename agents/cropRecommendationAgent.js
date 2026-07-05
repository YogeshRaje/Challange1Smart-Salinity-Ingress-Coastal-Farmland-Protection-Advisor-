/**
 * Crop Recommendation Agent — Granite-3 optimized
 * Pre-loads crop data, asks LLM to reason about suitability.
 */

const watsonxService = require('../services/watsonxService');
const { TOOL_REGISTRY } = require('../services/agentToolsService');
const { getSeason } = require('../services/salinityDataService');

class CropRecommendationAgent {
  constructor() {
    this.name = 'CropRecommendationAgent';
  }

  async run(query, context = {}) {
    const district = context.district || extractDistrict(query) || 'kutch';
    const ec = context.ec_level || extractEC(query) || null;

    // Get live reading if no EC provided
    let ecToUse = ec;
    let liveContext = '';
    try {
      const reading = await TOOL_REGISTRY.getSalinityReadings.fn({ district });
      if (!ecToUse) ecToUse = reading.data.soil.ec_surface_ds_m;
      liveContext = `Current soil EC in ${reading.data.district}: ${reading.data.soil.ec_surface_ds_m} dS/m (Alert: ${reading.data.tidal_ingress.alert_level})`;
    } catch (e) {
      if (!ecToUse) ecToUse = 8.0;
      liveContext = `Using provided EC: ${ecToUse} dS/m`;
    }

    // Get matching crops
    const crops = await TOOL_REGISTRY.getCropRecommendations.fn({ ec_level: ecToUse, district });
    const season = getSeason();

    const cropList = [
      ...crops.data.crops.highly_suitable.slice(0, 4).map(c => `✓ HIGHLY SUITABLE: ${c.name} (tolerates up to ${c.tolerance_ece} dS/m, Season: ${c.season}, Varieties: ${c.varieties.join(', ')})`),
      ...crops.data.crops.suitable.slice(0, 3).map(c => `~ SUITABLE: ${c.name} (tolerates up to ${c.tolerance_ece} dS/m, Season: ${c.season})`),
      ...crops.data.crops.marginal.slice(0, 2).map(c => `⚠ MARGINAL: ${c.name} (tolerates up to ${c.tolerance_ece} dS/m)`)
    ].join('\n');

    const prompt = `<|system|>
You are an expert crop advisor for Gujarat coastal farmers dealing with soil salinity.
Give practical, specific crop recommendations with varieties, planting tips, and expected yields.
Mention relevant government schemes (PM-KISAN, RKVY, PMFBY) where applicable.
<|user|>
${liveContext}
Current Season: ${season}
District: ${district}

Available crops for this EC level (${ecToUse} dS/m):
${cropList || 'Only halophytes suitable at this extreme salinity level'}

Farmer Question: ${query}

Provide:
1. Top 3 recommended crops with specific Gujarat varieties and why they suit current conditions
2. Planting calendar for this season
3. Expected yield compared to normal conditions
4. One halophyte option if EC is above 10 dS/m
5. Any relevant government support scheme
<|assistant|>`;

    const answer = await watsonxService.generateText(prompt, {
      max_new_tokens: 600,
      temperature: 0.3
    });

    return {
      agent: this.name,
      query,
      answer: answer.trim(),
      district,
      ec_level: ecToUse
    };
  }

  async getCropTable(ec_level, district) {
    const crops = await TOOL_REGISTRY.getCropRecommendations.fn({ ec_level, district });
    const season = getSeason();

    const cropSummary = [
      ...crops.data.crops.highly_suitable.slice(0, 5),
      ...crops.data.crops.suitable.slice(0, 3)
    ].map(c => `${c.name}: tolerates ${c.tolerance_ece} dS/m, ${c.season}, varieties: ${c.varieties.join('/')}`).join('\n');

    const prompt = `<|system|>
You are a crop advisor for Gujarat coastal saline farmland. Be structured and specific.
<|user|>
District: ${district} | Soil EC: ${ec_level} dS/m | Season: ${season}

Suitable crops:
${cropSummary || 'Extreme salinity — halophytes only'}

Give structured recommendations:
1. Top 3 crops (name, variety, expected yield, planting month)
2. Economic value in Gujarat market
3. Special care tips for saline conditions
4. Government support available
<|assistant|>`;

    const answer = await watsonxService.generateText(prompt, { max_new_tokens: 512, temperature: 0.3 });
    return {
      agent: this.name,
      ec_level,
      district,
      season,
      crops: crops.data.crops,
      recommendations: answer.trim()
    };
  }
}

function extractDistrict(text) {
  const t = text.toLowerCase();
  if (t.includes('kutch')) return 'kutch';
  if (t.includes('jamnagar')) return 'jamnagar';
  if (t.includes('bhavnagar')) return 'bhavnagar';
  return null;
}

function extractEC(text) {
  const m = text.match(/(\d+\.?\d*)\s*ds\/m/i) || text.match(/ec[^\d]*(\d+\.?\d*)/i);
  return m ? parseFloat(m[1]) : null;
}

module.exports = new CropRecommendationAgent();
