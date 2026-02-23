import type { ResidentBaseline, CurrentState, RiskScores, TimelineEvent, SimulationSnapshot } from './types';
import { computeDeviations, isNightHour } from './baseline';
import { computeRisks, urgencyBand } from './risk';
import { selectIntervention } from './intervention';

function randWalk(current: number, lo: number, hi: number, step: number): number {
  const delta = (Math.random() - 0.5) * 2 * step;
  return Math.max(lo, Math.min(hi, current + delta));
}

export function simulate24h(
  baseline: ResidentBaseline,
  initialState: CurrentState
): SimulationSnapshot[] {
  const snapshots: SimulationSnapshot[] = [];
  const state: CurrentState = { ...initialState };
  let recentHighCount = 0;

  for (let h = 0; h < 24; h++) {
    state.timeOfDay = h;
    const night = isNightHour(h, baseline);

    // Drift sliders with random walk
    state.mobility = randWalk(state.mobility, 15, 95, night ? 12 : 6);
    state.restlessness = randWalk(state.restlessness, 5, 90, night ? 15 : 8);
    state.speechDrift = randWalk(state.speechDrift, 5, 85, 5);
    state.socialIsolation = randWalk(state.socialIsolation, 10, 90, 6);

    if (state.useWearables) {
      state.heartRate = randWalk(state.heartRate, 50, 130, 5);
      state.spO2 = randWalk(state.spO2, 88, 100, 1.5);
    }

    // Night patterns
    if (night) {
      state.restlessness += Math.random() > 0.7 ? 12 : -3;
      state.mobility -= Math.random() > 0.6 ? 8 : 0;
    } else {
      state.socialIsolation -= Math.random() > 0.5 ? 5 : -3;
    }

    // Clamp
    state.mobility = Math.max(0, Math.min(100, state.mobility));
    state.restlessness = Math.max(0, Math.min(100, state.restlessness));
    state.speechDrift = Math.max(0, Math.min(100, state.speechDrift));
    state.socialIsolation = Math.max(0, Math.min(100, state.socialIsolation));
    if (state.useWearables) {
      state.heartRate = Math.max(40, Math.min(140, state.heartRate));
      state.spO2 = Math.max(85, Math.min(100, state.spO2));
    }

    const devs = computeDeviations(baseline, state);
    const risks = computeRisks(state, devs, baseline);
    const intervention = selectIntervention(state, risks, recentHighCount);

    if (urgencyBand(risks.overall) === 'High') recentHighCount++;
    else recentHighCount = Math.max(0, recentHighCount - 1);

    const events = generateEvents(h, state, risks, night, baseline);

    snapshots.push({
      hour: h,
      state: { ...state },
      risks: { ...risks },
      intervention: { ...intervention },
      events,
    });
  }

  return snapshots;
}

function generateEvents(
  hour: number,
  state: CurrentState,
  risks: RiskScores,
  night: boolean,
  _baseline: ResidentBaseline,
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const h = `${hour.toString().padStart(2, '0')}:00`;

  if (night && state.restlessness > 55) {
    events.push({
      time: hour,
      label: 'Bed exit detected',
      urgency: urgencyBand(risks.fall),
      detail: `Restlessness ${Math.round(state.restlessness)}% at ${h}. Path lighting activated.`,
    });
  }

  if (night && state.restlessness > 65 && state.mobility < 45) {
    events.push({
      time: hour,
      label: 'Wandering pattern',
      urgency: urgencyBand(risks.cognitive),
      detail: `Nighttime movement with reduced stability at ${h}.`,
    });
  }

  if (risks.fall > 70) {
    events.push({
      time: hour,
      label: 'Fall risk elevated',
      urgency: 'High',
      detail: `Fall risk score ${Math.round(risks.fall)}% at ${h}. Staff alerted.`,
    });
  }

  if (risks.loneliness > 60 && !night) {
    events.push({
      time: hour,
      label: 'Isolation noted',
      urgency: urgencyBand(risks.loneliness),
      detail: `Social isolation trend high (${Math.round(state.socialIsolation)}%) at ${h}.`,
    });
  }

  if (risks.overall < 25) {
    events.push({
      time: hour,
      label: 'Comfortable period',
      urgency: 'Low',
      detail: `All signals within range at ${h}.`,
    });
  }

  if (state.useWearables && state.spO2 < 91) {
    events.push({
      time: hour,
      label: 'SpO2 low',
      urgency: 'High',
      detail: `Blood oxygen ${Math.round(state.spO2)}% at ${h}.`,
    });
  }

  return events;
}
