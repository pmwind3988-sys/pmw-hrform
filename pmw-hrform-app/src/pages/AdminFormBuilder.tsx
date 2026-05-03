/**
 * AdminFormBuilder.tsx - Admin form builder page
 * Uses custom FormBuilder (react-dnd) instead of SurveyJS Creator
 */
import React from "react";
import { useNavigate } from "react-router-dom";
import FormBuilder from "../components/builder/FormBuilder";

export default function AdminFormBuilder() {
  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", minHeight: 300, padding: 20 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ background: "#5B21B6", color: "#FFFFFF", padding: "16px 22px", borderRadius: 12, marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 2 }}>Form Builder</div>
          <div style={{ fontSize: 14 }}>Admin - Build your custom form</div>
        </div>
        <div style={{ background: "#FFFFFF", borderRadius: 12, maxHeight: "70vh", overflow: "auto", minHeight: "calc(100vh - 150px)" }}>
          <div style={{ padding: 20 }}>Form builder unavailable - please use the main form builder in settings.</div>
        </div>
      </div>
    </div>
  );
}