/**
 * trainingFormSamples.ts — Filled Training Attendance, Needs Analysis and
 * Requisition forms, shaped exactly as those forms are published (question
 * names, types, panels, workflow steps) with made-up answers. The fixtures the
 * paper-layout tests read, and ready-made submissions for looking at the
 * designs without SharePoint.
 */
import { SAMPLE_SIGNATURE } from "../testRunLaunch";
import type { PdfFormData } from "../FormPdfDocument";

const COMPANIES = [
  "BORNEO POLE SDN BHD", "MEGA SUMMIT SDN BHD", "PMW CONCRETE INDUSTRIES SDN BHD", "PMW INDUSTRIES SDN BHD",
  "PMW INTERNATIONAL BERHAD", "PMW LIGHTING SDN BHD", "PMW MARKETING SDN BHD", "PMW WINABUMI SDN BHD",
];
const company = { type: "radiogroup", name: "company", title: "Company", isManagedCompanyChoice: true, choices: COMPANIES };
const shared = {
  isoStandards: "ISO 9001 · ISO 14001 · ISO 45001",
  companies: COMPANIES.join("\n"),
  pdfConfig: { enabled: true, title: "", deliveryMethod: "download" as const, design: "paper" as const },
};

export const TRAINING_ATTENDANCE_SAMPLE: PdfFormData = {
  ...shared,
  surveyJson: {
    title: "Training Attendance Form",
    pages: [{
      name: "page1",
      elements: [
        company,
        { type: "text", name: "programTitle", title: "Program Title", inputType: "text" },
        { type: "text", name: "trainerSName", title: "Trainer's Name", inputType: "text" },
        { type: "text", name: "dateTimeStart", title: "Date & Time Start", inputType: "datetime-local" },
        { type: "text", name: "dateTimeEnd", title: "Date & Time End", inputType: "datetime-local" },
        { type: "radiogroup", name: "trainingType", title: "Training Type", choices: ["In House", "Internal", "External"] },
        { type: "text", name: "employeeId", title: "Employee ID", inputType: "text" },
        { type: "text", name: "name", title: "Name", inputType: "text" },
        { type: "dropdown", name: "department", title: "Department", choices: [] },
        { type: "text", name: "position", title: "Position", inputType: "text" },
        { type: "signaturepad", name: "signature", title: "Signature" },
      ],
    }],
  },
  responseData: {
    company: "PMW INDUSTRIES SDN BHD",
    programTitle: "Working Safely at Height",
    trainerSName: "Lim Wei Jie",
    dateTimeStart: "2026-10-12T09:00",
    dateTimeEnd: "2026-10-12T17:00",
    trainingType: "Internal",
    employeeId: "PMW0417",
    name: "Nur Aisyah binti Rahman",
    department: "Production",
    position: "Line Supervisor",
    signature: SAMPLE_SIGNATURE,
  },
  meta: {
    submittedBy: "aisyah@example.com",
    submittedAt: "2026-10-12T09:05:00.000Z",
    formTitle: "Training Attendance Form",
    formVersion: "1.0",
    formStatus: "Submitted",
    referenceNo: "TAF-121026-0003",
  },
  layerResults: [],
};

const level = (name: string) => ({ name, cellType: "checkbox", choices: ["Low", "Medium", "High"] });

export const TRAINING_NEEDS_ANALYSIS_SAMPLE: PdfFormData = {
  ...shared,
  surveyJson: {
    title: "Training Needs Analysis",
    pages: [{
      name: "page1",
      elements: [
        company,
        { type: "dropdown", name: "department", title: "Department", choices: [] },
        {
          type: "matrixdynamic",
          name: "dynamicMatrix",
          title: "Dynamic Matrix",
          columns: [
            { name: "Employee_ID" },
            { name: "Name" },
            { name: "Traning_Needs", cellType: "text" },
            level("Current_Skill_Level"),
            level("Required_Skill_Level"),
            level("Priority"),
            { name: "Relevancy", cellType: "text" },
            { name: "Tentative_Date", cellType: "date" },
          ],
        },
        { type: "signaturepad", name: "Signature", title: "Prepared By HOD" },
      ],
    }],
  },
  responseData: {
    company: "PMW CONCRETE INDUSTRIES SDN BHD",
    department: "Quality Assurance",
    dynamicMatrix: [
      { Employee_ID: "PMW0211", Name: "Tan Mei Ling", Traning_Needs: "ISO 9001 internal auditing", Current_Skill_Level: ["Low"], Required_Skill_Level: ["High"], Priority: ["High"], Relevancy: "Leads the quarterly internal audits", Tentative_Date: "2027-02-15" },
      { Employee_ID: "PMW0388", Name: "Ravi Kumar", Traning_Needs: "Concrete compressive testing", Current_Skill_Level: ["Medium"], Required_Skill_Level: ["High"], Priority: ["Medium"], Relevancy: "Signs off batch test reports", Tentative_Date: "2027-04-01" },
    ],
    Signature: SAMPLE_SIGNATURE,
  },
  meta: {
    submittedBy: "Hassan bin Idris",
    submittedAt: "2026-11-03T02:00:00.000Z",
    formTitle: "Training Needs Analysis",
    formVersion: "1.1",
    formStatus: "Approved",
    referenceNo: "TNA-031126-0002",
  },
  layerResults: [{
    layerNumber: 1,
    type: "approval",
    status: "Approved",
    email: "ghrh@example.com",
    signedAt: "2026-11-05T06:00:00.000Z",
    signature: SAMPLE_SIGNATURE,
    signerName: "Wong Chiew Yee",
    signerPosition: "Group Human Resources Head",
    layerTitle: "Group Human Resources Head",
  }],
};

