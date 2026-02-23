import type { ResidentBaseline, CurrentState, Deviations } from './types';

export const DEFAULT_BASELINE: ResidentBaseline = {
  mobilityMean: 70,
  mobilityVar: 100,
  restlessnessMean: 25,
  restlessnessVar: 64,
  speechMean: 20,
  speechVar: 49,
  socialMean: 30,
  socialVar: 81,
  sleepStart: 22,
  sleepEnd: 6,
};

export function defaultState(): CurrentState {
  return {
    timeOfDay: 14,
    mobility: 70,
    restlessness: 25,
    speechDrift: 20,
    socialIsolation: 30,
    useWearables: false,
    heartRate: 72,
    spO2: 97,
    staffLoad: 40,
  };
}

const EPS = 1;

export function computeDeviations(
  baseline: ResidentBaseline,
  state: CurrentState
): Deviations {
  const norm = (current: number, mean: number, variance: number) =>
    (current - mean) / Math.sqrt(variance + EPS);

  return {
    // mobility: lower current = worse → flip sign so positive = risk
    mobility: -norm(state.mobility, baseline.mobilityMean, baseline.mobilityVar),
    restlessness: norm(state.restlessness, baseline.restlessnessMean, baseline.restlessnessVar),
    speech: norm(state.speechDrift, baseline.speechMean, baseline.speechVar),
    social: norm(state.socialIsolation, baseline.socialMean, baseline.socialVar),
  };
}

export function isNightHour(hour: number, baseline: ResidentBaseline): boolean {
  const h = ((hour % 24) + 24) % 24;
  if (baseline.sleepStart > baseline.sleepEnd) {
    return h >= baseline.sleepStart || h < baseline.sleepEnd;
  }
  return h >= baseline.sleepStart && h < baseline.sleepEnd;
}
