// ════════════════════════════════════════════════════════════════
// Login.jsx — Login + Forgot Password + OTP verify + Reset
// Fixes: white autofill bg, error persists, forgot password flow
// ════════════════════════════════════════════════════════════════
import { useState, useRef } from "react";
import API from "../services/api";

export default function Login({ setUser, onSwitchToRegister }) {
  // DSA: State machine — screens: login | forgot | resetOtp | newPw
  const [screen,  setScreen]  = useState("login");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [info,    setInfo]    = useState("");

  // Login fields
  const [emailId, setEmailId] = useState("");
  const [pass,    setPass]    = useState("");
  const [showPw,  setShowPw]  = useState(false);

  // Forgot / reset fields
  const [fEmail,     setFEmail]     = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPw,      setNewPw]      = useState("");
  const [confPw,     setConfPw]     = useState("");

  // OTP state
  const [otp, setOtp]   = useState(["","","","","",""]);
  const otpRefs = [useRef(),useRef(),useRef(),useRef(),useRef(),useRef()];

  const clearState = () => { setError(""); setInfo(""); };
  const go = (s)    => { clearState(); setScreen(s); };

  const otpChange = (i, val) => {
    const d = val.replace(/\D/g,"").slice(-1);
    const n = [...otp]; n[i] = d; setOtp(n);
    if (d && i < 5) otpRefs[i+1].current?.focus();
  };
  const otpKey = (i, e) => {
    if (e.key==="Backspace" && !otp[i] && i > 0) otpRefs[i-1].current?.focus();
  };
  const otpPaste = (e) => {
    const p = e.clipboardData.getData("text").replace(/\D/g,"").slice(0,6);
    if (p.length===6) { setOtp(p.split("")); otpRefs[5].current?.focus(); }
  };

  // ── LOGIN ─────────────────────────────────────────────────────
  const doLogin = async () => {
    clearState();
    if (!emailId.trim()) { setError("Enter your email or username"); return; }
    if (!pass)           { setError("Enter your password"); return; }
    setLoading(true);
    try {
      const res = await API.post("/auth/login", { email: emailId.trim(), password: pass });
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("me",    JSON.stringify(res.data.user));
      setUser(res.data.user);
    } catch (e) {
      setError(e.response?.data?.msg || "Login failed — check server is running");
    } finally { setLoading(false); }
  };

  // ── FORGOT: request code ──────────────────────────────────────
  const doForgot = async () => {
    clearState();
    if (!fEmail.trim()) { setError("Enter your account email"); return; }
    setLoading(true);
    try {
      await API.post("/auth/forgot-password", { email: fEmail.trim() });
      setInfo("Reset code sent! Check your email.");
      setOtp(["","","","","",""]); go("resetOtp");
    } catch (e) { setError(e.response?.data?.msg || "Failed. Try again."); }
    finally { setLoading(false); }
  };

  // ── VERIFY RESET CODE ─────────────────────────────────────────
  const doVerifyReset = async () => {
    clearState();
    const code = otp.join("");
    if (code.length < 6) { setError("Enter all 6 digits"); return; }
    setLoading(true);
    try {
      const res = await API.post("/auth/verify-reset-otp", { email: fEmail.trim(), otp: code });
      setResetToken(res.data.resetToken);
      go("newPw");
    } catch (e) {
      setError(e.response?.data?.msg || "Wrong code");
      setOtp(["","","","","",""]);
      otpRefs[0].current?.focus();
    } finally { setLoading(false); }
  };

  // ── SET NEW PASSWORD ──────────────────────────────────────────
  const doNewPw = async () => {
    clearState();
    if (newPw.length < 6)      { setError("Password must be 6+ characters"); return; }
    if (newPw !== confPw)       { setError("Passwords don't match"); return; }
    setLoading(true);
    try {
      await API.post("/auth/reset-password", { resetToken, newPassword: newPw });
      setInfo("Password updated! Login with your new password.");
      setNewPw(""); setConfPw(""); setFEmail("");
      go("login");
    } catch (e) { setError(e.response?.data?.msg || "Reset failed"); }
    finally { setLoading(false); }
  };

  return (
    <div className="auth-card">

      {/* ═══ LOGIN ═══ */}
      {screen === "login" && (
        <>
          <div style={{textAlign:"center",marginBottom:24}}>
            <div style={{width:56,height:56,borderRadius:18,background:"linear-gradient(135deg,#6c63ff,#a78bfa)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 10px",boxShadow:"0 0 24px rgba(108,99,255,.4)"}}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:22,fontWeight:800,margin:"0 0 4px",color:"#fff"}}>Welcome back</h2>
            <p style={{margin:0,fontSize:13,color:"rgba(255,255,255,.38)"}}>Login with your email or @username</p>
          </div>

          {error && <Alert type="error">{error}</Alert>}
          {info  && <Alert type="ok">{info}</Alert>}

          <Field label="Email / Username">
            <Input
              value={emailId} placeholder="email@example.com or @username"
              onChange={e=>setEmailId(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&doLogin()}
              autoComplete="username"
            />
          </Field>

          <Field label="Password" style={{ marginTop: 10 }}>
  <div style={{ position: "relative", width: "100%" }}>
    
    <Input
      type={showPw ? "text" : "password"}
      value={pass}
      placeholder="Your password"
      onChange={e => setPass(e.target.value)}
      onKeyDown={e => e.key === "Enter" && doLogin()}
      autoComplete="current-password"
      style={{
        width: "100%",
        paddingRight: "50px"
      }}
    />

    <button
      type="button"
      onClick={() => setShowPw(s => !s)}
      style={{
        position: "absolute",
        right: "10px",
        top: "50%",
        transform: "translateY(-50%)",
        width: "34px",
        height: "34px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        border: "none",
        cursor: "pointer",
        color: "rgba(255,255,255,0.9)",
        zIndex: 2
      }}
    >
      {showPw ? (
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      ) : (
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>

  </div>
</Field>

          <div style={{textAlign:"right",marginTop:6,marginBottom:18}}>
            <button type="button" onClick={()=>go("forgot")}
              style={{background:"none",border:"none",color:"rgba(167,139,250,.8)",cursor:"pointer",fontSize:13,fontWeight:600,padding:0}}>
              Forgot password?
            </button>
          </div>

          <Btn loading={loading} onClick={doLogin}>Login</Btn>

          <p style={{textAlign:"center",marginTop:16,fontSize:13,color:"rgba(255,255,255,.3)"}}>
            Don't have an account?{" "}
            <button type="button" onClick={onSwitchToRegister}
              style={{background:"none",border:"none",color:"#a78bfa",cursor:"pointer",fontWeight:700,fontSize:13,padding:0}}>
              Create one
            </button>
          </p>
        </>
      )}

      {/* ═══ FORGOT: enter email ═══ */}
      {screen === "forgot" && (
        <>
          <div style={{textAlign:"center",marginBottom:22}}>
            <div style={{width:52,height:52,borderRadius:16,background:"rgba(108,99,255,.15)",border:"1.5px solid rgba(108,99,255,.3)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 10px"}}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:800,margin:"0 0 4px",color:"#fff"}}>Forgot Password</h2>
            <p style={{margin:0,fontSize:13,color:"rgba(255,255,255,.38)"}}>Enter your account email to get a reset code</p>
          </div>

          {error && <Alert type="error">{error}</Alert>}

          <Field label="Account Email">
            <Input value={fEmail} placeholder="you@email.com" type="email"
              onChange={e=>setFEmail(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&doForgot()} />
          </Field>

          <div style={{marginTop:16,display:"flex",gap:10}}>
            <Btn secondary onClick={()=>go("login")} style={{flex:1}}>← Back</Btn>
            <Btn loading={loading} onClick={doForgot} style={{flex:2}}>Send Reset Code</Btn>
          </div>
        </>
      )}

      {/* ═══ RESET OTP ═══ */}
      {screen === "resetOtp" && (
        <>
          <div style={{textAlign:"center",marginBottom:20}}>
            <div style={{width:52,height:52,borderRadius:16,background:"rgba(108,99,255,.15)",border:"1.5px solid rgba(108,99,255,.3)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 10px"}}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21.27 15h.65a2 2 0 0 1 .08.92z"/></svg>
            </div>
            <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:800,margin:"0 0 6px",color:"#fff"}}>Enter Reset Code</h2>
            <p style={{margin:0,fontSize:13,color:"rgba(255,255,255,.38)"}}>Sent to <strong style={{color:"#a78bfa"}}>{fEmail}</strong></p>
          </div>

          {info  && <Alert type="ok">{info}</Alert>}
          {error && <Alert type="error">{error}</Alert>}

          <OtpGrid otp={otp} refs={otpRefs} onChange={otpChange} onKeyDown={otpKey} onPaste={otpPaste} accent="#f87171" />

          <Btn loading={loading} onClick={doVerifyReset} disabled={otp.join("").length<6} style={{marginTop:16}}>
            Verify Code →
          </Btn>
          <button type="button" onClick={()=>go("forgot")}
            style={{width:"100%",marginTop:8,padding:"10px",background:"none",border:"none",color:"rgba(255,255,255,.25)",fontSize:13,cursor:"pointer"}}>
            ← Request new code
          </button>
        </>
      )}

      {/* ═══ NEW PASSWORD ═══ */}
      {screen === "newPw" && (
        <>
          <div style={{textAlign:"center",marginBottom:22}}>
            <div style={{width:52,height:52,borderRadius:16,background:"rgba(108,99,255,.15)",border:"1.5px solid rgba(108,99,255,.3)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 10px"}}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:800,margin:"0 0 4px",color:"#fff"}}>Set New Password</h2>
            <p style={{margin:0,fontSize:13,color:"rgba(255,255,255,.38)"}}>Choose something strong</p>
          </div>

          {error && <Alert type="error">{error}</Alert>}

          <Field label="New Password">
            <Input type="password" value={newPw} placeholder="6+ characters"
              onChange={e=>setNewPw(e.target.value)} autoComplete="new-password" />
          </Field>
          <StrengthBar password={newPw} />
          <Field label="Confirm Password" style={{marginTop:10,marginBottom:16}}>
            <Input type="password" value={confPw} placeholder="Repeat password"
              onChange={e=>setConfPw(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&doNewPw()} autoComplete="new-password" />
          </Field>

          <Btn loading={loading} onClick={doNewPw}>Update Password ✓</Btn>
        </>
      )}

    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Sub-components
