import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IntersectionGuide, type TravelMode } from './components/IntersectionGuide';
import { TrafficLight } from './components/TrafficLight';
import { usePosition } from './hooks/usePosition';
import { mockIntersections, mockSignal } from './mock';
import { directionName, stabilizeDirection } from './lib/compass';
import { nearbyIntersections, normalizeDirection, selectNextIntersection } from './lib/geo';
import { calculateGlosaAdvice } from './lib/glosa';
import {
  countdownSignal,
  formatRemainingSeconds,
  nextSignalSyncDelay,
  type SignalSnapshot,
} from './lib/signalClock';
import type { ApiSignalResponse, ApproachDirection, Intersection, SignalTiming } from './types';
import './styles.css';

function useCountdown(snapshot: SignalSnapshot | null) {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    setNow(Date.now());
    if (!snapshot) return;
    const update = () => setNow(Date.now());
    const id = setInterval(update, 200);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', update);
    };
  }, [snapshot]);

  return countdownSignal(snapshot, now);
}

function useStableApproach(heading: number | null | undefined) {
  const [approach, setApproach] = useState<ApproachDirection>('UNKNOWN');

  useEffect(() => {
    setApproach((current) => stabilizeDirection(current, heading ?? null));
  }, [heading]);

  return approach;
}

function useSignalProgress(
  intersectionId: string | undefined,
  raw: SignalTiming | undefined,
  countdown: SignalTiming | undefined,
) {
  const [phase, setPhase] = useState<{ key: string; maximum: number } | null>(null);

  useEffect(() => {
    const remaining = raw?.remainingSeconds;
    if (!intersectionId || !raw || raw.state === 'UNKNOWN' || remaining == null || remaining <= 0) {
      setPhase(null);
      return;
    }
    const key = `${intersectionId}:${raw.state}`;
    setPhase((current) => (
      !current || current.key !== key || remaining > current.maximum + 1
        ? { key, maximum: remaining }
        : current
    ));
  }, [intersectionId, raw?.state, raw?.remainingSeconds]);

  if (!phase || countdown?.remainingSeconds == null || phase.maximum <= 0) return 0;
  return Math.min(100, Math.max(0, countdown.remainingSeconds / phase.maximum * 100));
}

