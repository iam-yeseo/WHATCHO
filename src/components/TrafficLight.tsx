import type { SignalColor } from '../types';

interface Props {
  className?: string;
  state: SignalColor;
}

const stateName: Record<SignalColor, string> = {
  GREEN: '녹색 신호',
  YELLOW: '황색 신호',
  RED: '적색 신호',
  UNKNOWN: '신호 확인 중',
};

export function TrafficLight({ className = '', state }: Props) {
  return <span
    className={`traffic-light ${state.toLowerCase()} ${className}`.trim()}
    role="img"
    aria-label={stateName[state]}
  >
    <i className="red-lamp" aria-hidden="true" />
    <i className="yellow-lamp" aria-hidden="true" />
    <i className="green-lamp" aria-hidden="true" />
  </span>;
}