// ════════════════════════════════════════════════════════════════
function Alert({ type, children }) {
  const isErr = type === "error";
  return (
    <div style={{marginBottom:14,padding:"10px 14px",borderRadius:10,fontSize:13,display:"flex",alignItems:"center",gap:8,
      color:isErr?"#f87171":"#86efac",
      background:isErr?"rgba(248,113,113,.08)":"rgba(34,197,94,.07)",
      border:`1px solid ${isErr?"rgba(248,113,113,.25)":"rgba(34,197,94,.2)"}`}}>
      {isErr?"⚠️":"✅"} {children}
    </div>
  );
}

function Field({ label, children, style }) {
  return (
    <div style={style}>
      {label && <label style={{display:"block",fontSize:11,fontWeight:700,color:"rgba(167,139,250,.75)",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.06em"}}>{label}</label>}
      {children}
    </div>
  );
}

// ── Input — overrides browser autofill white background ──────────
function Input({ type="text", value, placeholder, onChange, onKeyDown, autoComplete, ...rest }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type={type} value={value} placeholder={placeholder}
      onChange={onChange} onKeyDown={onKeyDown} autoComplete={autoComplete}
      onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
      {...rest}
      style={{
        width:"100%", padding:"12px 14px", borderRadius:11, boxSizing:"border-box",
        border:`1.5px solid ${focused?"rgba(108,99,255,.75)":"rgba(255,255,255,.1)"}`,
        // Force dark background even with browser autofill
        background:"rgba(255,255,255,.05)",
        // Autofill override via box-shadow trick (works in Chrome/Edge)
        WebkitBoxShadow:"0 0 0 1000px rgba(15,18,32,1) inset",
        WebkitTextFillColor:"#fff",
        color:"#fff", fontSize:14, outline:"none",
        fontFamily:"'DM Sans',sans-serif", transition:"border .2s",
        caretColor:"#a78bfa",
        ...rest.style,
      }}
    />
  );
}

function Btn({ loading, onClick, children, secondary, disabled, style }) {
  return (
    <button type="button" onClick={onClick} disabled={loading||disabled}
      style={{
        display:"block", width:"100%", padding:"13px", borderRadius:12, border:"none",
        background: secondary ? "rgba(255,255,255,.07)" : (loading||disabled) ? "rgba(108,99,255,.4)" : "linear-gradient(135deg,#6c63ff,#a78bfa)",
        color:"#fff", fontSize:14, fontWeight:700, cursor:(loading||disabled)?"not-allowed":"pointer",
        fontFamily:"'DM Sans',sans-serif", transition:"all .2s", ...style,
      }}>
      {loading ? "Please wait..." : children}
    </button>
  );
}

function OtpGrid({ otp, refs, onChange, onKeyDown, onPaste, accent="#a78bfa" }) {
  return (
    <div style={{display:"flex",gap:8,justifyContent:"center"}} onPaste={onPaste}>
      {otp.map((d,i)=>(
        <input key={i} ref={refs[i]} type="text" inputMode="numeric" maxLength={1} value={d}
          onChange={e=>onChange(i,e.target.value)} onKeyDown={e=>onKeyDown(i,e)}
          style={{
            width:44, height:52, borderRadius:11, textAlign:"center", outline:"none",
            fontSize:22, fontWeight:900, fontFamily:"'Courier New',monospace",
            color:"#fff", cursor:"text", transition:"all .15s",
            border:`2px solid ${d?accent:"rgba(255,255,255,.12)"}`,
            background: d ? `${accent}18` : "rgba(255,255,255,.04)",
            WebkitBoxShadow:"0 0 0 1000px rgba(15,18,32,1) inset",
            WebkitTextFillColor:"#fff",
          }}
          onFocus={e=>{e.target.style.borderColor=accent;e.target.style.background=`${accent}20`;}}
          onBlur={e=>{e.target.style.borderColor=d?accent:"rgba(255,255,255,.12)";e.target.style.background=d?`${accent}18`:"rgba(255,255,255,.04)";}}
        />
      ))}
    </div>
  );
}

function StrengthBar({ password }) {
  if (!password) return null;
  const s = password.length>=8&&/[A-Z]/.test(password)&&/[0-9]/.test(password)&&/[^A-Za-z0-9]/.test(password)?4
           :password.length>=8&&/[A-Z0-9]/.test(password)?3
           :password.length>=6?2:1;
  const labels = ["","Weak","Fair","Good","Strong"];
  const colors = ["","#ef4444","#f97316","#eab308","#22c55e"];
  return (
    <div style={{marginTop:6,marginBottom:4}}>
      <div style={{display:"flex",gap:3,marginBottom:3}}>
        {[1,2,3,4].map(n=><div key={n} style={{flex:1,height:3,borderRadius:2,background:n<=s?colors[s]:"rgba(255,255,255,.1)",transition:"all .3s"}}/>)}
      </div>
      <div style={{fontSize:11,color:colors[s]}}>{labels[s]}</div>
    </div>
  );
}