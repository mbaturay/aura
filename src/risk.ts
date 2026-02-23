import type { ResidentBaseline, CurrentState, Deviations, RiskScores, UrgencyBand, ExplanationOutput } from './types';
import { isNightHour } from './baseline';

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

export function computeRisks(
  state: CurrentState,
  deviations: Deviations,
  baseline: ResidentBaseline
): RiskScores {
  const night = isNightHour(state.timeOfDay, baseline);

  // ── Fall Risk ──
  let fall = 0;
  // Lower mobility stability → higher risk
  fall += (100 - state.mobility) * 0.35;
  // Higher restlessness → higher risk
  fall += state.restlessness * 0.20;
  // Night amplifier
  if (night) fall += 18;
  // Deviation amplifiers
  fall += Math.max(0, deviations.mobility) * 5;
  fall += Math.max(0, deviations.restlessness) * 3;
  // Vitals influence
  if (state.useWearables) {
    if (state.heartRate > 110) fall += (state.heartRate - 110) * 0.5;
    if (state.spO2 < 92) fall += (92 - state.spO2) * 3;
  }
  fall = clamp(fall);

  // ── Cognitive Concern Signal ──
  let cognitive = 0;
  cognitive += state.speechDrift * 0.45;
  // Night wandering proxy
  if (night) cognitive += state.restlessness * 0.25;
  cognitive += Math.max(0, deviations.speech) * 4;
  cognitive = clamp(cognitive);

  // ── Loneliness Risk ──
  let loneliness = 0;
  loneliness += state.socialIsolation * 0.50;
  // Low movement + high isolation
  const activityProxy = state.mobility * 0.3 + (100 - state.restlessness) * 0.2;
  loneliness += Math.max(0, 50 - activityProxy) * 0.3;
  loneliness += Math.max(0, deviations.social) * 4;
  loneliness = clamp(loneliness);

  // ── Overall Urgency ──
  const overall = clamp(fall * 0.40 + cognitive * 0.30 + loneliness * 0.30);

  return { fall, cognitive, loneliness, overall };
}

export function urgencyBand(score: number): UrgencyBand {
  if (score < 40) return 'Low';
  if (score < 70) return 'Medium';
  return 'High';
}

export function buildExplanation(
  state: CurrentState,
  deviations: Deviations,
  risks: RiskScores,
  baseline: ResidentBaseline
): ExplanationOutput {
  const night = isNightHour(state.timeOfDay, baseline);

  const factors: { factor: string; weight: number }[] = [];

  // Mobility
  if (state.mobility < 50)
    factors.push({ factor: 'Reduced mobility stability', weight: +(100 - state.mobility) / 100 });
  // Restlessness
  if (state.restlessness > 40)
    factors.push({ factor: 'Elevated restlessness', weight: +state.restlessness / 100 });
  // Night
  if (night)
    factors.push({ factor: 'Nighttime hours', weight: 0.6 });
  // Speech drift
  if (state.speechDrift > 35)
    factors.push({ factor: 'Speech clarity change', weight: +state.speechDrift / 100 });
  // Social isolation
  if (state.socialIsolation > 45)
    factors.push({ factor: 'Social isolation trend', weight: +state.socialIsolation / 100 });
  // Staff load
  if (state.staffLoad > 60)
    factors.push({ factor: 'High staff workload', weight: +state.staffLoad / 120 });
  // Vitals
  if (state.useWearables && state.heartRate > 100)
    factors.push({ factor: 'Elevated heart rate', weight: 0.5 });
  if (state.useWearables && state.spO2 < 93)
    factors.push({ factor: 'Low blood oxygen', weight: 0.7 });
  // Deviations
  if (deviations.mobility > 1.5)
    factors.push({ factor: 'Mobility below personal baseline', weight: 0.55 });
  if (deviations.restlessness > 1.5)
    factors.push({ factor: 'Restlessness above personal baseline', weight: 0.45 });

  // If no factors, add a default
  if (factors.length === 0)
    factors.push({ factor: 'All signals within comfortable range', weight: 0.1 });

  factors.sort((a, b) => b.weight - a.weight);
  const top3 = factors.slice(0, 3);

  // Build narrative
  const band = urgencyBand(risks.overall);
  let narrative: string;
  if (band === 'Low') {
    narrative = `The resident's current state is within a comfortable range. ` +
      `No significant deviations from their personal baseline have been detected.`;
  } else if (band === 'Medium') {
    const topNames = top3.map(f => f.factor.toLowerCase()).join(' and ');
    narrative = `Moderate attention suggested. The system has noticed ${topNames}. ` +
      `These patterns are being monitored to ensure the resident's comfort and safety.`;
  } else {
    const topNames = top3.map(f => f.factor.toLowerCase()).join(', ');
    narrative = `Elevated concern detected due to ${topNames}. ` +
      `The system recommends timely support to ensure the resident's wellbeing.`;
  }

  return { topFactors: top3, narrative };
}
