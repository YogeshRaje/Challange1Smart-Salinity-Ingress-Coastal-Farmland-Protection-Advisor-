/**
 * Irrigation Advisory Agent — Granite-3 optimized
 * Pre-calculates leaching requirements, asks LLM for schedule.
 */

const watsonxService = require('../services/watsonxService');
const { TOOL_REGISTRY } = require('../services/agentToolsService');

class IrrigationAdvisoryAgent {
  constructor() {
    this.name = 'IrrigationAdvisoryAgent';
  }

  async run(query, context = {}) {
    const district = context.district || extractDistrict(query) || 'kutch';
    const crop = context.crop || extractCrop(query) || 'Cotton';
    const waterEC = context.ec_water || extractEC(query) || 4.0;

    // Pre-calculate irrigation parameters
    const schedule = await TOOL_REGISTRY.getIrrigationSchedule.fn({ crop, district, ec_water: waterEC });

    const prompt = `<|system|>
You are an irrigation expert for Gujarat coastal saline agriculture.
Give practical, specific irrigation schedules. Mention PMKSY and GGRC micro-irrigation subsidies where relevant.
<|user|>
Irrigation Advisory Request:
- Crop: ${crop}
- District: ${district}
- Irrigation water EC: ${waterEC} dS/m
- Recommended method: ${schedule.data.recommended_method}
- Leaching fraction required: ${(schedule.data.leaching_requirement * 100).toFixed(1)}%
- Suggested irrigation interval: every ${schedule.data.irrigation_interval_days} days
- Pre-sowing leaching: ${schedule.data.pre_sowing_leaching}
- Timing note: ${schedule.data.timing}

Farmer Question: ${query}

Provide:
1. Weekly irrigation schedule (Day, Time, Duration, Water quantity per hectare)
2. Leaching schedule (when, how much extra water)
3. Water quality monitoring frequency and parameters to check
4. Signs of salt stress to watch for in ${crop}
5. Emergency steps if salinity suddenly increases
6. Available subsidy schemes for drip installation in Gujarat
<|assistant|>`;

    const answer = await watsonxService.generateText(prompt, {
      max_new_tokens: 600,
      temperature: 0.2
    });

    return {
      agent: this.name,
      query,
      answer: answer.trim(),
      district,
      schedule_data: schedule.data
    };
  }

  async generateWeeklySchedule(crop, district, water_ec) {
    const schedule = await TOOL_REGISTRY.getIrrigationSchedule.fn({ crop, district, ec_water: water_ec });

    const prompt = `<|system|>
You are an irrigation advisor for Gujarat saline farmland. Give structured, practical schedules.
<|user|>
Crop: ${crop} | District: ${district} | Water EC: ${water_ec} dS/m
Method: ${schedule.data.recommended_method} | Interval: every ${schedule.data.irrigation_interval_days} days
Leaching fraction: ${(schedule.data.leaching_requirement * 100).toFixed(1)}%

Create a detailed weekly irrigation plan with:
1. Day-by-day schedule table (Day / Time / Duration / Quantity)
2. Monthly leaching application plan
3. Water quality targets and testing schedule
4. Salt stress symptoms to monitor
<|assistant|>`;

    const answer = await watsonxService.generateText(prompt, { max_new_tokens: 500, temperature: 0.2 });
    return {
      agent: this.name,
      crop,
      district,
      water_ec,
      schedule_data: schedule.data,
      weekly_plan: answer.trim()
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

function extractCrop(text) {
  const crops = ['cotton', 'wheat', 'barley', 'groundnut', 'sorghum', 'date palm', 'coconut', 'beetroot', 'spinach'];
  const t = text.toLowerCase();
  return crops.find(c => t.includes(c)) || null;
}

module.exports = new IrrigationAdvisoryAgent();
