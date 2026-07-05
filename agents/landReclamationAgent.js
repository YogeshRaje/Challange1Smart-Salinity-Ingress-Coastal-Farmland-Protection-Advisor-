/**
 * Land Reclamation Agent — Granite-3 optimized
 * Pre-calculates amendment quantities, asks LLM for the phased plan.
 */

const watsonxService = require('../services/watsonxService');
const { TOOL_REGISTRY } = require('../services/agentToolsService');

class LandReclamationAgent {
  constructor() {
    this.name = 'LandReclamationAgent';
  }

  async run(query, context = {}) {
    const district = context.district || extractDistrict(query) || 'kutch';
    const area = context.area_ha || extractArea(query) || 1;
    const ec = context.ec_level || extractEC(query) || null;

    let ecToUse = ec;
    let liveContext = '';
    try {
      const reading = await TOOL_REGISTRY.getSalinityReadings.fn({ district });
      if (!ecToUse) ecToUse = reading.data.soil.ec_surface_ds_m;
      liveContext = `Current soil EC: ${reading.data.soil.ec_surface_ds_m} dS/m | pH: ${reading.data.soil.ph} | SAR: ${reading.data.soil.sodium_adsorption_ratio} | ESP: ${reading.data.soil.exchangeable_sodium_pct}%`;
    } catch (e) {
      if (!ecToUse) ecToUse = 10;
      liveContext = `Soil EC: ${ecToUse} dS/m`;
    }

    // Calculate amendment quantities
    const amend = await TOOL_REGISTRY.calculateAmendment.fn({ area_ha: area, ec_level: ecToUse });
    const severity = ecToUse > 16 ? 'Extreme' : ecToUse > 8 ? 'High' : 'Moderate';

    const prompt = `<|system|>
You are a soil reclamation expert following ICAR-CSSRI guidelines for Gujarat coastal saline soils.
Give detailed, actionable phased reclamation plans with exact quantities, costs, and timelines.
<|user|>
Reclamation Request:
- District: ${district}
- Field Area: ${area} hectares
- ${liveContext}
- Salinity Severity: ${severity}
- Gypsum required: ${amend.data.gypsum_required_kg.toLocaleString()} kg (cost: ₹${amend.data.gypsum_cost_inr.toLocaleString()})
- Green manure required: ${amend.data.green_manure_required_kg} kg
- Estimated recovery: ${amend.data.estimated_recovery_weeks} weeks

Farmer Question: ${query}

Provide a complete 4-phase reclamation plan:
PHASE 1 (Week 1-4): Immediate drainage and soil testing actions
PHASE 2 (Week 4-12): Gypsum application, leaching schedule with exact water quantities
PHASE 3 (Month 3-6): Green manuring, first crop planting with salt-tolerant variety
PHASE 4 (Month 6-18): Monitoring schedule, target EC milestones

Include:
- Exact material quantities and local procurement sources in Gujarat
- Total cost estimate in INR with subsidy information (ICAR, Gujarat Agriculture Dept)
- Expected EC reduction at each phase milestone
<|assistant|>`;

    const answer = await watsonxService.generateText(prompt, {
      max_new_tokens: 700,
      temperature: 0.2
    });

    return {
      agent: this.name,
      query,
      answer: answer.trim(),
      district,
      amendment_data: amend.data
    };
  }

  async generateReclamationPlan(district, area_ha, ec_level) {
    const amend = await TOOL_REGISTRY.calculateAmendment.fn({ area_ha, ec_level, soil_type: 'coastal' });
    const severity = ec_level > 16 ? 'Extreme' : ec_level > 8 ? 'High' : 'Moderate';

    const prompt = `<|system|>
You are a soil reclamation expert for Gujarat coastal farmers. Give phased, practical guidance.
<|user|>
District: ${district} | Area: ${area_ha} ha | Soil EC: ${ec_level} dS/m | Severity: ${severity}
Gypsum needed: ${amend.data.gypsum_required_kg.toLocaleString()} kg | Cost: ₹${amend.data.gypsum_cost_inr.toLocaleString()}
Recovery estimate: ${amend.data.estimated_recovery_weeks} weeks

Generate a phased reclamation plan (Phase 1 immediate actions → Phase 4 long-term restoration) with exact quantities, costs, and milestones.
<|assistant|>`;

    const answer = await watsonxService.generateText(prompt, { max_new_tokens: 700, temperature: 0.2 });
    return {
      agent: this.name,
      district,
      area_ha,
      ec_level,
      amendment_data: amend.data,
      reclamation_plan: answer.trim()
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

function extractArea(text) {
  const m = text.match(/(\d+\.?\d*)\s*hect/i) || text.match(/(\d+\.?\d*)\s*ha\b/i);
  return m ? parseFloat(m[1]) : null;
}

module.exports = new LandReclamationAgent();