export const TRAINING_REQUISITION_SAMPLE: PdfFormData = {
  ...shared,
  surveyJson: {
    title: "Training Requisition Form",
    pages: [{
      name: "page1",
      elements: [
        company,
        {
          type: "panel", name: "employeeDetails", title: "Employee Details", elements: [
            { type: "text", name: "employeeName", title: "Employee Name", inputType: "text" },
            { type: "text", name: "position", title: "Position", inputType: "text" },
            { type: "dropdown", name: "department", title: "Department", choices: [] },
            { type: "text", name: "reportingManager", title: "Reporting Manager", inputType: "text" },
          ],
        },
        {
          type: "panel", name: "trainingDetails", title: "Training Details", elements: [
            { type: "text", name: "courseName", title: "Course Name", inputType: "text" },
            { type: "comment", name: "trainingObjective", title: "Training Objective", inputType: "comment" },
            { type: "comment", name: "trainingProvider", title: "Training Provider", inputType: "comment" },
            { type: "comment", name: "trainingVenue", title: "Training Venue", inputType: "comment" },
            { type: "text", name: "startDateTime", title: "Start Date/Time", inputType: "datetime-local" },
            { type: "text", name: "endDateTime", title: "End Date/Time", inputType: "datetime-local" },
          ],
        },
        {
          type: "panel", name: "cost", title: "Cost", elements: [
            { type: "text", name: "trainingFee", title: "Training Fee", inputType: "number" },
            { type: "text", name: "mileageTransportationFees", title: "Mileage/Transportation Fees", inputType: "number" },
            { type: "text", name: "mealsAllowanceXDaysOfTraining", title: "Meals Allowance x Days of Training", inputType: "number" },
            { type: "text", name: "accomodation", title: "Accomodation", inputType: "number" },
            { type: "text", name: "otherCostTollParking", title: "Other Cost (Toll/Parking)", inputType: "number" },
            { type: "expression", name: "totalCost", title: "Total Cost" },
            { type: "boolean", name: "hRDCClaimable", title: "HRDC Claimable" },
          ],
        },
        { type: "signaturepad", name: "applicantSignature", title: "Applicant Signature" },
      ],
    }],
  },
  responseData: {
    company: "PMW LIGHTING SDN BHD",
    employeeName: "Farah Nadia binti Zulkifli",
    position: "Electrical Engineer",
    department: "Engineering",
    reportingManager: "Goh Kok Leong",
    courseName: "Certified Energy Manager (CEM)",
    trainingObjective: "Qualify to audit and report the plant's electricity use under EECA 2024.",
    trainingProvider: "Malaysian Green Technology and Climate Change Corporation",
    trainingVenue: "Bangi, Selangor",
    startDateTime: "2026-11-16T09:00",
    endDateTime: "2026-11-18T17:00",
    trainingFee: 4800,
    mileageTransportationFees: 320,
    mealsAllowanceXDaysOfTraining: 150,
    accomodation: 0,
    otherCostTollParking: 45.5,
    totalCost: 5315.5,
    hRDCClaimable: true,
    applicantSignature: SAMPLE_SIGNATURE,
  },
  meta: {
    submittedBy: "farah@example.com",
    submittedAt: "2026-10-20T01:15:00.000Z",
    formTitle: "Training Requisition Form",
    formVersion: "1.4",
    formStatus: "In Review",
    referenceNo: "TRF-201026-0011",
  },
  layerResults: [
    {
      layerNumber: 1, type: "approval", status: "Approved", email: "hod@example.com",
      signedAt: "2026-10-21T03:00:00.000Z", signature: SAMPLE_SIGNATURE,
      signerName: "Goh Kok Leong", signerPosition: "Head of Engineering", layerTitle: "HOD",
    },
    {
      layerNumber: 2, type: "approval", status: "Pending", email: "ghrh@example.com",
      layerTitle: "Group Human Resource Head",
    },
  ],
};
