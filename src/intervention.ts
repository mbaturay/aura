import type { CurrentState, RiskScores, InterventionOutput, InterventionLevel } from './types';
import { urgencyBand, } from './risk';
import { isNightHour, DEFAULT_BASELINE } from './baseline';

export function selectIntervention(
  state: CurrentState,
  risks: RiskScores,
  recentHighCount: number
): InterventionOutput {
  const night = isNightHour(state.timeOfDay, DEFAULT_BASELINE);
  const fallBand = urgencyBand(risks.fall);
  const cognitiveBand = urgencyBand(risks.cognitive);
  const lonelinessBand = urgencyBand(risks.loneliness);
  const overallBand = urgencyBand(risks.overall);

  let level: InterventionLevel = 1;

  // Level 4: High risk + vitals abnormal OR repeated high events
  const vitalsAbnormal = state.useWearables && (state.heartRate > 120 || state.spO2 < 90);
  if ((overallBand === 'High' && vitalsAbnormal) || recentHighCount >= 3) {
    level = 4;
  }
  // Level 3: High fall OR combined medium + high staff load
  else if (
    fallBand === 'High' ||
    (overallBand === 'Medium' && state.staffLoad > 65)
  ) {
    level = 3;
  }
  // Level 2: Medium+ fall risk OR medium loneliness
  else if (
    fallBand === 'Medium' ||
    lonelinessBand === 'Medium' || lonelinessBand === 'High' ||
    cognitiveBand === 'Medium'
  ) {
    level = 2;
  }
  // Level 1: Low/Medium at night ambient cue
  else if (night && (fallBand === 'Low' || fallBand === 'Medium')) {
    level = 1;
  }

  return buildIntervention(level, state, risks, night);
}

function buildIntervention(
  level: InterventionLevel,
  state: CurrentState,
  risks: RiskScores,
  night: boolean
): InterventionOutput {
  const hour = Math.floor(state.timeOfDay);
  const timeLabel = `${hour.toString().padStart(2, '0')}:${Math.floor((state.timeOfDay % 1) * 60).toString().padStart(2, '0')}`;

  switch (level) {
    case 1:
      return {
        level: 1,
        levelLabel: 'Ambient Cue',
        residentMessage: null,
        staffMessage: null,
        environmentalCue: night
          ? 'Soft warm floor-path lighting activated along bedroom → bathroom route. Gentle calming soundscape maintained.'
          : 'Room lighting adjusted to comfortable daytime level. Background music at low volume.',
      };

    case 2: {
      const resMsg = risks.loneliness > risks.fall
        ? `Good ${night ? 'evening' : 'afternoon'}! Your friend Martha mentioned she'd love to chat — would you like to give her a call?`
        : `Just a gentle reminder: take your time if you're getting up. The path light is on for you.`;
      return {
        level: 2,
        levelLabel: 'Gentle Prompt',
        residentMessage: resMsg,
        staffMessage: null,
        environmentalCue: night
          ? 'Path lighting brightened slightly. Ambient tone gently raised.'
          : 'Room ambiance shifted to warmer tones to encourage settling.',
      };
    }

    case 3: {
      const whyStaff = risks.fall >= 70
        ? `Fall risk elevated (${Math.round(risks.fall)}%) — resident mobility reduced, ${night ? 'nighttime' : 'daytime'} activity detected.`
        : `Combined risk moderate-high (${Math.round(risks.overall)}%) — staff load high. Supportive check-in recommended.`;
      return {
        level: 3,
        levelLabel: 'Staff Soft Alert',
        residentMessage: 'You\'re doing great. Someone will pop by shortly just to say hello.',
        staffMessage: `Soft alert at ${timeLabel}: ${whyStaff}`,
        environmentalCue: 'Room lighting set to calm, reassuring level. Gentle chime played in staff station.',
      };
    }

    case 4: {
      const whyEscalate = state.useWearables && state.spO2 < 90
        ? `Vitals concern: SpO2 ${state.spO2}%, HR ${state.heartRate} bpm. Immediate check recommended.`
        : `Repeated high-risk pattern detected (fall ${Math.round(risks.fall)}%, overall ${Math.round(risks.overall)}%). Prompt attention needed.`;
      return {
        level: 4,
        levelLabel: 'Escalate',
        residentMessage: 'Help is on the way. You\'re safe — just stay comfortable where you are.',
        staffMessage: `PRIORITY at ${timeLabel}: ${whyEscalate}`,
        environmentalCue: 'Room lights fully on. Staff alert tone at station. Hallway indicator active.',
      };
    }
  }
}
