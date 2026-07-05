/**
 * Agent Tools Service
 * Shared tool definitions used by specialist agents (ReAct pattern)
 * Each tool is a callable function that agents can invoke during reasoning
 */

const salinityDataService = require('./salinityDataService');

/**
 * Tool: Get current salinity readings for a district
 */
async function getSalinityReadings({ district, taluka }) {
  const reading = salinityDataService.generateSensorReading(district, taluka);
  return {
    tool: 'getSalinityReadings',
    data: reading,
    summary: `District: ${reading.district} | Soil EC: ${reading.soil.ec_surface_ds_m} dS/m | ` +
      `GW EC: ${reading.groundwater.ec_ds_m} dS/m | Alert: ${reading.tidal_ingress.alert_level}`
  };
}

/**
 * Tool: Get 30-day salinity trend
 */
async function getSalinityTrend({ district, days = 30 }) {
  const trend = salinityDataService.getTrendData(district, days);
  const avgEC = (trend.reduce((s, r) => s + r.soil_ec, 0) / trend.length).toFixed(2);
  const maxEC = Math.max(...trend.map(r => r.soil_ec)).toFixed(2);
  const trend_direction = trend[trend.length - 1].soil_ec > trend[0].soil_ec ? 'INCREASING' : 'DECLINING';

  return {
    tool: 'getSalinityTrend',
    data: { readings: trend, avg_ec: avgEC, max_ec: maxEC, trend: trend_direction },
    summary: `30-day trend for ${district}: Avg EC ${avgEC} dS/m, Max ${maxEC} dS/m, Trend: ${trend_direction}`
  };
}

/**
 * Tool: Get crop recommendations based on EC level
 */
async function getCropRecommendations({ ec_level, season, district }) {
  const crops = salinityDataService.getRecommendedCrops(parseFloat(ec_level));
  const currentSeason = season || salinityDataService.getSeason();

  return {
    tool: 'getCropRecommendations',
    data: { crops, season: currentSeason, ec_level },
    summary: `For EC ${ec_level} dS/m: ${crops.highly_suitable.length} highly suitable, ` +
      `${crops.suitable.length} suitable, ${crops.marginal.length} marginal crops`
  };
}

/**
 * Tool: Get reclamation amendment calculation
 */
async function calculateAmendment({ area_ha, ec_level, soil_type }) {
  const amendments = salinityDataService.RECLAMATION_AMENDMENTS;
  const severity = ec_level > 16 ? 'high' : ec_level > 8 ? 'medium' : 'low';
  const area = parseFloat(area_ha) || 1;

  const gypsum_qty = (amendments.gypsum.application_rate_kg_per_ha[severity] * area);
  const gypsum_cost = gypsum_qty * amendments.gypsum.cost_per_kg_inr;

  return {
    tool: 'calculateAmendment',
    data: {
      area_ha: area,
      severity,
      gypsum_required_kg: gypsum_qty,
      gypsum_cost_inr: gypsum_cost,
      green_manure_required_kg: amendments.green_manure.application_rate_kg_per_ha.all * area,
      estimated_recovery_weeks: ec_level > 8 ? 20 : 12
    },
    summary: `For ${area} ha (${severity} salinity): ${gypsum_qty.toLocaleString()} kg gypsum needed, ` +
      `cost ₹${gypsum_cost.toLocaleString()}, estimated recovery ${ec_level > 8 ? 20 : 12} weeks`
  };
}

/**
 * Tool: Get irrigation schedule recommendation
 */
async function getIrrigationSchedule({ crop, district, ec_water, soil_type }) {
  const waterEC = parseFloat(ec_water) || 3.0;
  // Leaching Requirement = ECw / (5 * ECe_threshold - ECw)
  const crop_ec_threshold = 4.0; // Default moderate tolerance
  const LR = (waterEC / (5 * crop_ec_threshold - waterEC)).toFixed(3);
  const leaching_fraction = Math.min(parseFloat(LR), 0.5);

  return {
    tool: 'getIrrigationSchedule',
    data: {
      crop,
      water_ec_ds_m: waterEC,
      leaching_requirement: leaching_fraction,
      recommended_method: waterEC > 4 ? 'Drip Irrigation' : 'Sprinkler/Furrow',
      irrigation_interval_days: waterEC > 6 ? 3 : waterEC > 3 ? 5 : 7,
      pre_sowing_leaching: 'Apply 600-800 mm water before sowing to push salts below root zone',
      timing: 'Irrigate in early morning or evening to minimize evaporation concentration'
    },
    summary: `Water EC: ${waterEC} dS/m | Leaching Fraction: ${(leaching_fraction * 100).toFixed(1)}% | ` +
      `Method: ${waterEC > 4 ? 'Drip' : 'Sprinkler'} | Interval: every ${waterEC > 6 ? 3 : waterEC > 3 ? 5 : 7} days`
  };
}

/**
 * Tool: Get district overview
 */
async function getDistrictInfo({ district }) {
  const info = salinityDataService.DISTRICTS[district.toLowerCase()];
  if (!info) return { tool: 'getDistrictInfo', error: `Unknown district: ${district}` };

  return {
    tool: 'getDistrictInfo',
    data: info,
    summary: `${info.name}: ${info.risk_level} risk | ${info.coastline_km}km coastline | ${info.talukas.length} talukas`
  };
}

// Tool registry for agents
const TOOL_REGISTRY = {
  getSalinityReadings: {
    fn: getSalinityReadings,
    description: 'Fetch real-time soil EC, pH, SAR and groundwater EC data for a district',
    params: ['district', 'taluka (optional)']
  },
  getSalinityTrend: {
    fn: getSalinityTrend,
    description: 'Get 30-day historical salinity trend with direction analysis',
    params: ['district', 'days (optional, default 30)']
  },
  getCropRecommendations: {
    fn: getCropRecommendations,
    description: 'Get list of suitable crops based on soil EC level and season',
    params: ['ec_level', 'season (optional)', 'district (optional)']
  },
  calculateAmendment: {
    fn: calculateAmendment,
    description: 'Calculate gypsum, green manure, and other amendment quantities and costs for soil reclamation',
    params: ['area_ha', 'ec_level', 'soil_type (optional)']
  },
  getIrrigationSchedule: {
    fn: getIrrigationSchedule,
    description: 'Generate irrigation schedule with leaching requirements based on water quality',
    params: ['crop', 'district', 'ec_water', 'soil_type (optional)']
  },
  getDistrictInfo: {
    fn: getDistrictInfo,
    description: 'Get metadata about a Gujarat coastal district',
    params: ['district']
  }
};

/**
 * Execute a tool by name with parameters
 */
async function executeTool(toolName, params) {
  const tool = TOOL_REGISTRY[toolName];
  if (!tool) throw new Error(`Unknown tool: ${toolName}`);
  return await tool.fn(params);
}

/**
 * Get formatted tool descriptions for prompt injection
 */
function getToolDescriptions() {
  return Object.entries(TOOL_REGISTRY)
    .map(([name, tool]) => `  - ${name}(${tool.params.join(', ')}): ${tool.description}`)
    .join('\n');
}

module.exports = { executeTool, getToolDescriptions, TOOL_REGISTRY };
