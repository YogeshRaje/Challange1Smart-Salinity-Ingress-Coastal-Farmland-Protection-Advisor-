/**
 * Salinity Data Service
 * Manages soil/groundwater sensor readings for Gujarat coastal districts
 * In production: connect to IoT sensors, ISRO BHUVAN, CGWB, and state portal APIs
 */

const DISTRICTS = {
  kutch: {
    name: 'Kutch',
    state: 'Gujarat',
    coordinates: { lat: 23.7337, lon: 69.8597 },
    coastline_km: 360,
    risk_level: 'Extreme',
    talukas: ['Bhuj', 'Mandvi', 'Mundra', 'Anjar', 'Abdasa', 'Nakhatrana', 'Rapar', 'Lakhpat']
  },
  jamnagar: {
    name: 'Jamnagar',
    state: 'Gujarat',
    coordinates: { lat: 22.4707, lon: 70.0577 },
    coastline_km: 210,
    risk_level: 'High',
    talukas: ['Jamnagar', 'Jamjodhpur', 'Kalavad', 'Lalpur', 'Dhrol', 'Jodiya']
  },
  bhavnagar: {
    name: 'Bhavnagar',
    state: 'Gujarat',
    coordinates: { lat: 21.7645, lon: 72.1519 },
    coastline_km: 180,
    risk_level: 'High',
    talukas: ['Bhavnagar', 'Talaja', 'Ghogha', 'Mahuva', 'Palitana', 'Sihor', 'Gariadhar']
  }
};

// Salt-tolerant crop database for Gujarat coastal conditions
const SALT_TOLERANT_CROPS = {
  cereals: [
    { name: 'Barley (जौ)', tolerance_ece: 8, yield_reduction_10pct: 5.0, season: 'Rabi', varieties: ['K-508', 'Amber', 'DWRB-91'] },
    { name: 'Cotton (કપાસ)', tolerance_ece: 7.7, yield_reduction_10pct: 5.2, season: 'Kharif', varieties: ['Suraj', 'Savar', 'Khandesh-3'] },
    { name: 'Sorghum (Jowar)', tolerance_ece: 6.8, yield_reduction_10pct: 4.0, season: 'Kharif', varieties: ['CSV-216', 'CSV-15'] },
    { name: 'Wheat (ઘઉં)', tolerance_ece: 6.0, yield_reduction_10pct: 7.1, season: 'Rabi', varieties: ['KRL-1-4', 'KRL-19', 'KRL-210'] }
  ],
  oilseeds: [
    { name: 'Safflower (Kusumb)', tolerance_ece: 6.5, yield_reduction_10pct: null, season: 'Rabi', varieties: ['A-1', 'Bhima'] },
    { name: 'Groundnut (Mungfali)', tolerance_ece: 3.2, yield_reduction_10pct: 9.0, season: 'Kharif', varieties: ['GG-20', 'GJG-31'] },
    { name: 'Sesame (Til)', tolerance_ece: 5.0, yield_reduction_10pct: 8.0, season: 'Kharif', varieties: ['GT-3', 'Purbas'] }
  ],
  vegetables: [
    { name: 'Beetroot (Chukandar)', tolerance_ece: 7.0, yield_reduction_10pct: 9.0, season: 'Rabi', varieties: ['Detroit Dark Red', 'Crimson Globe'] },
    { name: 'Spinach (Palak)', tolerance_ece: 7.6, yield_reduction_10pct: 9.5, season: 'Rabi', varieties: ['All Green', 'Jobner Green'] },
    { name: 'Asparagus (Shatavari)', tolerance_ece: 4.1, yield_reduction_10pct: 2.0, season: 'Perennial', varieties: ['UC-157', 'Mary Washington'] },
    { name: 'Brinjal (Ringan)', tolerance_ece: 3.5, yield_reduction_10pct: 6.9, season: 'Kharif/Rabi', varieties: ['Pusa Purple Long', 'GBH-1'] }
  ],
  halophytes: [
    { name: 'Salicornia (Loongrass)', tolerance_ece: 40, yield_reduction_10pct: null, season: 'Kharif', varieties: ['Wild', 'Cultivated'] },
    { name: 'Seabuckthorn (Danti)', tolerance_ece: 25, yield_reduction_10pct: null, season: 'Perennial', varieties: ['Habago', 'Frugana'] },
    { name: 'Date Palm (Khajur)', tolerance_ece: 18, yield_reduction_10pct: null, season: 'Perennial', varieties: ['Khadrawi', 'Medjool', 'Barhee'] },
    { name: 'Coconut (Nariyal)', tolerance_ece: 10, yield_reduction_10pct: null, season: 'Perennial', varieties: ['East Coast Tall', 'WCT hybrid'] }
  ],
  fodder: [
    { name: 'Rhodes Grass (Dhub)', tolerance_ece: 11, yield_reduction_10pct: 6.4, season: 'Perennial', varieties: ['Katambora', 'Pioneer'] },
    { name: 'Para Grass (Ghas)', tolerance_ece: 8.2, yield_reduction_10pct: null, season: 'Perennial', varieties: ['Common'] },
    { name: 'Karnal Grass', tolerance_ece: 9.5, yield_reduction_10pct: null, season: 'Perennial', varieties: ['SR-51'] }
  ]
};