export default function App() {
  const [mock, setMock] = useState(() => (
    new URLSearchParams(location.search).get('mock') === 'true' ||
    localStorage.testMode === 'true'
  ));
  const { position, state: gps } = usePosition(mock);
  const approach = useStableApproach(position?.heading);
  const [intersections, setIntersections] = useState<Intersection[]>(mock ? mockIntersections : []);
  const [signalSnapshot, setSignalSnapshot] = useState<SignalSnapshot | null>(() => mock ? {
    data: mockSignal(),
    receivedAt: Date.now(),
  } : null);
  const [api, setApi] = useState<'idle' | 'loading' | 'ok' | 'error' | 'offline'>(mock ? 'ok' : 'idle');
  const [developer, setDeveloper] = useState(localStorage.devMode === 'true');
  const [notice, setNotice] = useState(localStorage.safetyAccepted !== 'true');
  const [travelMode, setTravelMode] = useState<TravelMode>(() => (
    localStorage.travelMode === 'drive' ? 'drive' : 'walk'
  ));
  const [manualIntersectionId, setManualIntersectionId] = useState<string | null>(null);
  const lastIntersectionQuery = useRef<{
    latitude: number;
    longitude: number;
    at: number;
    ok: boolean;
  } | null>(null);
  const signalRequest = useRef<{ key: string; controller: AbortController } | null>(null);

  const toggleTestMode = () => {
    const next = !mock;
    const url = new URL(location.href);
    if (next) url.searchParams.set('mock', 'true');
    else url.searchParams.delete('mock');
    history.replaceState(null, '', url);
    localStorage.testMode = String(next);
    setMock(next);
  };

  useEffect(() => {
    signalRequest.current?.controller.abort();
    signalRequest.current = null;
    lastIntersectionQuery.current = null;
    setManualIntersectionId(null);
    setIntersections(mock ? mockIntersections : []);
    setSignalSnapshot(mock ? { data: mockSignal(), receivedAt: Date.now() } : null);
    setApi(mock ? 'ok' : navigator.onLine ? 'idle' : 'offline');
  }, [mock]);

  const automaticSelected = useMemo(
    () => position ? selectNextIntersection(position, intersections) : null,
    [position, intersections],
  );
  const nearby = useMemo(() => {
    if (!position) return [];
    const closest = nearbyIntersections(position, intersections, 1500, 4);
    if (!automaticSelected || closest.some((item) => item.id === automaticSelected.id)) return closest;
    return [...closest.slice(0, 3), automaticSelected]
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  }, [position, intersections, automaticSelected]);
  const selectedBase = useMemo(
    () => nearby.find((item) => item.id === manualIntersectionId) ?? automaticSelected,
    [nearby, manualIntersectionId, automaticSelected],
  );
  const selected = useMemo(
    () => selectedBase ? {
      ...selectedBase,
      approach: approach === 'UNKNOWN' ? normalizeDirection(selectedBase.bearing) : approach,
    } : null,
    [selectedBase, approach],
  );

  useEffect(() => {
    if (manualIntersectionId && !nearby.some((item) => item.id === manualIntersectionId)) {
      setManualIntersectionId(null);
    }
  }, [manualIntersectionId, nearby]);

  const activeSnapshot = signalSnapshot && selected &&
    signalSnapshot.data.intersectionId === selected.id &&
    (!signalSnapshot.data.approach || signalSnapshot.data.approach === selected.approach)
      ? signalSnapshot
      : null;
  const activeRawSignal = activeSnapshot?.data ?? null;
  const signal = useCountdown(activeSnapshot);
  const stale = activeSnapshot
    ? Date.now() - activeSnapshot.receivedAt > 90_000
    : false;
  const mainSignal = signal?.signal.straight ?? { state: 'UNKNOWN', remainingSeconds: null };
  const signalProgress = useSignalProgress(
    selected?.id,
    activeRawSignal?.signal.straight,
    signal?.signal.straight,
  );
  const glosa = calculateGlosaAdvice({
    distanceMeters: selected?.distanceMeters ?? null,
    currentSpeedMetersPerSecond: position?.speed ?? null,
    signal: signal?.signal.straight ?? null,
    stale,
  });

  const loadIntersections = useCallback(async () => {
    if (mock || !position) return;
    const last = lastIntersectionQuery.current;
    const movedLessThan500Meters = last
      ? nearbyIntersections(position, [{
        id: 'last-position',
        name: '',
        latitude: last.latitude,
        longitude: last.longitude,
      }], 500, 1).length > 0
      : false;
    if (last && Date.now() - last.at < (last.ok ? 300_000 : 15_000) && movedLessThan500Meters) {
      return;
    }

    lastIntersectionQuery.current = {
      latitude: position.latitude,
      longitude: position.longitude,
      at: Date.now(),
      ok: false,
    };
    try {
      setApi('loading');
      const response = await fetch(
        `/api/intersections?lat=${position.latitude}&lng=${position.longitude}&radius=1500`,
      );
      if (!response.ok) throw new Error();
      const data = await response.json() as { intersections: Intersection[] };
      setIntersections(data.intersections);
      lastIntersectionQuery.current = {
        latitude: position.latitude,
        longitude: position.longitude,
        at: Date.now(),
        ok: true,
      };
      setApi('ok');
    } catch {
      setApi(navigator.onLine ? 'error' : 'offline');
    }
  }, [mock, position]);

  const loadSignal = useCallback(async () => {
    const intersectionId = selected?.id;
    const selectedApproach = selected?.approach;
    if (mock || !intersectionId || !selectedApproach) return null;
    const key = `${intersectionId}:${selectedApproach}`;
    if (signalRequest.current?.key === key) return null;

    signalRequest.current?.controller.abort();
    const controller = new AbortController();
    signalRequest.current = { key, controller };
    try {
      setApi('loading');
      const response = await fetch(
        `/api/signals?intersectionId=${encodeURIComponent(intersectionId)}&approach=${selectedApproach}`,
        { signal: controller.signal },
      );
      if (!response.ok) throw new Error();
      const data = await response.json() as ApiSignalResponse;
      setSignalSnapshot({ data, receivedAt: Date.now() });
      setApi('ok');
      return data;
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return null;
      setApi(navigator.onLine ? 'error' : 'offline');
      return null;
    } finally {
      if (signalRequest.current?.controller === controller) signalRequest.current = null;
    }
  }, [mock, selected?.id, selected?.approach]);

  useEffect(() => {
    loadIntersections();
  }, [loadIntersections]);

  useEffect(() => {
    if (!mock) setSignalSnapshot(null);
  }, [mock, selected?.id, selected?.approach]);

  useEffect(() => {
    if (mock || !selected) return;
    let cancelled = false;
    let timer: number | undefined;

    const synchronize = async () => {
      const data = await loadSignal();
      if (cancelled) return;
      timer = window.setTimeout(
        synchronize,
        data ? nextSignalSyncDelay(data) : 15_000,
      );
    };

    void synchronize();
    return () => {
      cancelled = true;
      if (timer != null) clearTimeout(timer);
    };
  }, [loadSignal, mock, selected?.id, selected?.approach]);

  useEffect(() => {
    const online = () => {
      setApi('idle');
      void loadSignal();
    };
    const offline = () => setApi('offline');
    const visible = () => {
      if (document.visibilityState !== 'visible') return;
      const age = activeSnapshot ? Date.now() - activeSnapshot.receivedAt : Number.POSITIVE_INFINITY;
      if (age >= 15_000) void loadSignal();
    };
    addEventListener('online', online);
    addEventListener('offline', offline);
    document.addEventListener('visibilitychange', visible);
    return () => {
      removeEventListener('online', online);
      removeEventListener('offline', offline);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [activeSnapshot, loadSignal]);

  useEffect(() => () => signalRequest.current?.controller.abort(), []);

  useEffect(() => {
    if (!mock || !selected) return;
    setSignalSnapshot({ data: mockSignal(selected.id), receivedAt: Date.now() });
    const id = setTimeout(() => setSignalSnapshot({
      data: {
        ...mockSignal(selected.id),
        signal: {
          straight: { state: 'RED', remainingSeconds: 32.7 },
          left: { state: 'GREEN', remainingSeconds: 16.4 },
        },
        timestamp: new Date().toISOString(),
      },
      receivedAt: Date.now(),
    }), 23_700);
    return () => clearTimeout(id);
  }, [mock, selected?.id]);

  const gpsLabel = mock ? 'TEST GPS'
    : gps === 'active' ? 'GPS 정상'
    : gps === 'denied' ? 'GPS 권한 거부'
      : gps === 'requesting' ? 'GPS 요청 중' : 'GPS 확인 불가';
  const apiLabel = mock ? 'DEMO DATA'
    : api === 'ok' ? activeSnapshot ? '로컬 카운트' : 'C-ITS 연결'
    : api === 'loading' ? 'C-ITS 동기화'
      : api === 'offline' ? '오프라인'
        : api === 'error' ? 'API 오류' : '연결 대기';

  return <main>
    <header>
      <div className={`pill ${gps === 'active' ? 'good' : 'warn'}`}><i />{gpsLabel}</div>
      <div className={`pill ${api === 'ok' ? 'good' : 'warn'}`}><i />{apiLabel}</div>
    </header>

    <button
      type="button"
      className={`test-mode ${mock ? 'active' : ''}`}
      aria-pressed={mock}
      onClick={toggleTestMode}
    >
      <span><b>TEST MODE</b><small>GPS·API 없이 데모 데이터 사용</small></span>
      <em>{mock ? 'ON' : 'OFF'}</em>
      <i aria-hidden="true"><b /></i>
    </button>

    <section className="intersection">
      <span>선택 교차로</span>
      <h1>{selected?.name ?? (
        gps === 'denied' ? '위치 권한이 필요합니다'
          : api === 'ok' ? '주변 지원 교차로 없음'
            : intersections.length ? '교차로 검색 중' : '주변 교차로 확인 중'
      )}</h1>
      <strong>{selected ? `${Math.round(selected.distanceMeters)} m` : '—'}</strong>
      <small>
        진행 방향 · {directionName[selected?.approach ?? approach]}
        {approach === 'UNKNOWN' && selected && ' (교차로 기준 추정)'}
      </small>
    </section>

    <IntersectionGuide
      approach={selected?.approach ?? approach}
      straight={mainSignal}
      left={signal?.signal.left}
      mode={travelMode}
      onModeChange={(mode) => {
        setTravelMode(mode);
        localStorage.travelMode = mode;
      }}
    />

    <section className="nearby" aria-label="주변 교차로 선택">
      <div className="nearby-heading">
        <b>주변 신호 교차로</b>
        <span>선택해서 신호 보기</span>
      </div>
      {nearby.length > 0 ? <div className="nearby-list">
        {nearby.map((item, index) => <button
          type="button"
          key={item.id}
          className={selected?.id === item.id ? 'selected' : ''}
          aria-pressed={selected?.id === item.id}
          onClick={() => {
            setSignalSnapshot(null);
            setManualIntersectionId(item.id);
          }}
        >
          <span>{item.name}</span>
          <small>{Math.round(item.distanceMeters)} m</small>
          {index === 0 && <em>가까움</em>}
        </button>)}
      </div> : <p className="nearby-empty">반경 1.5 km 안에 제공 중인 교차로가 없습니다.</p>}
    </section>

    <section className={`signal ${mainSignal.state.toLowerCase()} ${stale ? 'stale' : ''}`}>
      <div className="signal-heading">
        <TrafficLight className="main-light" state={mainSignal.state} />
        <div className="state">{mainSignal.state}</div>
      </div>
      <div className="count">{formatRemainingSeconds(mainSignal.remainingSeconds)}</div>
      <div className="seconds">SECONDS</div>
      <div
        className="signal-progress"
        role="progressbar"
        aria-label="신호 잔여시간"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(signalProgress)}
      ><i style={{ width: `${signalProgress}%` }} /></div>
      <div className="lane">↑ 차량 직진 신호 {travelMode === 'walk' && <span>보행 연계 참고</span>} {stale && <b>오래된 데이터</b>}</div>
    </section>

    <section className="secondary">
      <div><span>↰ 좌회전</span><strong>{signal?.signal.left?.state ?? '정보 없음'}</strong></div>
      <div><span>남은 시간</span><strong>{formatRemainingSeconds(signal?.signal.left?.remainingSeconds)}초</strong></div>
    </section>

    {travelMode === 'drive' && <section className={`glosa ${glosa.tone}`}>
      <div className="glosa-heading"><span>GLOSA</span><small>신호 연동 속도 안내</small></div>
      <div className="glosa-body">
        <strong>{glosa.recommendedSpeedKph ?? '—'}{glosa.recommendedSpeedKph != null && <small>km/h</small>}</strong>
        <div><b>{glosa.label}</b><p>{glosa.message}</p></div>
      </div>
    </section>}

    <footer>
      <div><span>현재 속도</span><strong>{position?.speed == null ? '—' : Math.round(position.speed * 3.6)} <small>km/h</small></strong></div>
      <div><span>최근 동기화</span><strong>{activeSnapshot ? new Date(activeSnapshot.receivedAt).toLocaleTimeString('ko-KR', { hour12: false }) : '—'}</strong></div>
      <button type="button" onClick={() => {
        const value = !developer;
        setDeveloper(value);
        localStorage.devMode = String(value);
      }}>⚙ 설정</button>
    </footer>

    {developer && <pre className="developer">DEVELOPER MODE{JSON.stringify({
      position,
      selected,
      nearby,
      testMode: mock,
      api,
      endpoint: '/api',
      parsedSignal: activeRawSignal,
      receivedAt: activeSnapshot?.receivedAt,
      signalProgress,
      glosa,
    }, null, 2)}</pre>}

    {notice && <div className="overlay"><div className="dialog">
      <b>안전 안내</b>
      <p>C-ITS 데이터는 네트워크 지연, 시스템 오류 또는 데이터 누락이 발생할 수 있습니다.<br />실제 도로 신호와 제한속도를 항상 우선하여 확인하세요.</p>
      <button type="button" onClick={() => {
        localStorage.safetyAccepted = 'true';
        setNotice(false);
      }}>확인했습니다</button>
    </div></div>}
  </main>;
}
