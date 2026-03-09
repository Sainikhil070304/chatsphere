// ════════════════════════════════════════════════════════════════
// Register.jsx — 3-step with dev OTP display + autofill fix
// ════════════════════════════════════════════════════════════════
import { useState, useRef, useEffect } from "react";
import API from "../services/api";

// Shared sub-components (same as Login.jsx)
function Alert({ type, children }) {
  const e = type==="error";
  return <div style={{marginBottom:12,padding:"10px 13px",borderRadius:10,fontSize:13,display:"flex",gap:8,alignItems:"flex-start",color:e?"#f87171":"#86efac",background:e?"rgba(248,113,113,.08)":"rgba(34,197,94,.07)",border:`1px solid ${e?"rgba(248,113,113,.25)":"rgba(34,197,94,.2)"}`}}>{e?"⚠️":"✅"} <span>{children}</span></div>;
}
function Inp({ type="text", value, placeholder, onChange, onKeyDown, autoComplete, style:xtra }) {
  const [f,setF]=useState(false);
  return <input type={type} value={value} placeholder={placeholder} onChange={onChange} onKeyDown={onKeyDown} autoComplete={autoComplete} onFocus={()=>setF(true)} onBlur={()=>setF(false)}
    style={{width:"100%",padding:"12px 14px",borderRadius:11,boxSizing:"border-box",border:`1.5px solid ${f?"rgba(108,99,255,.75)":"rgba(255,255,255,.1)"}`,background:"rgba(255,255,255,.05)",WebkitBoxShadow:"0 0 0 1000px rgba(15,18,32,1) inset",WebkitTextFillColor:"#fff",color:"#fff",fontSize:14,outline:"none",fontFamily:"'DM Sans',sans-serif",transition:"border .2s",caretColor:"#a78bfa",...xtra}}/>;
}
function Btn({ loading, onClick, children, secondary, disabled, style:xtra }) {
  return <button type="button" onClick={onClick} disabled={loading||disabled} style={{display:"block",width:"100%",padding:"12px",borderRadius:12,border:"none",background:secondary?"rgba(255,255,255,.07)":(loading||disabled)?"rgba(108,99,255,.4)":"linear-gradient(135deg,#6c63ff,#a78bfa)",color:"#fff",fontSize:14,fontWeight:700,cursor:(loading||disabled)?"not-allowed":"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all .2s",...xtra}}>{loading?"Please wait...":children}</button>;
}
const lbl = {display:"block",fontSize:11,fontWeight:700,color:"rgba(167,139,250,.75)",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.06em"};

export default function Register({ onSwitchToLogin }) {
  const [step,    setStep]    = useState("details");
  const [email,   setEmail]   = useState("");
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const [devOtp,  setDevOtp]  = useState("");
  const [resendCd,setResendCd]= useState(0);

  const [form, setForm] = useState({ firstName:"",middleName:"",lastName:"",dob:"",username:"",email:"",password:"",confirm:"" });
  const [otp, setOtp]   = useState(["","","","","",""]);
  const otpRefs = [useRef(),useRef(),useRef(),useRef(),useRef(),useRef()];

  useEffect(()=>{ if(resendCd<=0)return; const t=setTimeout(()=>setResendCd(c=>c-1),1000); return()=>clearTimeout(t); },[resendCd]);

  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  const validate = () => {
    if (step==="details"){
      if (!form.firstName.trim())  return "First name required";
      if (!form.lastName.trim())   return "Last name required";
      if (!form.dob)                return "Date of birth required";
      if ((Date.now()-new Date(form.dob))/31557600000 < 13) return "Must be at least 13 years old";
    }
    if (step==="creds"){
      if (!form.username.trim())            return "Username required";
      if (/\s/.test(form.username))         return "No spaces in username";
      if (!/^[a-z0-9_]+$/.test(form.username.toLowerCase())) return "Username: letters, numbers, underscore only";
      if (!form.email.includes("@"))        return "Valid email required";
      if (form.password.length < 6)         return "Password must be 6+ characters";
      if (form.password !== form.confirm)   return "Passwords don't match";
    }
    return null;
  };

  const next = async () => {
    setError("");
    const err = validate(); if (err) { setError(err); return; }
    if (step==="details") { setStep("creds"); return; }
    if (step==="creds") {
      setLoading(true);
      try {
        const res = await API.post("/auth/register",{
          firstName:form.firstName.trim(), middleName:form.middleName.trim(),
          lastName:form.lastName.trim(),   username:form.username.toLowerCase().trim(),
          email:form.email.toLowerCase().trim(), password:form.password, dob:form.dob,
        });
        setEmail(form.email.toLowerCase().trim());
        setStep("verify"); setResendCd(60); setOtp(["","","","","",""]);
        if (res.data._devOtp) { setDevOtp(res.data._devOtp); console.log(" DEV OTP:", res.data._devOtp); }
      } catch(e) { setError(e.response?.data?.msg || "Registration failed"); }
      finally { setLoading(false); }
    }
  };

  const verifyOtp = async () => {
    const code = otp.join(""); if(code.length<6){setError("Enter all 6 digits");return;}
    setLoading(true); setError("");
    try {
      const res = await API.post("/auth/verify-otp",{ email, otp:code });
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("me",    JSON.stringify(res.data.user));
      window.location.reload();
    } catch(e) { setError(e.response?.data?.msg||"Verification failed"); setOtp(["","","","","",""]); }
    finally { setLoading(false); }
  };

  const resend = async () => {
    if (resendCd>0) return; setError(""); setLoading(true);
    try {
      const res = await API.post("/auth/resend-otp",{ email });
      setResendCd(60); setOtp(["","","","","",""]);
      if (res.data._devOtp) { setDevOtp(res.data._devOtp); console.log(" DEV OTP:", res.data._devOtp); }
    } catch(e) { setError(e.response?.data?.msg||"Resend failed"); }
    finally { setLoading(false); }
  };

  const otpChange = (i,val) => { const d=val.replace(/\D/g,"").slice(-1); const n=[...otp];n[i]=d;setOtp(n); if(d&&i<5)otpRefs[i+1].current?.focus(); };
  const otpKey   = (i,e)   => { if(e.key==="Backspace"&&!otp[i]&&i>0)otpRefs[i-1].current?.focus(); };
  const otpPaste = (e)     => { const p=e.clipboardData.getData("text").replace(/\D/g,"").slice(0,6); if(p.length===6){setOtp(p.split(""));otpRefs[5].current?.focus();} };

  const stepIdx = ["details","creds","verify"].indexOf(step);

  return (
    <div className="auth-card">
      {/* Progress bar */}
      <div style={{display:"flex",gap:6,marginBottom:20}}>
        {[0,1,2].map(i=><div key={i} style={{height:5,borderRadius:3,flex:i<=stepIdx?2:1,transition:"all .35s",background:i<=stepIdx?"linear-gradient(90deg,#6c63ff,#a78bfa)":"rgba(255,255,255,.1)"}}/>)}
      </div>

      {/* ── STEP 1 ── */}
      {step==="details"&&(<>
        <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:800,margin:"0 0 2px",color:"#fff"}}>Create Account</h2>
        <p style={{fontSize:12,color:"rgba(255,255,255,.35)",margin:"0 0 16px"}}>Step 1 of 3 — Personal details</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <div><label style={lbl}>First *</label><Inp value={form.firstName} placeholder="First" onChange={e=>set("firstName",e.target.value)}/></div>
          <div><label style={lbl}>Last *</label><Inp value={form.lastName} placeholder="Last" onChange={e=>set("lastName",e.target.value)}/></div>
        </div>
        <div style={{marginBottom:10}}><label style={lbl}>Middle <span style={{opacity:.4}}>(optional)</span></label><Inp value={form.middleName} placeholder="Middle" onChange={e=>set("middleName",e.target.value)}/></div>
        <div style={{marginBottom:14}}><label style={lbl}>Date of Birth *</label><Inp type="date" value={form.dob} onChange={e=>set("dob",e.target.value)} style={{colorScheme:"dark"}} max={new Date(Date.now()-13*365.25*86400000).toISOString().split("T")[0]}/></div>
        {error&&<Alert type="error">{error}</Alert>}
        <div style={{display:"flex",gap:8}}>
          <Btn secondary onClick={onSwitchToLogin} style={{flex:1}}>Login</Btn>
          <Btn onClick={next} style={{flex:2}}>Continue →</Btn>
        </div>
      </>)}

      {/* ── STEP 2 ── */}
      {step==="creds"&&(<>
        <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:800,margin:"0 0 2px",color:"#fff"}}>Your Credentials</h2>
        <p style={{fontSize:12,color:"rgba(255,255,255,.35)",margin:"0 0 16px"}}>Step 2 of 3 — Account details</p>
        <div style={{marginBottom:10}}>
          <label style={lbl}>Username *</label>
          <div style={{position:"relative"}}>
            <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:"rgba(167,139,250,.6)",pointerEvents:"none"}}>@</span>
            <Inp value={form.username} placeholder="username" onChange={e=>set("username",e.target.value.toLowerCase().replace(/\s/g,""))} style={{paddingLeft:24}}/>
          </div>
        </div>
        <div style={{marginBottom:10}}><label style={lbl}>Email *</label><Inp type="email" value={form.email} placeholder="you@email.com" onChange={e=>set("email",e.target.value)}/></div>
        <div style={{marginBottom:10}}><label style={lbl}>Password *</label><Inp type="password" value={form.password} placeholder="6+ characters" onChange={e=>set("password",e.target.value)} autoComplete="new-password"/></div>
        <div style={{marginBottom:14}}><label style={lbl}>Confirm *</label><Inp type="password" value={form.confirm} placeholder="Repeat password" onChange={e=>set("confirm",e.target.value)} onKeyDown={e=>e.key==="Enter"&&next()} autoComplete="new-password"/></div>
        {error&&<Alert type="error">{error}</Alert>}
        <div style={{display:"flex",gap:8}}>
          <Btn secondary onClick={()=>{setStep("details");setError("");}} style={{flex:1}}>← Back</Btn>
          <Btn loading={loading} onClick={next} style={{flex:2}}>{loading?"Sending...":"Send Code →"}</Btn>
        </div>
      </>)}

      {/* ── STEP 3 OTP ── */}
      {step==="verify"&&(<>
        <div style={{textAlign:"center",marginBottom:18}}>
          <div style={{fontSize:42,marginBottom:8}}></div>
          <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:800,margin:"0 0 5px",color:"#fff"}}>Verify Email</h2>
          <p style={{fontSize:13,color:"rgba(255,255,255,.35)",margin:0}}>Code sent to <strong style={{color:"#a78bfa"}}>{email}</strong></p>
        </div>

        {/* DEV MODE: show OTP on screen */}
        {devOtp && (
          <div style={{textAlign:"center",marginBottom:12,padding:"8px 12px",borderRadius:10,background:"rgba(34,197,94,.1)",border:"1px solid rgba(34,197,94,.25)",fontSize:13,color:"#86efac"}}>
            <span style={{opacity:.7}}>Dev OTP: </span>
            <strong style={{letterSpacing:4,fontSize:16,color:"#4ade80"}}>{devOtp}</strong>
          </div>
        )}

        {error && <Alert type="error">{error}</Alert>}

        {/* OTP digits */}
        <div style={{display:"flex",gap:8,justifyContent:"center",marginBottom:18}} onPaste={otpPaste}>
          {otp.map((d,i)=>(
            <input key={i} ref={otpRefs[i]} type="text" inputMode="numeric" maxLength={1} value={d}
              onChange={e=>otpChange(i,e.target.value)} onKeyDown={e=>otpKey(i,e)}
              style={{width:44,height:52,borderRadius:11,textAlign:"center",outline:"none",fontSize:22,fontWeight:900,fontFamily:"monospace",transition:"all .15s",
                border:`2px solid ${d?"rgba(108,99,255,.8)":"rgba(255,255,255,.12)"}`,
                background:d?"rgba(108,99,255,.15)":"rgba(255,255,255,.04)",
                WebkitBoxShadow:"0 0 0 1000px rgba(15,18,32,1) inset",
                WebkitTextFillColor:"#fff",color:"#fff",
              }}
              onFocus={e=>{e.target.style.borderColor="rgba(167,139,250,.9)";e.target.style.background="rgba(108,99,255,.18)";}}
              onBlur={e=>{e.target.style.borderColor=d?"rgba(108,99,255,.8)":"rgba(255,255,255,.12)";e.target.style.background=d?"rgba(108,99,255,.15)":"rgba(255,255,255,.04)";}}
            />
          ))}
        </div>

        <Btn loading={loading} disabled={otp.join("").length<6} onClick={verifyOtp}>✓ Verify & Create Account</Btn>
        <button type="button" onClick={resend} disabled={resendCd>0||loading}
          style={{width:"100%",marginTop:8,padding:"11px",borderRadius:11,border:"1px solid rgba(255,255,255,.08)",background:"rgba(255,255,255,.03)",color:resendCd>0?"rgba(255,255,255,.2)":"rgba(167,139,250,.8)",fontSize:13,fontWeight:600,cursor:resendCd>0?"not-allowed":"pointer",fontFamily:"'DM Sans',sans-serif"}}>
          {resendCd>0?`Resend in ${resendCd}s`:"↻ Resend Code"}
        </button>
        <button type="button" onClick={()=>{setStep("creds");setOtp(["","","","","",""]);setError("");setDevOtp("");}}
          style={{width:"100%",marginTop:6,padding:"8px",background:"none",border:"none",color:"rgba(255,255,255,.2)",fontSize:12,cursor:"pointer"}}>
          ← Change email
        </button>
      </>)}
    </div>
  );
}