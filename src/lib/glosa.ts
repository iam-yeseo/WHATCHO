import type { SignalTiming } from '../types';

export type GlosaTone = 'go' | 'slow' | 'stop' | 'idle';

export interface GlosaAdvice {
  tone: GlosaTone;
  label: string;
  message: string;
  recommendedSpeedKph: number | null;
}

interface GlosaInput {
  distanceMeters: number | null;
  currentSpeedMetersPerSecond: number | null;
  signal: SignalTiming | null;
  stale: boolean;
}

const MIN_GUIDANCE_DISTANCE_METERS = 35;
const MAX_GUIDANCE_DISTANCE_METERS = 800;
const MAX_ADVISORY_SPEED_KPH = 50;
const GREEN_ARRIVAL_BUFFER_SECONDS = 3;
const RED_ARRIVAL_BUFFER_SECONDS = 2;

const idle = (label: string, message: string): GlosaAdvice => ({
  tone: 'idle',
  label,
  message,
  recommendedSpeedKph: null,
});

const roundToFive = (speed: number) => Math.round(speed / 5) * 5;
const roundUpToFive = (speed: number) => Math.ceil(speed / 5) * 5;
const clamp = (speed: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, speed));

export function calculateGlosaAdvice({
  distanceMeters,
  currentSpeedMetersPerSecond,
  signal,
  stale,
}: GlosaInput): GlosaAdvice {
  if (
    distanceMeters == null || !Number.isFinite(distanceMeters) ||
    !signal || stale || signal.remainingSeconds == null ||
    !Number.isFinite(signal.remainingSeconds) || signal.remainingSeconds <= 0 ||
    signal.state === 'UNKNOWN'
  ) {
    return idle('속도 안내 대기', '유효한 신호 잔여시간을 확인하고 있습니다.');
  }

  if (distanceMeters > MAX_GUIDANCE_DISTANCE_METERS) {
    return idle('안내 구간 진입 전', '교차로 800 m 이내에서 권장 속도를 계산합니다.');
  }

  if (distanceMeters < MIN_GUIDANCE_DISTANCE_METERS) {
    return {
      tone: 'stop',
      label: '교차로 진입 구간',
      message: '속도 안내보다 전방의 실제 신호와 도로 상황을 우선하세요.',
      recommendedSpeedKph: null,
    };
  }

  if (signal.state === 'YELLOW') {
    return {
      tone: 'stop',
      label: '감속 후 정지 준비',
      message: '황색 신호에는 교차로 통과를 위한 속도를 안내하지 않습니다.',
      recommendedSpeedKph: null,
    };
  }

  if (signal.state === 'RED') {
    const speed = distanceMeters /
      (signal.remainingSeconds + RED_ARRIVAL_BUFFER_SECONDS) * 3.6;

    if (speed < 10) {
      return {
        tone: 'stop',
        label: '정지 준비',
        message: '교차로에 가까워 서행보다 안전한 정지 준비를 권장합니다.',
        recommendedSpeedKph: null,
      };
    }

    if (speed > MAX_ADVISORY_SPEED_KPH) {
      return idle('일반 주행 유지', '신호가 먼저 바뀌므로 무리한 가속 없이 주행하세요.');
    }

    return {
      tone: 'slow',
      label: '신호 변경에 맞춰 감속',
      message: '급감속 없이 도로 상황을 보며 천천히 속도를 맞추세요.',
      recommendedSpeedKph: clamp(roundToFive(speed), 10, MAX_ADVISORY_SPEED_KPH),
    };
  }

  const availableSeconds = signal.remainingSeconds - GREEN_ARRIVAL_BUFFER_SECONDS;
  if (availableSeconds <= 2) {
    return {
      tone: 'stop',
      label: '신호 전환 임박',
      message: '남은 녹색 시간이 짧습니다. 다음 신호를 준비하세요.',
      recommendedSpeedKph: null,
    };
  }

  const requiredSpeed = distanceMeters / availableSeconds * 3.6;
  if (requiredSpeed > MAX_ADVISORY_SPEED_KPH) {
    return {
      tone: 'stop',
      label: '무리한 가속 금지',
      message: '안전한 안내 범위에서 통과하기 어렵습니다. 다음 신호를 준비하세요.',
      recommendedSpeedKph: null,
    };
  }

  const currentSpeedKph = currentSpeedMetersPerSecond == null
    ? null
    : currentSpeedMetersPerSecond * 3.6;
  const targetSpeed = currentSpeedKph != null && currentSpeedKph >= requiredSpeed
    ? roundToFive(currentSpeedKph)
    : roundUpToFive(requiredSpeed);

  return {
    tone: 'go',
    label: '녹색 구간 진입 가능',
    message: '제한속도와 도로 상황을 우선하며 부드럽게 속도를 유지하세요.',
    recommendedSpeedKph: clamp(targetSpeed, 15, MAX_ADVISORY_SPEED_KPH),
  };
}
