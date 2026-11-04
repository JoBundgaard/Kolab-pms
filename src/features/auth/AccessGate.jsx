import { lazy, Suspense, useEffect, useState } from "react";
import {
  GoogleAuthProvider,
  onIdTokenChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { auth } from "../../firebase.js";
import { staffRequest } from "../../services/staffService.js";
import LoginView from "./LoginView.jsx";
const App = lazy(() => import("../../App.jsx"));
const StaffPortal = lazy(() => import("../staff/StaffPortal.jsx"));

export default function AccessGate() {
  const [state, setState] = useState({ loading: true });
  const [attempt, setAttempt] = useState(0);
  const [loginError, setLoginError] = useState("");
  useEffect(() => {
    let alive = true,
      generation = 0;
    const stop = onIdTokenChanged(auth, async (user) => {
      const version = ++generation;
      if (!alive) return;
      if (!user) {
        setState({ loading: false, user: null });
        return;
      }
      setState({ loading: true, user });
      try {
        const session = await staffRequest("session");
        if (alive && version === generation)
          setState({ loading: false, user, session });
      } catch (error) {
        if (alive && version === generation)
          setState({ loading: false, user, error: error.message });
      }
    });
    return () => {
      alive = false;
      stop();
    };
  }, [attempt]);
  const loading = (
    <div className="min-h-screen bg-[#F9F8F2] grid place-items-center text-[#26402E]">
      Loading your workspace… / Đang tải…
    </div>
  );
  if (state.loading) return loading;
  if (!state.user)
    return (
      <LoginView
        loginHint={loginError}
        handleGoogleSignIn={async () => {
          try {
            setLoginError("");
            await signInWithPopup(auth, new GoogleAuthProvider());
          } catch (error) {
            setLoginError(error.message);
          }
        }}
      />
    );
  if (state.error || state.session?.role === "pending")
    return (
      <div className="min-h-screen bg-[#F9F8F2] grid place-items-center p-6">
        <section className="bg-white border rounded-3xl p-8 max-w-lg space-y-5">
          <h1 className="text-2xl font-serif text-[#26402E]">
            Kolab · Your workspace
          </h1>
          <p>
            {state.error ||
              "Your manager needs to enable access for this Google account. / Quản lý cần cấp quyền cho tài khoản Google này."}
          </p>
          <p className="text-sm text-slate-500">{state.user.email}</p>
          <div className="flex gap-4">
            <button
              className="underline"
              onClick={() => setAttempt((n) => n + 1)}
            >
              Try again / Thử lại
            </button>
            <button className="underline" onClick={() => signOut(auth)}>
              Sign out / Đăng xuất
            </button>
          </div>
        </section>
      </div>
    );
  return (
    <Suspense fallback={loading}>
      {state.session.role === "manager" ? (
        <App key={state.user.uid} />
      ) : (
        <StaffPortal
          key={state.user.uid}
          user={state.user}
          profile={state.session.profile}
        />
      )}
    </Suspense>
  );
}