// Reclamation amendment specifications
const RECLAMATION_AMENDMENTS = {
  gypsum: {
    name: 'Gypsum (CaSO4·2H2O)',
    application_rate_kg_per_ha: { low: 2500, medium: 5000, high: 10000 },
    effect: 'Replaces Na+ with Ca2+, improves soil structure',
    time_to_effect_weeks: 6,
    cost_per_kg_inr: 3.5
  },
  pyrite: {
    name: 'Pyrite (FeS2)',
    application_rate_kg_per_ha: { low: 500, medium: 1000, high: 2000 },
    effect: 'Acidifies alkaline soil, improves permeability',
    time_to_effect_weeks: 8,
    cost_per_kg_inr: 6.0
  },
  green_manure: {
    name: 'Green Manure (Dhaincha/Sesbania)',
    application_rate_kg_per_ha: { all: 50 },
    effect: 'Improves organic matter, enhances leaching efficiency',
    time_to_effect_weeks: 4,
    cost_per_kg_inr: 45
  },
  rice_husk: {
    name: 'Rice Husk Ash',
    application_rate_kg_per_ha: { all: 5000 },
    effect: 'Improves drainage, reduces surface crust',
    time_to_effect_weeks: 2,
    cost_per_kg_inr: 1.5
  }
};

/**
 * Generate simulated sensor readings for a district/taluka
 * Production: Replace with actual IoT / CGWB API calls
 */
function generateSensorReading(district, taluka = null, daysAgo = 0) {
  const districtConfig = DISTRICTS[district.toLowerCase()];
  if (!districtConfig) throw new Error(`Unknown district: ${district}`);

  const riskMultiplier = { 'Extreme': 1.8, 'High': 1.4, 'Medium': 1.0 }[districtConfig.risk_level] || 1.0;
  const seasonal = Math.sin((Date.now() / 86400000 - daysAgo) / 180 * Math.PI) * 0.5 + 1.0;

  // Base EC values calibrated to Gujarat coastal research data
  const baseEC = 6.2 * riskMultiplier * seasonal;
  const noise = () => (Math.random() - 0.5) * 1.5;

  return {
    district: districtConfig.name,
    taluka: taluka || districtConfig.talukas[Math.floor(Math.random() * districtConfig.talukas.length)],
    timestamp: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    soil: {
      ec_surface_ds_m: +(baseEC + noise()).toFixed(2),        // 0-30cm
      ec_subsurface_ds_m: +(baseEC * 0.85 + noise()).toFixed(2), // 30-60cm
      ph: +(8.1 + noise() * 0.3).toFixed(2),
      sodium_adsorption_ratio: +(15 + riskMultiplier * 5 + noise() * 3).toFixed(2),
      exchangeable_sodium_pct: +(18 + riskMultiplier * 4 + noise() * 2).toFixed(1),
      organic_carbon_pct: +(0.38 - riskMultiplier * 0.05 + noise() * 0.05).toFixed(3)
    },
    groundwater: {
      ec_ds_m: +(baseEC * 2.1 + noise()).toFixed(2),
      depth_m: +(4.2 + riskMultiplier * 1.5 + noise() * 0.8).toFixed(2),
      ph: +(7.8 + noise() * 0.4).toFixed(2),
      chloride_mg_l: +(850 + riskMultiplier * 600 + noise() * 100).toFixed(0),
      sodium_mg_l: +(420 + riskMultiplier * 300 + noise() * 80).toFixed(0),
      tds_mg_l: +(3200 + riskMultiplier * 2000 + noise() * 400).toFixed(0)
    },
    tidal_ingress: {
      distance_km: +(2.1 - riskMultiplier * 0.3 + noise() * 0.5).toFixed(2),
      season: getSeason(),
      alert_level: getAlertLevel(baseEC)
    }
  };
}

/**
 * Get current agricultural season in Gujarat
 */
function getSeason() {
  const month = new Date().getMonth() + 1;
  if (month >= 6 && month <= 9) return 'Kharif (Monsoon)';
  if (month >= 10 && month <= 12) return 'Rabi (Winter)';
  if (month >= 1 && month <= 3) return 'Rabi (Winter)';
  return 'Summer (Zaid)';
}

/**
 * Compute salinity alert level from EC reading
 */
function getAlertLevel(ec) {
  if (ec > 16) return 'CRITICAL';
  if (ec > 8) return 'HIGH';
  if (ec > 4) return 'MODERATE';
  if (ec > 2) return 'LOW';
  return 'SAFE';
}

/**
 * Get 30-day trend data for charts
 */
function getTrendData(district, days = 30) {
  const readings = [];
  for (let i = days; i >= 0; i--) {
    const r = generateSensorReading(district, null, i);
    readings.push({
      date: r.timestamp.split('T')[0],
      soil_ec: r.soil.ec_surface_ds_m,
      gw_ec: r.groundwater.ec_ds_m,
      ph: r.soil.ph,
      sar: r.soil.sodium_adsorption_ratio
    });
  }
  return readings;
}

/**
 * Get recommended crops for given ECe level
 */
function getRecommendedCrops(ec_surface) {
  const recommendations = { highly_suitable: [], suitable: [], marginal: [] };

  const allCrops = [
    ...SALT_TOLERANT_CROPS.cereals,
    ...SALT_TOLERANT_CROPS.oilseeds,
    ...SALT_TOLERANT_CROPS.vegetables,
    ...SALT_TOLERANT_CROPS.halophytes,
    ...SALT_TOLERANT_CROPS.fodder
  ];

  for (const crop of allCrops) {
    if (ec_surface <= crop.tolerance_ece * 0.5) {
      recommendations.highly_suitable.push(crop);
    } else if (ec_surface <= crop.tolerance_ece * 0.8) {
      recommendations.suitable.push(crop);
    } else if (ec_surface <= crop.tolerance_ece) {
      recommendations.marginal.push(crop);
    }
  }

  return recommendations;
}

module.exports = {
  DISTRICTS,
  SALT_TOLERANT_CROPS,
  RECLAMATION_AMENDMENTS,
  generateSensorReading,
  getTrendData,
  getRecommendedCrops,
  getAlertLevel,
  getSeason
};
