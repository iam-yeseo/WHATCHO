import { useEffect, useRef, useState } from 'react';
import { bearing, distanceMeters } from '../lib/geo';
import type { UserPosition } from '../types';

export type GpsState = 'requesting' | 'active' | 'denied' | 'unavailable';

export function usePosition(testMode: boolean) {
  const [state, setState] = useState<GpsState>('requesting');
  const [position, setPosition] = useState<UserPosition | null>(null);
  const previous = useRef<UserPosition | null>(null);
  const testPosition = useRef<UserPosition>({
    latitude: 37.5087,
    longitude: 127.0628,
    accuracy: 4,
    speed: 11.1,
    heading: 82,
    timestamp: Date.now(),
  });

  useEffect(() => {
    previous.current = null;
    if (testMode) return;
    setState('requesting');
    if (!navigator.geolocation) {
      setPosition(null);
      setState('unavailable');
      return;
    }

    const id = navigator.geolocation.watchPosition(({ coords, timestamp }) => {
      const next: UserPosition = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy,
        speed: coords.speed,
        heading: coords.heading,
        timestamp,
      };
      if (
        next.heading == null && previous.current &&
        distanceMeters(previous.current, next) > 5
      ) {
        next.heading = bearing(previous.current, next);
      }
      previous.current = next;
      setPosition(next);
      setState('active');
    }, (error) => {
      setState(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable');
    }, {
      enableHighAccuracy: true,
      maximumAge: 2000,
      timeout: 12_000,
    });

    return () => navigator.geolocation.clearWatch(id);
  }, [testMode]);

  return testMode
    ? { position: testPosition.current, state: 'active' as const }
    : { position, state };
}
