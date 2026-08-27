import { directionName, relativeDirection } from '../lib/compass';
import { formatRemainingSeconds } from '../lib/signalClock';
import type { ApproachDirection, SignalColor, SignalTiming } from '../types';
import { TrafficLight } from './TrafficLight';

export type TravelMode = 'walk' | 'drive';

interface Props {
  approach: ApproachDirection;
  left?: SignalTiming;
  mode: TravelMode;
  onModeChange: (mode: TravelMode) => void;
  straight: SignalTiming;
}

const stateName: Record<SignalColor, string> = {
  GREEN: '녹색',
  YELLOW: '황색',
  RED: '적색',
  UNKNOWN: '확인 중',
};

const remaining = (timing?: SignalTiming) => timing?.remainingSeconds == null
  ? '—'
  : `${formatRemainingSeconds(timing.remainingSeconds)}초`;

export function IntersectionGuide({ approach, left, mode, onModeChange, straight }: Props) {
  const ahead = directionName[relativeDirection(approach, 'straight')];
  const leftward = directionName[relativeDirection(approach, 'left')];
  const rightward = directionName[relativeDirection(approach, 'right')];
  const summary = `내 진행 방향 기준 직진은 ${ahead}, 좌회전은 ${leftward}, 우회전은 ${rightward}`;

  return <section className={`intersection-guide ${mode}`} aria-label={`교차로 약도. ${summary}`}>
    <div className="guide-heading">
      <div><b>교차로 약도</b><small>내 진행 방향을 위로 표시</small></div>
      <div className="mode-switch" role="group" aria-label="이동 모드">
        <button
          type="button"
          className={mode === 'walk' ? 'active' : ''}
          aria-pressed={mode === 'walk'}
          onClick={() => onModeChange('walk')}
        >도보</button>
        <button
          type="button"
          className={mode === 'drive' ? 'active' : ''}
          aria-pressed={mode === 'drive'}
          onClick={() => onModeChange('drive')}
        >차량</button>
      </div>
    </div>

    <div className="junction" role="img" aria-label={summary}>
      <div className="road vertical" aria-hidden="true" />
      <div className="road horizontal" aria-hidden="true" />
      <div className="lane-line vertical" aria-hidden="true" />
      <div className="lane-line horizontal" aria-hidden="true" />
      <div className="crosswalk" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <i key={index} />)}</div>

      <div className="map-direction ahead"><b>↑ 직진</b><span>{ahead}</span></div>
      <div className="map-direction turn-left"><b>↰ 좌회전</b><span>{leftward}</span></div>
      <div className="map-direction turn-right"><b>↱ 우회전</b><span>{rightward}</span></div>

      <div className={`map-signal straight ${straight.state.toLowerCase()}`}>
        <TrafficLight state={straight.state} />
        <div className="map-signal-copy"><b>직진 {stateName[straight.state]}</b><small>{remaining(straight)}</small></div>
      </div>
      <div className={`map-signal left ${left?.state.toLowerCase() ?? 'unknown'}`}>
        <TrafficLight state={left?.state ?? 'UNKNOWN'} />
        <div className="map-signal-copy"><b>좌회전 {left ? stateName[left.state] : '정보 없음'}</b><small>{remaining(left)}</small></div>
      </div>
      <div className="you-marker" aria-hidden="true"><i>{mode === 'walk' ? '●' : '◆'}</i><b>나</b><span>↑</span></div>
    </div>

    <div className="guide-route" aria-hidden="true">
      <span>좌 · {leftward}</span><b>직진 · {ahead}</b><span>우 · {rightward}</span>
    </div>

    {mode === 'walk' && <div className="pedestrian-reference">
      <span className="walk-icon" aria-hidden="true">🚶</span>
      <div>
        <b>횡단보도 연계 참고</b>
        <p>같은 방향 차량 직진은 <strong>{stateName[straight.state]} · {remaining(straight)}</strong>입니다. 보행 신호 데이터는 없으므로 실제 횡단보도 신호를 반드시 확인하세요.</p>
      </div>
    </div>}
    {mode === 'drive' && <p className="right-turn-note">우회전 전용 신호 데이터는 제공되지 않습니다. 현장 신호와 보행자를 우선 확인하세요.</p>}
  </section>;
}
