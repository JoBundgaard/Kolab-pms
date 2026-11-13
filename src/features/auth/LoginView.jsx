import { COLORS } from '../../config/pms.js';

export default function LoginView({
  handleGoogleSignIn,
  loginHint,
}) {
  return (<div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.cream }}>
      <div className="bg-white shadow-xl border border-slate-200 rounded-2xl p-10 w-full max-w-md text-center space-y-6">
        <div>
          <h1 className="text-3xl font-serif font-bold" style={{ color: COLORS.darkGreen }}>Kolab PMS</h1>
          <p className="text-sm text-slate-500 mt-2">You must sign in to access the PMS.</p>
        </div>
        <button
          onClick={handleGoogleSignIn}
          className="w-full px-4 py-3 rounded-full font-semibold text-white shadow-lg hover:shadow-xl transition-all"
          style={{ backgroundColor: COLORS.darkGreen }}
        >
          Sign in with Google
        </button>
        {loginHint && <div className="text-xs text-red-600">{loginHint}</div>}
      </div>
    </div>);
}
