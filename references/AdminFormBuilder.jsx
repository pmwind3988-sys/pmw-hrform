/**
 * AdminFormBuilder.jsx — v3 (condensed)
 * Dynamic matrix fix: provisions one Enhanced Rich Text column per matrix field.
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import FormBuilder from "./FormBuilder";
import { flattenQuestions, getSpColumnKind } from "../utils/FormBuilderEngine";
import { createSpClient } from "../utils/sharepointClient";
import { SP_STATIC } from "../utils/spConfig";
import {
  slugify, checkSlugConflict, getAllFormConfigs, getFormConfig,
  upsertFormConfig, upsertApprovers, saveFormVersion,
  getFormVersionHistory, getFormVersion, logEvent, getFormLog,
  diffSurveyJson, isVersionGreater, incrementMinor, incrementMajor,
  bootstrapSystemLists, addColumn, listExists, createSpList,
} from "./formBuilderSP";
import logo from "../assets/logo.png";

const SP_SITE_URL = (process.env.REACT_APP_SP_SITE_URL || "").replace(/\/$/, "");

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  purple:"#5B21B6",purpleLight:"#7C3AED",purplePale:"#EDE9FE",purpleMid:"#DDD6FE",
  purpleDark:"#3B0764",white:"#FFFFFF",offWhite:"#F8F7FF",border:"#E5E3F0",
  textPrimary:"#1E1B4B",textSecond:"#6B7280",textMuted:"#9CA3AF",
  green:"#059669",greenPale:"#D1FAE5",red:"#DC2626",redPale:"#FEE2E2",
  amber:"#D97706",amberPale:"#FEF3C7",
  shadow:"0 1px 3px rgba(91,33,182,0.08),0 4px 16px rgba(91,33,182,0.06)",
  shadowMd:"0 4px 24px rgba(91,33,182,0.12)",shadowLg:"0 8px 40px rgba(91,33,182,0.16)",
};
const G=`@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0}body{font-family:'DM Sans',sans-serif;background:${C.offWhite};color:${C.textPrimary}}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:${C.purpleMid};border-radius:10px}`;
const inp={width:"100%",height:34,border:`1px solid ${C.border}`,borderRadius:8,padding:"0 11px",fontSize:13,fontFamily:"'DM Sans',sans-serif",color:C.textPrimary,background:C.white,outline:"none"};

// ── Atoms ─────────────────────────────────────────────────────────────────────
const Spinner=({size=18})=><div style={{width:size,height:size,border:`2px solid ${C.purpleMid}`,borderTop:`2px solid ${C.purple}`,borderRadius:"50%",animation:"spin 0.9s linear infinite",flexShrink:0}}/>;
const Tag=({children,color=C.purple,bg=C.purplePale})=><span style={{fontSize:10,fontWeight:700,color,background:bg,borderRadius:20,padding:"2px 9px",textTransform:"uppercase",letterSpacing:".04em"}}>{children}</span>;

function TextInput({value,onChange,placeholder,error,disabled,...rest}){
  const[f,setF]=useState(false);
  return(<><input value={value??""}onChange={e=>onChange(e.target.value)}placeholder={placeholder}disabled={disabled}
    style={{...inp,borderColor:error?C.red:f?C.purple:C.border,boxShadow:f?`0 0 0 3px ${error?C.redPale:C.purplePale}`:"none",transition:"all .15s",opacity:disabled?.6:1,cursor:disabled?"not-allowed":"text"}}
    onFocus={()=>setF(true)}onBlur={()=>setF(false)}{...rest}/>
    {error&&<div style={{fontSize:10,color:C.red,marginTop:3}}>{error}</div>}</>);
}
function FB({label,hint,children,required}){return(<div style={{marginBottom:14}}><label style={{display:"block",fontSize:11,fontWeight:600,color:C.textPrimary,marginBottom:4}}>{label}{required&&<span style={{color:C.red,marginLeft:3}}>*</span>}</label>{hint&&<div style={{fontSize:10,color:C.textMuted,marginBottom:4,lineHeight:1.5}}>{hint}</div>}{children}</div>);}
function ToggleSwitch({checked,onChange,label}){return(<label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",userSelect:"none"}}><div onClick={()=>onChange(!checked)}style={{width:36,height:20,borderRadius:10,flexShrink:0,background:checked?C.purple:C.border,position:"relative",transition:"background 0.2s",cursor:"pointer"}}><div style={{position:"absolute",top:3,left:checked?19:3,width:14,height:14,borderRadius:"50%",background:C.white,transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}/></div>{label&&<span style={{fontSize:12,color:C.textSecond}}>{label}</span>}</label>);}

// ── Provision overlay ─────────────────────────────────────────────────────────
function ProvisionOverlay({logs,success,error,onDone}){
  const ref=useRef(null);
  useEffect(()=>{ref.current?.scrollIntoView({behavior:"smooth"});},[logs]);
  return(<div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(10,5,25,.88)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
    <div style={{background:C.purpleDark,borderRadius:16,width:"100%",maxWidth:580,border:"1px solid rgba(167,139,250,.3)",boxShadow:C.shadowLg,overflow:"hidden",animation:"fadeUp .2s ease"}}>
      <div style={{padding:"14px 20px",borderBottom:"1px solid rgba(167,139,250,.2)"}}>
        <div style={{fontSize:13,fontWeight:600,color:C.purpleMid}}>{success?"✅ Done":error?"❌ Failed":"⚙️ Publishing…"}</div>
      </div>
      <div style={{padding:"12px 20px",fontFamily:"monospace",fontSize:11,color:"rgba(255,255,255,.8)",lineHeight:2,maxHeight:360,overflowY:"auto",background:"rgba(0,0,0,.2)"}}>
        {logs.map((l,i)=><div key={i}style={{color:l.t==="err"?"#FCA5A5":l.t==="ok"?"#6EE7B7":l.t==="warn"?"#FCD34D":"rgba(255,255,255,.7)"}}>{l.t==="err"?"✗ ":l.t==="ok"?"✓ ":l.t==="warn"?"⚠ ":"› "}{l.m}</div>)}
        {!success&&!error&&<div style={{display:"flex",alignItems:"center",gap:8}}><Spinner size={11}/><span style={{color:"rgba(255,255,255,.3)",animation:"pulse 1.4s infinite"}}>Working…</span></div>}
        <div ref={ref}/>
      </div>
      {(success||error)&&<div style={{padding:"12px 20px",borderTop:"1px solid rgba(167,139,250,.2)",display:"flex",justifyContent:"flex-end"}}>
        <button onClick={onDone}style={{padding:"8px 22px",borderRadius:8,background:success?C.green:C.purple,color:C.white,border:"none",fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:"'DM Sans'"}}>{success?"Done →":"Close"}</button>
      </div>}
    </div>
  </div>);
}

// ── Form library ──────────────────────────────────────────────────────────────
function FormLibrary({forms,onEdit,onNew,current}){
  return(<div style={{height:"100%",display:"flex",flexDirection:"column",overflow:"hidden"}}>
    <div style={{padding:"11px 13px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
      <div style={{fontSize:10,fontWeight:700,color:C.textMuted,textTransform:"uppercase",letterSpacing:".06em"}}>Forms ({forms.length})</div>
      <button onClick={onNew}style={{height:23,padding:"0 10px",border:"none",borderRadius:6,background:C.purple,color:C.white,fontSize:11,cursor:"pointer",fontFamily:"'DM Sans'"}}>＋ New</button>
    </div>
    <div style={{flex:1,overflowY:"auto",padding:"7px 9px"}}>
      {forms.length===0&&<div style={{textAlign:"center",padding:"20px 0",color:C.textMuted,fontSize:11}}>No forms yet.</div>}
      {forms.map(f=><div key={f.Id}onClick={()=>onEdit(f)}style={{padding:"8px 10px",borderRadius:8,border:`1px solid ${f.Title===current?C.purple:C.border}`,background:f.Title===current?C.purplePale:C.white,marginBottom:5,cursor:"pointer",transition:"all .13s"}}
        onMouseEnter={e=>{if(f.Title!==current)e.currentTarget.style.background=C.offWhite;}}onMouseLeave={e=>{if(f.Title!==current)e.currentTarget.style.background=C.white;}}>
        <div style={{fontSize:12,fontWeight:600,color:f.Title===current?C.purple:C.textPrimary,marginBottom:2}}>{f.Title}</div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}><span style={{fontSize:10,color:C.textMuted,fontFamily:"monospace"}}>{f.FormID}</span><Tag>v{f.CurrentVersion||"?"}</Tag>{f.Slug&&<span style={{fontSize:10,color:C.textMuted}}>/forms/{f.Slug}</span>}</div>
      </div>)}
    </div>
  </div>);
}

// ── Version history ───────────────────────────────────────────────────────────
function VersionHistory({history,current,onView}){
  if(!history.length)return<div style={{fontSize:11,color:C.textMuted,fontStyle:"italic"}}>No history yet.</div>;
  return(<div>{history.map((v,i)=><div key={i}style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px",border:`1px solid ${v.FormVersion===current?C.purple:C.border}`,borderRadius:8,background:v.FormVersion===current?C.purplePale:C.white,marginBottom:6}}>
    <div><div style={{display:"flex",alignItems:"center",gap:7,marginBottom:2}}><Tag>v{v.FormVersion}</Tag>{v.FormVersion===current&&<Tag color={C.green}bg={C.greenPale}>Current</Tag>}</div>
    <div style={{fontSize:10,color:C.textMuted}}>{v.PublishedBy?.split("@")[0]} · {v.PublishedAt?new Date(v.PublishedAt).toLocaleString("en-MY",{dateStyle:"short",timeStyle:"short"}):"—"}</div></div>
    <button onClick={()=>onView(v.FormVersion)}style={{fontSize:11,color:v.FormVersion===current?C.textMuted:C.purple,background:"none",border:`1px solid ${v.FormVersion===current?C.border:C.purpleMid}`,borderRadius:6,padding:"3px 10px",cursor:"pointer",fontFamily:"'DM Sans'"}}>{v.FormVersion===current?"Active":"View"}</button>
  </div>)}</div>);
}

// ── Audit log ─────────────────────────────────────────────────────────────────
function AuditLog({logs}){
  const[exp,setExp]=useState(null);
  const EC={FIELD_ADDED:{color:C.green,bg:C.greenPale},FIELD_REMOVED:{color:C.red,bg:C.redPale},FIELD_CHANGED:{color:C.amber,bg:C.amberPale},VERSION_BUMPED:{color:C.purple,bg:C.purplePale},PUBLISHED:{color:C.green,bg:C.greenPale},FORM_CREATED:{color:C.green,bg:C.greenPale}};
  if(!logs.length)return<div style={{fontSize:11,color:C.textMuted,fontStyle:"italic"}}>No log entries yet.</div>;
  return(<div style={{display:"flex",flexDirection:"column",gap:5}}>{logs.map((l,i)=>{
    const cfg=EC[l.EventType]||{color:C.textSecond,bg:C.offWhite},isE=exp===i;
    let before,after;try{before=l.BeforeJSON?JSON.parse(l.BeforeJSON):null;}catch{}try{after=l.AfterJSON?JSON.parse(l.AfterJSON):null;}catch{}
    const hasDiff=before||after;
    return(<div key={i}style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden"}}>
      <div onClick={()=>hasDiff&&setExp(isE?null:i)}style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",cursor:hasDiff?"pointer":"default",background:isE?C.offWhite:C.white}}>
        <span style={{fontSize:9,fontWeight:700,color:cfg.color,background:cfg.bg,borderRadius:20,padding:"2px 7px",flexShrink:0}}>{l.EventType}</span>
        <span style={{fontSize:11,color:C.textPrimary,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.EventSummary}</span>
        <span style={{fontSize:9,color:C.textMuted,flexShrink:0}}>{l.EventAt?new Date(l.EventAt).toLocaleString("en-MY",{dateStyle:"short",timeStyle:"short"}):""}</span>
        {hasDiff&&<span style={{fontSize:10,color:C.textMuted}}>{isE?"▲":"▼"}</span>}
      </div>
      {isE&&hasDiff&&<div style={{padding:"9px 10px",borderTop:`1px solid ${C.border}`,background:C.offWhite,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {before&&<div><div style={{fontSize:9,fontWeight:700,color:C.red,textTransform:"uppercase",marginBottom:3}}>Before</div><pre style={{fontSize:10,color:C.textSecond,fontFamily:"monospace",whiteSpace:"pre-wrap",lineHeight:1.6,margin:0}}>{JSON.stringify(before,null,2)}</pre></div>}
        {after&&<div><div style={{fontSize:9,fontWeight:700,color:C.green,textTransform:"uppercase",marginBottom:3}}>After</div><pre style={{fontSize:10,color:C.textSecond,fontFamily:"monospace",whiteSpace:"pre-wrap",lineHeight:1.6,margin:0}}>{JSON.stringify(after,null,2)}</pre></div>}
      </div>}
    </div>);
  })}</div>);
}

// ── Approver row ──────────────────────────────────────────────────────────────
function ApproverRow({index,layer,onChange,siteUsers}){
  const[open,setOpen]=useState(false),[q,setQ]=useState("");
  const ref=useRef(null);
  useEffect(()=>{const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);},[]);
  const sugg=useMemo(()=>{if(!q)return siteUsers.slice(0,5);const lq=q.toLowerCase();return siteUsers.filter(u=>u.email.toLowerCase().includes(lq)||u.name.toLowerCase().includes(lq)).slice(0,5);},[siteUsers,q]);
  return(<div style={{display:"flex",gap:7,alignItems:"center",marginBottom:7}}>
    <div style={{width:26,height:26,borderRadius:7,flexShrink:0,background:layer.email?`linear-gradient(135deg,${C.green},#34D399)`:`linear-gradient(135deg,${C.purple},${C.purpleLight})`,color:C.white,fontSize:11,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{layer.email?"✓":`L${index+1}`}</div>
    <div ref={ref}style={{flex:2,position:"relative"}}>
      <input value={layer.email}onChange={e=>{onChange(index,"email",e.target.value);setQ(e.target.value);}}onFocus={()=>setOpen(true)}placeholder={`Layer ${index+1} email`}style={{...inp,height:30,fontSize:12}}/>
      {open&&sugg.length>0&&<div style={{position:"absolute",top:"calc(100% + 3px)",left:0,right:0,zIndex:200,background:C.white,border:`1px solid ${C.border}`,borderRadius:9,boxShadow:C.shadowMd,overflow:"hidden"}}>
        {sugg.map(u=><div key={u.email}onClick={()=>{onChange(index,"email",u.email);onChange(index,"name",u.name);setOpen(false);setQ("");}}style={{padding:"7px 11px",cursor:"pointer",borderBottom:`1px solid ${C.border}`}}onMouseEnter={e=>e.currentTarget.style.background=C.purplePale}onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
          <div style={{fontSize:12,fontWeight:500}}>{u.name}</div><div style={{fontSize:10,color:C.textMuted}}>{u.email}</div>
        </div>)}
      </div>}
    </div>
    <input value={layer.name}onChange={e=>onChange(index,"name",e.target.value)}placeholder="Name"style={{...inp,flex:1,height:30,fontSize:12}}/>
  </div>);
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AdminFormBuilder(){
  const navigate=useNavigate();
  const{formTitle:paramTitle}=useParams();
  const{instance,accounts,inProgress}=useMsal();
  const isAuthenticated=useIsAuthenticated();
  const[authChecked,setAuthChecked]=useState(false);
  const[siteUsers,setSiteUsers]=useState([]);
  const tokenRef=useRef(null);
  const[allForms,setAllForms]=useState([]);
  const[libraryOpen,setLibraryOpen]=useState(true);
  const[isEditing,setIsEditing]=useState(false);
  const[originalVersion,setOriginalVersion]=useState(null);
  const[meta,setMeta]=useState({formTitle:"",formId:"",formVersion:"1.0",slug:"",isoStandards:"ISO 9001 · ISO 14001 · ISO 45001",companies:"PMW INDUSTRIES SDN BHD\nPMW CONCRETE INDUSTRIES SDN BHD\nPMW LIGHTING INDUSTRIES SDN BHD\nPMW WINABUMI SDN BHD"});
  const[showBanner,setShowBanner]=useState(true);
  const[isPublic,setIsPublic]=useState(true);
  const setM=(k,v)=>setMeta(m=>({...m,[k]:v}));
  const[slugError,setSlugError]=useState("");
  const[slugChecking,setSlugChecking]=useState(false);
  const[slugLocked,setSlugLocked]=useState(false);
  const[slugManual,setSlugManual]=useState(false);
  const[numLayers,setNumLayers]=useState(0);
  const[layers,setLayers]=useState(Array.from({length:5},()=>({email:"",name:""})));
  const updateLayer=(i,k,v)=>setLayers(ls=>ls.map((l,idx)=>idx===i?{...l,[k]:v}:l));
  const[surveyJson,setSurveyJson]=useState(null);
  const[initialJson,setInitialJson]=useState(null);
  const prevSurveyRef=useRef(null);
  const[sidebarTab,setSidebarTab]=useState("meta");
  const[sidebarOpen,setSidebarOpen]=useState(true);
  const[versionHistory,setVersionHistory]=useState([]);
  const[viewingOld,setViewingOld]=useState(null);
  const[newVersionMode,setNewVersionMode]=useState("minor");
  const[auditLog,setAuditLog]=useState([]);
  const[logLoading,setLogLoading]=useState(false);
  const[provLogs,setProvLogs]=useState([]);
  const[provisioning,setProvisioning]=useState(false);
  const[provOk,setProvOk]=useState(false);
  const[provErr,setProvErr]=useState(false);
  const[toast,setToast]=useState(null);
  const[approvalRules,setApprovalRules]=useState(null);
  const pLog=useCallback((m,t="info")=>setProvLogs(l=>[...l,{m,t}]),[]);
  const showToast=useCallback((msg,type="info")=>{setToast({msg,type});setTimeout(()=>setToast(null),4000);},[]);

  const proposedVersion=useMemo(()=>{
    if(!isEditing||!originalVersion)return meta.formVersion;
    return newVersionMode==="minor"?incrementMinor(originalVersion):incrementMajor(originalVersion);
  },[isEditing,originalVersion,newVersionMode,meta.formVersion]);

  useEffect(()=>{if(slugManual||slugLocked)return;setM("slug",slugify(meta.formTitle));},[meta.formTitle,slugManual,slugLocked]);

  useEffect(()=>{
    if(!meta.slug||!tokenRef.current){setSlugError("");return;}
    let cancelled=false;setSlugChecking(true);
    const t=setTimeout(async()=>{
      const c=await checkSlugConflict(tokenRef.current,meta.slug,isEditing?meta.formTitle:null);
      if(!cancelled){setSlugError(c?`Used by: "${c}"`:"");setSlugChecking(false);}
    },600);
    return()=>{cancelled=true;clearTimeout(t);};
  },[meta.slug,isEditing,meta.formTitle]);

  useEffect(()=>{
    if(inProgress!==InteractionStatus.None)return;
    if(!isAuthenticated){navigate("/");return;}
    createSpClient(instance,accounts).isGroupMember(SP_STATIC.adminGroup).then(admin=>{
      if(!admin){navigate("/");return;}
      setAuthChecked(true);
      const origin=new URL(process.env.REACT_APP_SP_SITE_URL||"https://placeholder.sharepoint.com").origin;
      instance.acquireTokenSilent({scopes:[`${origin}/AllSites.Manage`],account:accounts[0]}).then(async r=>{
        tokenRef.current=r.accessToken;
        bootstrapSystemLists(r.accessToken,()=>{}).catch(e=>console.warn("[AFB] bootstrap:",e.message));
        try{const ud=await fetch(`${SP_SITE_URL}/_api/web/siteusers?$select=Email,Title&$filter=PrincipalType eq 1`,{headers:{Authorization:`Bearer ${r.accessToken}`,Accept:"application/json;odata=nometadata"}}).then(r=>r.json());setSiteUsers((ud.value||[]).filter(u=>u.Email).map(u=>({email:u.Email,name:u.Title})));}catch{}
        getAllFormConfigs(r.accessToken).then(setAllForms).catch(e=>showToast(`Could not load forms: ${e.message}`,"err"));
      }).catch(e=>{console.error("[AFB] token:",e);showToast("Authentication error — please refresh.","err");});
    });
  },[isAuthenticated,inProgress]);

  const refreshLib=useCallback(()=>{setTimeout(()=>{getAllFormConfigs(tokenRef.current).then(setAllForms).catch(()=>{});},800);},[]);

  const loadForEdit=useCallback(async(cfg)=>{
    const token=tokenRef.current;if(!token)return;
    const c=typeof cfg==="object"?cfg:await getFormConfig(token,cfg);
    if(!c){showToast(`Form not found.`,"err");return;}
    const data=await getFormVersion(token,c.Title,c.CurrentVersion);
    if(!data){showToast(`Version data not found.`,"err");return;}
    const loaded=data.surveyJson||data;
    setInitialJson(loaded);prevSurveyRef.current=loaded;setViewingOld(null);
    setMeta({formTitle:c.Title,formId:c.FormID||"",formVersion:c.CurrentVersion||"1.0",slug:c.Slug||slugify(c.Title),isoStandards:data.meta?.isoStandards||"ISO 9001 · ISO 14001 · ISO 45001",companies:data.meta?.companies||"PMW INDUSTRIES SDN BHD\nPMW CONCRETE INDUSTRIES SDN BHD\nPMW LIGHTING INDUSTRIES SDN BHD\nPMW WINABUMI SDN BHD"});
    setShowBanner(data.meta?.showBanner!==false);
    setOriginalVersion(c.CurrentVersion);setNumLayers(c.NumberOfApprovalLayer||0);setSlugLocked(true);setIsEditing(true);setIsPublic(c.IsPublic!==false);
    if(c.ApprovalRules){try{setApprovalRules(JSON.parse(c.ApprovalRules));}catch{setApprovalRules(null);}}else setApprovalRules(null);
    getFormVersionHistory(token,c.Title).then(setVersionHistory);
    setLogLoading(true);getFormLog(token,c.Title).then(l=>{setAuditLog(l);setLogLoading(false);});
  },[showToast]);

  useEffect(()=>{if(!paramTitle||!authChecked||!tokenRef.current)return;loadForEdit(decodeURIComponent(paramTitle));},[paramTitle,authChecked]);

  const handleNew=()=>{
    setIsEditing(false);setOriginalVersion(null);setInitialJson(null);prevSurveyRef.current=null;
    setSlugLocked(false);setSlugManual(false);setVersionHistory([]);setAuditLog([]);setViewingOld(null);setShowBanner(true);
    setMeta({formTitle:"",formId:"",formVersion:"1.0",slug:"",isoStandards:"ISO 9001 · ISO 14001 · ISO 45001",companies:"PMW INDUSTRIES SDN BHD\nPMW CONCRETE INDUSTRIES SDN BHD\nPMW LIGHTING INDUSTRIES SDN BHD\nPMW WINABUMI SDN BHD"});
    setNumLayers(0);setLayers(Array.from({length:5},()=>({email:"",name:""})));setIsPublic(true);
    navigate("/admin/builder");
  };

  const handleViewVersion=async(ver)=>{
    try{const data=await getFormVersion(tokenRef.current,meta.formTitle,ver);if(!data){showToast(`v${ver} not found.`,"err");return;}setViewingOld({version:ver,json:data.surveyJson||data});setSidebarTab("version");}
    catch(e){showToast(`Failed: ${e.message}`,"err");}
  };

  useEffect(()=>{if(sidebarTab!=="log"||!isEditing||!tokenRef.current)return;setLogLoading(true);getFormLog(tokenRef.current,meta.formTitle).then(l=>{setAuditLog(l);setLogLoading(false);});},[sidebarTab,isEditing,meta.formTitle]);

  const handlePublish=useCallback(async(jsonArg)=>{
    if(!meta.formTitle.trim()){showToast("Form title required.","err");setSidebarTab("meta");return;}
    if(!meta.formId.trim()){showToast("Form ID required.","err");setSidebarTab("meta");return;}
    if(slugError){showToast(`Slug conflict: ${slugError}`,"err");return;}
    const usedJson=jsonArg||surveyJson;
    if(!usedJson){showToast("No fields yet.","err");return;}
    const token=tokenRef.current;
    if(!token){showToast("Auth unavailable.","err");return;}
    const version=isEditing?proposedVersion:meta.formVersion;
    const title=meta.formTitle.trim();
    const userEmail=accounts[0]?.username||"admin";
    const activeLayers=layers.slice(0,numLayers);
    setProvLogs([]);setProvOk(false);setProvErr(false);setProvisioning(true);
    try{
      const diffs=diffSurveyJson(prevSurveyRef.current,usedJson);
      const conflict=await checkSlugConflict(token,meta.slug,isEditing?title:null);
      if(conflict)throw new Error(`Slug "${meta.slug}" used by "${conflict}".`);
      if(isEditing&&originalVersion&&!isVersionGreater(version,originalVersion))throw new Error(`v${version} must be > v${originalVersion}.`);

      pLog(`Checking list "${title}"…`);
      if(!await listExists(token,title)){pLog(`Creating list…`);await createSpList(token,title);pLog(`Created`,"ok");}
      else pLog(`List exists — checking columns`,"ok");

      pLog(`Provisioning columns…`);
      const questions=flattenQuestions(usedJson);
      for(const q of questions){
        const sp=getSpColumnKind(q);
        if(q.type==="dynamicmatrix"){
          // FIX: One Enhanced Rich Text column for HTML table response
          // addColumn(token, listTitle, name, kind, multiLine, richText)
          await addColumn(token,title,`${q.name}_Response`,3,true,true);
          pLog(`     ✓ ${q.name}_Response (Enhanced Rich Text)`);
          // Optional: raw JSON backup column (plain multiline)
          await addColumn(token,title,`${q.name}_Json`,3,true,false);
          pLog(`     ✓ ${q.name}_Json (JSON backup)`);
        }else if(sp){
          await addColumn(token,title,q.name,sp.FieldTypeKind,sp.FieldTypeKind===3,false);
          pLog(`     ✓ ${q.name} (${sp.label})`);
        }
      }
      for(const[n,k]of[["SubmittedAt",4],["FormVersion",2],["FormID",2],["SubmittedBy",2]])await addColumn(token,title,n,k);
      for(let n=1;n<=numLayers;n++)for(const[col,k]of[["Status",2],["Email",2],["SignedAt",4],["Rejection",3],["Signature",3]])await addColumn(token,title,`L${n}_${col}`,k,k===3);
      pLog(`Columns done`,"ok");

      pLog(`Updating Form Config…`);
      await upsertFormConfig(token,title,{formId:meta.formId.trim(),numLayers,slug:meta.slug,version,isPublished:true,isPublic,conditionField:approvalRules?.conditionField??"",approvalRules:approvalRules??null});
      pLog(`Form Config saved`,"ok");

      if(numLayers>0){pLog(`Writing approvers…`);await upsertApprovers(token,title,activeLayers);pLog(`Approvers saved`,"ok");}

      pLog(`Saving version v${version}…`);
      await saveFormVersion(token,{listTitle:title,slug:meta.slug,version,surveyJson:usedJson,meta:{isoStandards:meta.isoStandards,companies:meta.companies,formId:meta.formId,formVersion:version,showBanner},changedBy:userEmail});
      pLog(`Version saved`,"ok");

      if(!isEditing)await logEvent(token,{formTitle:title,eventType:"FORM_CREATED",changedBy:userEmail,summary:`Created. Route: /forms/${meta.slug}`,before:null,after:{slug:meta.slug,version}});
      else{
        for(const d of diffs)await logEvent(token,{formTitle:title,eventType:d.type,changedBy:userEmail,summary:d.summary,before:d.before,after:d.after});
        await logEvent(token,{formTitle:title,eventType:"VERSION_BUMPED",changedBy:userEmail,summary:`v${originalVersion} → v${version}`,before:{version:originalVersion},after:{version}});
        await logEvent(token,{formTitle:title,eventType:"PUBLISHED",changedBy:userEmail,summary:`Published v${version}`,before:null,after:{version,slug:meta.slug}});
      }
      pLog(`✓ "${title}" v${version} live at /forms/${meta.slug}`,"ok");
      setProvOk(true);
      prevSurveyRef.current=usedJson;setOriginalVersion(version);setMeta(m=>({...m,formVersion:version}));setIsEditing(true);setSlugLocked(true);
      refreshLib();getFormVersionHistory(token,title).then(setVersionHistory);
    }catch(e){pLog(`Error: ${e.message}`,"err");setProvErr(true);}
  },[meta,surveyJson,numLayers,layers,isEditing,originalVersion,proposedVersion,slugError,isPublic,showBanner,pLog,refreshLib,approvalRules,accounts]);

  if(!authChecked)return<div style={{minHeight:"100vh",background:C.offWhite,display:"flex",alignItems:"center",justifyContent:"center"}}><style>{G}</style><Spinner size={36}/></div>;

  const sidebarTabs=[{id:"meta",label:"Meta",icon:"📋"},{id:"approval",label:"Approval",icon:"✅"},{id:"condapproval",label:"Conditional",icon:"🔀"},{id:"version",label:"Versions",icon:"🕒"},{id:"log",label:"Log",icon:"📜"},{id:"publish",label:"Publish",icon:"🚀"}];
  const formBuilderKey=viewingOld?`view_${meta.formTitle}_v${viewingOld.version}`:(initialJson?`edit_${meta.formTitle}_${JSON.stringify(initialJson).slice(0,60)}`:"new");

  return(<div style={{minHeight:"100vh",background:C.offWhite,display:"flex",flexDirection:"column"}}>
    <style>{G}</style>
    {toast&&<div style={{position:"fixed",top:16,right:16,zIndex:10000,background:toast.type==="err"?C.red:toast.type==="ok"?C.green:C.purple,color:C.white,padding:"10px 18px",borderRadius:10,fontSize:12,boxShadow:C.shadowLg,animation:"fadeUp .2s ease",maxWidth:360}}>{toast.msg}</div>}

    <header style={{background:C.white,borderBottom:`1px solid ${C.border}`,height:52,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 18px",position:"sticky",top:0,zIndex:100,boxShadow:"0 1px 0 rgba(91,33,182,.06)",flexShrink:0}}>
      <div style={{display:"flex",alignItems:"center",gap:11}}>
        <button onClick={()=>navigate("/")}style={{display:"flex",alignItems:"center",gap:5,background:"none",border:`1px solid ${C.border}`,borderRadius:7,padding:"4px 11px",cursor:"pointer",fontSize:12,color:C.textSecond,fontFamily:"'DM Sans'"}}>← Dashboard</button>
        <div style={{width:1,height:17,background:C.border}}/>
        <img src={logo}alt="logo"style={{height:21}}/>
        <span style={{fontFamily:"'DM Serif Display',serif",fontSize:16,color:C.textPrimary}}>{isEditing?`Editing: ${meta.formTitle}`:"New Form"}</span>
        <Tag color={C.amber}bg={C.amberPale}>⚙ Admin</Tag>
        {isEditing&&<Tag>v{meta.formVersion}</Tag>}
        {meta.slug&&<a href={`/forms/${meta.slug}`}target="_blank"rel="noreferrer"style={{fontSize:10,color:C.purple,textDecoration:"none",background:C.purplePale,borderRadius:20,padding:"2px 9px",border:`1px solid ${C.purpleMid}`}}>/forms/{meta.slug} ↗</a>}
      </div>
      <div style={{display:"flex",gap:7}}>
        <button onClick={()=>setLibraryOpen(o=>!o)}style={{height:28,padding:"0 12px",border:`1px solid ${C.border}`,borderRadius:7,background:libraryOpen?C.purplePale:C.white,color:libraryOpen?C.purple:C.textSecond,fontSize:12,cursor:"pointer",fontFamily:"'DM Sans'"}}>📂 Forms</button>
        <button onClick={()=>setSidebarOpen(o=>!o)}style={{height:28,padding:"0 12px",border:`1px solid ${C.border}`,borderRadius:7,background:sidebarOpen?C.purplePale:C.white,color:sidebarOpen?C.purple:C.textSecond,fontSize:12,cursor:"pointer",fontFamily:"'DM Sans'"}}>⚙ Settings</button>
        <button onClick={()=>handlePublish(surveyJson)}style={{height:28,padding:"0 16px",border:"none",borderRadius:7,background:`linear-gradient(135deg,${C.purple},${C.purpleLight})`,color:C.white,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans'",boxShadow:"0 2px 8px rgba(91,33,182,.25)"}}>🚀 Publish</button>
      </div>
    </header>

    {viewingOld&&<div style={{background:C.amberPale,borderBottom:"1px solid #FDE68A",padding:"7px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:12,color:C.amber}}>
      <span>👁 Viewing archived <strong>v{viewingOld.version}</strong> — read only</span>
      <button onClick={()=>setViewingOld(null)}style={{background:"none",border:"none",color:C.amber,cursor:"pointer",fontWeight:600,fontFamily:"'DM Sans'"}}>✕ Back to current</button>
    </div>}

    <div style={{flex:1,display:"flex",overflow:"hidden",height:"calc(100vh - 52px)"}}>
      {libraryOpen&&<div style={{width:215,flexShrink:0,borderRight:`1px solid ${C.border}`,background:C.white,overflow:"hidden",display:"flex",flexDirection:"column"}}><FormLibrary forms={allForms}onEdit={loadForEdit}onNew={handleNew}current={meta.formTitle}/></div>}

      <div style={{flex:1,overflow:"hidden"}}>
        <FormBuilder key={formBuilderKey} initialJson={viewingOld?.json||initialJson} onChange={json=>{if(!viewingOld)setSurveyJson(json);}} onPublish={viewingOld?undefined:handlePublish} height="100%" readOnly={!!viewingOld} token={tokenRef.current} showBanner={showBanner} meta={{isoStandards:meta.isoStandards,companies:meta.companies,formTitle:meta.formTitle}}/>
      </div>

      {sidebarOpen&&<div style={{width:300,flexShrink:0,borderLeft:`1px solid ${C.border}`,background:C.white,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{display:"flex",overflowX:"auto",borderBottom:`1px solid ${C.border}`}}>
          {sidebarTabs.map(t=><button key={t.id}onClick={()=>setSidebarTab(t.id)}style={{flex:"0 0 auto",height:35,border:"none",padding:"0 10px",background:sidebarTab===t.id?C.purplePale:"none",color:sidebarTab===t.id?C.purple:C.textMuted,fontSize:11,fontWeight:sidebarTab===t.id?600:400,cursor:"pointer",fontFamily:"'DM Sans'",borderBottom:sidebarTab===t.id?`2px solid ${C.purple}`:"2px solid transparent",display:"flex",alignItems:"center",gap:4,whiteSpace:"nowrap"}}>{t.icon} {t.label}</button>)}
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"13px 13px 24px"}}>

          {sidebarTab==="meta"&&<div style={{animation:"fadeUp .15s ease"}}>
            <FB label="Form Title"hint="Becomes the SP list name. Locked after first publish."required>
              <TextInput value={meta.formTitle}onChange={v=>setM("formTitle",v)}placeholder="Training Application Form"disabled={isEditing}/>
              {isEditing&&<div style={{fontSize:10,color:C.textMuted,marginTop:3}}>Locked after first publish</div>}
            </FB>
            <FB label="Form ID / Doc No."required><TextInput value={meta.formId}onChange={v=>setM("formId",v)}placeholder="PMW-HR-001"/></FB>
            <FB label="Version"hint={isEditing?`Current: v${originalVersion} → New: v${proposedVersion}`:undefined}>
              {isEditing?(<div style={{display:"flex",gap:7}}>{["minor","major"].map(m=><button key={m}onClick={()=>setNewVersionMode(m)}style={{flex:1,height:32,borderRadius:7,border:`1px solid ${newVersionMode===m?C.purple:C.border}`,background:newVersionMode===m?C.purplePale:C.white,color:newVersionMode===m?C.purple:C.textSecond,fontSize:12,cursor:"pointer",fontFamily:"'DM Sans'",fontWeight:newVersionMode===m?600:400}}>{m==="minor"?`v${incrementMinor(originalVersion)}`:`v${incrementMajor(originalVersion)}`}<div style={{fontSize:9,color:C.textMuted,marginTop:1}}>{m} bump</div></button>)}</div>)
              :<TextInput value={meta.formVersion}onChange={v=>setM("formVersion",v)}placeholder="1.0"/>}
            </FB>
            <FB label="Route slug"hint="URL: /forms/{slug}. Locked after first publish.">
              <div style={{position:"relative"}}>
                <TextInput value={meta.slug}onChange={v=>{setM("slug",slugify(v));setSlugManual(true);}}placeholder="training-application"disabled={slugLocked}error={slugError}/>
                {slugChecking&&<div style={{position:"absolute",right:9,top:"50%",transform:"translateY(-50%)"}}><Spinner size={12}/></div>}
                {!slugError&&!slugChecking&&meta.slug&&!slugLocked&&<div style={{fontSize:10,color:C.green,marginTop:3}}>✓ Slug available</div>}
                {slugLocked&&<div style={{fontSize:10,color:C.textMuted,marginTop:3}}>Locked — cannot change after publish</div>}
              </div>
            </FB>
            <FB label="ISO Standards"><TextInput value={meta.isoStandards}onChange={v=>setM("isoStandards",v)}/></FB>
            <FB label="Companies"hint="One per line"><textarea value={meta.companies}onChange={e=>setM("companies",e.target.value)}rows={4}style={{...inp,height:"auto",padding:"7px 10px",resize:"vertical",lineHeight:1.7}}/></FB>
            <FB label="Header / Companies banner"hint="Show or hide the ISO + company banner at the top of the form.">
              <div style={{background:showBanner?C.greenPale:C.offWhite,border:`1px solid ${showBanner?"#6EE7B7":C.border}`,borderRadius:8,padding:"10px 12px",transition:"all .2s"}}>
                <ToggleSwitch checked={showBanner}onChange={setShowBanner}label={showBanner?"Banner visible":"Banner hidden"}/>
                <div style={{fontSize:10,color:C.textMuted,marginTop:6,lineHeight:1.5}}>{showBanner?"ISO standards and company names appear at the top of the form.":"Form opens without the header banner."}</div>
              </div>
            </FB>
            <FB label="Form Access">
              <div style={{display:"flex",gap:7}}>
                {[{v:true,label:"🌐 Public",hint:"Any M365 user"},{v:false,label:"🔒 Private",hint:"Explicit sign-in gate"}].map(opt=><button key={String(opt.v)}onClick={()=>setIsPublic(opt.v)}style={{flex:1,padding:"8px 4px",borderRadius:8,cursor:"pointer",border:`1.5px solid ${isPublic===opt.v?C.purple:C.border}`,background:isPublic===opt.v?C.purplePale:C.white,color:isPublic===opt.v?C.purple:C.textSecond,fontFamily:"'DM Sans'",transition:"all .13s"}}><div style={{fontSize:12,fontWeight:600}}>{opt.label}</div><div style={{fontSize:9,color:C.textMuted,marginTop:2}}>{opt.hint}</div></button>)}
              </div>
            </FB>
          </div>}

          {sidebarTab==="condapproval"&&<div style={{animation:"fadeUp .15s ease"}}>
            <div style={{fontSize:11,color:C.textMuted,marginBottom:12,lineHeight:1.6}}>Route approvals based on a hidden field value.</div>
            <FB label="Enable conditional routing">
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <input type="checkbox"checked={!!approvalRules}onChange={e=>{if(e.target.checked)setApprovalRules({conditionField:"",rules:[{when:"",layers:[{email:"",name:"",role:""}]}]});else setApprovalRules(null);}}style={{width:16,height:16,accentColor:C.purple}}/>
                <span style={{fontSize:12,color:C.textSecond}}>{approvalRules?"Enabled":"Disabled — using static approvers"}</span>
              </div>
            </FB>
            {approvalRules&&<>
              <FB label="Condition field name"hint="The hidden field name in your form"><TextInput value={approvalRules.conditionField}onChange={v=>setApprovalRules(r=>({...r,conditionField:v}))}placeholder="subject"/></FB>
              <div style={{fontSize:11,fontWeight:700,color:C.textMuted,textTransform:"uppercase",letterSpacing:".05em",marginBottom:8}}>Rules ({approvalRules.rules.length})</div>
              {approvalRules.rules.map((rule,ri)=><div key={ri}style={{background:C.offWhite,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 12px",marginBottom:10}}>
                <div style={{display:"flex",gap:7,alignItems:"center",marginBottom:10}}>
                  <div style={{fontSize:11,color:C.textMuted,flexShrink:0}}>When field =</div>
                  <TextInput value={rule.when}onChange={v=>setApprovalRules(r=>({...r,rules:r.rules.map((ru,idx)=>idx===ri?{...ru,when:v}:ru)}))}placeholder="managerial"/>
                  <button onClick={()=>setApprovalRules(r=>({...r,rules:r.rules.filter((_,idx)=>idx!==ri)}))}style={{width:24,height:24,border:"none",background:C.redPale,color:C.red,borderRadius:6,cursor:"pointer",flexShrink:0}}>✕</button>
                </div>
                <div style={{fontSize:10,fontWeight:700,color:C.textMuted,textTransform:"uppercase",marginBottom:6}}>Layers ({rule.layers.length})</div>
                {rule.layers.map((layer,li)=><div key={li}style={{display:"flex",gap:6,marginBottom:6,alignItems:"center"}}>
                  <div style={{width:22,height:22,borderRadius:6,flexShrink:0,background:`linear-gradient(135deg,${C.purple},${C.purpleLight})`,color:C.white,fontSize:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{li+1}</div>
                  <input value={layer.email}onChange={e=>setApprovalRules(r=>({...r,rules:r.rules.map((ru,idx)=>idx!==ri?ru:{...ru,layers:ru.layers.map((la,lidx)=>lidx===li?{...la,email:e.target.value}:la)})}))}placeholder="email@company.com"style={{...inp,flex:2,height:28,fontSize:11}}/>
                  <input value={layer.name}onChange={e=>setApprovalRules(r=>({...r,rules:r.rules.map((ru,idx)=>idx!==ri?ru:{...ru,layers:ru.layers.map((la,lidx)=>lidx===li?{...la,name:e.target.value}:la)})}))}placeholder="Name"style={{...inp,flex:1.5,height:28,fontSize:11}}/>
                  <button onClick={()=>setApprovalRules(r=>({...r,rules:r.rules.map((ru,idx)=>idx!==ri?ru:{...ru,layers:ru.layers.filter((_,lidx)=>lidx!==li)})}))}style={{width:22,height:22,border:"none",background:C.redPale,color:C.red,borderRadius:5,cursor:"pointer",flexShrink:0,fontSize:11}}>✕</button>
                </div>)}
                <button onClick={()=>setApprovalRules(r=>({...r,rules:r.rules.map((ru,idx)=>idx!==ri?ru:{...ru,layers:[...ru.layers,{email:"",name:"",role:""}]})}))}style={{fontSize:11,color:C.purple,background:"none",border:`1px dashed ${C.purpleMid}`,borderRadius:6,padding:"3px 10px",cursor:"pointer",fontFamily:"'DM Sans'",marginTop:4}}>+ Add layer</button>
              </div>)}
              <button onClick={()=>setApprovalRules(r=>({...r,rules:[...r.rules,{when:"",layers:[{email:"",name:"",role:""}]}]}))}style={{width:"100%",height:30,border:`1px dashed ${C.border}`,borderRadius:8,background:"none",color:C.purple,fontSize:11,cursor:"pointer",fontFamily:"'DM Sans'",marginTop:4}}>+ Add rule</button>
            </>}
          </div>}

          {sidebarTab==="approval"&&<div style={{animation:"fadeUp .15s ease"}}>
            <div style={{fontSize:11,color:C.textMuted,marginBottom:12,lineHeight:1.6}}>Select approval layers. 0 = no approval chain.</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:5,marginBottom:16}}>
              {[0,1,2,3,4,5].map(n=><button key={n}onClick={()=>setNumLayers(n)}style={{padding:"9px 0",borderRadius:8,cursor:"pointer",border:`${numLayers===n?"2":"1"}px solid ${numLayers===n?C.purple:C.border}`,background:numLayers===n?C.purplePale:C.white,color:numLayers===n?C.purple:C.textSecond,fontSize:16,fontWeight:700,fontFamily:"'DM Sans'",transition:"all .15s"}}>{n}</button>)}
            </div>
            {numLayers>0&&<><div style={{fontSize:10,fontWeight:600,color:C.textMuted,textTransform:"uppercase",letterSpacing:".05em",marginBottom:8}}>Approver Emails</div>{Array.from({length:numLayers}).map((_,i)=><ApproverRow key={i}index={i}layer={layers[i]}onChange={updateLayer}siteUsers={siteUsers}/>)}</>}
            {numLayers===0&&<div style={{background:C.amberPale,border:"1px solid #FDE68A",borderRadius:8,padding:"9px 11px",fontSize:11,color:C.amber}}>No approval — submissions go straight to Submitted.</div>}
          </div>}

          {sidebarTab==="version"&&<div style={{animation:"fadeUp .15s ease"}}>
            {!isEditing?<div style={{fontSize:11,color:C.textMuted,fontStyle:"italic"}}>Publish a form first to see version history.</div>:<>
              {viewingOld&&<div style={{background:C.amberPale,border:"1px solid #FDE68A",borderRadius:8,padding:"8px 11px",fontSize:11,color:C.amber,marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span>Viewing v{viewingOld.version}</span><button onClick={()=>setViewingOld(null)}style={{background:"none",border:"none",color:C.amber,cursor:"pointer",fontWeight:600,fontSize:11}}>← Back to current</button>
              </div>}
              <VersionHistory history={versionHistory}current={originalVersion}onView={handleViewVersion}/>
            </>}
          </div>}

          {sidebarTab==="log"&&<div style={{animation:"fadeUp .15s ease"}}>{logLoading?<div style={{display:"flex",justifyContent:"center",padding:20}}><Spinner/></div>:<AuditLog logs={auditLog}/>}</div>}

          {sidebarTab==="publish"&&<div style={{animation:"fadeUp .15s ease"}}>
            <div style={{display:"flex",flexDirection:"column",gap:9,marginBottom:16}}>
              {[["Form",meta.formTitle||<em style={{color:C.red}}>Missing ⚠</em>],["Form ID",meta.formId||<em style={{color:C.red}}>Missing ⚠</em>],["Version",isEditing?`${originalVersion} → ${proposedVersion}`:meta.formVersion],["Route",meta.slug?`/forms/${meta.slug}`:<em style={{color:C.amber}}>No slug</em>],["Layers",numLayers||"None"],["Banner",showBanner?"✅ Visible":"🚫 Hidden"],["Access",isPublic?"🌐 Public":"🔒 Private"]].map(([k,v])=><div key={k}style={{display:"flex",gap:10,fontSize:12}}><span style={{color:C.textMuted,minWidth:70}}>{k}:</span><span style={{color:C.textPrimary,fontWeight:500}}>{v}</span></div>)}
            </div>
            {slugError&&<div style={{background:C.redPale,border:"1px solid #FCA5A5",borderRadius:8,padding:"7px 10px",fontSize:11,color:C.red,marginBottom:10}}>⚠ {slugError}</div>}
            <button onClick={()=>handlePublish(surveyJson)}disabled={!meta.formTitle||!meta.formId||!!slugError||!!viewingOld}style={{width:"100%",padding:"11px 0",borderRadius:9,border:"none",background:(!meta.formTitle||!meta.formId||slugError||viewingOld)?C.border:`linear-gradient(135deg,${C.purple},${C.purpleLight})`,color:(!meta.formTitle||!meta.formId||slugError||viewingOld)?C.textMuted:C.white,fontSize:13,fontWeight:600,cursor:(!meta.formTitle||!meta.formId||slugError||viewingOld)?"not-allowed":"pointer",fontFamily:"'DM Sans'"}}>
              {viewingOld?"⚠ Close version preview to publish":"🚀 Publish to SharePoint"}
            </button>
          </div>}

        </div>
      </div>}
    </div>

    {provisioning&&<ProvisionOverlay logs={provLogs}success={provOk}error={provErr}onDone={()=>{setProvisioning(false);if(provOk)navigate(`/admin/builder/${encodeURIComponent(meta.formTitle)}`);}}/>}
  </div>);
}