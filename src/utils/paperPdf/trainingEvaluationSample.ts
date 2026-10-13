/**
 * trainingEvaluationSample.ts — A filled Training Evaluation Form, built the
 * way the HR Word form is laid out. The fixture the paper-form tests read, and
 * a ready-made submission for looking at the design without SharePoint.
 */
import { SAMPLE_SIGNATURE } from "../testRunLaunch";
import type { PdfFormData } from "../FormPdfDocument";

const rating = (name: string, title: string) => ({ type: "rating", name, title, rateMin: 1, rateMax: 4 });
const yesNo = (name: string, title: string) => ({ type: "boolean", name, title });

export const TRAINING_EVALUATION_SAMPLE: PdfFormData = {
  surveyJson: {
    title: "Training Evaluation Form",
    pages: [
      {
        name: "page1",
        title: "To be filled by the participant",
        elements: [
          {
            type: "radiogroup",
            name: "company",
            title: "Company",
            isManagedCompanyChoice: true,
            choices: ["PMW INDUSTRIES SDN BHD", "PMW CONCRETE INDUSTRIES SDN BHD", "PMW LIGHTING INDUSTRIES SDN BHD", "WINABUMI SDN BHD"],
          },
          { type: "text", name: "employeeName", title: "Employee Name" },
          { type: "text", name: "employeeId", title: "Employee ID" },
          { type: "text", name: "position", title: "Position" },
          { type: "text", name: "department", title: "Department" },
          { type: "text", name: "trainingTitle", title: "Training Title" },
          { type: "text", name: "dateDuration", title: "Date & Duration" },
          { type: "text", name: "trainingObjective", title: "Training Objective" },
          { type: "radiogroup", name: "trainingType", title: "Training Type", choices: [{ value: "inhouse", text: "In-house" }, { value: "external", text: "External" }] },
          { type: "html", name: "ratingGuide", html: "<p>Please rate the following aspects on a scale of 1 &ndash; 4, where: 1 = Disagree, 2 = Neutral, 3 = Agree, 4 = Strongly Agree</p>" },
          {
            type: "panel",
            name: "contents",
            title: "Contents of the course",
            elements: [
              rating("q1", "The training room and facilities were adequate and comfortable"),
              rating("q2", "The time allocated for the training was sufficient"),
              rating("q3", "The assessment methods used were fair and relevant"),
              rating("q4", "There were opportunities to ask questions and seek clarifications"),
              rating("q5", "The training encouraged interaction and engagement"),
            ],
          },
          { type: "radiogroup", name: "overallRating", title: "Overall rating of the Training Program", choices: ["Excellent", "Good", "Fair", "Poor"] },
          {
            type: "panel",
            name: "effectiveness",
            title: "Effectiveness of the training",
            elements: [
              rating("q6", "The objectives of the training were met and clearly stated"),
              rating("q7", "The training was relevant to my job role/ I can apply what I learned in my day-day work"),
              rating("q8", "The training was relevant to improve the knowledge/skills I need to accomplish my job"),
              rating("q9", "The course information was at an appropriate level to understand the learning objectives"),
            ],
          },
          { type: "comment", name: "comments", title: "Comments/ Feedback" },
          {
            type: "panel",
            name: "ack",
            title: "Acknowledgement",
            elements: [{ type: "signaturepad", name: "employeeSignature", title: "Employee Signature" }],
          },
        ],
      },
    ],
  },
  responseData: {
    company: "PMW CONCRETE INDUSTRIES SDN BHD",
    employeeName: "Ahmad Faiz bin Rahman",
    employeeId: "PMW-01842",
    position: "Production Supervisor",
    department: "Production",
    trainingTitle: "ISO 45001 Internal Auditor",
    dateDuration: "22–23 Sep 2026 (2 days)",
    trainingObjective: "Audit the site's OH&S management system",
    trainingType: "external",
    q1: 4, q2: 3, q3: 3, q4: 4, q5: 4,
    overallRating: "Good",
    q6: 4, q7: 4, q8: 3, q9: 3,
    comments: "Very practical sessions. More time on the case studies would help, and a printed copy of the checklist would be useful on site.",
    employeeSignature: SAMPLE_SIGNATURE,
  },
  meta: {
    submittedBy: "ahmad.faiz@example.com",
    submittedAt: "2026-10-01T09:30:00.000Z",
    formTitle: "Training Evaluation Form",
    formVersion: "1.0",
    formStatus: "Approved",
    referenceNo: "TEF-011026-0007",
  },
  isoStandards: "ISO 9001, ISO 14001 & ISO 45001",
  layerResults: [
    {
      layerNumber: 1,
      type: "evaluation",
      status: "Confirmed",
      email: "siti.aminah@example.com",
      signedAt: "2027-01-05T03:00:00.000Z",
      signature: SAMPLE_SIGNATURE,
      signerName: "Siti Aminah",
      signerPosition: "Head of Department",
      layerTitle: "Immediate Superior/HOD evaluation (3 months after training)",
      evaluationSurveyElements: [
        {
          type: "panel",
          name: "performance",
          title: "Performance Indication",
          elements: [
            yesNo("p1", "Training objective met"),
            yesNo("p2", "Improve on required skills"),
            yesNo("p3", "The employee’s productivity level increase"),
            yesNo("p4", "I agree that overall quality of employee has improved"),
          ],
        },
        { type: "comment", name: "hodComments", title: "Immediate Superior/HOD Comments (justifications or remarks for the above)" },
      ],
      evaluationFields: {
        p1: true, p2: true, p3: false, p4: true,
        hodComments: "Ahmad now leads the monthly site inspections. Productivity is unchanged so far; reassess at the next review.",
      },
    },
  ],
  pdfConfig: { enabled: true, title: "", deliveryMethod: "download", design: "paper" },
};
