import { useCallback, useEffect, useRef, useState } from "react";
import {
  runStaffOperation,
  staffRequest,
} from "../../services/staffService.js";

export default function useStaffBoard(uid, date) {
  const key = `${uid}:${date}`;
  const [snapshot, setSnapshot] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [online, setOnline] = useState(navigator.onLine);
  const sequence = useRef(0),
    lock = useRef(false),
    currentKey = useRef(key);
  useEffect(() => {
    currentKey.current = key;
  }, [key]);
  const refresh = useCallback(async () => {
    if (!uid) return;
    const request = ++sequence.current;
    try {
      const board = await staffRequest("board", { uid, date });
      if (sequence.current === request && currentKey.current === key)
        setSnapshot({ key, board });
    } catch (error) {
      if (sequence.current === request && currentKey.current === key)
        setSnapshot({ key, error: error.message });
    }
  }, [uid, date, key]);
  useEffect(() => {
    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible" && !lock.current) refresh();
    };
    const interval = setInterval(onVisible, 30000);
    const onOnline = () => {
      setOnline(true);
      refresh();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      // This ref is a request generation counter, not a DOM ref. Invalidating it
      // deliberately prevents late responses from updating an unmounted board.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++sequence.current;
      clearInterval(interval);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);
  const run = async (operation, onSuccess) => {
    if (lock.current || !navigator.onLine) return false;
    lock.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      await runStaffOperation(operation);
      if (currentKey.current === key) setFeedback({ key, saved: true });
      await refresh();
      if (currentKey.current === key) onSuccess?.();
      return true;
    } catch (error) {
      if (currentKey.current === key)
        setFeedback({ key, error: error.message, operation, onSuccess });
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return {
    board: snapshot?.key === key ? snapshot.board : null,
    error: snapshot?.key === key ? snapshot.error : "",
    busy,
    feedback: feedback?.key === key ? feedback : null,
    online,
    refresh,
    run,
  };
}
